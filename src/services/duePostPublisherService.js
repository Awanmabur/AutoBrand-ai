const Post = require('../models/Post');
const { publishPost } = require('./publishingService');
const env = require('../config/env');
const {
  createConnectivityBackoff,
  isMongoConnectivityError,
  isMongoReady,
  mongoUnavailableError,
  onMongoReady
} = require('./runtimeConnectivity.service');

let duePostTimer = null;
let duePostInitialTimer = null;
let duePostSweepRunning = false;
let requestedSweepTimer = null;
let unsubscribeMongoReady = null;

const mongoBackoff = createConnectivityBackoff({
  label: 'scheduled publishing',
  minMs: Math.max(2000, Number(process.env.MONGO_WORKER_BACKOFF_MIN_MS || 5000)),
  maxMs: Math.max(10000, Number(process.env.MONGO_WORKER_BACKOFF_MAX_MS || 120000)),
  logIntervalMs: Math.max(15000, Number(process.env.MONGO_WORKER_LOG_INTERVAL_MS || 60000))
});

function pauseForMongo(error) {
  mongoBackoff.recordFailure(error || mongoUnavailableError());
  return {
    processed: 0,
    skipped: true,
    databaseUnavailable: true,
    retryInMs: mongoBackoff.remainingMs()
  };
}

async function publishDueScheduledPosts({ limit = 25 } = {}) {
  if (env.publishingPaused) return { processed: 0, skipped: true, paused: true };
  if (duePostSweepRunning) return { processed: 0, skipped: true };
  if (!mongoBackoff.canAttempt()) {
    return { processed: 0, skipped: true, databaseUnavailable: true, retryInMs: mongoBackoff.remainingMs() };
  }
  if (!isMongoReady()) return pauseForMongo();

  duePostSweepRunning = true;
  let processed = 0;

  try {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - Math.max(5 * 60 * 1000, Number(process.env.PUBLISHING_STALE_MS || 15 * 60 * 1000)));

    await Post.updateMany(
      { status: 'scheduled', scheduledAt: null },
      { $set: { scheduledAt: now }, $inc: { scheduleVersion: 1 } }
    );

    await Post.updateMany(
      { status: 'approved', publishAfterApproval: true, scheduledAt: null },
      {
        $set: {
          status: 'scheduled',
          scheduledAt: now,
          publishingStartedAt: null,
          publishingAttemptId: ''
        },
        $inc: { scheduleVersion: 1 }
      }
    );
    await Post.updateMany(
      { status: 'approved', publishAfterApproval: true, scheduledAt: { $ne: null } },
      {
        $set: {
          status: 'scheduled',
          publishingStartedAt: null,
          publishingAttemptId: ''
        },
        $inc: { scheduleVersion: 1 }
      }
    );

    const duePosts = await Post.find({
      $or: [
        { status: 'scheduled', scheduledAt: { $lte: now } },
        { status: 'publishing', publishingStartedAt: { $lte: staleBefore } },
        { status: 'publishing', publishingStartedAt: { $exists: false }, updatedAt: { $lte: staleBefore } }
      ]
    })
      .select('_id scheduledAt scheduleVersion')
      .sort({ scheduledAt: 1 })
      .limit(limit)
      .lean();

    if (mongoBackoff.recordSuccess()) {
      console.log('[runtime] MongoDB recovered; scheduled publishing resumed.');
    }

    if (duePosts.length) {
      console.log('[publishing] due-post sweep found work', {
        count: duePosts.length,
        postIds: duePosts.map((item) => String(item._id))
      });
    }

    const concurrency = Math.max(1, Math.min(10, Number(process.env.DUE_POST_CONCURRENCY || 3)));
    let cursor = 0;
    const runners = Array.from({ length: Math.min(concurrency, duePosts.length) }, async () => {
      while (cursor < duePosts.length) {
        const due = duePosts[cursor];
        cursor += 1;
        try {
          const result = await publishPost(due._id, { expectedScheduleVersion: due.scheduleVersion });
          if (result) {
            processed += 1;
            console.log('[publishing] due post processed', {
              postId: String(due._id),
              status: result.status || ''
            });
          }
        } catch (error) {
          if (isMongoConnectivityError(error)) throw error;
          console.error('[publishing] due post failed', {
            postId: String(due._id),
            error: error.message
          });
          processed += 1;
        }
      }
    });
    await Promise.all(runners);

    return { processed, skipped: false };
  } catch (error) {
    if (isMongoConnectivityError(error)) return pauseForMongo(error);
    throw error;
  } finally {
    duePostSweepRunning = false;
  }
}

function triggerDuePostPublisher({ delayMs = 0 } = {}) {
  if (env.publishingPaused || requestedSweepTimer) return requestedSweepTimer;
  requestedSweepTimer = setTimeout(() => {
    requestedSweepTimer = null;
    publishDueScheduledPosts().catch((error) => {
      console.error('Requested scheduled post sweep failed:', error.message);
    });
  }, Math.max(0, Number(delayMs || 0)));
  requestedSweepTimer.unref?.();
  return requestedSweepTimer;
}

function startDuePostPublisher({ intervalMs = Number(process.env.DUE_POST_POLL_MS || 10 * 1000), initialDelayMs = 2 * 1000 } = {}) {
  if (duePostTimer) return duePostTimer;

  const tick = () => {
    publishDueScheduledPosts().catch((error) => {
      console.error('Scheduled post sweep failed:', error.message);
    });
  };

  duePostInitialTimer = setTimeout(() => {
    duePostInitialTimer = null;
    tick();
  }, initialDelayMs);
  duePostInitialTimer.unref?.();

  duePostTimer = setInterval(tick, intervalMs);
  duePostTimer.unref?.();
  unsubscribeMongoReady = onMongoReady(() => {
    const recovered = mongoBackoff.recordSuccess();
    if (recovered) console.log('[runtime] MongoDB reconnected; scheduled publishing wake-up requested.');
    triggerDuePostPublisher({ delayMs: 0 });
  });
  console.log('[publishing] durable due-post publisher started', {
    intervalMs,
    initialDelayMs,
    paused: env.publishingPaused
  });
  return duePostTimer;
}

function stopDuePostPublisher() {
  if (duePostTimer) clearInterval(duePostTimer);
  if (duePostInitialTimer) clearTimeout(duePostInitialTimer);
  if (requestedSweepTimer) clearTimeout(requestedSweepTimer);
  duePostTimer = null;
  duePostInitialTimer = null;
  requestedSweepTimer = null;
  if (unsubscribeMongoReady) unsubscribeMongoReady();
  unsubscribeMongoReady = null;
}

module.exports = {
  publishDueScheduledPosts,
  triggerDuePostPublisher,
  startDuePostPublisher,
  stopDuePostPublisher
};
