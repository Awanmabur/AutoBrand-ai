const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('v1.3 exposes a dedicated workspace route for every social channel', () => {
  const routes = read('src/routes/dashboard.js');
  const controller = read('src/controllers/channelWorkspaceController.js');
  const view = read('src/views/dashboard/channel-workspace.ejs');
  assert.match(routes, /\/channels\/:platform/);
  for (const platform of ['facebook','instagram','linkedin','tiktok','youtube','x','threads','pinterest','google_business']) {
    assert.match(controller, /PLATFORM_CATALOG/);
    assert.match(view, /Top performance/);
  }
  assert.match(view, /Accounts & health/);
  assert.match(view, /Recent <%= platformLabel %> posts/);
});

test('Google Drive uses least-access drive.file and supports platform, Drive, or both storage', () => {
  const envExample = read('.env.example');
  const drive = read('src/services/storage/googleDrive.service.js');
  const user = read('src/models/User.js');
  assert.match(envExample, /https:\/\/www\.googleapis\.com\/auth\/drive\.file/);
  assert.match(user, /assetStoragePreference/);
  assert.match(user, /google_drive/);
  assert.match(drive, /createDriveOnlyMedia/);
  assert.match(drive, /mirrorMediaToDrive/);
  assert.match(drive, /ensureBrandFolder/);
});

test('ChatGPT MCP can inspect storage, list assets, choose Drive storage, and back up existing media', () => {
  const { tools } = require('../src/services/mcp/mcpToolDefinitions');
  const names = new Set(tools.map((tool) => tool.name));
  for (const name of ['get_storage_status','list_media','sync_media_to_drive','upload_media']) assert.ok(names.has(name), name);
  const upload = tools.find((tool) => tool.name === 'upload_media');
  assert.deepEqual(upload.inputSchema.properties.storageDestination.enum, ['platform','google_drive','both']);
  assert.deepEqual(upload._meta['openai/fileParams'], ['file']);
});

test('all default plans include ChatGPT, Drive and per-channel workspace capabilities', () => {
  const { DEFAULT_PLAN_MATRIX } = require('../src/services/subscription/defaultPlans');
  for (const plan of DEFAULT_PLAN_MATRIX) {
    assert.equal(plan.features.chatgptConnectorAccess, true, `${plan.slug} ChatGPT`);
    assert.equal(plan.features.googleDriveAccess, true, `${plan.slug} Drive`);
    assert.equal(plan.features.channelWorkspacesAccess, true, `${plan.slug} channels`);
  }
  const publish = DEFAULT_PLAN_MATRIX.find((plan) => plan.slug === 'manual-publisher');
  assert.equal(publish.name, 'Publish');
  assert.equal(publish.price, 10);
  assert.match(publish.featureList.join(' '), /ChatGPT/);
});

test('superadmin remains unlimited across role, plan limits, and AI credits', () => {
  const permissions = read('src/middlewares/permissions.js');
  const usage = read('src/services/usageLimitService.js');
  const credits = read('src/services/creditService.js');
  assert.match(permissions, /super_admin:[^\n]*\['\*'\]/);
  assert.match(usage, /user\?\.role === 'super_admin'/);
  assert.match(credits, /user\.role === 'super_admin'/);
});

test('account deletion removes Drive authorization but deliberately does not delete user-owned Drive files', () => {
  const deletion = read('src/services/account/accountDeletionProcessor.service.js');
  assert.match(deletion, /CloudStorageConnection\.deleteMany/);
  assert.match(deletion, /!fileUrl\.startsWith\('\/uploads\/drive\/'\)/);
});
