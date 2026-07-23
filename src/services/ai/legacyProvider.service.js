const crypto = require('crypto');
const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
let OpenAI;
let Resvg = null;
let sharp = null;
let ffmpegBinary;
try { ({ Resvg } = require('@resvg/resvg-js')); } catch (error) { Resvg = null; }
try { sharp = require('sharp'); } catch (error) { sharp = null; }
const env = require('../../config/env');
const { isCloudinaryConfigured } = require('../../config/cloudinary');
const { uploadBuffer } = require('../cloudinaryService');

const GENERATED_UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'public', 'uploads', 'ai');
const { saveBufferToGridFs } = require('../gridFsMediaStorage.service');
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

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

function resolveFfmpegBinary() {
  if (ffmpegBinary !== undefined) return ffmpegBinary;
  try {
    ffmpegBinary = require('ffmpeg-static') || '';
  } catch (error) {
    ffmpegBinary = '';
  }
  if (ffmpegBinary && !fsSync.existsSync(ffmpegBinary)) ffmpegBinary = '';
  ffmpegBinary = ffmpegBinary || process.env.FFMPEG_PATH || 'ffmpeg';
  return ffmpegBinary;
}

async function localVideoInput(sourceMedia) {
  const existingPath = localAbsolutePathFromUrl(sourceMedia?.fileUrl);
  if (existingPath) {
    try {
      await fs.access(existingPath);
      return { inputPath: existingPath, cleanup: async () => {} };
    } catch (error) {
      // A stale local URL must be downloaded or rejected instead of being sent
      // to ffmpeg as a path that no longer exists.
    }
  }

  if (!sourceMedia?.fileUrl) {
    throw new Error('A source image is required for local fallback video generation.');
  }

  const reference = await imageBufferForVideoReference(sourceMedia);
  if (!reference?.buffer?.length) {
    throw new Error('The source image could not be downloaded for local fallback video generation.');
  }

  await fs.mkdir(GENERATED_UPLOAD_DIR, { recursive: true });
  const inputPath = path.join(GENERATED_UPLOAD_DIR, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-video-source.png`);
  const normalized = sharp
    ? await sharp(reference.buffer, { failOn: 'none' }).rotate().png().toBuffer()
    : reference.buffer;
  await fs.writeFile(inputPath, normalized);
  return {
    inputPath,
    cleanup: async () => fs.unlink(inputPath).catch(() => {})
  };
}

async function generateLocalVideo({ brand, sourceMedia, durationSeconds = 8, aspectRatio = '9:16', prompt }) {
  const ffmpeg = resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg-static is unavailable, so the fallback MP4 renderer cannot run.');
  const source = await localVideoInput(sourceMedia);
  await fs.mkdir(GENERATED_UPLOAD_DIR, { recursive: true });
  const id = crypto.randomBytes(8).toString('hex');
  const filename = `${Date.now()}-${safeFilePart(brand?.name)}-${id}.mp4`;
  const outputPath = path.join(GENERATED_UPLOAD_DIR, filename);
  const [w, h] = String(aspectRatio || '9:16') === '1:1' ? [720, 720] : String(aspectRatio || '').startsWith('16:9') ? [1280, 720] : [720, 1280];
  const safeDuration = Math.max(4, Math.min(20, Number(durationSeconds || 8)));
  const fps = 24;
  const filter = [
    `scale=${w}:${h}:force_original_aspect_ratio=decrease`,
    `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`,
    `zoompan=z='min(zoom+0.0012,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${w}x${h}:fps=${fps}`,
    'format=yuv420p'
  ].join(',');

  try {
    await runCommand(ffmpeg, [
      '-y',
      '-loop', '1',
      '-framerate', String(fps),
      '-i', source.inputPath,
      '-t', String(safeDuration),
      '-vf', filter,
      '-r', String(fps),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '24',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath
    ]);
    const buffer = await fs.readFile(outputPath);
    const saved = await saveGeneratedBuffer({
      buffer,
      mimeType: 'video/mp4',
      brand,
      prompt,
      provider: 'local_ffmpeg',
      model: 'image-to-video-fallback',
      extension: 'mp4'
    });
    return {
      provider: 'local_ffmpeg',
      providerModel: 'image-to-video-fallback',
      providerJobId: `local-${id}`,
      outputUrl: saved.fileUrl,
      status: 'ready',
      message: 'Fallback MP4 generated successfully.',
      fileName: saved.fileName,
      mimeType: saved.mimeType,
      size: saved.size,
      folder: saved.folder,
      aiPrompt: prompt,
      publicId: saved.publicId
    };
  } finally {
    await Promise.allSettled([
      source.cleanup(),
      fs.unlink(outputPath).catch(() => {})
    ]);
  }
}

