const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_PLAN_MATRIX } = require('../src/services/subscription/defaultPlans');
const { LIMIT_DEFINITIONS } = require('../src/services/usage.service');
const usageLimits = require('../src/services/usageLimitService');

test('billing usage definitions cover every default plan limit', () => {
  const limitKeys = new Set(DEFAULT_PLAN_MATRIX.flatMap((plan) => Object.keys(plan.limits || {})));

  for (const key of limitKeys) {
    assert.ok(LIMIT_DEFINITIONS[key], `${key} needs a billing usage card definition`);
    assert.ok(LIMIT_DEFINITIONS[key].metric, `${key} needs a metric key`);
    assert.ok(LIMIT_DEFINITIONS[key].label, `${key} needs a display label`);
  }

  assert.equal(LIMIT_DEFINITIONS.maxStorageMb.metric, 'storage_mb');
  assert.equal(LIMIT_DEFINITIONS.maxClientApprovalLinks.metric, 'client_approval_links');
});

test('default plan matrix keeps advanced limits gated by paid tiers', () => {
  const bySlug = Object.fromEntries(DEFAULT_PLAN_MATRIX.map((plan) => [plan.slug, plan]));

  assert.equal(bySlug['free-trial'].limits.maxAvatarVideos, 0);
  assert.equal(bySlug['free-trial'].limits.maxClientApprovalLinks, 0);
  assert.equal(bySlug.growth.features.approvalWorkflowAccess, true);
  assert.ok(bySlug.growth.limits.maxClientApprovalLinks > 0);
  assert.ok(bySlug.pro.limits.maxAvatarVideos > 0);
});

test('usage limit service exposes product-specific quota guards', () => {
  for (const helper of [
    'assertCanCreateApprovalLink',
    'assertCanCreateAutoPosts',
    'assertCanCreateAvatarVideo',
    'assertCanCreateHandoffPosts',
    'assertCanUseStorage',
    'assertPlanFeature',
    'assertPlanPageAccess'
  ]) {
    assert.equal(typeof usageLimits[helper], 'function', `${helper} should be exported`);
  }
});


test('legacy mock social accounts never consume paid destination quota', () => {
  assert.deepEqual(usageLimits.ACTIVE_SOCIAL_STATUSES, ['connected', 'needs_reconnect', 'expired']);
  assert.equal(usageLimits.ACTIVE_SOCIAL_STATUSES.includes('mock'), false);
});

test('social destinations have a database uniqueness boundary per brand, platform and provider account', () => {
  const SocialAccount = require('../src/models/SocialAccount');
  const indexes = SocialAccount.schema.indexes();
  const unique = indexes.find(([keys, options]) => keys.brand === 1 && keys.platform === 1 && keys.accountId === 1 && options.unique === true);
  assert.ok(unique, 'brand + platform + accountId must be uniquely indexed');
  assert.equal(unique[1].name, 'uniq_brand_platform_account');
  assert.deepEqual(unique[1].partialFilterExpression, { accountId: { $type: 'string', $gt: '' } });
});
