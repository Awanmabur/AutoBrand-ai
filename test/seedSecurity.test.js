const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const root = path.join(__dirname, '..');

function runSeedIdentity(env = {}) {
  return spawnSync(process.execPath, ['-e', "const s=require('./scripts/seedSuperadmin'); try { console.log(JSON.stringify(s.resolveSeedIdentity())); } catch(e) { console.error(e.message); process.exit(7); }"], {
    cwd: root,
    env: { PATH: process.env.PATH, NODE_ENV: 'production', ...env },
    encoding: 'utf8'
  });
}

test('production superadmin seeding requires an explicit email instead of a default privileged identity', () => {
  const result = runSeedIdentity({ SUPERADMIN_EMAIL: '', SUPERADMIN_PASSWORD: '' });
  assert.equal(result.status, 7);
  assert.match(result.stderr, /SUPERADMIN_EMAIL must be explicitly configured/);
});

test('superadmin seed source has no built-in production password and protects existing-account promotion', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/seedSuperadmin.js'), 'utf8');
  assert.doesNotMatch(source, /process\.env\.SUPERADMIN_PASSWORD\s*\|\|\s*['"][^'"]+['"]/);
  assert.match(source, /SUPERADMIN_PASSWORD is required when creating/);
  assert.match(source, /SUPERADMIN_ALLOW_PROMOTION/);
  assert.match(source, /validatePassword\(identity\.password/);
});
