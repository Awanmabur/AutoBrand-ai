const test = require('node:test');
const assert = require('node:assert/strict');
const {
  capabilityList,
  evaluateSocialAccountHealth,
  missingPermissions,
  publishingCapabilities,
  tokenExpired
} = require('../src/services/social/socialAccountHealth.service');

test('social account health detects expired, disabled and failed accounts', () => {
  const now = new Date('2030-01-01T12:00:00Z');

  assert.equal(tokenExpired({ tokenExpiresAt: new Date('2030-01-01T11:59:00Z') }, now), true);
  assert.equal(evaluateSocialAccountHealth({ platform: 'facebook', status: 'disconnected' }, now).status, 'disabled');
  assert.equal(evaluateSocialAccountHealth({ platform: 'facebook', status: 'failed', lastPublishError: 'Permission denied' }, now).status, 'failed');
});

test('social account health reports missing permissions and capabilities', () => {
  const account = {
    platform: 'instagram',
    status: 'connected',
    accessTokenEncrypted: 'token',
    permissions: ['instagram_basic']
  };
  const health = evaluateSocialAccountHealth(account, new Date('2030-01-01T12:00:00Z'));

  assert.equal(health.status, 'missing_permission');
  assert.deepEqual(missingPermissions(account), ['instagram_content_publish']);
  assert.equal(publishingCapabilities('instagram').carousel, true);
  assert.ok(capabilityList(health.capabilities).includes('direct publishing'));
});

test('mock social accounts are development-connected without token checks', () => {
  const health = evaluateSocialAccountHealth({ platform: 'facebook', status: 'mock', permissions: [] });

  assert.equal(health.status, 'connected');
  assert.equal(health.label, 'Development connected');
});
