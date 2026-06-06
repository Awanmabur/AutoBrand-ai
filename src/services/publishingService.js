const Post = require('../models/Post');
const Notification = require('../models/Notification');
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

async function publishPost(postId) {
  const post = await Post.findById(postId).populate('brand').populate('media').populate('targetAccounts');
  if (!post || post.status === 'cancelled') return null;
  if (post.status === 'published') return post;

  try {
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
        results.push({
          account: account._id || undefined,
          accountName: account.accountName,
          platform: account.platform || post.platform,
          status: 'published',
          platformPostId: platformResult.id,
          publishedAt: new Date()
        });
      } catch (error) {
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
    post.errorMessage = failures.join(' | ');
    await post.save();

    if (failures.length) {
      const retry = await applyRetryPolicy(post, failures.join(' | '));
      await Notification.create({
        user: post.createdBy,
        type: retry.scheduled ? 'post_retry_scheduled' : 'post_failed',
        title: retry.scheduled ? 'Post retry scheduled' : 'Post failed on some Pages',
        message: retry.scheduled
          ? `${post.title || post.platform} will retry at ${retry.nextRetryAt.toLocaleString()}.`
          : failures.join(' | '),
        entityType: 'Post',
        entityId: post._id
      });
      throw new Error(failures.join(' | '));
    }

    await Notification.create({
      user: post.createdBy,
      type: 'post_published',
      title: 'Post published',
      message: `${post.title || post.platform} was published to ${results.length} destination(s).`,
      entityType: 'Post',
      entityId: post._id
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

      await Notification.create({
        user: post.createdBy,
        type: retry.scheduled ? 'post_retry_scheduled' : 'post_failed',
        title: retry.scheduled ? 'Post retry scheduled' : shouldUseHandoffFallback(error) ? 'Post moved to handoff' : 'Post failed',
        message: retry.scheduled ? `${error.message} Retrying at ${retry.nextRetryAt.toLocaleString()}.` : error.message,
        entityType: 'Post',
        entityId: post._id
      });
    }

    throw error;
  }
}

module.exports = { publishPost };
