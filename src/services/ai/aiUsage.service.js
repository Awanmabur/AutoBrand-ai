const { recordUsage } = require('../usage.service');

function estimateTokens(text = '') {
  return Math.max(1, Math.ceil(String(text).length / 4));
}

async function recordAiUsage({ user, brand, plan, taskType, provider, model, prompt = '', result }) {
  if (!user) return null;
  const mediaCount = ['image_generation', 'image_editing', 'video_generation', 'avatar_video_generation'].includes(taskType) ? 1 : 0;
  return recordUsage({
    user,
    brand,
    plan,
    metric: taskType,
    taskType,
    provider,
    model,
    tokensUsed: estimateTokens(prompt) + estimateTokens(JSON.stringify(result || '')),
    mediaCount,
    quantity: 1,
    metadata: { fallbackUsed: result?.fallbackUsed || false }
  });
}

module.exports = { estimateTokens, recordAiUsage };