function activeProvider(kind) {
  if (kind === 'text') return env.aiTextProvider || (env.geminiApiKey ? 'gemini' : env.openaiApiKey ? 'openai' : 'local');
  if (kind === 'image') return env.aiImageProvider || (env.replicateApiToken ? 'replicate' : env.openaiApiKey ? 'openai' : 'local');
  if (kind === 'video') return env.aiVideoProvider || (env.replicateApiToken ? 'replicate' : 'planning');
  return 'local';
}

function safeFilePart(value) {
  return String(value || 'asset')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'asset';
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
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

async function generateJsonText({ prompt, fallback, preferredProvider }) {
  const provider = preferredProvider || activeProvider('text');
  try {
    let text = '';
    if (provider === 'gemini') text = await generateTextWithGemini({ prompt, json: true });
    else if (provider === 'openai') text = await generateTextWithOpenAI({ prompt, json: true });
    else return { ok: false, provider: 'local', data: fallback, message: 'No hosted text provider configured.' };
    return { ok: true, provider, data: parseJsonSafely(text) };
  } catch (error) {
    return { ok: false, provider, data: fallback, message: error.message || 'Text generation failed.' };
  }
}

async function saveGeneratedBuffer({ buffer, mimeType = 'image/png', brand, prompt, provider, model, userId, extension = 'png' }) {
  const id = crypto.randomBytes(8).toString('hex');
  const filename = `${Date.now()}-${safeFilePart(brand?.name)}-${id}.${extension}`;
  const fileType = mimeType.startsWith('video/') ? 'video' : 'image';

  // Hosting platforms like Render/Heroku wipe the local filesystem on every
  // restart/redeploy, so a locally-saved file can vanish before a scheduled
  // post ever reads it back. Persist to Cloudinary when it's configured;
  // local disk is only a dev-mode fallback, not a real storage destination.
  if (isCloudinaryConfigured()) {
    try {
      const uploaded = await uploadBuffer({
        buffer,
        folder: `${provider}-generated`,
        resourceType: fileType === 'video' ? 'video' : 'image',
        publicId: `${Date.now()}-${safeFilePart(brand?.name)}-${id}`
      });
      return {
        fileName: filename,
        fileUrl: uploaded.secure_url,
        publicId: uploaded.public_id,
        fileType,
        mimeType,
        size: buffer.length,
        folder: `${provider}-generated`,
        aiPrompt: prompt,
        provider,
        providerModel: model,
        metadata: { userId }
      };
    } catch (error) {
      console.error(`Cloudinary upload failed, falling back to local disk (will not survive a restart): ${error.message}`);
    }
  }

  // MongoDB/GridFS is the durable no-extra-service fallback. It keeps the
  // generated bytes aligned with the Media record and survives web restarts.
  // A public HTTPS APP_URL makes the same route directly usable by Instagram.
  if (String(process.env.GENERATED_MEDIA_STORAGE || 'gridfs').toLowerCase() !== 'local') {
    try {
      const stored = await saveBufferToGridFs({
        buffer,
        filename,
        mimeType,
        metadata: { userId, provider, providerModel: model, brandId: brand?._id ? String(brand._id) : '' }
      });
      return {
        fileName: filename,
        fileUrl: stored.fileUrl,
        publicId: stored.publicId,
        fileType,
        mimeType,
        size: stored.size,
        folder: `gridfs/${stored.bucket}`,
        aiPrompt: prompt,
        provider,
        providerModel: model,
        metadata: { userId, storage: 'gridfs' }
      };
    } catch (error) {
      console.error(`GridFS generated-media save failed; using local disk fallback: ${error.message}`);
    }
  }

  await fs.mkdir(GENERATED_UPLOAD_DIR, { recursive: true });
  const absolutePath = path.join(GENERATED_UPLOAD_DIR, filename);
  await fs.writeFile(absolutePath, buffer);
  return {
    fileName: filename,
    fileUrl: `/uploads/ai/${filename}`,
    publicId: `${provider}:${id}`,
    fileType,
    mimeType,
    size: buffer.length,
    folder: `${provider}-generated`,
    aiPrompt: prompt,
    provider,
    providerModel: model,
    metadata: { userId, storage: 'local' }
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

let crcTable;

function crc32(buffer) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      return value >>> 0;
    });
  }

  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodePng({ width, height, pixels }) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (stride + 1);
    raw[rawOffset] = 0;
    pixels.copy(raw, rawOffset + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    header,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function parseColor(value, fallback) {
  const raw = String(value || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(raw)) {
    return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16), 255];
  }
  return fallback;
}

