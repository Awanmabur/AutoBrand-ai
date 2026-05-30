const DEFAULT_MODEL_REGISTRY = {
  openai: {
    text: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o-mini'],
    image: ['gpt-image-1'],
    video: ['sora-2']
  },
  gemini: {
    text: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    image: ['gemini-2.5-flash-image-preview']
  },
  deepseek: { text: ['deepseek-chat', 'deepseek-reasoner'] },
  groq: { text: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] },
  anthropic: { text: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'] },
  mistral: { text: ['mistral-large-latest', 'mistral-small-latest'] },
  replicate: { image: ['black-forest-labs/flux-schnell'], video: ['default-video'] },
  stability: { image: ['stable-image-core'] },
  fal: { image: ['fal-ai/flux/schnell'], video: ['fal-ai/video'] },
  local: { text: ['local-fast', 'local-fallback'], image: ['local-image'], video: ['local-storyboard'] }
};

function taskGroup(taskType = 'text_generation') {
  if (String(taskType).includes('image')) return 'image';
  if (String(taskType).includes('video')) return 'video';
  if (String(taskType).includes('audio')) return 'audio';
  return 'text';
}

function getModelsForProvider(provider, group) {
  return DEFAULT_MODEL_REGISTRY[provider]?.[group] || [];
}

function isModelAllowed({ provider, model, allowedModels = [], taskType }) {
  if (!allowedModels.length || allowedModels.includes('*')) return true;
  if (allowedModels.includes(model)) return true;
  const group = taskGroup(taskType);
  return getModelsForProvider(provider, group).some((registered) => registered === model && allowedModels.includes(registered));
}

module.exports = { DEFAULT_MODEL_REGISTRY, getModelsForProvider, isModelAllowed, taskGroup };
