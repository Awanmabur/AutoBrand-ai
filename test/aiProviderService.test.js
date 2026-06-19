const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
let sharp = null;
try { sharp = require('sharp'); } catch (error) { sharp = null; }
const env = require('../src/config/env');
const { generateImage, generateVideo, __private } = require('../src/services/aiProviderService');

test('generateImage creates a local branded PNG when local provider is explicitly used', async () => {
  const result = await generateImage({
    preferredProvider: 'local',
    brand: {
      name: 'Fallback Brand',
      businessType: 'shop',
      description: 'Friendly local offers',
      preferredCta: 'Book now',
      brandColors: ['#123456', '#24a391'],
      offers: [{ title: 'Weekend Deal', description: 'Save on the service customers need.' }]
    },
    prompt: 'Create a Facebook offer image',
    userId: 'user_1',
    size: '64x64'
  });

  const absolutePath = path.join(__dirname, '..', 'public', result.fileUrl.replace(/^\/+/, ''));
  const file = await fs.readFile(absolutePath);

  assert.equal(result.ok, true);
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.provider, 'local_fallback');
  assert.deepEqual([...file.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  await fs.unlink(absolutePath);
});

test('generateImage does not silently replace hosted provider failures with local fallback art', async () => {
  const originalApiKey = env.openaiApiKey;
  const originalFallback = env.allowLocalImageFallback;
  env.openaiApiKey = '';
  env.allowLocalImageFallback = false;

  try {
    const result = await generateImage({
      preferredProvider: 'openai',
      brand: { name: 'Real Image Brand' },
      prompt: 'Create a real social media image',
      userId: 'user_1'
    });

    assert.equal(result.ok, false);
    assert.equal(result.provider, 'openai');
    assert.match(result.message, /OPENAI_API_KEY is missing/);
    assert.equal(result.fileUrl, undefined);
  } finally {
    env.openaiApiKey = originalApiKey;
    env.allowLocalImageFallback = originalFallback;
  }
});

test('generateVideo returns a provider error instead of falling back to an image or plan', async () => {
  const originalApiKey = env.openaiApiKey;
  env.openaiApiKey = '';

  try {
    const result = await generateVideo({
      preferredProvider: 'openai',
      brand: { name: 'Video Brand' },
      prompt: 'Create a short product video',
      userId: 'user_1',
      aspectRatio: '9:16',
      durationSeconds: 4
    });

    assert.equal(result.ok, false);
    assert.equal(result.provider, 'openai');
    assert.match(result.message, /OPENAI_API_KEY is missing/);
    assert.equal(result.outputUrl, undefined);
  } finally {
    env.openaiApiKey = originalApiKey;
  }
});

test('prepareOpenAIVideoReferenceImage resizes uploaded images to the requested video dimensions', { skip: !sharp ? 'sharp is not available in this local node_modules install' : false }, async () => {
  const input = await sharp({
    create: {
      width: 300,
      height: 200,
      channels: 3,
      background: '#ffffff'
    }
  }).png().toBuffer();

  const output = await __private.prepareOpenAIVideoReferenceImage({
    buffer: input,
    size: '720x1280',
    brand: { brandColors: ['#123456'] }
  });
  const metadata = await sharp(output).metadata();

  assert.equal(metadata.width, 720);
  assert.equal(metadata.height, 1280);
  assert.equal(metadata.format, 'png');
});

test('openaiVideoSize defaults to high-resolution portrait and landscape outputs', () => {
  const originalSize = env.openaiVideoSize;
  env.openaiVideoSize = '';

  try {
    assert.equal(__private.openaiVideoSize('9:16'), '1024x1792');
    assert.equal(__private.openaiVideoSize('portrait'), '1024x1792');
    assert.equal(__private.openaiVideoSize('16:9'), '1792x1024');
    assert.equal(__private.openaiVideoSize('landscape'), '1792x1024');
  } finally {
    env.openaiVideoSize = originalSize;
  }
});
