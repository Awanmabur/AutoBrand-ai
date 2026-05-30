const { getProvider } = require('./aiProvider.factory');

async function runWithFallback({ primary, fallback, payload }) {
  try {
    return await getProvider(primary.provider).run({ ...payload, provider: primary.provider, model: primary.model });
  } catch (error) {
    const safeMessage = error.safeMessage || error.message || 'AI provider failed.';
    const fallbackResult = await getProvider(fallback.provider).run({ ...payload, provider: fallback.provider, model: fallback.model, fallbackReason: safeMessage });
    return { ...fallbackResult, fallbackUsed: true, fallbackReason: safeMessage };
  }
}

module.exports = { runWithFallback };
