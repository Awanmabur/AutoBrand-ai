const { decryptToken } = require('../../tokenCryptoService');

function providerError(provider, message, status) {
  const error = new Error(message);
  error.status = status || 502;
  error.safeMessage = `${provider} request failed.`;
  return error;
}

function configuredError(provider) {
  const error = new Error(`${provider} is not configured.`);
  error.status = 422;
  error.safeMessage = `${provider} provider is not configured.`;
  return error;
}

function decryptIfNeeded(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (!text) return '';
  if (text.split('.').length === 3) {
    try { return decryptToken(text); } catch (error) { return ''; }
  }
  return text;
}

function resolveApiKey(input, envNames = []) {
  for (const name of envNames) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return decryptIfNeeded(input?.providerConfig?.apiKeyEncrypted);
}

function promptText(input = {}) {
  const prompt = input.prompt;
  if (typeof prompt === 'string') return prompt;
  if (!prompt || typeof prompt !== 'object') return '';
  return [
    prompt.goal,
    prompt.contentGoal,
    prompt.caption,
    prompt.topic,
    prompt.prompt,
    prompt.offer,
    prompt.audience,
    prompt.platform ? `Platform: ${prompt.platform}` : '',
    prompt.context
  ].filter(Boolean).join('\n') || JSON.stringify(prompt);
}

function systemPrompt(input = {}) {
  const brand = input.brand || {};
  const task = input.taskType || 'text_generation';
  return [
    'You are AutoBrand AI, a production social media SaaS assistant.',
    `Task: ${task}.`,
    brand.name ? `Brand: ${brand.name}.` : '',
    brand.toneOfVoice || brand.tone ? `Voice: ${brand.toneOfVoice || brand.tone}.` : '',
    brand.targetAudience ? `Audience: ${brand.targetAudience}.` : '',
    'Return concise, safe, ready-to-use marketing copy. Do not expose secrets.'
  ].filter(Boolean).join(' ');
}

async function requestJson(provider, url, { method = 'POST', headers = {}, body, timeoutMs = 60000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: { accept: 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' || (typeof FormData !== 'undefined' && body instanceof FormData) ? body : JSON.stringify(body),
      signal: controller.signal
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json().catch(() => ({})) : await response.text().catch(() => '');
    if (!response.ok) {
      const message = typeof payload === 'string'
        ? payload.slice(0, 240)
        : payload?.error?.message || payload?.message || `${provider} HTTP ${response.status}`;
      throw providerError(provider, message, response.status);
    }
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw providerError(provider, `${provider} request timed out.`, 504);
    if (error.safeMessage) throw error;
    throw providerError(provider, error.message || `${provider} request failed.`);
  } finally {
    clearTimeout(timer);
  }
}

function textResponse({ provider, model, input, text, raw }) {
  return {
    provider,
    model,
    ok: true,
    taskType: input.taskType || 'text_generation',
    output: text || '',
    text: text || '',
    raw
  };
}

function mediaResponse({ provider, model, input, url = '', b64Json = '', raw }) {
  return {
    provider,
    model,
    ok: true,
    taskType: input.taskType || 'image_generation',
    url,
    b64Json,
    raw,
    prompt: input.prompt
  };
}

function isImageTask(taskType = '') {
  return String(taskType).includes('image');
}

function isVideoTask(taskType = '') {
  return String(taskType).includes('video');
}

module.exports = {
  configuredError,
  isImageTask,
  isVideoTask,
  mediaResponse,
  promptText,
  providerError,
  requestJson,
  resolveApiKey,
  systemPrompt,
  textResponse
};
