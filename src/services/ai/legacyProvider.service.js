const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
let OpenAI;
let sharp = null;
try { sharp = require('sharp'); } catch (error) { sharp = null; }
const env = require('../../config/env');

const { persistGeneratedBuffer } = require('../generatedMediaPersistence.service');
const REQUEST_TIMEOUT_MS = 90000;
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40;
// Sora-2 renders can genuinely take longer than a few minutes under real load -
// 80 polls * 3s = 4 minutes was cutting it off before OpenAI ever finished.
const OPENAI_VIDEO_MAX_POLLS = Number(process.env.OPENAI_VIDEO_MAX_POLLS || 240);

function localAbsolutePathFromUrl(fileUrl) {
  if (!fileUrl) return '';
  if (/^https?:\/\//i.test(fileUrl)) {
    try {
      const url = new URL(fileUrl);
      if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return '';
      fileUrl = url.pathname;
    } catch (error) {
      return '';
    }
  }
  const cleaned = String(fileUrl).split('?')[0].replace(/^\/+/, '');
  const publicRoot = path.join(__dirname, '..', '..', '..', 'public');
  const absolute = path.normalize(path.join(publicRoot, cleaned.replace(/^public[\/]/, '')));
  return absolute.startsWith(publicRoot) ? absolute : '';
}

function activeProvider(kind) {
  if (kind === 'text') return String(env.aiTextProvider || (env.geminiApiKey ? 'gemini' : env.openaiApiKey ? 'openai' : '')).trim().toLowerCase();
  if (kind === 'image') return String(env.aiImageProvider || (env.replicateApiToken ? 'replicate' : env.openaiApiKey ? 'openai' : '')).trim().toLowerCase();
  if (kind === 'video') return String(env.aiVideoProvider || (env.replicateApiToken ? 'replicate' : env.openaiApiKey ? 'openai' : '')).trim().toLowerCase();
  return '';
}

function safeFilePart(value) {
  return String(value || 'asset')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'asset';
}

