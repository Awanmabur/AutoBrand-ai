const Brand = require('../models/Brand');
const User = require('../models/User');
const ClientApprovalLink = require('../models/ClientApprovalLink');
const UsageLog = require('../models/UsageLog');
const AiVideoJob = require('../models/AiVideoJob');
const AiJob = require('../models/AiJob');
const Media = require('../models/Media');
const SocialAccount = require('../models/SocialAccount');
const TeamMember = require('../models/TeamMember');
const Post = require('../models/Post');
const { getCurrentPlan, getUsagePeriod } = require('./subscription.service');
const { planAllowsPage } = require('./subscription/featureAccess.service');

const BYTES_PER_MB = 1024 * 1024;
const SCHEDULED_POST_STATUSES = ['scheduled', 'pending_approval', 'approved'];
const ACTIVE_MEDIA_STATUSES = ['active'];
const ACTIVE_SOCIAL_STATUSES = ['connected', 'needs_reconnect', 'expired'];

function unlimited(user, limit) { return user?.role === 'super_admin' || Number(limit) < 0; }
function requestedAmount(value = 1) { const requested = Number(value); return Number.isFinite(requested) ? Math.max(0, requested) : 1; }
function idsEqual(a, b) { return String(a?._id || a || '') === String(b?._id || b || ''); }

async function resolveBillingUser(actor, brandId) {
  if (!brandId || actor?.role === 'super_admin') return actor;
  const brand = await Brand.findById(brandId).select('owner').lean();
  if (!brand?.owner || idsEqual(brand.owner, actor?._id)) return actor;
  return (await User.findById(brand.owner).select('_id role plan selectedPlanSlug trialUsed status').lean()) || actor;
}

async function ownerBrandIds(user) {
  if (!user?._id) return [];
  return Brand.find({ owner: user._id }).distinct('_id');
}

function limitError({ plan, limitName, limit, used, requested, label }) {
  const error = new Error(`Your ${plan?.name || 'current'} plan allows ${limit} ${label}.`);
  error.status = 402; error.limitName = limitName; error.limit = limit; error.used = used; error.requested = requested; error.planSlug = plan?.slug;
  return error;
}

async function assertLimit(user, limitName, used, label, requested = 1) {
  const plan = await getCurrentPlan(user);
  const limit = plan?.limits?.[limitName] ?? 0;
  if (unlimited(user, limit)) return true;
  const usedCount = Number(used || 0); const requestedCount = requestedAmount(requested);
  if (usedCount + requestedCount > Number(limit || 0)) throw limitError({ plan, limitName, limit, used: usedCount, requested: requestedCount, label });
  return true;
}

async function assertPlanPageAccess(user, page, label = 'this feature', brandId) {
  const billingUser = await resolveBillingUser(user, brandId);
  const plan = await getCurrentPlan(billingUser); const result = planAllowsPage({ page, plan, user: billingUser });
  if (result.allowed) return true;
  const error = new Error(`${plan?.name || 'Your current plan'} does not include ${label}.`); error.status = 402; error.planSlug = plan?.slug || billingUser?.plan || 'free-trial'; error.page = page; error.requirement = result.requirement; throw error;
}
async function assertPlanFeature(user, featureName, label = 'this feature', brandId) {
  const billingUser = await resolveBillingUser(user, brandId);
  const plan = await getCurrentPlan(billingUser);
  if (billingUser?.role === 'super_admin' || Boolean(plan?.features?.[featureName])) return true;
  const error = new Error(`${plan?.name || 'Your current plan'} does not include ${label}.`); error.status = 402; error.planSlug = plan?.slug || billingUser?.plan || 'free-trial'; error.featureName = featureName; throw error;
}

async function assertCanCreateBrand(user) {
  const count = await Brand.countDocuments({ owner: user._id, status: 'active' });
  return assertLimit(user, 'maxBrands', count, 'active brand(s)');
}

