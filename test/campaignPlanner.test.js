const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCampaignPlan, normalizeGoal, splitPlatforms } = require('../src/services/campaignPlannerService');

const brand = {
  name: 'Kampala Coffee',
  businessType: 'Cafe',
  location: 'Kampala',
  targetAudience: 'busy professionals',
  description: 'Fresh coffee and quick lunches.',
  preferredCta: 'Order ahead today.',
  preferredHashtags: ['#CoffeeUG'],
  offers: [{ title: 'lunch combo' }],
  products: [{ name: 'cold brew' }],
  testimonials: [{ quote: 'Fast, friendly, and tasty.' }],
  keywords: ['coffee', 'lunch']
};

test('campaign planner builds required campaign outputs', () => {
  const plan = buildCampaignPlan({
    brand,
    campaignType: 'offer sale',
    platforms: ['facebook', 'instagram', 'linkedin', 'tiktok'],
    durationDays: 7
  });

  assert.equal(plan.campaignType, 'offer_sale');
  assert.equal(plan.postIdeas.length, 7);
  assert.equal(plan.weeklyPlan.length, 7);
  assert.equal(plan.monthlyPlan.length, 30);
  assert.ok(plan.strategy.primaryCta);
  assert.ok(plan.captions.length);
  assert.ok(plan.hashtags.includes('#CoffeeUG'));
  assert.ok(plan.creativeIdeas.length);
  assert.ok(plan.videoScripts.some((script) => script.platform === 'tiktok'));
  assert.ok(plan.whatsappMessages.length);
});

test('campaign planner normalizes goals, platforms and platform post types', () => {
  assert.equal(normalizeGoal('Product Launch'), 'product_launch');
  assert.deepEqual(splitPlatforms('Facebook, instagram, facebook'), ['facebook', 'instagram']);

  const plan = buildCampaignPlan({ brand, campaignType: 'leads', platforms: 'instagram, youtube', durationDays: 2 });
  assert.equal(plan.postIdeas[0].type, 'carousel');
  assert.equal(plan.postIdeas[1].type, 'reel');
});
