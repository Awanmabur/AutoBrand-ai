const UsageRecord = require('../models/UsageRecord');
const Brand = require('../models/Brand');
const ClientApprovalLink = require('../models/ClientApprovalLink');
const UsageLog = require('../models/UsageLog');
const AiVideoJob = require('../models/AiVideoJob');
const AiJob = require('../models/AiJob');
const Media = require('../models/Media');
const Post = require('../models/Post');
const SocialAccount = require('../models/SocialAccount');
const TeamMember = require('../models/TeamMember');
const { getCurrentPlan, getCurrentSubscription, getUsagePeriod } = require('./subscription.service');
const { ACTIVE_SOCIAL_STATUSES, SCHEDULED_POST_STATUSES } = require('./usageLimitService');

const BYTES_PER_MB = 1024 * 1024;

const LIMIT_DEFINITIONS = {
  maxBrands: { metric: 'brands', label: 'Brands' },
  maxSocialAccounts: { metric: 'social_accounts', label: 'Social accounts' },
  maxTeamMembers: { metric: 'team_members', label: 'Team members' },
  maxScheduledPosts: { metric: 'scheduled_posts', label: 'Scheduled posts' },
  maxManualPosts: { metric: 'manual_posts', label: 'Manual/imported posts' },
  maxAutoPosts: { metric: 'auto_posts', label: 'Auto posts' },
  maxHandoffPosts: { metric: 'handoff_posts', label: 'Handoff posts' },
  maxAiTextGenerations: { metric: 'ai_text_generations', label: 'AI text generations' },
  maxAiImageGenerations: { metric: 'ai_image_generations', label: 'AI image generations' },
  maxAiVideoGenerations: { metric: 'ai_video_generations', label: 'AI video generations' },
  maxAvatarVideos: { metric: 'avatar_videos', label: 'Avatar videos' },
  maxStorageMb: { metric: 'storage_mb', label: 'Media storage' },
  maxClientApprovalLinks: { metric: 'client_approval_links', label: 'Client approval links' }
};

function monthWindow(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0));
  return { start, end };
}

async function recordUsage({ user, brand, metric, quantity = 1, taskType, provider, model, tokensUsed = 0, mediaCount = 0, costEstimate = 0, metadata = {} }) {
  const plan = user ? await getCurrentPlan(user) : null;
  return UsageRecord.create({
    user: user?._id || user,
    brand: brand?._id || brand,
    plan: plan?._id,
    planSlug: plan?.slug || user?.plan,
    metric,
    quantity,
    taskType,
    provider,
    model,
    tokensUsed,
    mediaCount,
    costEstimate,
    metadata
  });
}

async function getUsageForWindow(user, { start, end }, metrics = []) {
  const match = { user: user._id || user, createdAt: { $gte: start, $lt: end } };
  if (metrics.length) match.metric = { $in: metrics };
  const rows = await UsageRecord.aggregate([
    { $match: match },
    { $group: { _id: '$metric', quantity: { $sum: '$quantity' }, tokens: { $sum: '$tokensUsed' }, media: { $sum: '$mediaCount' }, cost: { $sum: '$costEstimate' } } }
  ]);
  return rows.reduce((map, row) => {
    map[row._id] = { quantity: row.quantity, tokens: row.tokens, media: row.media, cost: row.cost };
    return map;
  }, {});
}

// Kept for compatibility with older reports that explicitly ask for a calendar month.
async function getMonthlyUsage(user, metrics = []) {
  return getUsageForWindow(user, monthWindow(), metrics);
}

function bytesToMb(bytes) {
  return Math.round((Number(bytes || 0) / BYTES_PER_MB) * 10) / 10;
}

async function activeStorageMbForBrands(brandIds) {
  if (!brandIds.length) return 0;
  const rows = await Media.aggregate([
    { $match: { brand: { $in: brandIds }, status: 'active' } },
    { $group: { _id: null, total: { $sum: '$size' } } }
  ]);
  return bytesToMb(rows[0]?.total || 0);
}

async function countUsageLogForBrands(brandIds, actions, start, end) {
  if (!brandIds.length) return 0;
  return UsageLog.countDocuments({
    brand: { $in: brandIds },
    action: { $in: actions },
    createdAt: { $gte: start, $lt: end }
  });
}

