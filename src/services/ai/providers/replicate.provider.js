const env = require('../../../config/env');
const { configuredError, isVideoTask, mediaResponse, promptText, requestJson, resolveApiKey } = require('./httpClient');

async function run(input) {
  const provider = 'replicate';
  const apiKey = resolveApiKey(input, ['REPLICATE_API_TOKEN', 'REPLICATE_API_KEY']);
  if (!apiKey) throw configuredError(provider);
  const taskType = input.taskType || 'image_generation';
  const model = input.model || (isVideoTask(taskType) ? env.replicateVideoModel : env.replicateImageModel) || 'black-forest-labs/flux-schnell';
  const raw = await requestJson(provider, `https://api.replicate.com/v1/models/${model}/predictions`, {
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', prefer: 'wait' },
    body: { input: { prompt: promptText(input) } },
    timeoutMs: 180000
  });
  const output = Array.isArray(raw?.output) ? raw.output[0] : raw?.output;
  return mediaResponse({ provider, model, input, url: typeof output === 'string' ? output : '', raw });
}

module.exports = { run };