async function assertCanGenerateText(user, brandId) {
  const billingUser = await resolveBillingUser(user, brandId); const brands = await ownerBrandIds(billingUser); const { start, end } = await getUsagePeriod(billingUser);
  const count = await UsageLog.countDocuments({ brand: { $in: brands }, action: { $in: ['ai_generate_post', 'ai_generate_content'] }, createdAt: { $gte: start, $lt: end } });
  return assertLimit(billingUser, 'maxAiTextGenerations', count, 'AI text generation(s) per access period');
}
async function countGeneratedImages(brandIds, start, end) {
  const [usage] = await UsageLog.aggregate([{ $match: { brand: { $in: brandIds }, action: 'ai_generate_image', createdAt: { $gte: start, $lt: end } } }, { $group: { _id: null, count: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$metadata.count', 0] }, 0] }, '$metadata.count', 1] } } } }]);
  return Number(usage?.count || 0);
}
async function countPendingGeneratedImages(brandIds, start, end) {
  const [usage] = await AiJob.aggregate([{ $match: { brand: { $in: brandIds }, taskType: 'post_content_generation', status: { $in: ['queued', 'running'] }, createdAt: { $gte: start, $lt: end } } }, { $group: { _id: null, count: { $sum: { $ifNull: ['$metadata.plan.imagesToGenerate', 0] } } } }]);
  return Number(usage?.count || 0);
}
async function assertCanGenerateImage(user, requestedCount = 1, brandId) {
  const billingUser = await resolveBillingUser(user, brandId); const brands = await ownerBrandIds(billingUser); const { start, end } = await getUsagePeriod(billingUser);
  const [generated, pending] = await Promise.all([countGeneratedImages(brands, start, end), countPendingGeneratedImages(brands, start, end)]);
  return assertLimit(billingUser, 'maxAiImageGenerations', generated + pending, 'AI image generation(s) per access period', requestedCount);
}
async function assertCanSchedulePost(user, requestedCount = 1, brandId) {
  const billingUser = await resolveBillingUser(user, brandId); const brands = await ownerBrandIds(billingUser); const { start, end } = await getUsagePeriod(billingUser);
  const count = await Post.countDocuments({ brand: { $in: brands }, status: { $in: SCHEDULED_POST_STATUSES }, createdAt: { $gte: start, $lt: end } });
  return assertLimit(billingUser, 'maxScheduledPosts', count, 'scheduled post(s) per access period', requestedCount);
}
async function assertCanCreateManualPost(user, requestedCount = 1, brandId) {
  const billingUser = await resolveBillingUser(user, brandId); await assertPlanFeature(billingUser, 'manualPublisherAccess', 'manual publishing'); const brands = await ownerBrandIds(billingUser); const { start, end } = await getUsagePeriod(billingUser);
  const count = await Post.countDocuments({ brand: { $in: brands }, contentSource: { $in: ['manual', 'import'] }, createdAt: { $gte: start, $lt: end } });
  return assertLimit(billingUser, 'maxManualPosts', count, 'manual/imported post(s) per access period', requestedCount);
}
async function assertCanCreateVideo(user, brandId, requestedCount = 1) {
  const billingUser = await resolveBillingUser(user, brandId); const brands = await ownerBrandIds(billingUser); const { start, end } = await getUsagePeriod(billingUser);
  const [studioVideos, postVideos] = await Promise.all([
    AiVideoJob.countDocuments({ brand: { $in: brands }, mode: { $ne: 'avatar_video' }, createdAt: { $gte: start, $lt: end } }),
    AiJob.countDocuments({ brand: { $in: brands }, taskType: { $in: ['post_content_generation', 'post_video_generation'] }, $or: [{ taskType: 'post_video_generation' }, { 'metadata.plan.needsVideo': true }], status: { $ne: 'cancelled' }, createdAt: { $gte: start, $lt: end } })
  ]);
  return assertLimit(billingUser, 'maxAiVideoGenerations', studioVideos + postVideos, 'AI video generation(s) per access period', requestedCount);
}
async function assertCanCreateAvatarVideo(user, requestedCount = 1, brandId) {
  const billingUser = await resolveBillingUser(user, brandId); const brands = await ownerBrandIds(billingUser); const { start, end } = await getUsagePeriod(billingUser);
  const count = await AiVideoJob.countDocuments({ brand: { $in: brands }, mode: 'avatar_video', createdAt: { $gte: start, $lt: end } });
  return assertLimit(billingUser, 'maxAvatarVideos', count, 'avatar video generation(s) per access period', requestedCount);
}
async function countPostsForWorkflow(user, workflowMode, brandId) { const billingUser = await resolveBillingUser(user, brandId); const brands = await ownerBrandIds(billingUser); const { start, end } = await getUsagePeriod(billingUser); return { billingUser, count: await Post.countDocuments({ brand: { $in: brands }, workflowMode, createdAt: { $gte: start, $lt: end } }) }; }
async function assertCanCreateAutoPosts(user, requestedCount = 1, brandId) { const { billingUser, count } = await countPostsForWorkflow(user, 'auto', brandId); await assertPlanFeature(billingUser, 'autoModeAccess', 'Auto Mode'); return assertLimit(billingUser, 'maxAutoPosts', count, 'auto post(s) per access period', requestedCount); }
async function assertCanCreateHandoffPosts(user, requestedCount = 1, brandId) { const { billingUser, count } = await countPostsForWorkflow(user, 'handoff', brandId); await assertPlanPageAccess(billingUser, 'approvals', 'handoff workflows'); return assertLimit(billingUser, 'maxHandoffPosts', count, 'handoff post(s) per access period', requestedCount); }

async function findExistingSocialAccount(user, account = {}) {
  if (!account.platform || !account.accountId) return null;
  const query = { platform: String(account.platform).trim().toLowerCase(), accountId: String(account.accountId).trim() };
  if (account.brand) query.brand = account.brand; else query.owner = user._id;
  if (account.excludeId) query._id = { $ne: account.excludeId };
  return SocialAccount.findOne(query).select('_id status');
}
async function countActiveSocialAccounts(user) { return SocialAccount.countDocuments({ owner: user._id, status: { $in: ACTIVE_SOCIAL_STATUSES } }); }
async function availableSocialSlots(user, brandId) { const billingUser = await resolveBillingUser(user, brandId); const plan = await getCurrentPlan(billingUser); const limit = plan?.limits?.maxSocialAccounts ?? 0; if (unlimited(billingUser, limit)) return Number.MAX_SAFE_INTEGER; return Math.max(Number(limit || 0) - await countActiveSocialAccounts(billingUser), 0); }
async function assertCanConnectSocial(user, account = {}) { const billingUser = await resolveBillingUser(user, account.brand); const existing = await findExistingSocialAccount(billingUser, account); if (existing) return true; return assertLimit(billingUser, 'maxSocialAccounts', await countActiveSocialAccounts(billingUser), 'social account(s)'); }

async function assertCanInviteTeam(user, brandId) {
  const billingUser = await resolveBillingUser(user, brandId); const brands = await ownerBrandIds(billingUser);
  const count = await TeamMember.countDocuments({ brand: { $in: brands }, status: { $ne: 'removed' } });
  return assertLimit(billingUser, 'maxTeamMembers', count, 'team member(s)');
}
async function countActiveMediaStorageBytes(user) { const brands = await ownerBrandIds(user); const rows = await Media.aggregate([{ $match: { brand: { $in: brands }, status: { $in: ACTIVE_MEDIA_STATUSES } } }, { $group: { _id: null, total: { $sum: '$size' } } }]); return rows[0]?.total || 0; }
function bytesToMb(bytes) { return Math.round((Number(bytes || 0) / BYTES_PER_MB) * 10) / 10; }
async function assertCanUseStorage(user, requestedBytes = 0, brandId) {
  const billingUser = await resolveBillingUser(user, brandId); const plan = await getCurrentPlan(billingUser); const limit = plan?.limits?.maxStorageMb ?? 0;
  if (unlimited(billingUser, limit)) return true;
  const usedBytes = await countActiveMediaStorageBytes(billingUser); const requested = Math.max(0, Number(requestedBytes || 0)); const limitBytes = Number(limit || 0) * BYTES_PER_MB;
  if (usedBytes + requested > limitBytes) throw limitError({ plan, limitName: 'maxStorageMb', limit, used: bytesToMb(usedBytes), requested: bytesToMb(requested), label: 'MB of media storage' });
  return true;
}
async function assertCanUseApprovalWorkflow(user, brandId) { const billingUser = await resolveBillingUser(user, brandId); return assertPlanPageAccess(billingUser, 'approvals', 'approval workflows'); }
async function assertCanCreateApprovalLink(user, requestedCount = 1, brandId) { const billingUser = await resolveBillingUser(user, brandId); await assertCanUseApprovalWorkflow(billingUser, brandId); const brands = await ownerBrandIds(billingUser); const { start, end } = await getUsagePeriod(billingUser); const count = await ClientApprovalLink.countDocuments({ brand: { $in: brands }, createdAt: { $gte: start, $lt: end } }); return assertLimit(billingUser, 'maxClientApprovalLinks', count, 'client approval link(s) per access period', requestedCount); }

module.exports = { ACTIVE_SOCIAL_STATUSES, SCHEDULED_POST_STATUSES, assertCanCreateApprovalLink, assertCanCreateAutoPosts, assertCanCreateAvatarVideo, assertCanConnectSocial, assertCanCreateBrand, assertCanCreateHandoffPosts, assertCanCreateManualPost, assertCanCreateVideo, assertCanGenerateImage, assertCanGenerateText, assertCanInviteTeam, assertCanSchedulePost, assertCanUseApprovalWorkflow, assertCanUseStorage, assertLimit, assertPlanFeature, assertPlanPageAccess, availableSocialSlots, countActiveSocialAccounts, countActiveMediaStorageBytes, findExistingSocialAccount, ownerBrandIds, resolveBillingUser };