async function countImageUsageForBrands(brandIds, start, end) {
  if (!brandIds.length) return 0;
  const [usage] = await UsageLog.aggregate([
    { $match: { brand: { $in: brandIds }, action: 'ai_generate_image', createdAt: { $gte: start, $lt: end } } },
    { $group: { _id: null, count: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$metadata.count', 0] }, 0] }, '$metadata.count', 1] } } } }
  ]);
  return Number(usage?.count || 0);
}

async function countVideoUsageForBrands(brandIds, start, end) {
  if (!brandIds.length) return 0;
  const [studioVideos, postVideos] = await Promise.all([
    AiVideoJob.countDocuments({ brand: { $in: brandIds }, mode: { $ne: 'avatar_video' }, createdAt: { $gte: start, $lt: end } }),
    AiJob.countDocuments({
      brand: { $in: brandIds },
      taskType: { $in: ['post_content_generation', 'post_video_generation'] },
      $or: [
        { taskType: 'post_video_generation' },
        { 'metadata.plan.needsVideo': true }
      ],
      status: { $ne: 'cancelled' },
      createdAt: { $gte: start, $lt: end }
    })
  ]);
  return studioVideos + postVideos;
}

async function buildLiveUsageCounts(user, period) {
  const userId = user._id || user;
  const { start, end } = period || await getUsagePeriod(user);
  const brandIds = await Brand.find({ owner: userId }).distinct('_id');
  const activeBrandCount = await Brand.countDocuments({ owner: userId, status: 'active' });
  if (!brandIds.length) {
    return {
      maxBrands: activeBrandCount, maxSocialAccounts: 0, maxTeamMembers: 0, maxScheduledPosts: 0, maxManualPosts: 0,
      maxAutoPosts: 0, maxHandoffPosts: 0, maxAiTextGenerations: 0, maxAiImageGenerations: 0, maxAiVideoGenerations: 0,
      maxAvatarVideos: 0, maxStorageMb: 0, maxClientApprovalLinks: 0
    };
  }

  const [
    socialAccounts, teamMembers, scheduledPosts, manualPosts, autoPosts, handoffPosts, aiTextGenerations,
    aiImageGenerations, aiVideoGenerations, avatarVideos, storageMb, approvalLinks
  ] = await Promise.all([
    SocialAccount.countDocuments({ brand: { $in: brandIds }, status: { $in: ACTIVE_SOCIAL_STATUSES } }),
    TeamMember.countDocuments({ brand: { $in: brandIds }, status: { $ne: 'removed' } }),
    Post.countDocuments({ brand: { $in: brandIds }, status: { $in: SCHEDULED_POST_STATUSES }, createdAt: { $gte: start, $lt: end } }),
    Post.countDocuments({ brand: { $in: brandIds }, contentSource: { $in: ['manual', 'import'] }, createdAt: { $gte: start, $lt: end } }),
    Post.countDocuments({ brand: { $in: brandIds }, workflowMode: 'auto', createdAt: { $gte: start, $lt: end } }),
    Post.countDocuments({ brand: { $in: brandIds }, workflowMode: 'handoff', createdAt: { $gte: start, $lt: end } }),
    countUsageLogForBrands(brandIds, ['ai_generate_post', 'ai_generate_content'], start, end),
    countImageUsageForBrands(brandIds, start, end),
    countVideoUsageForBrands(brandIds, start, end),
    AiVideoJob.countDocuments({ brand: { $in: brandIds }, mode: 'avatar_video', createdAt: { $gte: start, $lt: end } }),
    activeStorageMbForBrands(brandIds),
    ClientApprovalLink.countDocuments({ brand: { $in: brandIds }, createdAt: { $gte: start, $lt: end } })
  ]);

  return {
    maxBrands: activeBrandCount, maxSocialAccounts: socialAccounts, maxTeamMembers: teamMembers, maxScheduledPosts: scheduledPosts,
    maxManualPosts: manualPosts, maxAutoPosts: autoPosts, maxHandoffPosts: handoffPosts, maxAiTextGenerations: aiTextGenerations,
    maxAiImageGenerations: aiImageGenerations, maxAiVideoGenerations: aiVideoGenerations, maxAvatarVideos: avatarVideos,
    maxStorageMb: storageMb, maxClientApprovalLinks: approvalLinks
  };
}

async function buildUsageDashboard(user) {
  const period = await getUsagePeriod(user);
  const [plan, subscription, usage, liveUsage] = await Promise.all([
    getCurrentPlan(user),
    getCurrentSubscription(user),
    getUsageForWindow(user, period),
    buildLiveUsageCounts(user, period)
  ]);
  const limits = plan?.limits || {};
  const cards = Object.entries(limits).map(([limitName, limit]) => {
    const definition = LIMIT_DEFINITIONS[limitName] || {};
    const metric = definition.metric || limitName.replace(/^max/, '').replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).replace(/^_/, '');
    const used = liveUsage[limitName] ?? usage[metric]?.quantity ?? 0;
    const unlimited = user.role === 'super_admin' || Number(limit) < 0;
    const percent = unlimited ? 0 : Number(limit || 0) ? Math.min(100, Math.round((used / Number(limit)) * 100)) : 100;
    return { limitName, metric, label: definition.label || limitName, limit, used, percent, unlimited, warn: !unlimited && percent >= 80 };
  });
  const tokenLimit = Number(plan?.aiConfig?.monthlyTokenLimit || 0);
  if (tokenLimit !== 0 || user.role === 'super_admin') {
    const tokenUsed = Number(subscription?.aiTokensUsed || 0);
    const tokenReserved = Number(subscription?.aiTokensReserved || 0);
    const unlimited = user.role === 'super_admin' || tokenLimit < 0;
    const percent = unlimited ? 0 : tokenLimit > 0 ? Math.min(100, Math.round(((tokenUsed + tokenReserved) / tokenLimit) * 100)) : 100;
    cards.push({
      limitName: 'monthlyTokenLimit',
      metric: 'ai_tokens',
      label: 'AI tokens',
      limit: tokenLimit,
      used: tokenUsed,
      reserved: tokenReserved,
      percent,
      unlimited,
      warn: !unlimited && percent >= 80
    });
  }
  return { plan, subscription, usage, liveUsage, cards, period };
}

module.exports = { LIMIT_DEFINITIONS, buildLiveUsageCounts, buildUsageDashboard, getMonthlyUsage, getUsageForWindow, monthWindow, recordUsage };
