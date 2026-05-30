const Brand = require('../models/Brand');
const UsageLog = require('../models/UsageLog');
const AiVideoJob = require('../models/AiVideoJob');
const SocialAccount = require('../models/SocialAccount');
const TeamMember = require('../models/TeamMember');
const Post = require('../models/Post');
const { getCurrentPlan } = require('./subscription.service');

function monthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function unlimited(user, limit) {
  return user?.role === 'super_admin' || Number(limit) < 0;
}

async function assertLimit(user, limitName, used, label) {
  const plan = await getCurrentPlan(user);
  const limit = plan?.limits?.[limitName] ?? 0;
  if (unlimited(user, limit)) return true;
  if (used >= Number(limit || 0)) {
    const error = new Error(`Your ${plan?.name || 'current'} plan allows ${limit} ${label}.`);
    error.status = 402;
    error.limitName = limitName;
    error.limit = limit;
    error.used = used;
    throw error;
  }
  return true;
}

async function assertCanCreateBrand(user) {
  const count = await Brand.countDocuments({ owner: user._id, status: 'active' });
  return assertLimit(user, 'maxBrands', count, 'active brand(s)');
}

async function assertCanGenerateText(user) {
  const count = await UsageLog.countDocuments({
    user: user._id,
    action: 'ai_generate_post',
    createdAt: { $gte: monthStart() }
  });
  return assertLimit(user, 'maxAiTextGenerations', count, 'AI text generation(s) per month');
}

async function assertCanSchedulePost(user) {
  const count = await Post.countDocuments({
    createdBy: user._id,
    status: { $in: ['scheduled', 'pending_approval', 'approved'] },
    createdAt: { $gte: monthStart() }
  });
  return assertLimit(user, 'maxScheduledPosts', count, 'scheduled post(s) per month');
}

async function assertCanCreateVideo(user) {
  const count = await AiVideoJob.countDocuments({ createdBy: user._id, createdAt: { $gte: monthStart() } });
  return assertLimit(user, 'maxAiVideoGenerations', count, 'AI video generation(s) per month');
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

module.exports = {
  ACTIVE_SOCIAL_STATUSES,
  assertCanConnectSocial,
  assertCanCreateBrand,
  assertCanCreateVideo,
  assertCanGenerateText,
  assertCanInviteTeam,
  assertCanSchedulePost,
  availableSocialSlots,
  countActiveSocialAccounts,
  findExistingSocialAccount
};
