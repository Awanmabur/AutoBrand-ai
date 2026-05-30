const env = require('../../../config/env');
const { configuredError, promptText, requestJson, resolveApiKey, systemPrompt, textResponse } = require('./httpClient');

async function run(input) {
  const provider = 'anthropic';
  const apiKey = resolveApiKey(input, ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY']);
  if (!apiKey) throw configuredError(provider);
  const model = input.model || env.anthropicTextModel || 'claude-3-5-sonnet-latest';
  const raw = await requestJson(provider, 'https://api.anthropic.com/v1/messages', {
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: { model, max_tokens: 1200, system: systemPrompt(input), messages: [{ role: 'user', content: promptText(input) }] }
  });
  const text = (raw?.content || []).map((part) => part.text || '').join('\n').trim();
  return textResponse({ provider, model, input, text, raw });
}

module.exports = { run };
