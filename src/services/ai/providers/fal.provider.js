const env = require('../../../config/env');
const { configuredError, isVideoTask, mediaResponse, promptText, requestJson, resolveApiKey } = require('./httpClient');

async function run(input) {
  const provider = 'fal';
  const apiKey = resolveApiKey(input, ['FAL_KEY', 'FAL_API_KEY']);
  if (!apiKey) throw configuredError(provider);
  const taskType = input.taskType || 'image_generation';
  const model = input.model || (isVideoTask(taskType) ? env.falVideoModel : env.falImageModel) || 'fal-ai/flux/schnell';
  const raw = await requestJson(provider, `https://fal.run/${model}`, {
    headers: { authorization: `Key ${apiKey}`, 'content-type': 'application/json' },
    body: { prompt: promptText(input) },
    timeoutMs: 180000
  });
  const images = raw?.images || raw?.data?.images || [];
  const videos = raw?.videos || raw?.data?.videos || [];
  const url = images[0]?.url || videos[0]?.url || raw?.url || '';
  return mediaResponse({ provider, model, input, url, raw });
}

module.exports = { run };
