const Post = require('../models/Post');
const { publishPost } = require('./publishingService');

let duePostTimer = null;
let duePostSweepRunning = false;

async function publishDueScheduledPosts({ limit = 25 } = {}) {
  if (duePostSweepRunning) return { processed: 0, skipped: true };
  duePostSweepRunning = true;
  let processed = 0;

  try {
    const duePosts = await Post.find({
      status: 'scheduled',
      scheduledAt: { $lte: new Date() }
    })
      .select('_id scheduledAt')
      .sort({ scheduledAt: 1 })
      .limit(limit)
      .lean();

    for (const due of duePosts) {
      const locked = await Post.findOneAndUpdate(
        { _id: due._id, status: 'scheduled', scheduledAt: { $lte: new Date() } },
        { $set: { status: 'publishing' } },
        { new: true }
      );

      if (!locked) continue;

      try {
        await publishPost(locked._id);
      } catch (error) {
        console.error(`Scheduled post ${locked._id} failed:`, error.message);
      }

      processed += 1;
    }

    return { processed, skipped: false };
  } finally {
    duePostSweepRunning = false;
  }
}

function startDuePostPublisher({ intervalMs = 60 * 1000, initialDelayMs = 5 * 1000 } = {}) {
  if (duePostTimer) return duePostTimer;

  const tick = () => {
    publishDueScheduledPosts().catch((error) => {
      console.error('Scheduled post sweep failed:', error.message);
    });
  };

  const initialTimer = setTimeout(tick, initialDelayMs);
  if (initialTimer.unref) initialTimer.unref();

  duePostTimer = setInterval(tick, intervalMs);
  if (duePostTimer.unref) duePostTimer.unref();
  return duePostTimer;
}

function stopDuePostPublisher() {
  if (duePostTimer) clearInterval(duePostTimer);
  duePostTimer = null;
}

module.exports = {
  publishDueScheduledPosts,
  startDuePostPublisher,
  stopDuePostPublisher
};
