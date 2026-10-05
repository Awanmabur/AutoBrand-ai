const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('GridFS public URLs are signed and token verification is deterministic', () => {
  const media = require('../src/services/gridFsMediaStorage.service');
  const id = '507f1f77bcf86cd799439011';
  const url = media.gridFsPublicUrl(id, 'launch image.png');
  assert.match(url, /^\/uploads\/db\/507f1f77bcf86cd799439011\/t\/[A-Za-z0-9_-]{32,128}\//);
  const token = url.split('/')[5];
  assert.equal(media.verifyGridFsToken(id, token), true);
  assert.equal(media.verifyGridFsToken(id, `${token}bad`), false);
});

test('production migration signs legacy GridFS references before legacy URLs are disabled', () => {
  const migration = read('scripts/migrateProductionData.js');
  assert.ok(migration.includes('signLegacyGridFsMediaUrls'));
  for (const model of ['Media', 'BrandAsset', 'AiVideoJob', 'VideoRender']) assert.ok(migration.includes(model), model);
  assert.ok(migration.includes('gridFsPublicUrl'));
});

test('external media is ingested rather than persisted as arbitrary third-party URL', () => {
  const controller = read('src/controllers/mediaController.js');
  assert.ok(controller.includes('downloadRemoteBuffer'));
  assert.ok(controller.includes('persistGeneratedBuffer'));
  assert.ok(controller.includes('isTrustedCloudinaryAsset'));
});

test('privileged MFA is wired before sessions and protected by a server-side challenge', () => {
  const controller = read('src/controllers/authController.js');
  const routes = read('src/routes/auth.js');
  const model = read('src/models/PrivilegedLoginChallenge.js');
  assert.ok(routes.includes("router.post('/mfa'"));
  assert.ok(controller.includes('requiresPrivilegedMfa(user)'));
  assert.ok(controller.includes('beginPrivilegedMfa'));
  assert.ok(model.includes('expireAfterSeconds: 0'));
  assert.ok(model.includes('maxAttempts'));
});

test('privileged MFA identifies platform administrators when enabled', () => {
  const script = `process.env.NODE_ENV='production';process.env.PRIVILEGED_MFA_ENABLED='true';process.env.PRIVILEGED_MFA_CHALLENGE_SECRET='${'m'.repeat(64)}';const s=require('./src/services/privilegedMfa.service');process.stdout.write(JSON.stringify([s.requiresPrivilegedMfa({role:'super_admin'}),s.requiresPrivilegedMfa({role:'brand_owner'})]));`;
  const result = spawnSync(process.execPath, ['-e', script], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [true, false]);
});

test('Brain worker is represented in deploy process declarations', () => {
  assert.ok(read('Procfile').includes('brainworker: node workers/aiBrainWorker.js'));
  assert.ok(read('package.json').includes('"worker:brain"'));
});

test('SEO includes WebSite schema and separates search crawlers from training controls', () => {
  const publicSite = read('src/services/publicSite.service.js');
  const publicController = read('src/controllers/publicController.js');
  assert.ok(publicSite.includes("'@type': 'WebSite'"));
  assert.ok(publicController.includes('User-agent: OAI-SearchBot'));
  assert.ok(publicController.includes('User-agent: OAI-AdsBot'));
  assert.ok(publicController.includes('User-agent: Applebot'));
  assert.ok(publicController.includes('User-agent: GPTBot'));
  assert.ok(publicController.includes('User-agent: Applebot-Extended'));
});

test('account deletion purges MFA challenges and pseudonymizes matching public inquiries', () => {
  const processor = read('src/services/account/accountDeletionProcessor.service.js');
  assert.ok(processor.includes('PrivilegedLoginChallenge.deleteMany'));
  assert.ok(processor.includes('PublicInquiry.updateMany'));
});
