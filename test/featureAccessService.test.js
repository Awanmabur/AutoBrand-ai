const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_PLAN_MATRIX } = require('../src/services/subscription/defaultPlans');
const {
  buildFeatureAccess,
  resolveDashboardPageForAccess
} = require('../src/services/subscription/featureAccess.service');

function plan(slug) {
  const found = DEFAULT_PLAN_MATRIX.find((item) => item.slug === slug);
  assert.ok(found, `missing test plan ${slug}`);
  return found;
}

test('single dashboard gates pages by free trial plan while keeping upgradeable pages visible', () => {
  const access = buildFeatureAccess({ user: { role: 'brand_owner', plan: 'free-trial' }, plan: plan('free-trial') });

  assert.equal(access.role, 'brand_owner');
  assert.ok(access.visiblePages.includes('campaigns'));
  assert.ok(access.lockedPages.includes('campaigns'));
  assert.ok(access.pageLocks.campaigns.upgradeUrl.includes('/pricing'));
  assert.ok(!access.visiblePages.includes('growth-studio'));
  assert.ok(access.unlockedPages.includes('social'));
  assert.ok(access.lockedPages.includes('team'));
  assert.ok(!access.visiblePages.includes('admin'));
});

test('growth plan unlocks campaigns, approvals, and growth studio for brand owner role', () => {
  const access = buildFeatureAccess({ user: { role: 'brand_owner', plan: 'growth' }, plan: plan('growth') });

  assert.ok(access.unlockedPages.includes('campaigns'));
  assert.ok(access.unlockedPages.includes('campaigns'));
  assert.ok(!access.unlockedPages.includes('growth-studio'));
  assert.ok(access.unlockedPages.includes('approvals'));
  assert.ok(!access.visiblePages.includes('admin'));
});

test('super admin bypasses plan locks and can access admin pages', () => {
  const access = buildFeatureAccess({ user: { role: 'super_admin', plan: 'free-trial' }, plan: plan('free-trial') });

  assert.ok(access.isSuperadmin);
  assert.ok(access.visiblePages.includes('admin'));
  assert.ok(access.unlockedPages.includes('video-system'));
  assert.ok(access.unlockedPages.includes('avatar-video'));
  assert.equal(access.lockedPages.length, 0);
});

test('dashboard resolver redirects role-denied pages to overview but leaves plan-locked pages in shell', () => {
  const access = buildFeatureAccess({ user: { role: 'brand_owner', plan: 'free-trial' }, plan: plan('free-trial') });

  assert.equal(resolveDashboardPageForAccess({ page: 'admin', featureAccess: access }), 'overview');
  assert.equal(resolveDashboardPageForAccess({ page: 'growth-studio', featureAccess: access }), 'campaigns');
});