function blend(color, amount) {
  return color.map((channel, index) => index === 3 ? channel : Math.max(0, Math.min(255, Math.round(channel + (255 - channel) * amount))));
}

function drawRect(pixels, width, height, x, y, rectWidth, rectHeight, color) {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(width, Math.ceil(x + rectWidth));
  const endY = Math.min(height, Math.ceil(y + rectHeight));
  for (let row = startY; row < endY; row += 1) {
    for (let col = startX; col < endX; col += 1) {
      const offset = (row * width + col) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = color[3];
    }
  }
}

const font = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '#': ['01010', '11111', '01010', '01010', '11111', '01010', '01010'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100']
};

function drawChar(pixels, width, height, x, y, char, scale, color) {
  const glyph = font[char] || font['?'];
  glyph.forEach((row, rowIndex) => {
    [...row].forEach((pixel, colIndex) => {
      if (pixel === '1') drawRect(pixels, width, height, x + colIndex * scale, y + rowIndex * scale, scale, scale, color);
    });
  });
}

function drawText(pixels, width, height, x, y, text, scale, color) {
  let cursor = x;
  String(text || '').toUpperCase().split('').forEach((char) => {
    if (char === ' ') {
      cursor += 4 * scale;
      return;
    }
    drawChar(pixels, width, height, cursor, y, char, scale, color);
    cursor += 6 * scale;
  });
}

