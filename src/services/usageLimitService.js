const Brand = require('../models/Brand');
const ClientApprovalLink = require('../models/ClientApprovalLink');
const UsageLog = require('../models/UsageLog');
const AiVideoJob = require('../models/AiVideoJob');
const Media = require('../models/Media');
const SocialAccount = require('../models/SocialAccount');
const TeamMember = require('../models/TeamMember');
const Post = require('../models/Post');
const { getCurrentPlan } = require('./subscription.service');
const { planAllowsPage } = require('./subscription/featureAccess.service');

const BYTES_PER_MB = 1024 * 1024;
const SCHEDULED_POST_STATUSES = ['scheduled', 'pending_approval', 'approved'];
const ACTIVE_MEDIA_STATUSES = ['active'];

function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function unlimited(user, limit) {
  return user?.role === 'super_admin' || Number(limit) < 0;
}

function requestedAmount(value = 1) {
  const requested = Number(value);
  if (!Number.isFinite(requested)) return 1;
  return Math.max(0, requested);
}

function limitError({ plan, limitName, limit, used, requested, label }) {
  const error = new Error(`Your ${plan?.name || 'current'} plan allows ${limit} ${label}.`);
  error.status = 402;
  error.limitName = limitName;
  error.limit = limit;
  error.used = used;
  error.requested = requested;
  return error;
}

async function assertLimit(user, limitName, used, label, requested = 1) {
  const plan = await getCurrentPlan(user);
  const limit = plan?.limits?.[limitName] ?? 0;
  if (unlimited(user, limit)) return true;
  const usedCount = Number(used || 0);
  const requestedCount = requestedAmount(requested);
  if (usedCount + requestedCount > Number(limit || 0)) {
    throw limitError({ plan, limitName, limit, used: usedCount, requested: requestedCount, label });
  }
  return true;
}

async function assertPlanPageAccess(user, page, label = 'this feature') {
  const plan = await getCurrentPlan(user);
  const result = planAllowsPage({ page, plan, user });
  if (result.allowed) return true;
  const error = new Error(`${plan?.name || 'Your current plan'} does not include ${label}.`);
  error.status = 402;
  error.planSlug = plan?.slug || user?.plan || 'free-trial';
  error.page = page;
  error.requirement = result.requirement;
  throw error;
}

async function assertPlanFeature(user, featureName, label = 'this feature') {
  const plan = await getCurrentPlan(user);
  if (user?.role === 'super_admin' || Boolean(plan?.features?.[featureName])) return true;
  const error = new Error(`${plan?.name || 'Your current plan'} does not include ${label}.`);
  error.status = 402;
  error.planSlug = plan?.slug || user?.plan || 'free-trial';
  error.featureName = featureName;
  throw error;
}

async function assertCanCreateBrand(user) {
  const count = await Brand.countDocuments({ owner: user._id, status: 'active' });
  return assertLimit(user, 'maxBrands', count, 'active brand(s)');
}

async function assertCanGenerateText(user) {
  const count = await UsageLog.countDocuments({
    user: user._id,
    action: { $in: ['ai_generate_post', 'ai_generate_content'] },
    createdAt: { $gte: monthStart() }
  });
  return assertLimit(user, 'maxAiTextGenerations', count, 'AI text generation(s) per month');
}

async function assertCanGenerateImage(user, requestedCount = 1) {
  const count = await UsageLog.countDocuments({
    user: user._id,
    action: 'ai_generate_image',
    createdAt: { $gte: monthStart() }
  });
  return assertLimit(user, 'maxAiImageGenerations', count, 'AI image generation(s) per month', requestedCount);
}

async function assertCanSchedulePost(user, requestedCount = 1) {
  const count = await Post.countDocuments({
    createdBy: user._id,
    status: { $in: SCHEDULED_POST_STATUSES },
    createdAt: { $gte: monthStart() }
  });
  return assertLimit(user, 'maxScheduledPosts', count, 'scheduled post(s) per month', requestedCount);
}

async function assertCanCreateVideo(user) {
  const count = await AiVideoJob.countDocuments({ createdBy: user._id, mode: { $ne: 'avatar_video' }, createdAt: { $gte: monthStart() } });
  return assertLimit(user, 'maxAiVideoGenerations', count, 'AI video generation(s) per month');
}

async function assertCanCreateAvatarVideo(user, requestedCount = 1) {
  const count = await AiVideoJob.countDocuments({ createdBy: user._id, mode: 'avatar_video', createdAt: { $gte: monthStart() } });
  return assertLimit(user, 'maxAvatarVideos', count, 'avatar video generation(s) per month', requestedCount);
}

async function countPostsForWorkflow(user, workflowMode) {
  return Post.countDocuments({
    createdBy: user._id,
    workflowMode,
    createdAt: { $gte: monthStart() }
  });
}

