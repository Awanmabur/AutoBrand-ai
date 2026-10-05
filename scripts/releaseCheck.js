#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const failures = [];
const notices = [];

const forbiddenDirs = new Set(['node_modules', '.git', 'logs', 'uploads', 'tmp', 'temp', 'coverage', '.nyc_output']);
const forbiddenExact = new Set(['.env', '.autobrand-token-key', 'npm-debug.log', 'yarn-debug.log', 'yarn-error.log']);
const allowedDotEnv = new Set(['.env.example']);
const forbiddenExt = new Set(['.pem', '.p12', '.pfx', '.jks', '.keystore']);
const archiveExt = new Set(['.zip', '.tar', '.gz', '.tgz', '.7z', '.rar']);
const textExt = new Set(['.js', '.json', '.md', '.ejs', '.css', '.html', '.txt', '.yml', '.yaml', '.example']);

function rel(file) { return path.relative(ROOT, file).replace(/\\/g, '/'); }
function walk(dir = ROOT) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    const relative = rel(absolute);
    if (entry.isDirectory()) {
      if (forbiddenDirs.has(entry.name) || relative === 'public/uploads' || relative === 'public/generated') {
        notices.push(`Excluded runtime directory present in working tree: ${relative}/`);
        continue;
      }
      walk(absolute);
      continue;
    }
    const lower = entry.name.toLowerCase();
    const ext = path.extname(lower);
    if (forbiddenExact.has(entry.name)) failures.push(`Forbidden secret/runtime file is present: ${relative}`);
    if (lower.startsWith('.env') && !allowedDotEnv.has(entry.name)) failures.push(`Environment file must not ship: ${relative}`);
    if (forbiddenExt.has(ext)) failures.push(`Private key/keystore file must not ship: ${relative}`);
    if (archiveExt.has(ext)) failures.push(`Nested archive must not ship: ${relative}`);
    if (!textExt.has(ext) && !['Procfile'].includes(entry.name)) continue;
    if (fs.statSync(absolute).size > 2 * 1024 * 1024) continue;
    const text = fs.readFileSync(absolute, 'utf8');
    if (/mock\.autobrand\.local/i.test(text) && !relative.includes('migrateProductionData.js')) {
      failures.push(`Mock production URL remains in releasable source: ${relative}`);
    }
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) failures.push(`Embedded private key detected: ${relative}`);
    const secretAssignments = [...text.matchAll(/(?:PESAPAL_CONSUMER_SECRET|OPENAI_API_KEY|JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|TOKEN_ENCRYPTION_KEY)\s*=\s*([A-Za-z0-9_\-]{24,})/g)];
    for (const match of secretAssignments) {
      const value = String(match[1] || '');
      const placeholder = /replace|example|your_|change|placeholder/i.test(value);
      if (!placeholder && relative !== '.env.example') failures.push(`Possible hard-coded secret assignment detected: ${relative}`);
    }
  }
}

walk();
const requiredDocs = [
  'docs/ARCHITECTURE.md', 'docs/SECURITY.md', 'docs/PESAPAL-BILLING.md', 'docs/WORKSPACE-RBAC.md',
  'docs/MANUAL-PUBLISHER.md', 'docs/ANALYTICS.md', 'docs/BACKGROUND-WORKERS.md', 'docs/DATA-LIFECYCLE.md',
  'docs/DEPLOYMENT-RUNBOOK.md', 'docs/PRODUCTION-CHECKLIST.md', 'docs/MCP-CONNECTOR.md'
];
for (const file of requiredDocs) if (!fs.existsSync(path.join(ROOT, file))) failures.push(`Required production documentation is missing: ${file}`);

if (failures.length) {
  console.error(`Release gate failed with ${failures.length} issue(s):`);
  failures.forEach((item) => console.error(`- ${item}`));
  if (notices.length) notices.forEach((item) => console.log(`NOTICE ${item}`));
  process.exit(1);
}
console.log('Release gate passed: no releasable secrets, nested archives, private keys, or mock production URLs detected.');
if (notices.length) notices.forEach((item) => console.log(`NOTICE ${item}`));
