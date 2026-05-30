const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_PLAN_MATRIX } = require('../src/services/subscription/defaultPlans');
const { buildPlanSeedOperation } = require('../src/services/subscription/planSeedOperation');

function updatePaths(operation) {
  const paths = [];
  for (const [operator, payload] of Object.entries(operation)) {
    if (!operator.startsWith('$')) continue;
    for (const path of Object.keys(payload || {})) {
      paths.push({ operator, path });
    }
  }
  return paths;
}

function hasPathConflict(left, right) {
  return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}

test('default plan seeding does not write the same path through multiple update operators', () => {
  for (const plan of DEFAULT_PLAN_MATRIX) {
    const operation = buildPlanSeedOperation(plan);
    const paths = updatePaths(operation);

    for (let index = 0; index < paths.length; index += 1) {
      for (let next = index + 1; next < paths.length; next += 1) {
        const a = paths[index];
        const b = paths[next];
        assert.equal(
          hasPathConflict(a.path, b.path),
          false,
          `${plan.slug} writes ${a.path} through ${a.operator} and ${b.path} through ${b.operator}`
        );
      }
    }

    assert.equal(Object.hasOwn(operation.$setOnInsert, 'sortOrder'), false);
    assert.equal(Object.hasOwn(operation.$setOnInsert, 'isPublic'), false);
    assert.equal(Object.hasOwn(operation.$setOnInsert, 'isActive'), false);
    assert.equal(operation.$set.sortOrder, plan.sortOrder);
    assert.equal(operation.$set.isPublic, plan.isPublic !== false);
    assert.equal(operation.$set.isActive, plan.isActive !== false);
  }
});

test('overwrite plan seeding uses a single update operator', () => {
  const operation = buildPlanSeedOperation(DEFAULT_PLAN_MATRIX[0], { overwrite: true });
  assert.deepEqual(Object.keys(operation), ['$set']);
  assert.equal(operation.$set.slug, 'free-trial');
  assert.equal(operation.$set.sortOrder, DEFAULT_PLAN_MATRIX[0].sortOrder);
});
