const { recordUsage } = require('../usage.service');
const { estimateTokens, extractActualTokenUsage } = require('./tokenBudget.service');

async function recordAiUsage({ user, brand, plan, taskType, provider, model, prompt = '', result, tokenUsage }) {
  if (!user) return null;
  const mediaCount = ['image_generation', 'image_editing', 'video_generation', 'avatar_video_generation'].includes(taskType) ? 1 : 0;
  const actual = tokenUsage || extractActualTokenUsage(result);
  const fallbackEstimate = estimateTokens(prompt) + estimateTokens(JSON.stringify(result?.output || result?.text || ''));
  const tokensUsed = Number(actual?.totalTokens || 0) > 0 ? Number(actual.totalTokens) : fallbackEstimate;
  return recordUsage({
    user,
    brand,
    plan,
    metric: taskType,
    taskType,
    provider,
    model,
    tokensUsed,
    mediaCount,
    quantity: 1,
    metadata: {
      fallbackUsed: result?.fallbackUsed || false,
      tokenUsageSource: actual?.source || 'estimated',
      inputTokens: Number(actual?.inputTokens || 0),
      outputTokens: Number(actual?.outputTokens || 0)
    }
  });
}

module.exports = { estimateTokens, recordAiUsage };
