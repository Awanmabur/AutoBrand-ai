const Brand = require('../../models/Brand');
const { assertPlanFeature, assertPlanPageAccess } = require('../usageLimitService');

const OPERATING_MODES = new Set(['assist', 'approval', 'autopilot']);
const CONTENT_SOURCES = new Set(['manual_assets', 'chatgpt_operator', 'autobrand_ai', 'hybrid']);

function boolValue(value, fallback) {
  if (value === undefined) return fallback;
  return Boolean(value);
}

function normalizeAiBrain(input = {}, current = {}) {
  const operatingMode = OPERATING_MODES.has(String(input.operatingMode || '').toLowerCase())
    ? String(input.operatingMode).toLowerCase()
    : current.operatingMode || 'assist';
  const contentSource = CONTENT_SOURCES.has(String(input.contentSource || '').toLowerCase())
    ? String(input.contentSource).toLowerCase()
    : current.contentSource || 'manual_assets';
  return {
    ...current,
    enabled: boolValue(input.enabled, current.enabled ?? false),
    operatingMode,
    contentSource,
    learnFromAnalytics: boolValue(input.learnFromAnalytics, current.learnFromAnalytics ?? true),
    useBestTimes: boolValue(input.useBestTimes, current.useBestTimes ?? true),
    requireApproval: boolValue(input.requireApproval, current.requireApproval ?? true),
    autoPublish: boolValue(input.autoPublish, current.autoPublish ?? false),
    pauseOnError: boolValue(input.pauseOnError, current.pauseOnError ?? true),
    minContentScore: Math.max(1, Math.min(100, Number(input.minContentScore ?? current.minContentScore ?? 80))),
    instructions: String(input.instructions ?? current.instructions ?? '').trim().slice(0, 5000)
  };
}

async function assertAiBrainEntitlements(user, brain, brandId) {
  if (!brain?.enabled) return true;
  if (brain.contentSource === 'chatgpt_operator') {
    await assertPlanFeature(user, 'chatgptConnectorAccess', 'ChatGPT Operator', brandId);
    if (brain.operatingMode === 'autopilot') {
      const error = new Error('ChatGPT Operator is interactive and cannot run unattended in the background. Use Assist/Approval, or switch the content source to AutoBrand AI/Hybrid for Autopilot.');
      error.status = 400;
      throw error;
    }
  }
  if (['autobrand_ai', 'hybrid'].includes(brain.contentSource)) {
    await assertPlanPageAccess(user, 'content-generator', 'AutoBrand AI generation', brandId);
  }
  if (brain.operatingMode === 'approval') {
    await assertPlanPageAccess(user, 'approvals', 'AI Brain approval mode', brandId);
    // Background approval still consumes AutoBrand AI and runs unattended.
    // Keep it Growth+ just like Autopilot; interactive ChatGPT/manual approval
    // remains available because those sources do not enter the background worker.
    if (['autobrand_ai', 'hybrid'].includes(brain.contentSource)) {
      await assertPlanFeature(user, 'autoModeAccess', 'AI Brain background automation', brandId);
    }
  }
  if (brain.operatingMode === 'autopilot') {
    await assertPlanFeature(user, 'autoModeAccess', 'AI Brain Autopilot', brandId);
  }
  return true;
}

function backgroundEnabled(brain) {
  return Boolean(brain.enabled && ['approval', 'autopilot'].includes(brain.operatingMode) && ['autobrand_ai', 'hybrid'].includes(brain.contentSource));
}

async function applyAiBrainSettings({ user, brand, input = {} }) {
  const current = brand.aiBrain?.toObject?.() || brand.aiBrain || {};
  const brain = normalizeAiBrain(input, current);
  await assertAiBrainEntitlements(user, brain, brand._id);

  const wasBackground = backgroundEnabled(current);
  const isBackground = backgroundEnabled(brain);
  brand.aiBrain = {
    ...current,
    ...brain,
    nextRunAt: isBackground ? (wasBackground && current.nextRunAt ? current.nextRunAt : new Date()) : undefined,
    lastRunStatus: isBackground ? (current.lastRunStatus === 'running' ? 'never' : current.lastRunStatus || 'never') : 'paused',
    lastRunError: isBackground ? current.lastRunError || '' : ''
  };
  brand.autoPosting = {
    ...(brand.autoPosting?.toObject?.() || brand.autoPosting || {}),
    enabled: isBackground
  };
  await brand.save();
  return brand;
}

async function findAndApplyAiBrainSettings({ user, brandId, input }) {
  const brand = await Brand.findById(brandId);
  if (!brand) {
    const error = new Error('Brand not found.');
    error.status = 404;
    throw error;
  }
  return applyAiBrainSettings({ user, brand, input });
}

module.exports = {
  CONTENT_SOURCES,
  OPERATING_MODES,
  normalizeAiBrain,
  assertAiBrainEntitlements,
  backgroundEnabled,
  applyAiBrainSettings,
  findAndApplyAiBrainSettings
};
