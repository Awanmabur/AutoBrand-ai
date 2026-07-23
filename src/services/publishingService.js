const crypto = require('crypto');
const Post = require('../models/Post');
const Approval = require('../models/Approval');
const env = require('../config/env');
const SocialAccount = require('../models/SocialAccount');
const { publishFacebookPost } = require('./facebookService');
const { publishGoogleBusinessPost } = require('./googleBusinessProfileService');
const { publishInstagramPost } = require('./instagramService');
const { publishLinkedInPost } = require('./linkedinService');
const { publishPinterestPin } = require('./pinterestService');
const { publishXPost } = require('./xService');
const { publishThreadsPost } = require('./threadsService');
const { publishTikTokVideo } = require('./tiktokService');
const { publishYouTubeVideo } = require('./youtubeService');
const { shouldUseHandoffFallback } = require('./auto-handoff/handoff.service');
const { applyRetryPolicy } = require('./publishingRetryPolicyService');
const { buildPublishingReadiness, publicUrlFromPublishResult } = require('./publishingReadiness.service');
const { notifyAccountDisconnected, notifyUser } = require('./notification.service');
const { isTokenDecryptionError } = require('./tokenCryptoService');

async function bestEffort(label, task) {
  try {
    return await task();
  } catch (error) {
    console.error(`${label}:`, error.message);
    return null;
  }
}

async function safeNotifyUser(payload) {
  return bestEffort('Publishing notification failed', () => notifyUser(payload));
}

