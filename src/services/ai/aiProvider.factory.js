const providers = {
  openai: () => require('./providers/openai.provider'),
  gemini: () => require('./providers/gemini.provider'),
  deepseek: () => require('./providers/deepseek.provider'),
  groq: () => require('./providers/groq.provider'),
  anthropic: () => require('./providers/anthropic.provider'),
  mistral: () => require('./providers/mistral.provider'),
  replicate: () => require('./providers/replicate.provider'),
  stability: () => require('./providers/stability.provider'),
  fal: () => require('./providers/fal.provider')
};

function providerError(message, status = 422) {
  const error = new Error(message);
  error.status = status;
  error.safeMessage = message;
  return error;
}

function getProvider(slug) {
  const normalized = String(slug || '').trim().toLowerCase();
  if (!normalized) throw providerError('No AI provider is configured for this task.', 503);
  const factory = providers[normalized];
  if (!factory) throw providerError(`Unsupported AI provider: ${normalized}.`, 422);
  return factory();
}

function supportedProviders() {
  return Object.keys(providers);
}

module.exports = { getProvider, supportedProviders };
