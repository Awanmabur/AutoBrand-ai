const { spawnSync } = require('child_process');
const path = require('path');

const scripts = ['seedPlans.js', 'seedPermissions.js', 'seedPlatformRules.js', 'seedAiProviders.js', 'seedSuperadmin.js'];
for (const script of scripts) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}
