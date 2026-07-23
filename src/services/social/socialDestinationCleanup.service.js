const Campaign = require('../../models/Campaign');
const Post = require('../../models/Post');
const SocialAccount = require('../../models/SocialAccount');
const { destinationReadiness, stringId } = require('./socialDestination.service');

const ACTIVE_POST_STATUSES = ['pending_approval', 'approved', 'scheduled', 'publishing'];

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || '')).filter(Boolean))];
}

function filterPlanByPlatforms(aiPlan = {}, platforms = []) {
  const allowed = new Set(platforms);
  const next = { ...(aiPlan || {}) };
  ['postIdeas', 'captions', 'creativeIdeas', 'videoScripts', 'weeklyPlan', 'monthlyPlan'].forEach((key) => {
    if (!Array.isArray(next[key])) return;
    next[key] = next[key].filter((item) => !item?.platform || allowed.has(item.platform));
  });
  return next;
}

async function cleanupDisconnectedDestination(account) {
  const accountId = account?._id || account;
  const ownerId = account?.owner;
  const brandId = account?.brand?._id || account?.brand;
  if (!accountId || !ownerId || !brandId) return { postsUpdated: 0, campaignsUpdated: 0 };

  const [remainingAccounts, affectedPosts, affectedCampaigns] = await Promise.all([
    SocialAccount.find({
      owner: ownerId,
      brand: brandId,
      _id: { $ne: accountId },
      status: 'connected'
    }).select('_id platform accountName accountId accessTokenEncrypted tokenExpiresAt status permissions providerMeta').lean(),
    Post.find({ createdBy: ownerId, brand: brandId, targetAccounts: accountId }),
    Campaign.find({ createdBy: ownerId, brand: brandId, targetAccounts: accountId })
  ]);

  const readyRemaining = remainingAccounts.filter((candidate) => destinationReadiness(candidate).ready);
  const readyById = new Map(readyRemaining.map((candidate) => [stringId(candidate), candidate]));
  let postsUpdated = 0;
  let campaignsUpdated = 0;

  for (const post of affectedPosts) {
    const remainingTargetIds = unique((post.targetAccounts || []).filter((id) => stringId(id) !== stringId(accountId)));
    const selectedReadyAccounts = remainingTargetIds.map((id) => readyById.get(id)).filter(Boolean);
    const selectedTargetIds = selectedReadyAccounts.map((candidate) => candidate._id);
    const selectedTargetIdSet = new Set(selectedTargetIds.map(stringId));
    const selectedPlatforms = unique(selectedReadyAccounts.map((candidate) => candidate.platform));

    post.targetAccounts = selectedTargetIds;
    post.platforms = selectedPlatforms;
    post.platform = selectedPlatforms[0] || post.platform;
    post.platformVariations = (post.platformVariations || []).filter((variation) => (!variation.account || selectedTargetIdSet.has(stringId(variation.account))) && (!variation.platform || selectedPlatforms.includes(variation.platform)));
    post.scheduleVersion = Number(post.scheduleVersion || 0) + 1;
    post.publishingStartedAt = undefined;
    post.publishingAttemptId = '';

    if (!selectedReadyAccounts.length) {
      post.errorMessage = 'A selected social destination was removed. Select a connected destination before publishing.';
      if (ACTIVE_POST_STATUSES.includes(post.status)) {
        post.status = 'failed';
        post.scheduledAt = undefined;
      }
    } else if (post.errorMessage?.includes('selected social destination was removed')) {
      post.errorMessage = '';
    }

    post.platformMetadata = {
      ...(post.platformMetadata || {}),
      destinationCleanup: {
        removedAccountId: stringId(accountId),
        remainingAccountIds: selectedTargetIds.map(stringId),
        remainingPlatforms: selectedPlatforms,
        cleanedAt: new Date()
      }
    };
    post.markModified('platformMetadata');
    await post.save();
    postsUpdated += 1;
  }

  for (const campaign of affectedCampaigns) {
    const remainingTargetIds = unique((campaign.targetAccounts || []).filter((id) => stringId(id) !== stringId(accountId)));
    const selectedReadyAccounts = remainingTargetIds.map((id) => readyById.get(id)).filter(Boolean);
    const selectedTargetIds = selectedReadyAccounts.map((candidate) => candidate._id);
    const selectedPlatforms = unique(selectedReadyAccounts.map((candidate) => candidate.platform));

    campaign.targetAccounts = selectedTargetIds;
    campaign.platforms = selectedPlatforms;
    campaign.aiPlan = filterPlanByPlatforms(campaign.aiPlan, selectedPlatforms);
    if (!selectedReadyAccounts.length && ['active', 'approved'].includes(campaign.status)) campaign.status = 'paused';
    campaign.markModified('aiPlan');
    await campaign.save();
    campaignsUpdated += 1;
  }

  return { postsUpdated, campaignsUpdated };
}

module.exports = { cleanupDisconnectedDestination, filterPlanByPlatforms };
