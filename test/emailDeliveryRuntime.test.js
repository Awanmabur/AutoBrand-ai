const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function productionEnv(overrides = {}) {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME || process.cwd(),
    NODE_ENV: 'production',
    APP_URL: 'https://autobrand.example',
    PUBLIC_APP_URL: 'https://autobrand.example',
    MONGO_URI: 'mongodb+srv://user:pass@cluster.example.mongodb.net/app',
    JWT_ACCESS_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
    COOKIE_SECRET: 'c'.repeat(40),
    CSRF_SECRET: 'd'.repeat(40),
    WEBHOOK_SECRET: 'e'.repeat(40),
    TOKEN_ENCRYPTION_KEY: 'f'.repeat(40),
    ALLOW_LOCAL_IMAGE_FALLBACK: 'false',
    ALLOW_LOCAL_VIDEO_FALLBACK: 'false',
    ALLOW_DEVELOPMENT_EMAIL_LINKS: 'false',
    EMAIL_DELIVERY_MODE: 'optional',
    EMAIL_VERIFICATION_REQUIRED: 'false',
    ...overrides
  };
  return env;
}

function runValidation(env) {
  return spawnSync(process.execPath, ['-e', `
    const env = require('./src/config/env');
    const { validateEnvironment } = require('./src/config/validateEnv');
    try {
      const result = validateEnvironment();
      process.stdout.write(JSON.stringify({ ok: true, warnings: result.warnings, mode: env.emailDeliveryMode, enabled: env.emailDeliveryEnabled, verificationRequired: env.emailVerificationRequired }));
    } catch (error) {
      process.stdout.write(JSON.stringify({ ok: false, code: error.code, errors: error.validationErrors || [] }));
    }
  `], { cwd: root, env, encoding: 'utf8' });
}

test('production starts without SMTP in optional email mode', () => {
  const result = runValidation(productionEnv());
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.mode, 'optional');
  assert.equal(output.enabled, false);
  assert.equal(output.verificationRequired, false);
  assert.match(output.warnings.join(' '), /Email delivery is not configured/i);
});

test('required email mode still fails closed without SMTP', () => {
  const result = runValidation(productionEnv({
    EMAIL_DELIVERY_MODE: 'required',
    EMAIL_VERIFICATION_REQUIRED: 'true'
  }));
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.equal(output.code, 'EINVALIDENV');
  assert.match(output.errors.join(' '), /EMAIL_DELIVERY_MODE=required/i);
});

test('partial SMTP in optional mode warns instead of crashing startup', () => {
  const result = runValidation(productionEnv({ EMAIL_FROM: 'AutoBrand <no-reply@example.org>' }));
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.match(output.warnings.join(' '), /SMTP configuration is incomplete/i);
});

test('verification middleware bypasses verification only when deployment disables it', () => {
  const source = fs.readFileSync(path.join(root, 'src/middlewares/requireVerified.js'), 'utf8');
  assert.match(source, /!env\.emailVerificationRequired \|\| req\.user\.isVerified/);
});

test('registration and recovery flows use safe no-email behavior', () => {
  const auth = fs.readFileSync(path.join(root, 'src/controllers/authController.js'), 'utf8');
  const email = fs.readFileSync(path.join(root, 'src/services/emailService.js'), 'utf8');
  assert.match(auth, /isVerified:\s*!verificationRequired/);
  assert.match(auth, /Password reset email is temporarily unavailable/);
  assert.doesNotMatch(email, /if \(env\.nodeEnv === 'production'\) throw/);
  assert.match(email, /unavailable:\s*true/);
});