async function settleWithConcurrency(items, limit, task) {
  const queue = Array.from(items || []);
  const results = new Array(queue.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(Math.max(1, Number(limit || 1)), queue.length || 1));

  async function worker() {
    while (cursor < queue.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: 'fulfilled', value: await task(queue[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function accountsForPlatform(post, platform) {
  const selectedIds = (post.targetAccounts || []).map((id) => id?._id || id).filter(Boolean);
  const allowedStatuses = ['connected'];
  const filter = {
    brand: post.brand._id,
    owner: post.createdBy,
    platform,
    status: { $in: allowedStatuses }
  };

  if (selectedIds.length) filter._id = { $in: selectedIds };
  const accounts = await SocialAccount.find(filter).sort({ accountName: 1 });
  return accounts.filter((account) => platform !== 'instagram' || Boolean(account.providerMeta?.permissionGrantVerifiedAt));
}

function postViewForPlatform(post, platform) {
  const variation = (post.platformVariations || []).find((item) => item.platform === platform);
  if (!variation) return post.platform === platform ? post : { ...post.toObject(), platform };
  const base = post.toObject();
  return {
    ...base,
    platform,
    caption: variation.caption || base.caption,
    hashtags: variation.hashtags?.length ? variation.hashtags : base.hashtags,
    firstComment: variation.firstComment || base.firstComment,
    altText: variation.altText || base.altText,
    thumbnail: variation.thumbnail || base.thumbnail,
    videoTitle: variation.videoTitle || base.videoTitle,
    videoDescription: variation.videoDescription || base.videoDescription,
    shortVideoHook: variation.shortVideoHook || base.shortVideoHook
  };
}

async function publishToAccount({ post, account }) {
  if (!account) throw new Error(`No connected ${post.platform} account was selected.`);
  if (account.status === 'mock') {
    throw new Error('Mock social accounts cannot publish in production or create live posts. Reconnect the real provider account.');
  }
  if (account.status !== 'connected') throw new Error(`${account.accountName || post.platform} is not connected.`);

  if (post.platform === 'facebook') return publishFacebookPost({ post, account });
  if (post.platform === 'google_business') return publishGoogleBusinessPost({ post, account });
  if (post.platform === 'instagram') return publishInstagramPost({ post, account });
  if (post.platform === 'linkedin') return publishLinkedInPost({ post, account });
  if (post.platform === 'pinterest') return publishPinterestPin({ post, account });
  if (post.platform === 'x') return publishXPost({ post, account });
  if (post.platform === 'threads') return publishThreadsPost({ post, account });
  if (post.platform === 'tiktok') return publishTikTokVideo({ post, account });
  if (post.platform === 'youtube') return publishYouTubeVideo({ post, account });
  throw new Error(`Direct publishing is not implemented for ${post.platform}.`);
}

function canPersistAccount(account) {
  return account?._id && typeof account.save === 'function';
}

function isReconnectRequiredPublishingError(errorOrMessage) {
  if (isTokenDecryptionError(errorOrMessage)) return true;
  const message = String(errorOrMessage?.message || errorOrMessage || '');
  return /access token|invalid token|expired|oauth|permission|scope|app review|not approved|reconnect|insufficient|application has been deleted|application does not exist|invalid application|app not found/i.test(message);
}

function providerApprovalMessage(errorOrMessage, platform = '') {
  const message = String(errorOrMessage?.message || errorOrMessage || '');
  if (isTokenDecryptionError(errorOrMessage)) {
    return `${platform || 'Provider'} credentials were encrypted with a different TOKEN_ENCRYPTION_KEY. Restore the previous key or reconnect this account.`;
  }
  if (/permission|scope|app review|not approved|insufficient/i.test(message)) {
    return `${platform || 'Provider'} publishing permissions need provider approval or expanded scopes before direct publishing can continue.`;
  }
  if (/access token|invalid token|expired|oauth|reconnect|application has been deleted|application does not exist|invalid application|app not found/i.test(message)) {
    return `${platform || 'Provider'} needs a fresh token before direct publishing can continue.`;
  }
  return '';
}

async function markAccountPublishSuccess(account, platformResult = {}) {
  if (!canPersistAccount(account)) return;
  const now = new Date();
  const platformPostUrl = publicUrlFromPublishResult(platformResult);
  account.status = 'connected';
  account.healthStatus = 'healthy';
  account.lastHealthCheckAt = now;
  account.lastSyncAt = now;
  account.lastPublishError = '';
  account.providerMeta = {
    ...(account.providerMeta || {}),
    lastPublish: {
      status: 'published',
      platformPostId: platformResult.id || '',
      platformPostUrl,
      checkedAt: now
    }
  };
  await account.save();
}

async function markAccountPublishFailure(account, error, post) {
  if (!canPersistAccount(account)) return;
  const now = new Date();
  const message = String(error?.message || error || 'Publishing failed.');
  const approvalMessage = providerApprovalMessage(message, account.platform);
  account.healthStatus = 'failed';
  account.lastHealthCheckAt = now;
  account.lastPublishError = message;
  account.providerMeta = {
    ...(account.providerMeta || {}),
    lastPublish: {
      status: 'failed',
      errorMessage: message,
      approvalMessage,
      checkedAt: now
    }
  };
  if (isReconnectRequiredPublishingError(message)) {
    account.status = 'needs_reconnect';
    account.reconnectRequiredAt = now;
  }
  await account.save();
  if (account.status === 'needs_reconnect') {
    await bestEffort('Disconnected-account notification failed', () => notifyAccountDisconnected({
      user: post?.createdBy || account.owner,
      account,
      health: { status: 'needs_reconnect', message: approvalMessage || message }
    }));
  }
}

async function publishPost(postId, { expectedScheduleVersion } = {}) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - Math.max(5 * 60 * 1000, Number(process.env.PUBLISHING_STALE_MS || 15 * 60 * 1000)));
  const claimFilter = {
    _id: postId,
    $or: [
      { status: 'scheduled', scheduledAt: { $lte: now } },
      { status: 'publishing', publishingStartedAt: { $lte: staleBefore } },
      { status: 'publishing', publishingStartedAt: { $exists: false }, updatedAt: { $lte: staleBefore } }
    ]
  };
  if (expectedScheduleVersion !== undefined && expectedScheduleVersion !== null) {
    const expectedVersion = Math.max(0, Number(expectedScheduleVersion) || 0);
    if (expectedVersion === 0) {
      claimFilter.$and = [
        ...(claimFilter.$and || []),
        { $or: [{ scheduleVersion: 0 }, { scheduleVersion: { $exists: false } }] }
      ];
    } else {
      claimFilter.scheduleVersion = expectedVersion;
    }
  }

  const publishingAttemptId = crypto.randomUUID();
  const claimed = await Post.findOneAndUpdate(
    claimFilter,
    {
      $set: {
        status: 'publishing',
        publishingStartedAt: now,
        publishingAttemptId
      }
    },
    { new: true }
  );

  if (!claimed) {
    const existing = await Post.findById(postId);
    if (!existing || ['cancelled', 'published'].includes(existing.status)) return existing || null;
    return null;
  }

  const post = await Post.findById(claimed._id).populate('brand').populate('media').populate('targetAccounts');
  if (!post) return null;

  try {
    if (post.approvalRequired) {
      const approved = post.handoffStatus === 'approved' || Boolean(await Approval.exists({
        post: post._id,
        $or: [{ status: 'approved' }, { decision: 'approved' }]
      }));
      if (!approved) {
        post.status = 'pending_approval';
        post.publishingStartedAt = undefined;
        post.publishingAttemptId = '';
        post.errorMessage = 'This post requires approval before publishing.';
        await post.save();
        await safeNotifyUser({
          user: post.createdBy,
          type: 'post_approval_required',
          title: 'Approval required',
          message: post.errorMessage,
          severity: 'warning',
          entityType: 'Post',
          entityId: post._id,
          actionUrl: '/dashboard/approvals'
        });
        return post;
      }
    }

    const platformsToPublish = [...new Set(post.platforms?.length ? post.platforms : [post.platform])];
    const readinessChecks = await Promise.all(platformsToPublish.map(async (platform) => {
      const platformPost = postViewForPlatform(post, platform);
      const readiness = await buildPublishingReadiness(platformPost);
      return { platform, ...readiness };
    }));
    const readinessByPlatform = new Map(readinessChecks.map((item) => [item.platform, item]));
    const readiness = {
      // Multi-platform publishing is intentionally not all-or-nothing. A platform
      // that cannot accept the current media (for example Instagram receiving a
      // localhost URL) must not prevent an otherwise valid Facebook Page publish.
      ready: readinessChecks.some((item) => item.ready),
      fullyReady: readinessChecks.every((item) => item.ready),
      warnings: [...new Set(readinessChecks.flatMap((item) => item.warnings || []))],
      blockers: [...new Set(readinessChecks.flatMap((item) => (item.blockers || []).map((warning) => `${item.platform}: ${warning}`)))],
      platforms: readinessChecks,
      checkedAt: new Date()
    };
    post.validationWarnings = [...new Set([...(post.validationWarnings || []), ...readiness.warnings])];
    post.platformMetadata = {
      ...(post.platformMetadata || {}),
      publishReadiness: readiness
    };

    console.log('[publishing] post claimed', {
      postId: String(post._id),
      attemptId: publishingAttemptId,
      platforms: platformsToPublish,
      readiness: readinessChecks.map((item) => ({
        platform: item.platform,
        ready: item.ready,
        blockers: item.blockers || []
      }))
    });

    // A previous attempt may have partially succeeded (some platforms published,
    // others failed and got scheduled for retry). Carry forward what already
    // succeeded and never re-attempt it - otherwise every retry re-publishes to
    // platforms that already have a live post, duplicating them each cycle.
    const previousResults = Array.isArray(post.publishResults) ? post.publishResults : [];
    const succeededKeys = new Set(
      previousResults
        .filter((item) => item.status === 'published')
        .map((item) => `${item.platform}:${item.account ? String(item.account) : 'mock'}`)
    );
    const platformsWithPriorSuccess = new Set(
      previousResults.filter((item) => item.status === 'published').map((item) => item.platform)
    );

    const results = previousResults.filter((item) => item.status === 'published');
    const failures = [];
    const jobs = [];

    for (const platform of platformsToPublish) {
      const platformReadiness = readinessByPlatform.get(platform);
      if (!platformReadiness?.ready) {
        if (!platformsWithPriorSuccess.has(platform)) {
          const message = (platformReadiness?.blockers || []).join(' | ') || `Publishing validation failed for ${platform}.`;
          failures.push(`${platform}: ${message}`);
          results.push({
            platform,
            status: 'failed',
            errorMessage: message,
            publishedAt: new Date()
          });
          console.error('[publishing] platform blocked before provider call', {
            postId: String(post._id),
            platform,
            blockers: platformReadiness?.blockers || []
          });
        }
        continue;
      }

      const accounts = await accountsForPlatform(post, platform);

      if (!accounts.length) {
        if (!platformsWithPriorSuccess.has(platform)) {
          const message = `No connected ${platform} account found for this brand. Connect and select a destination before publishing.`;
          failures.push(`${platform}: ${message}`);
          results.push({ platform, status: 'failed', errorMessage: message, publishedAt: new Date() });
        }
        continue;
      }

      const effectiveAccounts = accounts.filter((account) => !succeededKeys.has(`${platform}:${account._id ? String(account._id) : 'mock'}`));

      if (!effectiveAccounts.length) continue;

      const platformPost = postViewForPlatform(post, platform);

      for (const account of effectiveAccounts) {
        jobs.push({ platform, account, platformPost });
      }
    }

    // Publish to every platform/account concurrently instead of one at a time -
    // each provider call is network-bound (some, like Instagram video, take up to
    // two minutes), so running them sequentially made multi-platform posts take
    // the sum of every platform's latency instead of just the slowest one.
    console.log('[publishing] provider jobs prepared', {
      postId: String(post._id),
      jobs: jobs.map((job) => ({
        platform: job.platform,
        accountId: String(job.account?._id || ''),
        accountName: job.account?.accountName || ''
      })),
      preflightFailures: failures
    });

    const settled = await settleWithConcurrency(
      jobs,
      Math.max(1, Math.min(10, Number(process.env.POST_PUBLISH_CONCURRENCY || 3))),
      async (job) => {
        console.log('[publishing] provider request starting', {
          postId: String(post._id),
          platform: job.platform,
          accountId: String(job.account?._id || ''),
          accountName: job.account?.accountName || ''
        });
        return publishToAccount({ post: job.platformPost, account: job.account });
      }
    );

    for (let index = 0; index < jobs.length; index += 1) {
      const { platform, account } = jobs[index];
      const outcome = settled[index];

      if (outcome.status === 'fulfilled') {
        const platformResult = outcome.value;
        console.log('[publishing] provider request succeeded', {
          postId: String(post._id),
          platform,
          accountId: String(account?._id || ''),
          accountName: account?.accountName || '',
          providerPostId: platformResult?.id || ''
        });
        const platformPostUrl = publicUrlFromPublishResult(platformResult);
        await bestEffort('Could not persist social-account publish success', () => markAccountPublishSuccess(account, platformResult));
        results.push({
          account: account._id || undefined,
          accountName: account.accountName,
          platform: account.platform || platform,
          status: 'published',
          platformPostId: platformResult.id,
          platformPostUrl,
          publishedAt: new Date()
        });
      } else {
        const error = outcome.reason;
        console.error('[publishing] provider request failed', {
          postId: String(post._id),
          platform,
          accountId: String(account?._id || ''),
          accountName: account?.accountName || '',
          error: error?.message || String(error)
        });
        await bestEffort('Could not persist social-account publish failure', () => markAccountPublishFailure(account, error, post));
        failures.push(`${account.accountName}: ${error.message}`);
        results.push({
          account: account._id || undefined,
          accountName: account.accountName,
          platform: account.platform || platform,
          status: 'failed',
          errorMessage: error.message,
          publishedAt: new Date()
        });
      }
    }

    post.publishResults = results;
    post.status = failures.length ? 'failed' : 'published';
    post.publishedAt = failures.length ? undefined : new Date();
    post.platformPostId = results.find((item) => item.status === 'published')?.platformPostId || post.platformPostId;
    post.platformPostUrl = results.find((item) => item.status === 'published' && item.platformPostUrl)?.platformPostUrl || post.platformPostUrl;
    post.platformMetadata = {
      ...(post.platformMetadata || {}),
      publishReadiness: {
        ...(post.platformMetadata?.publishReadiness || {}),
        status: failures.length ? 'failed' : 'published',
        checkedAt: new Date()
      },
      publishUrls: results.reduce((map, item) => {
        if (item.platformPostUrl) map[item.accountName || item.platform || 'published'] = item.platformPostUrl;
        return map;
      }, {})
    };
    post.errorMessage = failures.join(' | ');
    post.publishingStartedAt = undefined;
    post.publishingAttemptId = '';
    await post.save();

    console.log('[publishing] post attempt completed', {
      postId: String(post._id),
      status: post.status,
      published: results.filter((item) => item.status === 'published').map((item) => ({
        platform: item.platform,
        accountName: item.accountName || ''
      })),
      failures
    });

    if (failures.length) {
      const retry = await applyRetryPolicy(post, failures.join(' | '));
      await safeNotifyUser({
        user: post.createdBy,
        type: retry.scheduled ? 'post_retry_scheduled' : 'post_failed',
        title: retry.scheduled ? 'Post retry scheduled' : 'Post failed on some Pages',
        message: retry.scheduled
          ? `${post.title || post.platform} will retry at ${retry.nextRetryAt.toLocaleString()}.`
          : failures.join(' | '),
        severity: retry.scheduled ? 'warning' : 'error',
        entityType: 'Post',
        entityId: post._id,
        actionUrl: '/dashboard/calendar',
        metadata: { failures }
      });
      throw new Error(failures.join(' | '));
    }

    await safeNotifyUser({
      user: post.createdBy,
      type: 'post_published',
      title: 'Post published',
      message: `${post.title || post.platform} was published to ${results.length} destination(s).`,
      severity: 'success',
      entityType: 'Post',
      entityId: post._id,
      actionUrl: '/dashboard/calendar',
      metadata: { results }
    });
    return post;
  } catch (error) {
    if (!post.publishResults?.length) {
      post.errorMessage = error.message;
      const retry = await applyRetryPolicy(post, error.message);

      if (shouldUseHandoffFallback(error)) {
        post.workflowMode = post.workflowMode === 'auto' ? 'handoff' : post.workflowMode;
        post.handoffStatus = 'ready';
        post.handoffNotes = [post.handoffNotes, `Direct publishing failed: ${error.message}`].filter(Boolean).join('\n');
        await post.save();
      }

      await safeNotifyUser({
        user: post.createdBy,
        type: retry.scheduled ? 'post_retry_scheduled' : 'post_failed',
        title: retry.scheduled ? 'Post retry scheduled' : shouldUseHandoffFallback(error) ? 'Post moved to handoff' : 'Post failed',
        message: retry.scheduled ? `${error.message} Retrying at ${retry.nextRetryAt.toLocaleString()}.` : error.message,
        severity: retry.scheduled || shouldUseHandoffFallback(error) ? 'warning' : 'error',
        entityType: 'Post',
        entityId: post._id,
        actionUrl: shouldUseHandoffFallback(error) ? '/dashboard/approvals' : '/dashboard/calendar',
        metadata: { retry }
      });
    }

    throw error;
  }
}

module.exports = { publishPost };
