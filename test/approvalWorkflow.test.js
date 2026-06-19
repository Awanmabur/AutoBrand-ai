const test = require('node:test');
const assert = require('node:assert/strict');
const Approval = require('../src/models/Approval');
const ClientApprovalLink = require('../src/models/ClientApprovalLink');
const Campaign = require('../src/models/Campaign');

test('approval schemas support post and campaign review targets with history', () => {
  assert.deepEqual(Approval.schema.path('targetType').enumValues, ['post', 'campaign']);
  assert.ok(Approval.schema.path('campaign'));
  assert.equal(Boolean(Approval.schema.path('post').isRequired), false);
  assert.ok(Approval.schema.path('history'));

  assert.deepEqual(ClientApprovalLink.schema.path('targetType').enumValues, ['post', 'campaign']);
  assert.ok(ClientApprovalLink.schema.path('campaign'));
  assert.equal(Boolean(ClientApprovalLink.schema.path('post').isRequired), false);
});

test('campaign status enum includes approval workflow states', () => {
  const statuses = Campaign.schema.path('status').enumValues;
  assert.ok(statuses.includes('pending_approval'));
  assert.ok(statuses.includes('approved'));
  assert.ok(statuses.includes('changes_requested'));
  assert.ok(statuses.includes('rejected'));
});
