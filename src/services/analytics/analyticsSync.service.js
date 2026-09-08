const os = require('os');
const crypto = require('crypto');
const Analytics = require('../../models/Analytics');
const AnalyticsSyncJob = require('../../models/AnalyticsSyncJob');
const Post = require('../../models/Post');
const SocialAccount = require('../../models/SocialAccount');
const { deriveEngagementRate } = require('./analyticsDashboard.service');
const { notifyUser } = require('../notification.service');
const { updateBrandPerformanceMemory } = require('../analyticsMemoryService');

const DEFAULT_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_POLL_MS = 60 * 1000;
const DEFAULT_SEED_MS = 15 * 60 * 1000;
const WORKER_ID = `${os.hostname()}:${process.pid}:${crypto.randomBytes(4).toString('hex')}`;

let timer = null;
let ticking = false;
let lastSeedAt = 0;

function id(value) {
  return value?._id?.toString?.() || value?.toString?.() || String(value || '');
}

function publishedResults(post = {}) {
  return (post.publishResults || []).filter((result) =>
    result?.account
    && result?.platform
    && result?.platformPostId
    && ['published', 'processing'].includes(String(result.status || ''))
  );
}

async function ensureAnalyticsSyncJobsForPost(post) {
  if (!post?._id || !post?.brand) return { createdOrUpdated: 0 };
  const rows = publishedResults(post);
  let createdOrUpdated = 0;
  for (const result of rows) {
    const providerPostId = String(result.platformPostId || '').trim();
    if (!providerPostId) continue;
    await AnalyticsSyncJob.findOneAndUpdate(
      { post: post._id, account: result.account, platform: result.platform },
      {
        $setOnInsert: {
          brand: post.brand?._id || post.brand,
          post: post._id,
          account: result.account,
          platform: result.platform,
          originalProviderPostId: providerPostId,
          status: 'queued',
          nextAttemptAt: new Date()
        },
        $set: { providerPostId }
      },
      { upsert: true, new: true }
    );
    createdOrUpdated += 1;
  }
  return { createdOrUpdated };
}

async function seedAnalyticsSyncJobs({ limit = 500 } = {}) {
  const posts = await Post.find({
    publishResults: {
      $elemMatch: {
        status: { $in: ['published', 'processing'] },
        account: { $exists: true },
        platformPostId: { $nin: [null, ''] }
      }
    }
  })
    .select('_id brand publishResults publishedAt createdAt')
    .sort({ updatedAt: -1 })
    .limit(Math.max(1, Math.min(5000, Number(limit || 500))))
    .lean();

  let createdOrUpdated = 0;
  for (const post of posts) {
    const result = await ensureAnalyticsSyncJobsForPost(post);
    createdOrUpdated += result.createdOrUpdated;
  }
  return { scanned: posts.length, createdOrUpdated };
}

function successIntervalMs(post) {
  const publishedAt = new Date(post?.publishedAt || post?.createdAt || Date.now()).getTime();
  const age = Math.max(0, Date.now() - publishedAt);
  if (age < 2 * 24 * 60 * 60 * 1000) return 60 * 60 * 1000;
  if (age < 14 * 24 * 60 * 60 * 1000) return 6 * 60 * 60 * 1000;
  if (age < 90 * 24 * 60 * 60 * 1000) return 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
}

function failureBackoffMs(failures) {
  const steps = [15, 30, 60, 180, 360, 720, 1440];
  const minutes = steps[Math.min(Math.max(0, Number(failures || 1) - 1), steps.length - 1)];
  return minutes * 60 * 1000;
}

async function claimDueAnalyticsJob({ leaseMs = DEFAULT_LEASE_MS } = {}) {
  const now = new Date();
  const due = {
    $or: [
      {
        status: { $in: ['queued', 'retry', 'succeeded'] },
        nextAttemptAt: { $lte: now }
      },
      {
        status: 'running',
        leaseUntil: { $lte: now }
      }
    ]
  };
  return AnalyticsSyncJob.findOneAndUpdate(
    due,
    {
      $set: {
        status: 'running',
        leaseOwner: WORKER_ID,
        leaseUntil: new Date(now.getTime() + Math.max(30_000, Number(leaseMs || DEFAULT_LEASE_MS))),
        lastAttemptAt: now
      },
      $inc: { attemptCount: 1 }
    },
    { new: true, sort: { nextAttemptAt: 1, updatedAt: 1 } }
  );
}