async function fetchJson(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) { json = { raw: text }; }
    if (!response.ok) {
      const message = json?.error?.message || json?.detail || json?.raw || `${response.status} ${response.statusText}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = json;
      throw error;
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function extractGeminiText(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part.text || '').join('\n').trim();
}

async function generateTextWithGemini({ prompt, json = true }) {
  if (!env.geminiApiKey) throw new Error('GEMINI_API_KEY is missing.');
  const model = env.geminiTextModel || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.geminiApiKey)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: json ? { responseMimeType: 'application/json' } : undefined
  };
  const response = await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return extractGeminiText(response);
}

function createOpenAIClient() {
  if (!env.openaiApiKey) throw new Error('OPENAI_API_KEY is missing.');
  if (!OpenAI) OpenAI = require('openai');
  return new OpenAI({ apiKey: env.openaiApiKey, maxRetries: 1, timeout: 120000 });
}

async function generateTextWithOpenAI({ prompt, json = true }) {
  const client = createOpenAIClient();
  const response = await client.responses.create({
    model: env.openaiModel,
    input: prompt,
    text: json ? { format: { type: 'json_object' } } : undefined
  });
  return response.output_text || '';
}

function parseJsonSafely(text) {
  const raw = String(text || '').trim();
  const withoutFence = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(withoutFence); } catch (_) {
    const first = withoutFence.indexOf('{');
    const last = withoutFence.lastIndexOf('}');
    if (first >= 0 && last > first) return JSON.parse(withoutFence.slice(first, last + 1));
    throw new Error('AI returned non-JSON text.');
  }
}

async function generateJsonText({ prompt, preferredProvider }) {
  const provider = String(preferredProvider || activeProvider('text') || '').trim().toLowerCase();
  if (!provider) {
    return { ok: false, provider: '', data: null, message: 'No hosted text AI provider is configured.' };
  }
  try {
    let text = '';
    if (provider === 'gemini') text = await generateTextWithGemini({ prompt, json: true });
    else if (provider === 'openai') text = await generateTextWithOpenAI({ prompt, json: true });
    else return { ok: false, provider, data: null, message: `Unsupported hosted text provider: ${provider}` };
    return { ok: true, provider, data: parseJsonSafely(text) };
  } catch (error) {
    return { ok: false, provider, data: null, message: error.message || 'Text generation failed.' };
  }
}

async function saveGeneratedBuffer({ buffer, mimeType = 'image/png', brand, prompt, provider, model, userId, extension = 'png' }) {
  const id = crypto.randomBytes(8).toString('hex');
  const filename = `${Date.now()}-${safeFilePart(brand?.name)}-${id}.${extension}`;
  const fileType = mimeType.startsWith('video/') ? 'video' : 'image';
  const persisted = await persistGeneratedBuffer({
    buffer,
    filename,
    mimeType,
    folder: `${provider}-generated`,
    resourceType: fileType === 'video' ? 'video' : 'image',
    publicId: `${Date.now()}-${safeFilePart(brand?.name)}-${id}`,
    metadata: {
      userId,
      provider,
      providerModel: model,
      brandId: brand?._id ? String(brand._id) : ''
    }
  });

  // Development may explicitly opt into local generated-media storage.
  // In that mode this legacy provider cannot safely persist a buffer without
  // an absolute renderer-owned path, so require durable storage instead of
  // writing an implicit project-local file.
  if (!persisted.fileUrl) {
    throw new Error('Generated AI media requires Cloudinary or MongoDB/GridFS durable storage.');
  }

  return {
    fileName: filename,
    fileUrl: persisted.fileUrl,
    publicId: persisted.publicId,
    fileType,
    mimeType,
    size: persisted.size || buffer.length,
    folder: persisted.storage === 'gridfs' ? `gridfs/${persisted.bucket || 'generated'}` : `${provider}-generated`,
    aiPrompt: prompt,
    provider,
    providerModel: model,
    metadata: { userId, storage: persisted.storage }
  };
}

async function createReplicatePrediction({ model, input }) {
  if (!env.replicateApiToken) throw new Error('REPLICATE_API_TOKEN is missing.');
  if (!model || !model.includes('/')) throw new Error('REPLICATE model must look like owner/model.');
  const [owner, name] = model.split('/');
  return fetchJson(`https://api.replicate.com/v1/models/${owner}/${name}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.replicateApiToken}`,
      'Content-Type': 'application/json',
      Prefer: 'wait'
    },
    body: JSON.stringify({ input })
  });
}

async function pollReplicatePrediction(prediction) {
  let current = prediction;
  for (let index = 0; index < MAX_POLLS; index += 1) {
    if (['succeeded', 'failed', 'canceled'].includes(current.status)) return current;
    if (!current.urls?.get) return current;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    current = await fetchJson(current.urls.get, {
      headers: { Authorization: `Bearer ${env.replicateApiToken}` }
    });
  }
  return current;
}

function firstOutputUrl(output) {
  if (!output) return '';
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    const first = output.find(Boolean);
    if (typeof first === 'string') return first;
    if (first?.url) return first.url;
  }
  if (output.url) return output.url;
  return '';
}

function replicateAspectRatio(aspectRatio, size) {
  if (aspectRatio) return aspectRatio;
  if (String(size || '').includes('1536')) return '2:3';
  return '1:1';
}

async function generateImageWithReplicate(input) {
  const model = input.model || env.replicateImageModel || 'black-forest-labs/flux-schnell';
  const prediction = await createReplicatePrediction({
    model,
    input: {
      prompt: input.prompt,
      aspect_ratio: replicateAspectRatio(input.aspectRatio, input.size),
      output_format: 'png',
      num_outputs: 1,
      go_fast: true
    }
  });
  const final = await pollReplicatePrediction(prediction);
  if (final.status && final.status !== 'succeeded') throw new Error(final.error || `Replicate image status: ${final.status}`);
  const url = firstOutputUrl(final.output);
  if (!url) throw new Error('Replicate did not return an image URL.');
  return {
    fileName: `${safeFilePart(input.brand?.name)}-replicate-image.png`,
    fileUrl: url,
    publicId: final.id || url,
    fileType: 'image',
    mimeType: 'image/png',
    size: 0,
    folder: 'replicate-generated-url',
    aiPrompt: input.prompt,
    provider: 'replicate',
    providerModel: model,
    metadata: { predictionId: final.id, status: final.status }
  };
}

