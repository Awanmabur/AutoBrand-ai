const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('workspace-owned growth and avatar assets preserve actor attribution separately', () => {
  const GrowthAsset = require('../src/models/GrowthAsset');
  const AvatarProfile = require('../src/models/AvatarProfile');
  assert.equal(GrowthAsset.schema.path('owner').options.required, true);
  assert.equal(GrowthAsset.schema.path('createdBy').options.required, true);
  assert.equal(AvatarProfile.schema.path('owner').options.required, true);
  assert.equal(AvatarProfile.schema.path('createdBy').options.required, true);

  const growthController = source('src/controllers/growthStudioController.js');
  assert.match(growthController, /owner:\s*brand\.owner,\s*createdBy:\s*req\.user\._id/);
  const avatarController = source('src/controllers/avatarController.js');
  assert.match(avatarController, /owner:\s*brand\.owner,\s*createdBy:\s*req\.user\._id/);
});

test('production migration normalizes legacy business assets and subscription credits', () => {
  const migration = source('scripts/migrateProductionData.js');
  assert.match(migration, /normalizeWorkspaceOwnedAssets/);
  assert.match(migration, /if \(!row\.createdBy && row\.owner\) set\.createdBy = row\.owner/);
  assert.match(migration, /normalizeSubscriptionCredits/);
  assert.match(migration, /creditsUsed:\s*0/);
});

test('default development credential key lives outside the project tree', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'autobrand-home-'));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'autobrand-project-'));
  const envPath = path.join(root, 'src/config/env.js');
  const result = spawnSync(process.execPath, ['-e', `const e=require(${JSON.stringify(envPath)}); process.stdout.write(e.tokenEncryptionKeyFile);`], {
    cwd,
    env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, NODE_ENV: 'development' },
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  const keyFile = path.resolve(result.stdout.trim());
  assert.equal(keyFile.startsWith(path.resolve(cwd) + path.sep), false);
  assert.equal(keyFile.startsWith(path.resolve(home) + path.sep), true);
  assert.equal(fs.existsSync(path.join(cwd, '.autobrand-token-key')), false);
  assert.equal(fs.existsSync(keyFile), true);
});


test('production migration deduplicates social destinations before installing unique indexes', () => {
  const migration = source('scripts/migrateProductionData.js');
  const model = require('../src/models/SocialAccount');
  assert.match(migration, /async function deduplicateSocialAccounts\(\)/);
  assert.match(migration, /remapSocialAccountReferences/);
  assert.match(migration, /AnalyticsSyncJob/);
  assert.ok(migration.indexOf('socialAccountDuplicates: await deduplicateSocialAccounts()') < migration.indexOf('report.indexedModels = await ensureDatabaseIndexes()'));
  assert.ok(migration.indexOf('socialAccountDuplicates: await deduplicateSocialAccounts()') < migration.indexOf('socialAccounts: await normalizeSocialAccountTenancy()'));
  const unique = model.schema.indexes().find(([keys, options]) => keys.brand === 1 && keys.platform === 1 && keys.accountId === 1 && options.unique);
  assert.ok(unique);
});

test('shared social-account upserts key by brand destination, not acting employee', () => {
  const socialService = source('src/services/social/socialAccount.service.js');
  assert.match(socialService, /workspaceOwner = brand\?\.owner/);
  assert.match(socialService, /\{ brand: update\.brand, platform: update\.platform, accountId: update\.accountId \}/);
  assert.doesNotMatch(socialService, /\{ owner: update\.owner, platform, accountId \}/);
});