function metricUpdate(metrics = {}) {
  const update = {
    providerPostId: metrics.providerPostId || '',
    availableMetrics: metrics.availableMetrics || [],
    source: 'provider',
    recordKind: 'lifetime',
    metricDate: new Date(),
    lastSyncedAt: new Date(),
    syncMeta: {
      partial: (metrics.availableMetrics || []).length < 6,
      syncedBy: 'provider-api'
    }
  };
  [
    'impressions', 'views', 'watchTimeSeconds', 'likes', 'comments', 'shares',
    'saves', 'clicks', 'reach', 'followersGained', 'engagementRate'
  ].forEach((key) => {
    if (metrics[key] !== undefined) update[key] = Number(metrics[key] || 0);
  });
  if (update.engagementRate === undefined) update.engagementRate = deriveEngagementRate(update);
  return update;
}

function providerResultForJob(post, job) {
  return (post.publishResults || []).find((result) =>
    id(result.account) === id(job.account)
    && String(result.platform || '') === String(job.platform || '')
  );
}

async function notifyPublicationResolved(post, success, message) {
  try {
    await notifyUser({
      user: post.createdBy,
      type: success ? 'post_published' : 'post_failed',
      title: success ? 'Post published' : 'Provider publishing failed',
      message,
      severity: success ? 'success' : 'error',
      entityType: 'Post',
      entityId: post._id,
      actionUrl: '/dashboard/calendar'
    });
  } catch (error) {
    console.error('[analytics-sync] publication notification failed', { postId: id(post._id), error: error.message });
  }
}

async function reconcileProviderProcessing(post, job, { metrics, error } = {}) {
  if (String(job.platform) !== 'tiktok') return;
  const result = providerResultForJob(post, job);
  if (!result || result.status !== 'processing') return;

  const before = post.status;
  if (error?.publicationFailed) {
    result.status = 'failed';
    result.errorMessage = error.message;
    result.publishedAt = new Date();
  } else if (metrics?.publicationComplete || error?.publicationComplete) {
    result.status = 'published';
    if (metrics?.providerPostId) result.platformPostId = metrics.providerPostId;
    if (metrics?.providerPostUrl) result.platformPostUrl = metrics.providerPostUrl;
    result.errorMessage = '';
    result.publishedAt = new Date();
  } else {
    return;
  }

  const states = (post.publishResults || []).map((item) => item.status);
  if (states.includes('failed')) {
    post.status = 'failed';
    post.errorMessage = (post.publishResults || []).filter((item) => item.status === 'failed').map((item) => item.errorMessage).filter(Boolean).join(' | ');
  } else if (states.includes('processing')) {
    post.status = 'provider_processing';
  } else {
    post.status = 'published';
    post.publishedAt = post.publishedAt || new Date();
    post.errorMessage = '';
    post.platformPostId = (post.publishResults || []).find((item) => item.status === 'published')?.platformPostId || post.platformPostId;
    post.platformPostUrl = (post.publishResults || []).find((item) => item.status === 'published' && item.platformPostUrl)?.platformPostUrl || post.platformPostUrl;
  }
  post.markModified('publishResults');
  await post.save();

  if (before === 'provider_processing' && post.status === 'published') {
    await notifyPublicationResolved(post, true, `${post.title || post.platform || 'Post'} finished provider processing and is now published.`);
  }
  if (result.status === 'failed') {
    await notifyPublicationResolved(post, false, error.message);
  }
}

async function markAccountAnalyticsAuthFailure(account, error) {
  const message = String(error?.message || error || '');
  if (!/access token|invalid token|expired|oauth|permission|scope|reconnect|not authorized/i.test(message)) return;
  account.status = 'needs_reconnect';
  account.healthStatus = 'failed';
  account.reconnectRequiredAt = new Date();
  account.lastHealthCheckAt = new Date();
  account.lastPublishError = message;
  account.providerMeta = {
    ...(account.providerMeta || {}),
    analyticsSync: { status: 'failed', errorMessage: message, checkedAt: new Date() }
  };
  await account.save().catch(() => {});
}

