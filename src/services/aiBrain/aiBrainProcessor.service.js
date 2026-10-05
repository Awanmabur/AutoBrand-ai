const Brand = require('../../models/Brand');
const User = require('../../models/User');
const { getCurrentPlan } = require('../subscription.service');
const {
  assertCanCreateAutoPosts,
  assertCanSchedulePost,
  assertCanUseApprovalWorkflow,
  assertPlanPageAccess,
  assertPlanFeature
} = require('../usageLimitService');
const { chooseProvider } = require('../ai/aiTaskRouter');
const { resolvePublishingTargets } = require('../social/socialDestination.service');
const { createScheduledPostsFromBatch, countFromFrequency } = require('../autoCampaignService');
const { dispatchScheduledPost } = require('../postDispatchService');
const { updateBrandPerformanceMemory } = require('../analyticsMemoryService');
const { notifyUser } = require('../notification.service');

let timer = null;
let running = false;

function intervalMsForFrequency(unit = 'week') {
  if (unit === 'day') return 24 * 60 * 60 * 1000;
  if (unit === 'month') return 30 * 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
}

function nextRunAtForBrand(brand, from = new Date()) {
  return new Date(from.getTime() + intervalMsForFrequency(brand.autoPosting?.frequencyUnit));
}

function brainCanRunInBackground(brand) {
  const brain = brand?.aiBrain || {};
  return Boolean(
    brand?.status === 'active'
    && brain.enabled
    && ['approval', 'autopilot'].includes(brain.operatingMode)
    && ['autobrand_ai', 'hybrid'].includes(brain.contentSource)
  );
}

async function assertBrainPlanAccess({ user, brand, mode }) {
  await assertPlanPageAccess(user, 'content-generator', 'AutoBrand AI Brain generation', brand._id);
  // Any unattended Brain run is an automation capability. Approval mode creates
  // content in the background for review; Autopilot can also schedule/publish.
  // Both therefore require the Growth+ automation entitlement.
  await assertPlanFeature(user, 'autoModeAccess', mode === 'autopilot' ? 'AI Brain Autopilot' : 'AI Brain background automation', brand._id);
  if (mode === 'approval') await assertCanUseApprovalWorkflow(user, brand._id);
}

async function claimDueBrand() {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 30 * 60 * 1000);
  return Brand.findOneAndUpdate(
    {
      status: 'active',
      'aiBrain.enabled': true,
      'aiBrain.operatingMode': { $in: ['approval', 'autopilot'] },
      'aiBrain.contentSource': { $in: ['autobrand_ai', 'hybrid'] },
      $and: [
        { $or: [{ 'aiBrain.nextRunAt': { $exists: false } }, { 'aiBrain.nextRunAt': null }, { 'aiBrain.nextRunAt': { $lte: now } }] },
        { $or: [{ 'aiBrain.lastRunStatus': { $ne: 'running' } }, { 'aiBrain.lastRunAt': { $lt: staleBefore } }] }
      ]
    },
    {
      $set: {
        'aiBrain.lastRunStatus': 'running',
        'aiBrain.lastRunAt': now,
        'aiBrain.lastRunError': ''
      }
    },
    { new: true, sort: { 'aiBrain.nextRunAt': 1, updatedAt: 1 } }
  );
}

async function providerForTask({ user, plan, taskType, optional = false }) {
  try {
    return await chooseProvider({ user, plan, taskType });
  } catch (error) {
    if (optional && [402, 403, 422, 503].includes(Number(error.status))) return null;
    throw error;
  }
}