async function generateImageWithOpenAI(input) {
  const client = createOpenAIClient();
  const imageRequest = {
    model: input.model || env.openaiImageModel,
    prompt: input.prompt,
    size: input.size || env.openaiImageSize || '1024x1024',
    n: 1
  };
  const imageModel = String(imageRequest.model || '').toLowerCase();
  if (env.openaiQuality) {
    if (imageModel.includes('dall-e-3')) {
      imageRequest.quality = ['standard', 'hd'].includes(String(env.openaiQuality).toLowerCase()) ? env.openaiQuality : 'standard';
    } else {
      imageRequest.quality = env.openaiQuality;
    }
  }
  const response = await client.images.generate(imageRequest);
  const first = response.data?.[0];
  if (first?.b64_json) {
    return saveGeneratedBuffer({
      buffer: Buffer.from(first.b64_json, 'base64'),
      brand: input.brand,
      prompt: input.prompt,
      userId: input.userId,
      provider: 'openai',
      model: input.model || env.openaiImageModel,
      mimeType: 'image/png',
      extension: 'png'
    });
  }
  if (first?.url) {
    return {
      fileName: `${safeFilePart(input.brand?.name)}-openai-image.png`,
      fileUrl: first.url,
      publicId: first.url,
      fileType: 'image',
      mimeType: 'image/png',
      size: 0,
      folder: 'openai-generated-url',
      aiPrompt: input.prompt,
      provider: 'openai',
      providerModel: input.model || env.openaiImageModel
    };
  }
  throw new Error('OpenAI did not return an image.');
}

async function generateImageWithGemini(input) {
  if (!env.geminiApiKey) throw new Error('GEMINI_API_KEY is missing.');
  const model = env.geminiImageModel || 'gemini-2.5-flash-image-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.geminiApiKey)}`;
  const response = await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
    })
  });
  const parts = response?.candidates?.[0]?.content?.parts || [];
  const inline = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
  const inlineData = inline?.inlineData || inline?.inline_data;
  if (!inlineData?.data) throw new Error('Gemini did not return inline image data.');
  const mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png';
  return saveGeneratedBuffer({
    buffer: Buffer.from(inlineData.data, 'base64'),
    brand: input.brand,
    prompt: input.prompt,
    userId: input.userId,
    provider: 'gemini',
    model,
    mimeType,
    extension: mimeType.includes('jpeg') ? 'jpg' : 'png'
  });
}

async function generateImage({ prompt, brand, userId, sourceMedia, aspectRatio, size, preferredProvider, model, postType, slideIndex, slideCount }) {
  const provider = String(preferredProvider || activeProvider('image') || '').trim().toLowerCase();
  const input = { prompt, brand, userId, sourceMedia, aspectRatio, size, model, postType, slideIndex, slideCount };
  if (!provider) return { ok: false, provider: '', message: 'No hosted image AI provider is configured.', aiPrompt: prompt };
  try {
    let asset;
    if (provider === 'replicate') asset = await generateImageWithReplicate(input);
    else if (provider === 'gemini') asset = await generateImageWithGemini(input);
    else if (provider === 'openai') asset = await generateImageWithOpenAI(input);
    else return { ok: false, provider, message: `Unsupported hosted image provider: ${provider}`, aiPrompt: prompt };
    return { ok: true, ...asset };
  } catch (error) {
    return { ok: false, provider, message: error.message || 'Hosted image generation failed.', aiPrompt: prompt };
  }
}

