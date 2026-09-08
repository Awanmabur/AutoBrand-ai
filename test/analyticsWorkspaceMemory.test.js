const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('provider analytics refreshes shared Brand Brain memory by brand, not online owner', () => {
  const memory = source('src/services/analyticsMemoryService.js');
  const sync = source('src/services/analytics/analyticsSync.service.js');
  const dashboard = source('src/modules/dashboard/dashboard.controller.js');
  assert.match(memory, /async function updateBrandPerformanceMemory\(\{ brandIds \}/);
  assert.match(memory, /Analytics\.find\(\{ brand: \{ \$in:/);
  assert.match(sync, /updateBrandPerformanceMemory\(\{ brandIds: \[post\.brand\] \}\)/);
  assert.doesNotMatch(dashboard, /updateBrandPerformanceMemoryForOwner/);
});
