const test = require('node:test');
const assert = require('node:assert/strict');
const {
  aspectRatioForWorkflow,
  buildImageWorkflowPrompt,
  imageCountForWorkflow,
  imageCreditsForResults,
  imageSizeForWorkflow,
  normalizeImageWorkflow,
  postTypeForImageWorkflow,
  providerPostTypeForWorkflow
} = require('../src/services/aiImageWorkflow.service');

const brand = {
  name: 'Demo Brand',
  businessType: 'salon',
  description: 'Premium beauty services',
  location: 'Kampala',
  targetAudience: 'busy professionals',
  tone: 'warm and polished',
  brandColors: ['#123456', '#24a391'],
  preferredCta: 'Book today',
  products: [{ name: 'Hair spa', price: '$30', description: 'Hydrating treatment' }],
  offers: [{ title: 'Weekend package', description: 'Two services for one visit' }],
  keywords: ['beauty', 'self care'],
  blockedWords: ['cheap'],
  brandRules: ['Keep claims realistic']
};

test('AI image workflow prompt uses Brand Brain context and workflow instructions', () => {
  const prompt = buildImageWorkflowPrompt({
    brand,
    body: { imageWorkflow: 'product_promo', platform: 'instagram', prompt: 'Luxury counter scene' },
    workflow: 'product_promo'
  });

  assert.match(prompt, /product or service promo/i);
  assert.match(prompt, /Demo Brand/);
  assert.match(prompt, /Hair spa/);
  assert.match(prompt, /Weekend package/);
  assert.match(prompt, /Blocked words to avoid: cheap/);
  assert.match(prompt, /Luxury counter scene/);
});

test('carousel image workflow defaults to multiple square carousel assets', () => {
  const body = { imageWorkflow: 'carousel_image' };

  assert.equal(normalizeImageWorkflow('carousel-image'), 'carousel_image');
  assert.equal(imageCountForWorkflow(body), 3);
  assert.equal(imageSizeForWorkflow(body), '1024x1024');
  assert.equal(providerPostTypeForWorkflow('carousel_image'), 'carousel');
  assert.equal(postTypeForImageWorkflow('carousel_image'), 'carousel');
});

test('story and reel covers use vertical draft and provider settings', () => {
  const body = { imageWorkflow: 'story_cover' };

  assert.equal(imageCountForWorkflow({ ...body, imageCount: 4 }), 4);
  assert.equal(aspectRatioForWorkflow(body), '9:16');
  assert.equal(imageSizeForWorkflow(body), '1024x1536');
  assert.equal(providerPostTypeForWorkflow('story_cover'), 'video');
  assert.equal(postTypeForImageWorkflow('reel_cover'), 'reel');
});

test('image credits charge local fallback lower than hosted results', () => {
  assert.equal(imageCreditsForResults([{ provider: 'local_fallback' }, { provider: 'openai' }]), 4);
});
