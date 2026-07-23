const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('compose surfaces use a separate live destination catalogue', () => {
  const controller = read('src/modules/dashboard/dashboard.controller.js');
  const view = read('src/views/dashboard/experience.ejs');

  assert.match(controller, /allSocialAccounts = socialAccounts\.filter\(isRealSocialAccount\)/);
  assert.match(controller, /buildComposerDestinationCatalog\(allSocialAccounts, \{ verifyEncryption: true \}\)/);
  assert.match(controller, /publishingAccounts: publishingAccounts\.map\(serializeSocialAccount\)/);
  assert.match(controller, /composerPlatforms: destinationCatalog\.platforms/);
  assert.doesNotMatch(view, /const socialAccounts = options\.socialAccounts/);
  assert.match(view, /const socialAccounts = options\.publishingAccounts/);
  assert.match(view, /platformOptions\.forEach/);
  assert.match(view, /class="composer-check-card target-account-option"/);
});

test('post creation, AI campaigns, campaigns and growth resolve exact live targets', () => {
  const composer = read('src/modules/composer/post.controller.js');
  const ai = read('src/controllers/aiController.js');
  const campaigns = read('src/controllers/campaignController.js');
  const growth = read('src/controllers/growthStudioController.js');
  const campaignModel = read('src/models/Campaign.js');

  assert.match(composer, /resolvePublishingTargets/);
  assert.match(composer, /const selectedPlatforms = targets\.platforms/);
  assert.match(composer, /const targetAccounts = targets\.accountIds/);
  assert.match(ai, /targetAccounts: targets\.accountIds/);
  assert.match(campaigns, /requestedAccountIds: req\.body\.targetAccounts/);
  assert.match(growth, /resolvePublishingTargets/);
  assert.match(campaignModel, /targetAccounts:\s*\[/);
});

test('removed or disconnected destinations are reconciled across posts and campaigns', () => {
  const cleanup = read('src/services/social/socialDestinationCleanup.service.js');
  const socialController = read('src/modules/social-accounts/social.controller.js');
  const socialRoutes = read('src/routes/social.js');

  assert.match(cleanup, /Post\.find\(\{ createdBy: ownerId, brand: brandId, targetAccounts: accountId \}\)/);
  assert.match(cleanup, /Campaign\.find\(\{ createdBy: ownerId, brand: brandId, targetAccounts: accountId \}\)/);
  assert.match(cleanup, /post\.status = 'failed'/);
  assert.match(cleanup, /campaign\.status = 'paused'/);
  assert.match(socialController, /cleanupDisconnectedDestination/);
  assert.match(socialRoutes, /\/:id\/remove/);
});

test('browser filters by brand and platform and selects an exact live account', () => {
  const browser = read('public/js/dashboard-experience.js');

  assert.match(browser, /function initSmartDestinationForm/);
  assert.match(browser, /brandAllowed\(label\.dataset\.brands, brandId\)/);
  assert.match(browser, /visibleByPlatform/);
  assert.match(browser, /candidates\[0\]\.checked = true/);
  assert.match(browser, /selectedAccountCount === 0/);
  assert.match(browser, /initSmartDestinationForms/);
});

test('calendar suggestions and post edit choices only use live platforms', () => {
  const controller = read('src/modules/dashboard/dashboard.controller.js');

  assert.match(controller, /preferredPlatforms\.length \? preferredPlatforms : livePlatforms/);
  assert.doesNotMatch(controller, /: \['facebook', 'instagram', 'linkedin'\]/);
  assert.match(controller, /availablePlatforms\.length \? \[\{ name: 'platform'/);
  assert.match(controller, /postCard\(post, \{ availablePlatforms \}\)/);
});

test('dashboard EJS templates remain balanced', () => {
  for (const file of [
    'src/views/dashboard/experience.ejs',
    'src/views/dashboard/partials/full-composer.ejs',
    'src/views/dashboard/partials/post-schedule-form.ejs'
  ]) {
    const source = read(file);
    assert.equal((source.match(/<%/g) || []).length, (source.match(/%>/g) || []).length, `${file} has unbalanced EJS tags`);
  }
});
