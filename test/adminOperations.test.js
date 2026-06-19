const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('admin dashboard loads platform-wide operations data for admin page', () => {
  const controller = read('src/modules/dashboard/dashboard.controller.js');

  assert.match(controller, /platformAdminView/);
  assert.match(controller, /canViewPlatformAdmin/);
  assert.match(controller, /Brand\.find\(\)\.populate\('owner'\)/);
  assert.match(controller, /Subscription\.find\(\)\.populate\('user'\)\.populate\('planRef'\)/);
  assert.match(controller, /Payment\.find\(\)\.populate\('user'\)/);
  assert.match(controller, /UsageLog\.find\(\)\.populate\('user'\)\.populate\('brand'\)/);
  assert.match(controller, /AiVideoJob\.find\(\{ status: 'failed' \}\)\.populate\('brand'\)\.populate\('createdBy'\)/);
  assert.match(controller, /SocialAccount\.find\(\)\.populate\('brand'\)\.populate\('owner'\)/);
  assert.match(controller, /ApiLog\.find\(\)\.populate\('user'\)/);
  assert.match(controller, /AuditLog\.find\(\)\.populate\('user'\)/);
});

test('admin cards cover required platform resources', () => {
  const controller = read('src/modules/dashboard/dashboard.controller.js');

  for (const kind of [
    'admin_brand',
    'user',
    'subscription',
    'payment',
    'ai_usage',
    'post',
    'failed_ai_video_job',
    'connected_account',
    'provider_readiness',
    'api_log',
    'audit_log'
  ]) {
    assert.match(controller, new RegExp(`kind: '${kind}'`), `${kind} card should be present`);
  }
});

test('admin mutations support user enable-disable and failed job retries', () => {
  const routes = read('src/routes/admin.js');
  const controller = read('src/controllers/adminController.js');
  const dashboardJs = read('public/js/dashboard-experience.js');

  assert.match(routes, /\/users\/:id\/status/);
  assert.match(routes, /\/posts\/:id\/retry/);
  assert.match(routes, /\/jobs\/:id\/retry/);
  assert.match(controller, /admin_user_status_update/);
  assert.match(controller, /admin_retry_post/);
  assert.match(controller, /admin_retry_ai_video_job/);
  assert.match(dashboardJs, /hiddenInputsFromAction/);
  assert.match(dashboardJs, /hiddenFields/);
});
