const env = require('../../../config/env');
const { configuredError, promptText, requestJson, resolveApiKey, systemPrompt, textResponse } = require('./httpClient');

async function run(input) {
  const provider = 'deepseek';
  const apiKey = resolveApiKey(input, ['DEEPSEEK_API_KEY']);
  if (!apiKey) throw configuredError(provider);
  const model = input.model || env.deepseekTextModel || 'deepseek-chat';
  const raw = await requestJson(provider, 'https://api.deepseek.com/chat/completions', {
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: { model, messages: [{ role: 'system', content: systemPrompt(input) }, { role: 'user', content: promptText(input) }], temperature: 0.7 }
  });
  return textResponse({ provider, model, input, text: raw?.choices?.[0]?.message?.content || '', raw });
}

module.exports = { run };
