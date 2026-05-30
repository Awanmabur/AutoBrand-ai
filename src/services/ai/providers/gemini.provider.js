const env = require('../../../config/env');
const { configuredError, promptText, requestJson, resolveApiKey, systemPrompt, textResponse } = require('./httpClient');

async function run(input) {
  const provider = 'gemini';
  const apiKey = resolveApiKey(input, ['GEMINI_API_KEY', 'GOOGLE_AI_API_KEY']);
  if (!apiKey) throw configuredError(provider);
  const model = input.model || env.geminiTextModel || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const raw = await requestJson(provider, url, {
    headers: { 'content-type': 'application/json' },
    body: {
      systemInstruction: { parts: [{ text: systemPrompt(input) }] },
      contents: [{ role: 'user', parts: [{ text: promptText(input) }] }],
      generationConfig: { temperature: 0.7 }
    }
  });
  const text = (raw?.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('\n').trim();
  return textResponse({ provider, model, input, text, raw });
}

module.exports = { run };
