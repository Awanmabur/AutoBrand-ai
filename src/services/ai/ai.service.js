const crypto = require('crypto');
const AiJob = require('../../models/AiJob');
const { chooseProvider } = require('./aiTaskRouter');
const { runWithFallback } = require('./aiFallback.service');
const { recordAiUsage } = require('./aiUsage.service');

const SUPPORTED_TASKS = [
  'text_generation',
  'caption_generation',
  'hashtag_generation',
  'campaign_generation',
  'content_calendar_generation',
  'brand_voice_generation',
  'post_rewrite',
  'reply_generation',
  'ad_copy_generation',
  'image_generation',
  'image_editing',
  'video_generation',
  'avatar_video_generation',
  'script_generation',
  'analytics_summary',
  'best_time_prediction',
  'platform_variation_generation',
  'content_score',
  'brand_fit_check',
  'risk_check'
];

function hashPrompt(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
}

async function runAiTask({ user, brand, taskType = 'text_generation', prompt, requestedProvider, requestedModel, metadata = {}, queue = false }) {
  if (!SUPPORTED_TASKS.includes(taskType)) {
    const error = new Error(`Unsupported AI task: ${taskType}`);
    error.status = 422;
    throw error;
  }
  const route = await chooseProvider({ user, taskType, requestedProvider, requestedModel });
  const promptHash = hashPrompt({ taskType, prompt, brand: brand?._id || brand?.name });
  const job = await AiJob.create({
    user: user?._id,
    brand: brand?._id,
    taskType,
    provider: route.provider,
    model: route.model,
    promptHash,
    status: queue ? 'queued' : 'running',
    priority: route.priority,
    metadata
  });

  if (queue) return { job, queued: true };

  try {
    job.startedAt = new Date();
    await job.save();
    const result = await runWithFallback({
      primary: { provider: route.provider, model: route.model },
      fallback: { provider: route.fallbackProvider, model: route.fallbackModel },
      payload: { taskType, prompt, brand, providerConfig: route.providerConfig, metadata }
    });
    job.status = 'completed';
    job.result = result;
    job.completedAt = new Date();
    await job.save();
    await recordAiUsage({ user, brand, plan: route.plan, taskType, provider: result.provider || route.provider, model: result.model || route.model, prompt, result });
    return { job, result, route };
  } catch (error) {
    job.status = 'failed';
    job.error = error.safeMessage || error.message || 'AI task failed.';
    job.completedAt = new Date();
    await job.save();
    throw error;
  }
}

async function generateCaption(input) {
  return runAiTask({ ...input, taskType: 'caption_generation' });
}

async function generatePlatformVariation(input) {
  return runAiTask({ ...input, taskType: 'platform_variation_generation' });
}

const legacyProvider = require('./legacyProvider.service');

async function generateJsonText(input) {
  return legacyProvider.generateJsonText(input);
}

async function generateImage(input) {
  return legacyProvider.generateImage(input);
}

async function generateVideo(input) {
  return legacyProvider.generateVideo(input);
}

function activeProvider(kind) {
  return legacyProvider.activeProvider(kind);
}

function checkProviders(input) {
  return legacyProvider.checkProviders(input);
}

module.exports = {
  SUPPORTED_TASKS,
  activeProvider,
  checkProviders,
  generateCaption,
  generateImage,
  generateJsonText,
  generatePlatformVariation,
  generateVideo,
  hashPrompt,
  runAiTask
};
