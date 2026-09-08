const test = require('node:test');
const assert = require('node:assert/strict');
let sharp = null;
try { sharp = require('sharp'); } catch (error) { sharp = null; }
const env = require('../src/config/env');
const { generateImage, generateVideo, __private } = require('../src/services/aiProviderService');

test('generateImage rejects the removed local AI provider instead of creating deterministic fallback art', async () => {
  const result = await generateImage({
    preferredProvider: 'local',
    brand: { name: 'No Fake Provider Brand' },
    prompt: 'Create a social image',
    userId: 'user_1'
  });

  assert.equal(result.ok, false);
  assert.equal(result.provider, 'local');
  assert.match(result.message, /Unsupported hosted image provider: local/);
  assert.equal(result.fileUrl, undefined);
});

test('generateImage does not silently replace hosted provider failures with deterministic art', async () => {
  const originalApiKey = env.openaiApiKey;
  env.openaiApiKey = '';

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
  }
});

test('generateVideo rejects the removed local AI provider', async () => {
  const result = await generateVideo({
    preferredProvider: 'local',
    brand: { name: 'Video Brand' },
    sourceMedia: { fileUrl: '/uploads/example.png', fileType: 'image' },
    prompt: 'Create a short product video',
    userId: 'user_1',
    aspectRatio: '9:16',
    durationSeconds: 4
  });

  assert.equal(result.ok, false);
  assert.equal(result.provider, 'local');
  assert.match(result.message, /Unsupported hosted video provider: local/);
  assert.equal(result.outputUrl, undefined);
});

test('generateVideo returns a provider error instead of falling back to an image or local render', async () => {
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

test('openaiVideoSize defaults to sora-2-supported portrait and landscape sizes', () => {
  const originalSize = env.openaiVideoSize;
  env.openaiVideoSize = '';

  try {
    assert.equal(__private.openaiVideoSize('9:16'), '720x1280');
    assert.equal(__private.openaiVideoSize('portrait'), '720x1280');
    assert.equal(__private.openaiVideoSize('16:9'), '1280x720');
    assert.equal(__private.openaiVideoSize('landscape'), '1280x720');
  } finally {
    env.openaiVideoSize = originalSize;
  }
});
