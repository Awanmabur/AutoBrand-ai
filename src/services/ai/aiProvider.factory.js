const providers = {
  openai: () => require('./providers/openai.provider'),
  gemini: () => require('./providers/gemini.provider'),
  deepseek: () => require('./providers/deepseek.provider'),
  groq: () => require('./providers/groq.provider'),
  anthropic: () => require('./providers/anthropic.provider'),
  mistral: () => require('./providers/mistral.provider'),
  replicate: () => require('./providers/replicate.provider'),
  stability: () => require('./providers/stability.provider'),
  fal: () => require('./providers/fal.provider'),
  local: () => require('./providers/local.provider')
};

function getProvider(slug = 'local') {
  const factory = providers[String(slug || 'local').toLowerCase()] || providers.local;
  return factory();
}

module.exports = { getProvider };
