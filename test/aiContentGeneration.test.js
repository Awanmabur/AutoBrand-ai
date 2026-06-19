const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildFallbackBundle,
  creditsForGeneration,
  normalizeGenerationControls,
  postTypeForOutput
} = require('../src/services/aiContentGeneration.service');

const brand = {
  name: 'Bright Studio',
  industry: 'design',
  description: 'Brand design and social content for local companies.',
  targetAudience: 'busy founders',
  preferredCta: 'Book a strategy call',
  products: [{ name: 'Launch kit', price: '$499', description: 'Brand and social starter pack' }],
  offers: [{ title: 'June launch offer', description: 'Discounted launch package' }],
  preferredHashtags: ['#BrightStudio'],
  keywords: ['brand design', 'content'],
  blockedWords: ['guaranteed'],
  brandRules: ['Avoid guaranteed claims.']
};

test('normalizes generation controls for 30-day calendars', () => {
  const controls = normalizeGenerationControls({ outputType: '30_day_content_calendar', platforms: ['facebook', 'linkedin'], hashtagCount: 4 });
  assert.equal(controls.outputType, '30_day_content_calendar');
  assert.equal(controls.durationDays, 30);
  assert.deepEqual(controls.platforms, ['facebook', 'linkedin']);
  assert.equal(controls.hashtagCount, 4);
});

test('builds complete 30-day content calendar fallback', () => {
  const bundle = buildFallbackBundle(brand, { outputType: '30_day_content_calendar', platforms: ['facebook', 'instagram'], goal: 'sales' });
  assert.equal(bundle.campaignPlan.length, 30);
  assert.equal(bundle.platformOutputs.length, 2);
  assert.equal(bundle.outputType, '30_day_content_calendar');
  assert.equal(postTypeForOutput(bundle.outputType), 'campaign');
  assert.equal(creditsForGeneration(bundle.controls), 12);
});

test('builds platform-specific and carousel outputs', () => {
  const linkedin = buildFallbackBundle(brand, { outputType: 'linkedin_post', goal: 'lead generation' });
  assert.equal(linkedin.controls.platform, 'linkedin');
  assert.equal(linkedin.platformOutputs[0].platform, 'linkedin');
  assert.match(linkedin.caption, /Bright Studio/);

  const carousel = buildFallbackBundle(brand, { outputType: 'carousel_copy' });
  assert.equal(carousel.carouselSlides.length, 5);
  assert.equal(postTypeForOutput(carousel.outputType), 'carousel');
});

test('flags blocked words in generated content', () => {
  const bundle = buildFallbackBundle(brand, { outputType: 'single_post', goal: 'guaranteed sales' });
  assert.ok(bundle.warnings.blockedWordWarnings.some((warning) => warning.includes('guaranteed')));
  assert.ok(bundle.warnings.brandRuleWarnings.length);
});
