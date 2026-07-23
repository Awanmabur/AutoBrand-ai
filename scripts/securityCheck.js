#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOTS = ['server.js', 'src', 'workers', 'scripts'];
const failures = [];
const notices = [];

function walk(target) {
  const absolute = path.join(ROOT, target);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return [absolute];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '.git', 'public/uploads', 'tmp', 'coverage'].includes(entry.name)) return [];
    return walk(path.relative(ROOT, path.join(absolute, entry.name)));
  });
}

const files = SOURCE_ROOTS.flatMap(walk).filter((file) => file.endsWith('.js') && !file.endsWith('scripts/securityCheck.js'));
const relative = (file) => path.relative(ROOT, file).replace(/\\/g, '/');

function fail(message) { failures.push(message); }
function notice(message) { notices.push(message); }
function contents(file) { return fs.readFileSync(file, 'utf8'); }
function requireText(file, snippets) {
  const text = contents(path.join(ROOT, file));
  for (const snippet of snippets) {
    if (!text.includes(snippet)) fail(`${file} is missing required security control: ${snippet}`);
  }
}

for (const file of files) {
  const name = relative(file);
  const text = contents(file);
  if (/\beval\s*\(|new\s+Function\s*\(/.test(text)) fail(`${name}: dynamic code execution is forbidden.`);
  if (/(?:require\(['"]node:child_process['"]\)|require\(['"]child_process['"]\)|from ['"]node:child_process['"])[\s\S]{0,300}\bexec(?:Sync)?\s*\(/.test(text)) fail(`${name}: shell command execution is forbidden; use spawn/execFile with fixed arguments.`);
  if (/jwt\.verify\s*\(/.test(text) && name !== 'src/services/tokenService.js') fail(`${name}: JWT verification must remain centralized in tokenService.`);
  if (/console\.(?:log|info|warn|error)\([^\n]*(?:password|accessToken|refreshToken|clientSecret|apiKey)/i.test(text)) fail(`${name}: possible credential logging detected.`);
  if (/TODO[^\n]*(?:verification|password reset|email|security)/i.test(text)) fail(`${name}: unresolved security-sensitive TODO detected.`);
  if (/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(text) && name.startsWith('src/') && !name.includes('config/env.js')) {
    notice(`${name}: contains a local URL; confirm it is development-only.`);
  }
}

const envText = contents(path.join(ROOT, 'src/config/env.js'));
for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'COOKIE_SECRET', 'CSRF_SECRET', 'WEBHOOK_SECRET', 'TOKEN_ENCRYPTION_KEY']) {
  if (!envText.includes(`secretEnv('${name}')`)) fail(`src/config/env.js must load ${name} through fail-closed secretEnv.`);
}
if (/SUPERADMIN_(?:EMAIL|PASSWORD)[^\n]*\|\|\s*['"][^'"]+/.test(envText)) fail('Super-admin credentials must not have hard-coded fallbacks.');

requireText('src/app.js', [
  "app.disable('x-powered-by')",
  'helmet({',
  'requestSanitizer',
  'csrfProtection',
  "app.get('/readyz'"
]);
requireText('src/config/validateEnv.js', [
  'APP_URL must be a valid HTTPS URL in production.',
  'Security secrets must be distinct',
  'SMTP_HOST, SMTP_USER, SMTP_PASS, and EMAIL_FROM are required'
]);
requireText('src/services/tokenService.js', ["algorithms: ['HS256']", "type: 'access'", "type: 'refresh'", 'issuer: env.jwtIssuer', 'audience: env.jwtAudience']);
requireText('src/services/authService.js', ['reuse_detected', 'session_limit', 'rotateRefreshToken']);
requireText('src/services/remoteFetch.service.js', ['resolvePublicAddresses', 'Private network URLs are not allowed.', 'MAX_REDIRECTS']);
requireText('src/controllers/webhookController.js', ['timingSafeEqual', 'MAX_CLOCK_SKEW_MS', 'eventId']);
requireText('src/models/WebhookEvent.js', ["{ provider: 1, eventId: 1 }, { unique: true }"]);

const sensitiveRoutes = ['ai', 'approvals', 'avatars', 'brands', 'campaigns', 'growthStudio', 'media', 'posts', 'social', 'templates', 'videos'];
for (const route of sensitiveRoutes) {
  const file = `src/routes/${route}.js`;
  const text = contents(path.join(ROOT, file));
  if (!text.includes('requireAuth') || !text.includes('requireVerified')) fail(`${file}: authenticated sensitive routes must require verified accounts.`);
}

if (failures.length) {
  console.error(`Security gate failed with ${failures.length} issue(s):`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`Security gate passed: ${files.length} JavaScript files inspected.`);
if (notices.length) {
  console.log(`Review notices (${notices.length}):`);
  notices.forEach((item) => console.log(`- ${item}`));
}
