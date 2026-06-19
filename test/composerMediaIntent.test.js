const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveComposerMediaIntent, mediaIntentAllowsType } = require('../src/services/composer/mediaIntent.service');

test('video post format forces video output and disables generated image intent', () => {
  const body = resolveComposerMediaIntent({ type: 'video', mediaPreset: 'image-3', imageCount: 3, externalMediaType: 'image', generateImage: 'on' });
  assert.equal(body.type, 'video');
  assert.equal(body.mediaPreset, 'video');
  assert.equal(body.imageCount, 1);
  assert.equal(body.mediaFormat, 'short_video');
  assert.equal(body.externalMediaType, 'video');
  assert.deepEqual(body.__mediaIntent.allowedMediaTypes, ['video']);
  assert.equal(body.__mediaIntent.shouldGenerateImage, false);
  assert.equal(body.__mediaIntent.shouldGenerateVideo, true);
});

test('carousel post format keeps selected slide count and allows images only', () => {
  const body = resolveComposerMediaIntent({ type: 'carousel', mediaPreset: 'image-1', imageCount: 4, externalMediaType: 'video' });
  assert.equal(body.type, 'carousel');
  assert.equal(body.mediaPreset, 'carousel-4');
  assert.equal(body.imageCount, 4);
  assert.equal(body.mediaFormat, 'carousel_slides');
  assert.equal(body.externalMediaType, 'image');
  assert.deepEqual(body.__mediaIntent.allowedMediaTypes, ['image']);
});

test('image post format cannot submit video media intent', () => {
  const body = resolveComposerMediaIntent({ type: 'image', mediaPreset: 'video', imageCount: 2 });
  assert.equal(body.type, 'image');
  assert.equal(body.mediaPreset, 'image-2');
  assert.equal(mediaIntentAllowsType(body.__mediaIntent, 'image'), true);
  assert.equal(mediaIntentAllowsType(body.__mediaIntent, 'video'), false);
});

test('text post format removes media output', () => {
  const body = resolveComposerMediaIntent({ type: 'text', mediaPreset: 'carousel-5', imageCount: 5 });
  assert.equal(body.type, 'text');
  assert.equal(body.mediaPreset, 'text');
  assert.equal(body.imageCount, 0);
  assert.deepEqual(body.__mediaIntent.allowedMediaTypes, []);
});

test('link and WhatsApp message formats are text-like composer outputs', () => {
  const link = resolveComposerMediaIntent({ type: 'link', mediaPreset: 'image-1', imageCount: 1 });
  assert.equal(link.type, 'link');
  assert.equal(link.mediaPreset, 'text');
  assert.equal(link.mediaFormat, 'link_post');
  assert.deepEqual(link.__mediaIntent.allowedMediaTypes, []);

  const whatsapp = resolveComposerMediaIntent({ type: 'whatsapp', mediaPreset: 'video' });
  assert.equal(whatsapp.type, 'whatsapp_message');
  assert.equal(whatsapp.mediaPreset, 'text');
  assert.equal(whatsapp.mediaFormat, 'whatsapp_message');
});
