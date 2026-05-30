const env = require('../../../config/env');
const { configuredError, isImageTask, isVideoTask, mediaResponse, promptText, providerError, requestJson, resolveApiKey, systemPrompt, textResponse } = require('./httpClient');

async function run(input) {
  const provider = 'openai';
  const apiKey = resolveApiKey(input, ['OPENAI_API_KEY']);
  if (!apiKey) throw configuredError(provider);
  const taskType = input.taskType || 'text_generation';
  const model = input.model || (isImageTask(taskType) ? env.openaiImageModel : env.openaiModel);

  if (isImageTask(taskType)) {
    const raw = await requestJson(provider, 'https://api.openai.com/v1/images/generations', {
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: { model, prompt: promptText(input), size: env.openaiImageSize || '1024x1024', quality: env.openaiQuality || 'medium', n: 1 },
      timeoutMs: 120000
    });
    const image = raw?.data?.[0] || {};
    return mediaResponse({ provider, model, input, url: image.url || '', b64Json: image.b64_json || '', raw });
  }

  if (isVideoTask(taskType)) {
    throw providerError(provider, 'OpenAI video generation needs the configured video worker endpoint for this deployment.', 422);
  }

  const raw = await requestJson(provider, 'https://api.openai.com/v1/chat/completions', {
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: {
      model,
      messages: [
        { role: 'system', content: systemPrompt(input) },
        { role: 'user', content: promptText(input) }
      ],
      temperature: 0.7
    }
  });
  return textResponse({ provider, model, input, text: raw?.choices?.[0]?.message?.content || '', raw });
}

module.exports = { run };
