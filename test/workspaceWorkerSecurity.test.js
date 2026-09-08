const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/services/postGeneration.service.js'), 'utf8');

test('background generation uses brand tenancy instead of creator ownership', () => {
  assert.match(source, /const post = await Post\.findById\(rawMetadata\.postId\)/);
  assert.match(source, /canAccessBrand\(user, brand, "content\.edit"\)/);
  assert.match(source, /brand: brand\._id,[\s\S]{0,120}status: trustedOperator/);
  assert.doesNotMatch(source, /Brand\.findOne\(\{[\s\S]{0,120}owner: job\.user/);
  assert.doesNotMatch(source, /uploadedBy: job\.user,[\s\S]{0,100}status:/);
});

test('generation publishing resolves workspace credentials and rechecks current action permission', () => {
  assert.match(source, /owner: brand\.owner,[\s\S]{0,80}brand: brand\._id/);
  assert.match(source, /requiredPermissionForRequestedAction/);
  assert.match(source, /assertGenerationActorAccess\(user, brand, metadata\)/);
  assert.match(source, /assertGenerationActorAccess\(actor, brand, job\.metadata \|\| \{\}\)/);
});

test('generation jobs persist actor, billing workspace and required permission metadata', () => {
  assert.match(source, /actorUserId: cleanObjectId\(userId\)/);
  assert.match(source, /billingWorkspaceId: cleanObjectId\(brand\.owner\)/);
  assert.match(source, /requiredPermission: requiredPermissionForRequestedAction/);
  assert.match(source, /user: billingUser/);
  assert.match(source, /actorUserId: job\.user/);
});