async function syncClaimedAnalyticsJob(job) {
  const [post, account] = await Promise.all([
    Post.findById(job.post),
    SocialAccount.findById(job.account)
  ]);
  if (!post || !account) {
    job.status = 'unsupported';
    job.unsupportedReason = !post ? 'Post was removed.' : 'Social destination was removed.';
    job.nextAttemptAt = undefined;
    job.leaseOwner = '';
    job.leaseUntil = undefined;
    await job.save();
    return { status: 'unsupported' };
  }

  try {
    // Load provider adapters only inside the worker path. Publishing only needs to enqueue
    // sync jobs and must not eagerly initialize every provider SDK/configuration module.
    const { fetchProviderMetrics } = require('./providerMetrics.service');
    const metrics = await fetchProviderMetrics({
      platform: job.platform,
      account,
      platformPostId: job.providerPostId,
      post
    });

    await reconcileProviderProcessing(post, job, { metrics });

    if (metrics.providerPostId && metrics.providerPostId !== job.providerPostId) {
      job.providerPostId = metrics.providerPostId;
    }

    await Analytics.findOneAndUpdate(
      { post: post._id, account: account._id, platform: job.platform, recordKind: 'lifetime' },
      {
        $set: {
          brand: post.brand,
          post: post._id,
          campaign: post.campaign || undefined,
          account: account._id,
          platform: job.platform,
          ...metricUpdate(metrics)
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await updateBrandPerformanceMemory({ brandIds: [post.brand] }).catch((memoryError) => {
      console.error('[analytics-sync] brand performance memory refresh failed', { brandId: id(post.brand), error: memoryError.message });
    });

    const now = new Date();
    job.status = 'succeeded';
    job.lastSuccessAt = now;
    job.consecutiveFailures = 0;
    job.lastError = '';
    job.unsupportedReason = '';
    job.nextAttemptAt = new Date(now.getTime() + successIntervalMs(post));
    job.leaseOwner = '';
    job.leaseUntil = undefined;
    job.metadata = {
      ...(job.metadata || {}),
      lastAvailableMetrics: metrics.availableMetrics || [],
      lastProviderPostUrl: metrics.providerPostUrl || '',
      lastMetricCount: (metrics.availableMetrics || []).length
    };
    await job.save();
    return { status: 'succeeded', metrics };
  } catch (error) {
    await reconcileProviderProcessing(post, job, { error });
    await markAccountAnalyticsAuthFailure(account, error);

    const permanent = Boolean(error?.permanent || error?.code === 'ANALYTICS_UNSUPPORTED');
    const failures = Number(job.consecutiveFailures || 0) + 1;
    job.consecutiveFailures = failures;
    job.lastError = String(error?.message || error || 'Analytics sync failed.').slice(0, 4000);
    job.leaseOwner = '';
    job.leaseUntil = undefined;

    if (permanent) {
      job.status = 'unsupported';
      job.unsupportedReason = job.lastError;
      job.nextAttemptAt = undefined;
    } else {
      job.status = 'retry';
      job.nextAttemptAt = new Date(Date.now() + failureBackoffMs(failures));
    }
    await job.save();
    return { status: job.status, error };
  }
}

async function runAnalyticsSyncBatch({ concurrency = 2 } = {}) {
  const workerCount = Math.max(1, Math.min(10, Number(concurrency || 2)));
  const results = [];
  async function worker() {
    for (;;) {
      const job = await claimDueAnalyticsJob();
      if (!job) return;
      results.push(await syncClaimedAnalyticsJob(job));
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function tick({ concurrency = 2, seedIntervalMs = DEFAULT_SEED_MS } = {}) {
  if (ticking) return;
  ticking = true;
  try {
    if (Date.now() - lastSeedAt >= seedIntervalMs) {
      await seedAnalyticsSyncJobs();
      lastSeedAt = Date.now();
    }
    await runAnalyticsSyncBatch({ concurrency });
  } catch (error) {
    console.error('[analytics-sync] tick failed', error);
  } finally {
    ticking = false;
  }
}

function startAnalyticsSyncProcessor({ pollMs = DEFAULT_POLL_MS, concurrency = 2 } = {}) {
  if (timer) return;
  const cadence = Math.max(30_000, Number(pollMs || DEFAULT_POLL_MS));
  timer = setInterval(() => tick({ concurrency }), cadence);
  timer.unref?.();
  setImmediate(() => tick({ concurrency }));
  console.log('[analytics-sync] processor started', { workerId: WORKER_ID, pollMs: cadence, concurrency });
}

function stopAnalyticsSyncProcessor() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  claimDueAnalyticsJob,
  ensureAnalyticsSyncJobsForPost,
  failureBackoffMs,
  runAnalyticsSyncBatch,
  seedAnalyticsSyncJobs,
  startAnalyticsSyncProcessor,
  stopAnalyticsSyncProcessor,
  successIntervalMs,
  syncClaimedAnalyticsJob
};
