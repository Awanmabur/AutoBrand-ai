const Post = require('../models/Post');
const SocialAccount = require('../models/SocialAccount');
const { isFacebookConfigured, publishFacebookPost } = require('./facebookService');
const { publishGoogleBusinessPost } = require('./googleBusinessProfileService');
const { publishInstagramPost } = require('./instagramService');
const { isLinkedInConfigured, publishLinkedInPost } = require('./linkedinService');
const { publishPinterestPin } = require('./pinterestService');
const { publishXPost } = require('./xService');
const { publishThreadsPost } = require('./threadsService');
const { isTikTokConfigured, publishTikTokVideo } = require('./tiktokService');
const { isWhatsAppConfigured, publishWhatsAppMessage } = require('./whatsappService');
const { isYouTubeConfigured, publishYouTubeVideo } = require('./youtubeService');
const { shouldUseHandoffFallback } = require('./auto-handoff/handoff.service');
const { applyRetryPolicy } = require('./publishingRetryPolicyService');
const { buildPublishingReadiness, publicUrlFromPublishResult } = require('./publishingReadiness.service');
const { notifyAccountDisconnected, notifyUser } = require('./notification.service');

async function accountsForPost(post) {
  const selectedIds = (post.targetAccounts || []).map((id) => id?._id || id).filter(Boolean);
  const filter = {
    brand: post.brand._id,
    platform: post.platform,
    status: { $in: ['connected', 'mock'] }
  };

  if (selectedIds.length) filter._id = { $in: selectedIds };
  return SocialAccount.find(filter).sort({ accountName: 1 });
}

async function publishToAccount({ post, account }) {
  if (post.platform === 'facebook' && account) return publishFacebookPost({ post, account });
  if (post.platform === 'google_business' && account?.status === 'connected') return publishGoogleBusinessPost({ post, account });
  if (post.platform === 'instagram' && account?.status === 'connected') return publishInstagramPost({ post, account });
  if (post.platform === 'linkedin' && account?.status === 'connected') return publishLinkedInPost({ post, account });
  if (post.platform === 'pinterest' && account?.status === 'connected') return publishPinterestPin({ post, account });
  if (post.platform === 'x' && account?.status === 'connected') return publishXPost({ post, account });
  if (post.platform === 'threads' && account?.status === 'connected') return publishThreadsPost({ post, account });
  if (post.platform === 'tiktok' && account?.status === 'connected') return publishTikTokVideo({ post, account });
  if (post.platform === 'whatsapp' && (account?.status === 'connected' || isWhatsAppConfigured())) return publishWhatsAppMessage({ post, account: account || {} });
  if (post.platform === 'youtube' && account?.status === 'connected') return publishYouTubeVideo({ post, account });
  return { id: `mock_${post.platform}_${account?._id || post._id}` };
}

function needsConnectedAccount(platform) {
  if (platform === 'youtube') return isYouTubeConfigured();
  if (platform === 'tiktok') return isTikTokConfigured();
  if (platform === 'linkedin') return isLinkedInConfigured();
  if (['instagram', 'google_business', 'pinterest', 'x', 'threads'].includes(platform)) return true;
  if (platform === 'whatsapp') return !isWhatsAppConfigured();
  return false;
}

function canPersistAccount(account) {
  return account?._id && typeof account.save === 'function';
}

function isReconnectRequiredPublishingError(errorOrMessage) {
  const message = String(errorOrMessage?.message || errorOrMessage || '');
  return /access token|invalid token|expired|oauth|permission|scope|app review|not approved|reconnect|insufficient/i.test(message);
}

function providerApprovalMessage(errorOrMessage, platform = '') {
  const message = String(errorOrMessage?.message || errorOrMessage || '');
  if (/permission|scope|app review|not approved|insufficient/i.test(message)) {
    return `${platform || 'Provider'} publishing permissions need provider approval or expanded scopes before direct publishing can continue.`;
  }
  if (/access token|invalid token|expired|oauth|reconnect/i.test(message)) {
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
    await notifyAccountDisconnected({
      user: post?.createdBy || account.owner,
      account,
      health: { status: 'needs_reconnect', message: approvalMessage || message }
    });
  }
}

async function publishPost(postId) {
  const post = await Post.findById(postId).populate('brand').populate('media').populate('targetAccounts');
  if (!post || post.status === 'cancelled') return null;
  if (post.status === 'published') return post;

  try {
    if (post.approvalRequired && !['approved', 'scheduled', 'publishing'].includes(post.status)) {
      throw new Error('This post requires approval before publishing.');
    }

    const readiness = await buildPublishingReadiness(post);
    post.validationWarnings = [...new Set([...(post.validationWarnings || []), ...readiness.warnings])];
    post.platformMetadata = {
      ...(post.platformMetadata || {}),
      publishReadiness: readiness
    };
    if (!readiness.ready) {
      throw new Error(`Publishing validation failed: ${readiness.blockers.join(' | ')}`);
    }

    const accounts = await accountsForPost(post);

    if (post.platform === 'facebook' && isFacebookConfigured() && !accounts.length) {
      throw new Error('No selected or connected Facebook Page found for this brand. Connect Facebook, then select at least one Page.');
    }

    if (needsConnectedAccount(post.platform) && !accounts.some((account) => account.status === 'connected')) {
      throw new Error(`No connected ${post.platform} account found for this brand. Connect ${post.platform}, then select it before publishing.`);
    }

    if (!accounts.length) {
      accounts.push({ _id: null, platform: post.platform, accountName: `${post.platform} mock`, status: 'mock' });
    }

    const results = [];
    const failures = [];

    for (const account of accounts) {
      try {
        const platformResult = await publishToAccount({ post, account });
        const platformPostUrl = publicUrlFromPublishResult(platformResult);
        await markAccountPublishSuccess(account, platformResult);
        results.push({
          account: account._id || undefined,
          accountName: account.accountName,
          platform: account.platform || post.platform,
          status: 'published',
          platformPostId: platformResult.id,
          platformPostUrl,
          publishedAt: new Date()
        });
      } catch (error) {
        await markAccountPublishFailure(account, error, post);
        failures.push(`${account.accountName}: ${error.message}`);
        results.push({
          account: account._id || undefined,
          accountName: account.accountName,
          platform: account.platform || post.platform,
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
    await post.save();

    if (failures.length) {
      const retry = await applyRetryPolicy(post, failures.join(' | '));
      await notifyUser({
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

    await notifyUser({
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

      await notifyUser({
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
