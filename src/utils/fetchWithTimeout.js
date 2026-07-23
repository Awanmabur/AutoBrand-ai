const DEFAULT_TIMEOUT_MS = Math.max(10_000, Number(process.env.SOCIAL_PROVIDER_TIMEOUT_MS || 5 * 60 * 1000));

async function fetchWithTimeout(url, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: externalSignal, ...fetchOptions } = options || {};
  const controller = new AbortController();
  let timedOut = false;

  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternalSignal();
  else externalSignal?.addEventListener?.('abort', abortFromExternalSignal, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(1_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
  timer.unref?.();

  try {
    return await fetch(url, { ...fetchOptions, signal: controller.signal });
  } catch (error) {
    if (!timedOut) throw error;
    const timeoutError = new Error(`Social provider request timed out after ${Math.round(Number(timeoutMs) / 1000)} seconds.`);
    timeoutError.code = 'ETIMEDOUT';
    timeoutError.cause = error;
    throw timeoutError;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener?.('abort', abortFromExternalSignal);
  }
}

module.exports = { DEFAULT_TIMEOUT_MS, fetchWithTimeout };
