const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateBrandScore } = require('../src/services/brandBrain/brandScore.service');
const { buildBrandContext, buildComposerDefaults } = require('../src/services/brandBrain/brandContext.service');
const { getMissingFieldSuggestions, suggestContentPillars, suggestOffers } = require('../src/services/brandBrain/brandSuggestion.service');
const { scoreContent } = require('../src/services/composer/contentScore.service');
const { checkBrandFit } = require('../src/services/composer/brandFitChecker.service');
const { checkRisk } = require('../src/services/composer/riskChecker.service');
const { DEFAULT_PLATFORM_RULES } = require('../src/services/composer/defaultPlatformRules');
const { decoratePlanForDisplay, limitText } = require('../src/services/planDisplay.service');
const { DEFAULT_PLAN_MATRIX } = require('../src/services/subscription/defaultPlans');

test('brand score reports missing fields and improves with richer data', () => {
  const emptyScore = calculateBrandScore({ name: 'Demo' });
  const richScore = calculateBrandScore({
    logo: 'logo.png',
    favicon: 'favicon.ico',
    coverImage: 'cover.png',
    brandColors: ['#000'],
    fonts: ['Inter'],
    website: 'https://example.com',
    industry: 'Retail',
    businessType: 'Ecommerce',
    location: 'Kampala',
    timezone: 'Africa/Kampala',
    language: 'English',
    targetCountries: ['Uganda'],
    slogan: 'Better content',
    tagline: 'Create faster',
    mission: 'Help teams publish',
    vision: 'Simple social operations',
    values: ['speed'],
    uniqueSellingPoint: 'AI workflow',
    brandStory: 'Built for creators',
    targetAudience: 'Small businesses',
    audienceAgeRange: '25-44',
    audienceInterests: ['marketing'],
    customerPainPoints: ['no time'],
    customerDesires: ['growth'],
    customerObjections: ['cost'],
    customerPersonas: [{ name: 'Founder' }],
    products: ['Planner'],
    services: ['Strategy'],
    offers: ['Trial'],
    pricingNotes: '$10/month',
    guarantees: ['support'],
    faqs: [{ question: 'How?', answer: 'Online' }],
    competitors: ['Other app'],
    competitorLinks: [{ name: 'Other', url: 'https://other.example' }],
    differentiationNotes: 'Plan-aware AI',
    toneOfVoice: 'Friendly',
    writingStyle: 'Clear',
    bannedWords: ['cheap'],
    preferredWords: ['simple'],
    emojiUsage: 'light',
    hashtagStyle: 'few',
    formalityLevel: 'medium',
    humorLevel: 'low',
    ctaStyle: 'direct',
    contentPillars: ['education'],
    contentDos: ['be useful'],
    contentDonts: ['overpromise'],
    complianceNotes: ['no guarantees'],
    defaultPostingTimes: ['09:00'],
    savedPrompts: [{ name: 'Caption', prompt: 'Write a caption' }],
    previousBestPosts: ['Launch post'],
    highPerformingTopics: ['automation'],
    brandKnowledgeBase: ['Uses social scheduling']
  });

  assert.equal(emptyScore.score < richScore.score, true);
  assert.equal(richScore.score, 100);
  assert.equal(emptyScore.missingFields.includes('website'), true);
});

test('brand context and defaults include voice, CTA and blocked words', () => {
  const brand = {
    name: 'AutoBrand',
    website: 'https://example.com',
    industry: 'Marketing',
    toneOfVoice: 'Helpful',
    ctaStyle: 'soft',
    language: 'English',
    timezone: 'Africa/Kampala',
    approvalRequiredByDefault: true,
    bannedWords: ['spam'],
    blockedWords: ['guaranteed'],
    contentPillars: ['education']
  };
  const context = buildBrandContext(brand);
  const defaults = buildComposerDefaults(brand);

  assert.match(context, /AutoBrand/);
  assert.match(context, /Marketing/);
  assert.deepEqual(defaults.blockedWords, ['spam', 'guaranteed']);
  assert.equal(defaults.approvalRequired, true);
  assert.equal(defaults.ctaStyle, 'soft');
});

test('brand suggestions return missing-field, pillar and offer ideas', () => {
  const missing = getMissingFieldSuggestions({ website: '', industry: '' });
  const pillars = suggestContentPillars({ industry: 'fitness' });
  const offers = suggestOffers({ products: [{ name: 'Scheduler' }] });

  assert.equal(missing.some((item) => item.includes('website')), true);
  assert.equal(pillars.includes('Training tips'), true);
  assert.equal(offers.some((item) => item.includes('Scheduler')), true);
});

test('content score, brand fit and risk checker produce actionable output', () => {
  const brand = { bannedWords: ['spam'], preferredWords: ['simple'], contentPillars: ['education'] };
  const content = { caption: 'A simple education post with spam claim. Learn more today.', hashtags: ['AI'] };

  const score = scoreContent(content);
  const fit = checkBrandFit(content, brand);
  const risk = checkRisk({ caption: 'This is a guaranteed result.' }, brand);

  assert.equal(score.score > 0, true);
  assert.equal(fit.violations.includes('spam'), true);
  assert.equal(Boolean(fit.offBrandWarning), true);
  assert.equal(risk.risks.includes('guaranteed outcome'), true);
});

test('default platform rules include new social platforms and capability flags', () => {
  assert.equal(DEFAULT_PLATFORM_RULES.x.characterLimit, 280);
  assert.equal(DEFAULT_PLATFORM_RULES.threads.supportsDirectPublishing, true);
  assert.equal(DEFAULT_PLATFORM_RULES.google_business.supportsLinks, true);
  assert.equal(DEFAULT_PLATFORM_RULES.pinterest.supportsAltText, true);
});

test('plan display decorates default database plan matrix objects', () => {
  const starter = DEFAULT_PLAN_MATRIX.find((plan) => plan.slug === 'starter');
  const growth = DEFAULT_PLAN_MATRIX.find((plan) => plan.slug === 'growth');
  const superadmin = DEFAULT_PLAN_MATRIX.find((plan) => plan.slug === 'superadmin');
  const decorated = decoratePlanForDisplay(starter);

  assert.equal(starter.price, 10);
  assert.equal(growth.isPopular, true);
  assert.equal(superadmin.limits.maxBrands, -1);
  assert.equal(decorated.priceLabel, '$10');
  assert.equal(decorated.signupUrl, '/signup?plan=starter');
  assert.equal(limitText(-1), 'Unlimited');
});
