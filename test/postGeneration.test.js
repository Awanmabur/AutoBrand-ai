const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildPostGenerationPlan } = require('../src/services/postGeneration.service');

function media(id, fileType) {
  return { _id: id, fileType };
}

test('manual post with complete caption and existing image skips AI generation', () => {
  const plan = buildPostGenerationPlan(
    { type: 'image', creationMode: 'manual', caption: 'Ready to publish' },
    [media('image-1', 'image')],
    {}
  );

  assert.equal(plan.needsText, false);
  assert.equal(plan.imagesToGenerate, 0);
  assert.equal(plan.needsGeneration, false);
  assert.deepEqual(plan.existingImageIds, ['image-1']);
});

test('video generation keeps an image reference and only queues the missing MP4', () => {
  const plan = buildPostGenerationPlan(
    { type: 'video', mediaFormat: 'short_video', creationMode: 'manual', caption: 'Video caption' },
    [media('reference-image', 'image')],
    {}
  );

  assert.equal(plan.needsText, false);
  assert.equal(plan.needsVideo, true);
  assert.equal(plan.sourceImageId, 'reference-image');
  assert.equal(plan.needsGeneration, true);
});

test('existing video avoids duplicate rendering', () => {
  const plan = buildPostGenerationPlan(
    { type: 'video', creationMode: 'manual', caption: 'Existing video post' },
    [media('video-1', 'video')],
    {}
  );

  assert.equal(plan.needsVideo, false);
  assert.equal(plan.needsGeneration, false);
  assert.deepEqual(plan.existingVideoIds, ['video-1']);
});

test('carousel generation fills only missing slides', () => {
  const plan = buildPostGenerationPlan(
    { type: 'carousel', creationMode: 'ai', imageCount: 4, caption: '' },
    [media('slide-1', 'image')],
    {}
  );

  assert.equal(plan.targetImageCount, 4);
  assert.equal(plan.imagesToGenerate, 3);
  assert.equal(plan.needsText, true);
});

test('content library live refresh upserts new cards without discarding loaded cards', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/dashboard-experience.js'), 'utf8');
  assert.match(source, /mergeContentLibraryCards\(incomingCards, page\.cards \|\| \[\]\)/);
  assert.match(source, /query\.set\('cursor', contentLibraryState\.nextCursor\)/);
  assert.doesNotMatch(source, /page\.cards\s*=\s*append\s*\?[^;]+:\s*\(payload\.cards\s*\|\|\s*\[\]\)/s);
});
