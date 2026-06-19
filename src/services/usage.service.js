const UsageRecord = require('../models/UsageRecord');
const Brand = require('../models/Brand');
const ClientApprovalLink = require('../models/ClientApprovalLink');
const UsageLog = require('../models/UsageLog');
const AiVideoJob = require('../models/AiVideoJob');
const Media = require('../models/Media');
const Post = require('../models/Post');
const SocialAccount = require('../models/SocialAccount');
const TeamMember = require('../models/TeamMember');
const { getCurrentPlan } = require('./subscription.service');
const { ACTIVE_SOCIAL_STATUSES, SCHEDULED_POST_STATUSES } = require('./usageLimitService');

const BYTES_PER_MB = 1024 * 1024;

const LIMIT_DEFINITIONS = {
  maxBrands: { metric: 'brands', label: 'Brands' },
  maxSocialAccounts: { metric: 'social_accounts', label: 'Social accounts' },
  maxTeamMembers: { metric: 'team_members', label: 'Team members' },
  maxScheduledPosts: { metric: 'scheduled_posts', label: 'Scheduled posts' },
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

async function getMonthlyUsage(user, metrics = []) {
  const { start, end } = monthWindow();
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

function bytesToMb(bytes) {
  return Math.round((Number(bytes || 0) / BYTES_PER_MB) * 10) / 10;
}

async function activeStorageMb(userId) {
  const rows = await Media.aggregate([
    { $match: { uploadedBy: userId, status: 'active' } },
    { $group: { _id: null, total: { $sum: '$size' } } }
  ]);
  return bytesToMb(rows[0]?.total || 0);
}

async function countUsageLog(userId, actions, start, end) {
  return UsageLog.countDocuments({
    user: userId,
    action: { $in: actions },
    createdAt: { $gte: start, $lt: end }
  });
}

async function buildLiveUsageCounts(user) {
  const userId = user._id || user;
  const { start, end } = monthWindow();
  const [
    brands,
    socialAccounts,
    teamMembers,
    scheduledPosts,
    autoPosts,
    handoffPosts,
    aiTextGenerations,
    aiImageGenerations,
    aiVideoGenerations,
    avatarVideos,
    storageMb,
    approvalLinks
  ] = await Promise.all([
    Brand.countDocuments({ owner: userId, status: 'active' }),
    SocialAccount.countDocuments({ owner: userId, status: { $in: ACTIVE_SOCIAL_STATUSES } }),
    TeamMember.countDocuments({ invitedBy: userId, status: { $ne: 'removed' } }),
    Post.countDocuments({ createdBy: userId, status: { $in: SCHEDULED_POST_STATUSES }, createdAt: { $gte: start, $lt: end } }),
    Post.countDocuments({ createdBy: userId, workflowMode: 'auto', createdAt: { $gte: start, $lt: end } }),
    Post.countDocuments({ createdBy: userId, workflowMode: 'handoff', createdAt: { $gte: start, $lt: end } }),
    countUsageLog(userId, ['ai_generate_post', 'ai_generate_content'], start, end),
    countUsageLog(userId, ['ai_generate_image'], start, end),
    AiVideoJob.countDocuments({ createdBy: userId, mode: { $ne: 'avatar_video' }, createdAt: { $gte: start, $lt: end } }),
    AiVideoJob.countDocuments({ createdBy: userId, mode: 'avatar_video', createdAt: { $gte: start, $lt: end } }),
    activeStorageMb(userId),
    ClientApprovalLink.countDocuments({ createdBy: userId, createdAt: { $gte: start, $lt: end } })
  ]);

  return {
    maxBrands: brands,
    maxSocialAccounts: socialAccounts,
    maxTeamMembers: teamMembers,
    maxScheduledPosts: scheduledPosts,
    maxAutoPosts: autoPosts,
    maxHandoffPosts: handoffPosts,
    maxAiTextGenerations: aiTextGenerations,
    maxAiImageGenerations: aiImageGenerations,
    maxAiVideoGenerations: aiVideoGenerations,
    maxAvatarVideos: avatarVideos,
    maxStorageMb: storageMb,
    maxClientApprovalLinks: approvalLinks
  };
}

async function buildUsageDashboard(user) {
  const [plan, usage, liveUsage] = await Promise.all([getCurrentPlan(user), getMonthlyUsage(user), buildLiveUsageCounts(user)]);
  const limits = plan?.limits || {};
  const cards = Object.entries(limits).map(([limitName, limit]) => {
    const definition = LIMIT_DEFINITIONS[limitName] || {};
    const metric = definition.metric || limitName.replace(/^max/, '').replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).replace(/^_/, '');
    const used = liveUsage[limitName] ?? usage[metric]?.quantity ?? 0;
    const unlimited = user.role === 'super_admin' || Number(limit) < 0;
    const percent = unlimited ? 0 : Number(limit || 0) ? Math.min(100, Math.round((used / Number(limit)) * 100)) : 100;
    return { limitName, metric, label: definition.label || limitName, limit, used, percent, unlimited, warn: !unlimited && percent >= 80 };
  });
  return { plan, usage, liveUsage, cards };
}

module.exports = { LIMIT_DEFINITIONS, buildLiveUsageCounts, buildUsageDashboard, getMonthlyUsage, monthWindow, recordUsage };