function sourceMediaUrl(sourceMedia) {
  if (!sourceMedia?.fileUrl) return '';
  if (/^https?:\/\//i.test(sourceMedia.fileUrl)) return sourceMedia.fileUrl;
  if (env.publicAppUrl && /^https?:\/\//i.test(env.publicAppUrl)) return `${env.publicAppUrl.replace(/\/$/, '')}${sourceMedia.fileUrl}`;
  return '';
}

function reachableHttpUrl(value) {
  if (!/^https?:\/\//i.test(String(value || ''))) return '';
  try {
    const url = new URL(value);
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return '';
    return url.toString();
  } catch (error) {
    return '';
  }
}

function openaiVideoSeconds(durationSeconds) {
  const raw = Number(env.openaiVideoSeconds || durationSeconds || 4);
  if (raw <= 4) return '4';
  if (raw <= 8) return '8';
  return '12';
}

function openaiVideoSize(aspectRatio) {
  const configured = String(env.openaiVideoSize || '').trim();
  if (['720x1280', '1280x720'].includes(configured)) return configured;
  const normalized = String(aspectRatio || '').trim();
  if (normalized === '16:9' || normalized === 'landscape') return '1280x720';
  if (normalized === '9:16' || normalized === 'portrait') return '720x1280';
  return '720x1280';
}

function dimensionsFromVideoSize(size) {
  const [width, height] = String(size || '').split('x').map((value) => Number(value));
  if (!width || !height) return { width: 720, height: 1280 };
  return { width, height };
}

async function fetchBinary(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get('content-type') || 'image/png'
    };
  } finally {
    clearTimeout(timer);
  }
}

async function imageBufferForVideoReference(sourceMedia) {
  const localPath = localAbsolutePathFromUrl(sourceMedia.fileUrl);
  if (localPath) {
    return {
      buffer: await fs.readFile(localPath),
      mimeType: sourceMedia.mimeType || 'image/png',
      fileName: sourceMedia.fileName || path.basename(localPath)
    };
  }

  const remoteUrl = reachableHttpUrl(sourceMedia.fileUrl) || reachableHttpUrl(sourceMediaUrl(sourceMedia));
  if (!remoteUrl) return null;
  const downloaded = await fetchBinary(remoteUrl);
  return {
    ...downloaded,
    fileName: sourceMedia.fileName || path.basename(new URL(remoteUrl).pathname) || 'reference-image.png'
  };
}

async function prepareOpenAIVideoReferenceImage({ buffer, size, brand }) {
  if (!sharp) {
    throw new Error('Image-to-video needs the sharp package to resize reference images before OpenAI video generation.');
  }
  const { width, height } = dimensionsFromVideoSize(size);
  const backgroundColor = Array.isArray(brand?.brandColors) ? String(brand.brandColors[0] || '').trim() : '';
  const background = /^#[0-9a-f]{3,8}$/i.test(backgroundColor) ? backgroundColor : '#000000';
  return sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({
      width,
      height,
      fit: 'contain',
      background
    })
    .png()
    .toBuffer();
}

async function openaiVideoInputReference(sourceMedia, size, brand) {
  if (!sourceMedia?.fileUrl || (sourceMedia.fileType && sourceMedia.fileType !== 'image')) return undefined;
  const referenceImage = await imageBufferForVideoReference(sourceMedia);
  if (!referenceImage) return undefined;
  if (!OpenAI) OpenAI = require('openai');
  const buffer = await prepareOpenAIVideoReferenceImage({ buffer: referenceImage.buffer, size, brand });
  const fileName = `${safeFilePart(sourceMedia.fileName || referenceImage.fileName || brand?.name || 'reference')}-${String(size || '').replace(/[^0-9x]/g, '') || '720x1280'}.png`;
  return OpenAI.toFile(
    buffer,
    fileName,
    { type: 'image/png' }
  );
}

async function pollOpenAIVideo(client, video) {
  let current = video;
  for (let index = 0; index < OPENAI_VIDEO_MAX_POLLS; index += 1) {
    if (current.status === 'completed') return current;
    if (current.status === 'failed') throw new Error(current.error?.message || current.error?.code || 'OpenAI video generation failed.');
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    current = await client.videos.retrieve(current.id);
  }
  throw new Error('OpenAI video generation timed out before the MP4 was ready.');
}

async function generateVideoWithOpenAI(input) {
  const client = createOpenAIClient();
  const model = input.model || env.openaiVideoModel || 'sora-2';
  const body = {
    model,
    prompt: input.prompt,
    seconds: openaiVideoSeconds(input.durationSeconds),
    size: openaiVideoSize(input.aspectRatio)
  };
  const inputReference = await openaiVideoInputReference(input.sourceMedia, body.size, input.brand);
  if (inputReference) body.input_reference = inputReference;

  const job = await client.videos.create(body);
  const final = await pollOpenAIVideo(client, job);
  const response = await client.videos.downloadContent(final.id, { variant: 'video' });
  if (!response.ok) throw new Error(`OpenAI video download failed: ${response.status} ${response.statusText}`);
  const saved = await saveGeneratedBuffer({
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: 'video/mp4',
    brand: input.brand,
    prompt: input.prompt,
    provider: 'openai',
    model,
    userId: input.userId,
    extension: 'mp4'
  });
  return {
    provider: 'openai',
    providerModel: model,
    providerJobId: final.id,
    outputUrl: saved.fileUrl,
    status: 'ready',
    message: 'OpenAI video generated successfully.',
    fileName: saved.fileName,
    mimeType: saved.mimeType,
    size: saved.size,
    folder: saved.folder,
    aiPrompt: saved.aiPrompt,
    metadata: { videoId: final.id, seconds: body.seconds, size: body.size }
  };
}

async function generateVideoWithReplicate(input) {
  const model = input.model || env.replicateVideoModel || 'alibaba/happyhorse-1.0';
  const image = sourceMediaUrl(input.sourceMedia);
  const predictionInput = {
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio || '9:16',
    duration: Number(input.durationSeconds || 8)
  };
  if (image) predictionInput.image = image;
  const prediction = await createReplicatePrediction({ model, input: predictionInput });
  const final = await pollReplicatePrediction(prediction);
  if (final.status && final.status !== 'succeeded') throw new Error(final.error || `Replicate video status: ${final.status}`);
  const url = firstOutputUrl(final.output);
  if (!url) throw new Error('Replicate did not return a video URL.');
  return {
    provider: 'replicate',
    providerModel: model,
    providerJobId: final.id,
    outputUrl: url,
    status: 'ready',
    message: 'Video generated successfully.'
  };
}

async function generateVideo({ prompt, brand, sourceMedia, aspectRatio, durationSeconds, preferredProvider, model, userId }) {
  const provider = String(preferredProvider || activeProvider('video') || '').trim().toLowerCase();
  if (!provider) return { ok: false, provider: '', message: 'No hosted video AI provider is configured.' };
  try {
    if (provider === 'openai') return { ok: true, ...(await generateVideoWithOpenAI({ prompt, brand, sourceMedia, aspectRatio, durationSeconds, model, userId })) };
    if (provider === 'replicate') return { ok: true, ...(await generateVideoWithReplicate({ prompt, brand, sourceMedia, aspectRatio, durationSeconds, model })) };
    return { ok: false, provider, message: `Unsupported hosted video provider: ${provider}. Configure a supported generative video provider.` };
  } catch (error) {
    return { ok: false, provider, message: error.message || 'Hosted video generation failed.' };
  }
}

async function checkProviders() {
  const providerConfigured = {
    openai: Boolean(env.openaiApiKey),
    gemini: Boolean(env.geminiApiKey),
    replicate: Boolean(env.replicateApiToken)
  };
  return ['text', 'image', 'video'].map((kind) => {
    const provider = activeProvider(kind);
    return {
      kind,
      provider,
      configured: Boolean(provider && providerConfigured[provider])
    };
  });
}

module.exports = {
  activeProvider,
  generateJsonText,
  generateImage,
  generateVideo,
  checkProviders,
  __private: {
    dimensionsFromVideoSize,
    openaiVideoSize,
    prepareOpenAIVideoReferenceImage
  }
};