function wrapText(text, maxChars, maxLines = 5) {
  const words = String(text || '')
    .replace(/[^\w\s#&+./:!?-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}


function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textLineElements(lines, { x, y, lineHeight, fontSize, color, weight = 600, anchor = 'start' }) {
  return lines.map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" font-family="Inter, Lato, Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${escapeXml(line)}</text>`).join('');
}

function imageFallbackCopy(input) {
  const brand = input.brand || {};
  const promptText = String(input.prompt || '').replace(/\s+/g, ' ').trim();
  const requestedType = String(input.postType || 'image').toLowerCase();
  const slideIndex = Number(input.slideIndex || 0);
  const slideCount = Math.max(1, Number(input.slideCount || 1));
  const offer = brand.offers?.[0] || {};
  const product = brand.products?.[0] || {};
  const testimonial = brand.testimonials?.[0] || {};
  const benefits = [
    offer.title,
    product.name,
    brand.goals?.[0],
    brand.customerPainPoints?.[0],
    brand.description,
    promptText
  ].filter(Boolean);
  const hook = offer.title || product.name || brand.businessType || 'Special Offer';
  const body = offer.description || brand.description || promptText || `Discover ${brand.name || 'our brand'} today.`;
  const cta = brand.preferredCta || 'Contact us today';

  if (requestedType === 'carousel') {
    const steps = [
      { badge: `SLIDE ${slideIndex + 1}/${slideCount}`, headline: hook, body, cta: 'Swipe to learn more' },
      { badge: `SLIDE ${slideIndex + 1}/${slideCount}`, headline: 'Why it matters', body: brand.customerPainPoints?.[0] || body, cta: 'See the solution' },
      { badge: `SLIDE ${slideIndex + 1}/${slideCount}`, headline: 'What you get', body: benefits[1] || benefits[0] || body, cta: 'Great value' },
      { badge: `SLIDE ${slideIndex + 1}/${slideCount}`, headline: 'Proof / trust', body: testimonial.quote ? `${testimonial.author || 'Customer'}: ${testimonial.quote}` : body, cta: 'Trusted by customers' },
      { badge: `SLIDE ${slideIndex + 1}/${slideCount}`, headline: 'Ready to start?', body, cta }
    ];
    return steps[Math.min(slideIndex, steps.length - 1)];
  }

  return {
    badge: requestedType === 'video' ? 'VIDEO COVER' : slideCount > 1 ? `IMAGE ${slideIndex + 1}/${slideCount}` : 'BRAND VISUAL',
    headline: hook,
    body,
    cta
  };
}

async function svgToPngBuffer(svg) {
  if (Resvg) {
    const renderer = new Resvg(svg, { fitTo: { mode: 'original' } });
    return renderer.render().asPng();
  }

  const tempDir = path.join(GENERATED_UPLOAD_DIR, '_tmp');
  await fs.mkdir(tempDir, { recursive: true });
  const id = crypto.randomBytes(8).toString('hex');
  const svgPath = path.join(tempDir, `${id}.svg`);
  const pngPath = path.join(tempDir, `${id}.png`);
  await fs.writeFile(svgPath, svg, 'utf8');
  const commands = [env.imageMagickBinary, 'magick', 'convert'].filter(Boolean);
  let lastError = null;
  for (const command of commands) {
    try {
      await runCommand(command, [svgPath, 'PNG32:' + pngPath]);
      const buffer = await fs.readFile(pngPath);
      await Promise.allSettled([fs.unlink(svgPath), fs.unlink(pngPath)]);
      return buffer;
    } catch (error) {
      lastError = error;
    }
  }
  await Promise.allSettled([fs.unlink(svgPath), fs.unlink(pngPath)]);
  throw lastError || new Error('No SVG to PNG renderer is available. Install @resvg/resvg-js or ImageMagick.');
}

function imageDimensions(input) {
  const size = String(input.size || env.openaiImageSize || '1024x1024');
  const match = size.match(/^(\d+)x(\d+)$/);
  if (match) return { width: Number(match[1]), height: Number(match[2]) };
  if (String(input.aspectRatio || '').includes('9:16')) return { width: 1024, height: 1536 };
  if (String(input.aspectRatio || '').includes('16:9')) return { width: 1536, height: 1024 };
  return { width: 1024, height: 1024 };
}

async function generateLocalImage(input, warning = '') {
  const { width, height } = imageDimensions(input);
  const primary = parseColor(input.brand?.brandColors?.[0], [15, 76, 129, 255]);
  const accent = parseColor(input.brand?.brandColors?.[1], [25, 167, 142, 255]);
  const requestedType = String(input.postType || 'image').toLowerCase();
  const copy = imageFallbackCopy(input);
  const brandName = input.brand?.name || 'AutoBrand';
  const headlineLines = wrapText(copy.headline, width > 1200 ? 26 : 20, 2);
  const bodyLines = wrapText(copy.body, width > 1200 ? 38 : 28, requestedType === 'carousel' ? 4 : 3);
  const badgeColor = `rgb(${accent[0]},${accent[1]},${accent[2]})`;
  const primaryColor = `rgb(${primary[0]},${primary[1]},${primary[2]})`;
  const bgLight = `rgb(${blend(primary, 0.92).slice(0,3).join(',')})`;
  const cardShadow = 'rgba(18,31,53,0.14)';
  const progressDots = Array.from({ length: Math.max(1, Number(input.slideCount || 1)) }).map((_, index) => {
    const active = index === Number(input.slideIndex || 0);
    const cx = 110 + index * 26;
    return `<circle cx="${cx}" cy="${height - 86}" r="7" fill="${active ? primaryColor : '#d8dee7'}" />`;
  }).join('');
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bgLight}" />
        <stop offset="100%" stop-color="#ffffff" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <rect x="0" y="0" width="100%" height="138" fill="${primaryColor}"/>
    <rect x="0" y="138" width="100%" height="18" fill="${badgeColor}"/>
    <text x="74" y="86" font-family="Inter, Lato, Arial, sans-serif" font-size="54" font-weight="700" fill="#ffffff">${escapeXml(brandName.slice(0, 30))}</text>
    <g transform="translate(70,220)">
      <rect x="8" y="10" rx="34" ry="34" width="${width - 140}" height="${height - 330}" fill="${cardShadow}" opacity="0.16"/>
      <rect x="0" y="0" rx="34" ry="34" width="${width - 140}" height="${height - 330}" fill="#ffffff"/>
      <rect x="0" y="0" rx="34" ry="34" width="16" height="${height - 330}" fill="${badgeColor}"/>
      <rect x="40" y="38" rx="18" ry="18" width="220" height="46" fill="${badgeColor}"/>
      <text x="150" y="70" font-family="Inter, Lato, Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(copy.badge)}</text>
      ${textLineElements(headlineLines, { x: 48, y: 154, lineHeight: 66, fontSize: 56, color: '#102032', weight: 700 })}
      ${textLineElements(bodyLines, { x: 48, y: 314, lineHeight: 46, fontSize: 34, color: '#4b5b6d', weight: 500 })}
      <rect x="48" y="${height - 430}" rx="20" ry="20" width="${Math.min(width - 236, 540)}" height="76" fill="${primaryColor}"/>
      <text x="${48 + Math.min(width - 236, 540) / 2}" y="${height - 381}" font-family="Inter, Lato, Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(copy.cta.slice(0, 32))}</text>
      ${requestedType === 'carousel' ? `<g>${progressDots}</g>` : ''}
    </g>
    ${warning ? `<text x="74" y="${height - 28}" font-family="Inter, Lato, Arial, sans-serif" font-size="18" font-weight="500" fill="#6b7c90">Fallback brand visual generated locally</text>` : ''}
  </svg>`;

  const buffer = await svgToPngBuffer(svg);
  return saveGeneratedBuffer({
    buffer,
    brand: input.brand,
    prompt: input.prompt,
    userId: input.userId,
    provider: 'local_fallback',
    model: warning || 'brand-brain-fallback',
    mimeType: 'image/png',
    extension: 'png'
  });
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
  const provider = String(preferredProvider || activeProvider('image') || 'local').toLowerCase();
  const input = { prompt, brand, userId, sourceMedia, aspectRatio, size, model, postType, slideIndex, slideCount };
  try {
    let asset;
    if (provider === 'replicate') asset = await generateImageWithReplicate(input);
    else if (provider === 'gemini') asset = await generateImageWithGemini(input);
    else if (provider === 'openai') asset = await generateImageWithOpenAI(input);
    else if (provider === 'local') asset = await generateLocalImage(input, 'No hosted image provider configured.');
    else {
      return {
        ok: false,
        provider,
        message: `Unsupported image provider: ${provider}`,
        aiPrompt: prompt
      };
    }
    return { ok: true, ...asset };
  } catch (error) {
    const message = error.message || 'Hosted image generation failed.';
    if (env.allowLocalImageFallback && provider !== 'local') {
      const asset = await generateLocalImage(input, message);
      return { ok: true, ...asset, warning: message };
    }
    return {
      ok: false,
      provider,
      message,
      aiPrompt: prompt
    };
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
  const provider = String(preferredProvider || activeProvider('video') || 'planning').toLowerCase();
  try {
    if (provider === 'openai') return { ok: true, ...(await generateVideoWithOpenAI({ prompt, brand, sourceMedia, aspectRatio, durationSeconds, model, userId })) };
    if (provider === 'replicate') return { ok: true, ...(await generateVideoWithReplicate({ prompt, brand, sourceMedia, aspectRatio, durationSeconds, model })) };
    if (provider === 'local') {
      return { ok: true, ...(await generateLocalVideo({ brand, sourceMedia, durationSeconds, aspectRatio, prompt })) };
    }
    if (env.allowLocalVideoFallback && sourceMedia?.fileUrl) {
      const local = await generateLocalVideo({ prompt, brand, sourceMedia, aspectRatio, durationSeconds, userId });
      return { ok: true, ...local, warning: `Provider ${provider} is unavailable; a local MP4 fallback was generated.` };
    }
    return { ok: false, provider, message: `Unsupported or planning-only video provider: ${provider}. Configure AI_VIDEO_PROVIDER=openai or replicate to render MP4 videos.` };
  } catch (error) {
    if (env.allowLocalVideoFallback && provider !== 'local' && sourceMedia?.fileUrl) {
      try {
        const local = await generateLocalVideo({ prompt, brand, sourceMedia, aspectRatio, durationSeconds, userId });
        return { ok: true, ...local, warning: error.message || `${provider} video generation failed.` };
      } catch (fallbackError) {
        return {
          ok: false,
          provider,
          message: `${error.message || 'Video generation failed.'} Fallback renderer also failed: ${fallbackError.message}`
        };
      }
    }
    return { ok: false, provider, message: error.message || 'Video generation failed.' };
  }
}

async function checkProviders() {
  const checks = [];
  checks.push({ kind: 'text', provider: activeProvider('text'), configured: Boolean(env.geminiApiKey || env.openaiApiKey || activeProvider('text') === 'local') });
  checks.push({ kind: 'image', provider: activeProvider('image'), configured: Boolean(env.replicateApiToken || env.geminiApiKey || env.openaiApiKey || activeProvider('image') === 'local') });
  checks.push({ kind: 'video', provider: activeProvider('video'), configured: Boolean(env.replicateApiToken || env.openaiApiKey || activeProvider('video') === 'planning') });
  return checks;
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
