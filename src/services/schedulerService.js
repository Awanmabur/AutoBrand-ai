const { getPostQueue, getQueueConnection, closeQueueResources } = require('../config/queue');

const env = require('../config/env');

const REDIS_PING_TIMEOUT_MS = Math.max(250, Number(process.env.REDIS_PING_TIMEOUT_MS || 1500));
const REDIS_RECHECK_MS = Math.max(5000, Number(process.env.REDIS_RECHECK_MS || 30000));
let redisReachabilityCache = { checkedAt: 0, available: false };

function withTimeout(promise, timeoutMs, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      timer.unref?.();
    })
  ]).finally(() => clearTimeout(timer));
}

async function canReachRedis({ force = false } = {}) {
  if (!env.redisConfigured) return false;
  const now = Date.now();
  if (!force && now - redisReachabilityCache.checkedAt < REDIS_RECHECK_MS) {
    return redisReachabilityCache.available;
  }
  try {
    const connection = getQueueConnection();
    const result = await withTimeout(
      connection.ping(),
      REDIS_PING_TIMEOUT_MS,
      `Redis did not respond within ${REDIS_PING_TIMEOUT_MS}ms.`
    );
    redisReachabilityCache = { checkedAt: now, available: result === 'PONG' };
    return redisReachabilityCache.available;
  } catch (_error) {
    redisReachabilityCache = { checkedAt: now, available: false };
    await closeQueueResources().catch(() => {});
    return false;
  }
}

function scheduleVersionFor(post) {
  return Math.max(0, Number(post?.scheduleVersion || 0));
}

function publishingJobId(post) {
  return `publish-${String(post._id)}-${scheduleVersionFor(post)}`;
}

async function enqueuePost(post) {
  if (!post?._id) throw new Error('A saved post is required before it can be queued.');
  if (!env.redisConfigured) {
    const error = new Error('Redis is disabled; the MongoDB publisher fallback is active.');
    error.code = 'EREDISDISABLED';
    throw error;
  }
  if (!(post.scheduledAt instanceof Date) || Number.isNaN(post.scheduledAt.getTime())) {
    throw new Error('A valid schedule time is required before a post can be queued.');
  }

  const redisAvailable = await canReachRedis();
  if (!redisAvailable) throw new Error('Redis is not reachable.');

  const delay = Math.max(post.scheduledAt.getTime() - Date.now(), 0);
  const queue = getPostQueue();
  const jobId = publishingJobId(post);
  const existing = await queue.getJob(jobId);

  if (existing) {
    const state = await existing.getState().catch(() => 'unknown');
    if (['delayed', 'waiting', 'waiting-children', 'prioritized'].includes(state)) {
      await existing.remove().catch(() => {});
    } else if (state === 'active') {
      return existing;
    } else {
      await existing.remove().catch(() => {});
    }
  }

  return queue.add(
    'publish-post',
    {
      postId: post._id.toString(),
      scheduleVersion: scheduleVersionFor(post)
    },
    {
      jobId,
      delay,
      attempts: 1,
      removeOnComplete: 250,
      removeOnFail: 500
    }
  );
}

module.exports = {
  enqueuePost,
  canReachRedis,
  publishingJobId,
  scheduleVersionFor
};
