const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');

function validate(overrides = {}) {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME || root,
    NODE_ENV: 'production',
    APP_URL: 'https://app.example.test',
    PUBLIC_APP_URL: 'https://media.example.test',
    MONGO_URI: 'mongodb+srv://user:pass@cluster.example.test/app',
    JWT_ACCESS_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
    COOKIE_SECRET: 'c'.repeat(40),
    CSRF_SECRET: 'd'.repeat(40),
    WEBHOOK_SECRET: 'e'.repeat(40),
    TOKEN_ENCRYPTION_KEY: 'f'.repeat(40),
    ALLOW_DEVELOPMENT_EMAIL_LINKS: 'false',
    EMAIL_DELIVERY_MODE: 'disabled',
    EMAIL_VERIFICATION_REQUIRED: 'false',
    BILLING_PROVIDER: 'pesapal',
    CHECKOUT_DEFAULT_PROVIDER: 'pesapal',
    PESAPAL_ENVIRONMENT: 'production',
    PESAPAL_CONSUMER_KEY: 'consumer-key',
    PESAPAL_CONSUMER_SECRET: 'consumer-secret',
    PESAPAL_IPN_ID: 'ipn-id',
    ...overrides
  };
  const result = spawnSync(process.execPath, ['-e', `
    const { validateEnvironment } = require('./src/config/validateEnv');
    try { validateEnvironment({ production: true }); console.log(JSON.stringify({ok:true})); }
    catch (error) { console.log(JSON.stringify({ok:false, errors:error.validationErrors || []})); }
  `], { cwd: root, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test('production validation requires live Pesapal credentials and IPN readiness', () => {
  const missing = validate({ PESAPAL_CONSUMER_KEY: '', PESAPAL_CONSUMER_SECRET: '', PESAPAL_IPN_ID: '' });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join(' '), /PESAPAL_CONSUMER_KEY/);
  assert.match(missing.errors.join(' '), /PESAPAL_IPN_ID/);

  const valid = validate();
  assert.equal(valid.ok, true);
});

test('production validation rejects sandbox or non-Pesapal billing configuration', () => {
  const sandbox = validate({ PESAPAL_ENVIRONMENT: 'sandbox' });
  assert.equal(sandbox.ok, false);
  assert.match(sandbox.errors.join(' '), /PESAPAL_ENVIRONMENT must be production/);

  const other = validate({ BILLING_PROVIDER: 'stripe' });
  assert.equal(other.ok, false);
  assert.match(other.errors.join(' '), /BILLING_PROVIDER must be pesapal/);
});

test('production Pesapal callbacks and IPN must stay on the application hostname', () => {
  const result = validate({ PESAPAL_CALLBACK_URL: 'https://attacker.example/callback' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /PESAPAL_CALLBACK_URL must use the APP_URL hostname/);
});

test('production rejects a custom Pesapal API origin that could receive credentials', () => {
  const result = validate({ PESAPAL_BASE_URL: 'https://proxy.example.test/pesapal' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /official live Pesapal API origin/);
});
