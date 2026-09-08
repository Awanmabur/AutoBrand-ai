const { getProvider } = require('./aiProvider.factory');

function safeProviderFailure(error, fallbackMessage = 'AI provider failed.') {
  const message = error?.safeMessage || error?.message || fallbackMessage;
  const wrapped = new Error(message);
  wrapped.status = error?.status || 502;
  wrapped.safeMessage = message;
  if (error?.code) wrapped.code = error.code;
  return wrapped;
}

async function runWithFallback({ primary, fallback, payload }) {
  try {
    return await getProvider(primary?.provider).run({
      ...payload,
      provider: primary.provider,
      model: primary.model
    });
  } catch (primaryError) {
    const fallbackProvider = String(fallback?.provider || '').trim().toLowerCase();
    const fallbackModel = String(fallback?.model || '').trim();
    const sameRoute = fallbackProvider
      && fallbackProvider === String(primary?.provider || '').trim().toLowerCase()
      && fallbackModel === String(primary?.model || '').trim();

    if (!fallbackProvider || sameRoute) throw safeProviderFailure(primaryError);

    const primaryMessage = primaryError?.safeMessage || primaryError?.message || 'Primary AI provider failed.';
    try {
      const fallbackResult = await getProvider(fallbackProvider).run({
        ...payload,
        provider: fallbackProvider,
        model: fallbackModel,
        fallbackReason: primaryMessage
      });
      return { ...fallbackResult, fallbackUsed: true, fallbackReason: primaryMessage };
    } catch (fallbackError) {
      const fallbackMessage = fallbackError?.safeMessage || fallbackError?.message || 'Fallback AI provider failed.';
      const error = new Error(`AI generation failed. Primary: ${primaryMessage} Fallback: ${fallbackMessage}`);
      error.status = fallbackError?.status || primaryError?.status || 502;
      error.safeMessage = 'AI generation failed because the configured provider routes are unavailable.';
      throw error;
    }
  }
}

module.exports = { runWithFallback };