async function runBrainForBrand(brand) {
  if (!brainCanRunInBackground(brand)) return { skipped: true, reason: 'AI Brain is not configured for background operation.' };

  const owner = await User.findById(brand.owner);
  if (!owner || owner.status === 'deleted' || owner.status === 'disabled') {
    throw new Error('The brand owner is unavailable.');
  }

  const mode = brand.aiBrain.operatingMode;
  await assertBrainPlanAccess({ user: owner, brand, mode });
  const plan = await getCurrentPlan(owner);

  if (brand.aiBrain.learnFromAnalytics) {
    await updateBrandPerformanceMemory({ brandIds: [brand._id] }).catch(() => {});
    brand = await Brand.findById(brand._id);
  }

  const targets = await resolvePublishingTargets({
    brandId: brand._id,
    requestedPlatforms: [],
    requestedAccountIds: [],
    requireReady: true,
    allowPlatformDefaults: true,
    allowEmpty: false
  });

  const count = Math.max(1, Math.min(90, countFromFrequency({ brand })));
  await assertCanSchedulePost(owner, count, brand._id);
  await assertCanCreateAutoPosts(owner, count, brand._id);

  const textRoute = await providerForTask({ user: owner, plan, taskType: 'text_generation' });
  const imageAllowed = owner.role === 'super_admin' || Number(plan?.limits?.maxAiImageGenerations || 0) !== 0;
  const videoAllowed = owner.role === 'super_admin' || Number(plan?.limits?.maxAiVideoGenerations || 0) !== 0;
  const imageRoute = imageAllowed ? await providerForTask({ user: owner, plan, taskType: 'image_generation', optional: true }) : null;
  const videoRoute = videoAllowed ? await providerForTask({ user: owner, plan, taskType: 'video_generation', optional: true }) : null;

  const wantsApproval = mode === 'approval' || brand.aiBrain.requireApproval || !brand.aiBrain.autoPublish;
  const desiredStatus = wantsApproval ? 'pending_approval' : 'scheduled';
  const mediaMix = (brand.autoPosting?.mediaMix || []).filter((item) => videoRoute || String(item).toLowerCase() !== 'video');

  const result = await createScheduledPostsFromBatch({
    userId: owner._id,
    actorUser: owner,
    brand,
    targetAccounts: targets.accountIds,
    // Do not enqueue inside generation. The processor applies quality/approval safety first.
    enqueue: null,
    input: {
      platforms: targets.platforms,
      frequencyUnit: brand.autoPosting?.frequencyUnit || 'week',
      count,
      workflowMode: 'auto',
      status: desiredStatus,
      startDate: new Date(),
      preferredSlots: brand.autoPosting?.preferredSlots || [],
      mediaMix: mediaMix.length ? mediaMix : (imageRoute ? ['image'] : ['auto']),
      imagesPerPostMin: brand.autoPosting?.imagesPerPostMin || 1,
      imagesPerPostMax: brand.autoPosting?.imagesPerPostMax || 3,
      customerGoal: [brand.aiBrain.instructions, brand.autoPosting?.customerGoal].filter(Boolean).join('\n') || undefined,
      strengthTarget: Math.max(Number(brand.aiBrain.minContentScore || 80), Number(brand.autoPosting?.strengthTarget || 90)),
      aiProvider: textRoute.provider,
      textProvider: textRoute.provider,
      imageProvider: imageRoute?.provider,
      videoProvider: videoRoute?.provider,
      generateImages: Boolean(imageRoute) && brand.autoPosting?.requireMedia !== false,
      generateVideos: Boolean(videoRoute),
      usageSource: 'ai_brain'
    }
  });

  let scheduled = 0;
  let awaitingApproval = 0;
  for (const post of result.createdPosts) {
    const score = Number(post.platformMetadata?.qualityScore || 0);
    const belowThreshold = score > 0 && score < Number(brand.aiBrain.minContentScore || 80);
    if (belowThreshold && post.status === 'scheduled') {
      post.status = 'pending_approval';
      post.scheduleVersion = 0;
      post.platformMetadata = {
        ...(post.platformMetadata || {}),
        aiBrainSafetyHold: `Content score ${score} is below the AI Brain minimum of ${brand.aiBrain.minContentScore || 80}.`
      };
      await post.save();
    }

    if (post.status === 'scheduled') {
      await dispatchScheduledPost(post, { userId: owner._id });
      scheduled += 1;
    } else if (post.status === 'pending_approval') {
      awaitingApproval += 1;
    }
  }

  brand.aiBrain.lastRunStatus = 'success';
  brand.aiBrain.lastRunAt = new Date();
  brand.aiBrain.lastRunError = '';
  brand.aiBrain.nextRunAt = nextRunAtForBrand(brand);
  await brand.save();

  await notifyUser({
    user: owner._id,
    type: 'ai_brain_run',
    title: wantsApproval ? 'AI Brain prepared content for review' : 'AI Brain scheduled new content',
    message: `${result.createdPosts.length} post(s) created for ${brand.name}. ${scheduled} scheduled, ${awaitingApproval} awaiting approval.`,
    entityType: 'Brand',
    entityId: brand._id
  }).catch(() => {});

  return { brandId: String(brand._id), created: result.createdPosts.length, scheduled, awaitingApproval };
}

async function markBrainFailure(brand, error) {
  const fresh = await Brand.findById(brand._id);
  if (!fresh) return;
  fresh.aiBrain.lastRunAt = new Date();
  fresh.aiBrain.lastRunStatus = fresh.aiBrain.pauseOnError ? 'paused' : 'failed';
  fresh.aiBrain.lastRunError = String(error?.safeMessage || error?.message || 'AI Brain run failed.').slice(0, 1000);
  fresh.aiBrain.nextRunAt = fresh.aiBrain.pauseOnError ? undefined : new Date(Date.now() + 60 * 60 * 1000);
  if (fresh.aiBrain.pauseOnError) fresh.aiBrain.enabled = false;
  await fresh.save();
}

async function processOneDueBrain() {
  const brand = await claimDueBrand();
  if (!brand) return null;
  try {
    return await runBrainForBrand(brand);
  } catch (error) {
    await markBrainFailure(brand, error).catch(() => {});
    throw error;
  }
}

async function runAiBrainBatch({ concurrency = 1 } = {}) {
  const workers = Array.from({ length: Math.max(1, Math.min(5, Number(concurrency || 1))) }, async () => {
    const results = [];
    while (true) {
      const result = await processOneDueBrain().catch((error) => {
        console.error('[ai-brain] run failed', { message: error.message });
        return { failed: true, error: error.message };
      });
      if (!result) break;
      results.push(result);
    }
    return results;
  });
  return (await Promise.all(workers)).flat();
}

function startAiBrainProcessor({ pollMs = 60_000, concurrency = 1 } = {}) {
  if (timer) return;
  const run = async () => {
    if (running) return;
    running = true;
    try { await runAiBrainBatch({ concurrency }); }
    finally { running = false; }
  };
  run().catch((error) => console.error('[ai-brain] initial run failed:', error.message));
  timer = setInterval(() => run().catch((error) => console.error('[ai-brain] run failed:', error.message)), Math.max(30_000, Number(pollMs || 60_000)));
  timer.unref?.();
}

function stopAiBrainProcessor() {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;
}

module.exports = {
  brainCanRunInBackground,
  nextRunAtForBrand,
  runBrainForBrand,
  runAiBrainBatch,
  startAiBrainProcessor,
  stopAiBrainProcessor
};
