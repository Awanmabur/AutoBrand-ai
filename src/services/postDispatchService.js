const { enqueuePost } = require('./schedulerService');
const env = require('../config/env');

function postIsDue(post, toleranceMs = 1000) {
  const scheduledAt = post?.scheduledAt instanceof Date
    ? post.scheduledAt
    : post?.scheduledAt
      ? new Date(post.scheduledAt)
      : null;
  return Boolean(scheduledAt && !Number.isNaN(scheduledAt.getTime()) && scheduledAt.getTime() <= Date.now() + toleranceMs);
}

function requestDatabaseSweep({ delayMs = 0 } = {}) {
  // Lazy require avoids a module cycle: due publisher -> publishing service -> retry policy -> dispatch service.
  const { triggerDuePostPublisher } = require('./duePostPublisherService');
  triggerDuePostPublisher({ delayMs });
}

async function createQueueFallbackNotification(userId, post, error) {
  if (!userId) return;
  try {
    const Notification = require('../models/Notification');
    await Notification.create({
      user: userId,
      type: 'queue_unavailable',
      title: 'Publishing queue fallback active',
      message: `The post was saved and will be handled by the built-in database publisher. Queue detail: ${error?.message || 'Redis/BullMQ is unavailable.'}`,
      entityType: 'Post',
      entityId: post?._id
    });
  } catch (notificationError) {
    console.error('Could not persist queue fallback notification:', notificationError.message);
  }
}

/**
 * Dispatches a saved scheduled post without making Redis a correctness dependency.
 * BullMQ is used when available, while the database publisher remains the durable fallback.
 */
async function dispatchScheduledPost(post, { userId, notifyOnQueueFailure = true } = {}) {
  if (!post?._id) throw new Error('A saved post is required before it can be dispatched.');

  let queued = false;
  let queueError = null;
  try {
    await enqueuePost(post);
    queued = true;
  } catch (error) {
    queueError = error;
    const redisWasExpected = env.redisConfigured && error?.code !== 'EREDISDISABLED';
    if (notifyOnQueueFailure && redisWasExpected) {
      await createQueueFallbackNotification(userId, post, error);
    }
  }

  // An immediate post must not wait for a separate BullMQ worker. Future posts are
  // picked up by the regular database sweep, but requesting a sweep is harmless.
  requestDatabaseSweep({ delayMs: postIsDue(post) ? 0 : 25 });

  return { queued, queueError };
}

module.exports = {
  dispatchScheduledPost,
  postIsDue,
  requestDatabaseSweep
};
