const env = require('../../../config/env');
const { configuredError, mediaResponse, promptText, providerError, resolveApiKey } = require('./httpClient');

async function run(input) {
  const provider = 'stability';
  const apiKey = resolveApiKey(input, ['STABILITY_API_KEY']);
  if (!apiKey) throw configuredError(provider);
  if (typeof FormData === 'undefined') throw providerError(provider, 'FormData is not available in this Node runtime.', 500);

  const model = input.model || env.stabilityImageModel || 'stable-image-core';
  const form = new FormData();
  form.append('prompt', promptText(input));
  form.append('output_format', 'png');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      body: form,
      signal: controller.signal
    });
    const raw = await response.json().catch(() => ({}));
    if (!response.ok) throw providerError(provider, raw?.message || `Stability HTTP ${response.status}`, response.status);
    return mediaResponse({ provider, model, input, b64Json: raw?.image || '', raw });
  } catch (error) {
    if (error.safeMessage) throw error;
    throw providerError(provider, error.name === 'AbortError' ? 'Stability request timed out.' : error.message);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { run };
