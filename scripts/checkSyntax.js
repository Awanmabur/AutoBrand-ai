const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const roots = ['server.js', 'src', 'scripts', 'workers'];

function collectJs(target) {
  const absolute = path.join(process.cwd(), target);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return target.endsWith('.js') ? [absolute] : [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(absolute, entry.name);
    if (entry.isDirectory()) return collectJs(path.relative(process.cwd(), child));
    return entry.isFile() && entry.name.endsWith('.js') ? [child] : [];
  });
}

const files = roots.flatMap(collectJs);
let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}

if (failed) process.exit(1);
console.log(`Syntax OK: ${files.length} JavaScript files checked.`);