async function assertCanCreateAutoPosts(user, requestedCount = 1) {
  await assertPlanFeature(user, 'autoModeAccess', 'Auto Mode');
  const count = await countPostsForWorkflow(user, 'auto');
  return assertLimit(user, 'maxAutoPosts', count, 'auto post(s) per month', requestedCount);
}

async function assertCanCreateHandoffPosts(user, requestedCount = 1) {
  await assertPlanPageAccess(user, 'approvals', 'handoff workflows');
  const count = await countPostsForWorkflow(user, 'handoff');
  return assertLimit(user, 'maxHandoffPosts', count, 'handoff post(s) per month', requestedCount);
}

const ACTIVE_SOCIAL_STATUSES = ['connected', 'mock', 'needs_reconnect', 'expired'];

async function findExistingSocialAccount(user, account = {}) {
  if (!account.platform || !account.accountId) return null;
  const query = {
    owner: user._id,
    platform: account.platform,
    accountId: String(account.accountId).trim()
  };
  if (account.brand) query.brand = account.brand;
  if (account.excludeId) query._id = { $ne: account.excludeId };
  return SocialAccount.findOne(query).select('_id status');
}

async function countActiveSocialAccounts(user) {
  return SocialAccount.countDocuments({ owner: user._id, status: { $in: ACTIVE_SOCIAL_STATUSES } });
}

async function availableSocialSlots(user) {
  const plan = await getCurrentPlan(user);
  const limit = plan?.limits?.maxSocialAccounts ?? 0;
  if (unlimited(user, limit)) return Number.MAX_SAFE_INTEGER;
  const count = await countActiveSocialAccounts(user);
  return Math.max(Number(limit || 0) - count, 0);
}

async function assertCanConnectSocial(user, account = {}) {
  const existing = await findExistingSocialAccount(user, account);
  if (existing) return true;
  const count = await countActiveSocialAccounts(user);
  return assertLimit(user, 'maxSocialAccounts', count, 'social account(s)');
}

async function assertCanInviteTeam(user) {
  const count = await TeamMember.countDocuments({ invitedBy: user._id, status: { $ne: 'removed' } });
  return assertLimit(user, 'maxTeamMembers', count, 'team member(s)');
}

async function countActiveMediaStorageBytes(user) {
  const rows = await Media.aggregate([
    { $match: { uploadedBy: user._id, status: { $in: ACTIVE_MEDIA_STATUSES } } },
    { $group: { _id: null, total: { $sum: '$size' } } }
  ]);
  return rows[0]?.total || 0;
}

function bytesToMb(bytes) {
  return Math.round((Number(bytes || 0) / BYTES_PER_MB) * 10) / 10;
}

async function assertCanUseStorage(user, requestedBytes = 0) {
  const plan = await getCurrentPlan(user);
  const limit = plan?.limits?.maxStorageMb ?? 0;
  if (unlimited(user, limit)) return true;
  const usedBytes = await countActiveMediaStorageBytes(user);
  const requested = Math.max(0, Number(requestedBytes || 0));
  const limitBytes = Number(limit || 0) * BYTES_PER_MB;
  if (usedBytes + requested > limitBytes) {
    throw limitError({
      plan,
      limitName: 'maxStorageMb',
      limit,
      used: bytesToMb(usedBytes),
      requested: bytesToMb(requested),
      label: 'MB of media storage'
    });
  }
  return true;
}

async function assertCanUseApprovalWorkflow(user) {
  return assertPlanPageAccess(user, 'approvals', 'approval workflows');
}

async function assertCanCreateApprovalLink(user, requestedCount = 1) {
  await assertCanUseApprovalWorkflow(user);
  const count = await ClientApprovalLink.countDocuments({
    createdBy: user._id,
    createdAt: { $gte: monthStart() }
  });
  return assertLimit(user, 'maxClientApprovalLinks', count, 'client approval link(s) per month', requestedCount);
}

module.exports = {
  ACTIVE_SOCIAL_STATUSES,
  SCHEDULED_POST_STATUSES,
  assertCanCreateApprovalLink,
  assertCanCreateAutoPosts,
  assertCanCreateAvatarVideo,
  assertCanConnectSocial,
  assertCanCreateBrand,
  assertCanCreateHandoffPosts,
  assertCanCreateVideo,
  assertCanGenerateImage,
  assertCanGenerateText,
  assertCanInviteTeam,
  assertCanSchedulePost,
  assertCanUseApprovalWorkflow,
  assertCanUseStorage,
  assertLimit,
  assertPlanFeature,
  assertPlanPageAccess,
  availableSocialSlots,
  countActiveSocialAccounts,
  countActiveMediaStorageBytes,
  findExistingSocialAccount
};
