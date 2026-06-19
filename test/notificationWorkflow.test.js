const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Notification = require('../src/models/Notification');
const notificationService = require('../src/services/notification.service');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('notification schema supports severity, actions, metadata, and read state', () => {
  assert.deepEqual(Notification.schema.path('severity').enumValues, ['info', 'success', 'warning', 'error']);
  assert.equal(Notification.schema.path('actionUrl').defaultValue, '');
  assert.equal(Notification.schema.path('metadata').instance, 'Mixed');
  assert.ok(Notification.schema.path('readAt'));
});

test('notification service exposes workflow notification helpers', () => {
  for (const helper of [
    'notifyAccountDisconnected',
    'notifyLowCredits',
    'notifyPayment',
    'notifyUser',
    'notifyVideoRendered'
  ]) {
    assert.equal(typeof notificationService[helper], 'function', `${helper} should be exported`);
  }
});

test('notification routes and dashboard menu provide read controls', () => {
  const routes = read('src/routes/notifications.js');
  const controller = read('src/controllers/notificationController.js');
  const dashboard = read('src/views/dashboard/experience.ejs');

  assert.match(routes, /router\.post\('\/read-all'/);
  assert.match(routes, /router\.post\('\/:id\/read'/);
  assert.match(controller, /markAllRead/);
  assert.match(controller, /markRead/);
  assert.match(dashboard, /notification-menu/);
  assert.match(dashboard, /Mark all read/);
});

test('required product events are wired to notifications', () => {
  const publishing = read('src/services/publishingService.js');
  const approvals = read('src/controllers/approvalController.js');
  const billing = read('src/controllers/billingController.js');
  const credits = read('src/services/creditService.js');
  const social = read('src/modules/social-accounts/social.controller.js');
  const team = read('src/controllers/teamController.js');
  const video = read('src/controllers/videoController.js');
  const avatar = read('src/controllers/avatarController.js');
  const service = read('src/services/notification.service.js');

  assert.match(publishing, /post_published/);
  assert.match(publishing, /post_failed/);
  assert.match(publishing, /notifyAccountDisconnected/);
  assert.match(approvals, /approval_requested/);
  assert.match(approvals, /approval_approved/);
  assert.match(approvals, /approval_rejected/);
  assert.match(billing, /payment_success/);
  assert.match(billing, /notifyPayment/);
  assert.match(credits, /notifyLowCredits/);
  assert.match(social, /notifyAccountDisconnected/);
  assert.match(team, /team_invite_accepted/);
  assert.match(video, /notifyVideoRendered/);
  assert.match(avatar, /notifyVideoRendered/);
  assert.match(service, /low_credits/);
  assert.match(service, /video_rendered/);
  assert.match(service, /avatar_video_rendered/);
});
