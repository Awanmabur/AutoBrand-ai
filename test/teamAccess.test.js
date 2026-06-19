const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canManageTeam,
  normalizeTeamPermissions,
  normalizeTeamRole,
  permissionsForTeamRole
} = require('../src/services/team/teamAccess.service');

test('team access normalizes requested roles and legacy aliases', () => {
  assert.equal(normalizeTeamRole('content_creator'), 'creator');
  assert.equal(normalizeTeamRole('reviewer'), 'approver');
  assert.equal(normalizeTeamRole('billing'), 'billing');
  assert.equal(normalizeTeamRole('unknown'), 'viewer');
});

test('team access maps permissions and grants role defaults', () => {
  const permissions = permissionsForTeamRole('manager', ['brand_read', 'content_create']);

  assert.ok(permissions.includes('brand.manage'));
  assert.ok(permissions.includes('brand.view'));
  assert.ok(permissions.includes('content.create'));
  assert.deepEqual(normalizeTeamPermissions('approve_posts, analytics_read'), ['approvals.manage', 'analytics.view']);
  assert.equal(canManageTeam(permissionsForTeamRole('admin')), true);
  assert.equal(canManageTeam(permissionsForTeamRole('viewer')), false);
});
