const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const tokenServicePath = path.join(root, 'src/services/tokenCryptoService.js');

function run(script, env = {}, cwd = root) {
  return spawnSync(process.execPath, ['-e', script], {
    cwd,
    env: { PATH: process.env.PATH, NODE_ENV: 'development', ...env },
    encoding: 'utf8'
  });
}

test('development token encryption key persists across process restarts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autobrand-token-key-'));
  const keyFile = path.join(dir, '.autobrand-token-key');
  const encrypt = run(
    `const {encryptToken}=require(${JSON.stringify(tokenServicePath)}); process.stdout.write(encryptToken('page-token'));`,
    { TOKEN_ENCRYPTION_KEY_FILE: keyFile },
    dir
  );
  assert.equal(encrypt.status, 0, encrypt.stderr);
  assert.match(encrypt.stdout, /^v2\./);
  assert.equal(fs.existsSync(keyFile), true);

  const decrypt = run(
    `const {decryptToken}=require(${JSON.stringify(tokenServicePath)}); process.stdout.write(decryptToken(${JSON.stringify(encrypt.stdout)}));`,
    { TOKEN_ENCRYPTION_KEY_FILE: keyFile },
    dir
  );
  assert.equal(decrypt.status, 0, decrypt.stderr);
  assert.equal(decrypt.stdout, 'page-token');
});

test('previous token encryption key decrypts records during a safe rotation', () => {
  const oldKey = 'old-key-'.padEnd(48, 'a');
  const newKey = 'new-key-'.padEnd(48, 'b');
  const encrypt = run(
    `const {encryptToken}=require(${JSON.stringify(tokenServicePath)}); process.stdout.write(encryptToken('instagram-token'));`,
    { TOKEN_ENCRYPTION_KEY: oldKey }
  );
  assert.equal(encrypt.status, 0, encrypt.stderr);

  const decrypt = run(
    `const {decryptToken}=require(${JSON.stringify(tokenServicePath)}); process.stdout.write(decryptToken(${JSON.stringify(encrypt.stdout)}));`,
    { TOKEN_ENCRYPTION_KEY: newKey, TOKEN_ENCRYPTION_KEY_PREVIOUS: oldKey }
  );
  assert.equal(decrypt.status, 0, decrypt.stderr);
  assert.equal(decrypt.stdout, 'instagram-token');
});


test('legacy v1 tokens can be recovered with TOKEN_ENCRYPTION_KEY_PREVIOUS', () => {
  const oldKey = 'legacy-key-'.padEnd(48, 'l');
  const createLegacy = run(`
    const crypto=require('crypto');
    const key=crypto.createHash('sha256').update(${JSON.stringify('legacy-key-'.padEnd(48, 'l'))}).digest();
    const iv=crypto.randomBytes(12);
    const cipher=crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted=Buffer.concat([cipher.update('legacy-page-token','utf8'),cipher.final()]);
    const tag=cipher.getAuthTag();
    process.stdout.write(['v1',iv.toString('base64url'),tag.toString('base64url'),encrypted.toString('base64url')].join('.'));
  `, { TOKEN_ENCRYPTION_KEY: oldKey });
  assert.equal(createLegacy.status, 0, createLegacy.stderr);

  const decrypt = run(
    `const {decryptToken}=require(${JSON.stringify(tokenServicePath)}); process.stdout.write(decryptToken(${JSON.stringify(createLegacy.stdout)}));`,
    { TOKEN_ENCRYPTION_KEY: 'rotated-key-'.padEnd(48, 'r'), TOKEN_ENCRYPTION_KEY_PREVIOUS: oldKey }
  );
  assert.equal(decrypt.status, 0, decrypt.stderr);
  assert.equal(decrypt.stdout, 'legacy-page-token');
});

test('wrong token key returns a clear permanent reconnect error', () => {
  const encrypt = run(
    `const {encryptToken}=require(${JSON.stringify(tokenServicePath)}); process.stdout.write(encryptToken('facebook-token'));`,
    { TOKEN_ENCRYPTION_KEY: 'first-key-'.padEnd(48, '1') }
  );
  assert.equal(encrypt.status, 0, encrypt.stderr);

  const decrypt = run(
    `const {decryptToken}=require(${JSON.stringify(tokenServicePath)}); try { decryptToken(${JSON.stringify(encrypt.stdout)}); } catch (error) { process.stdout.write(JSON.stringify({code:error.code,message:error.message})); }`,
    { TOKEN_ENCRYPTION_KEY: 'second-key-'.padEnd(48, '2') }
  );
  assert.equal(decrypt.status, 0, decrypt.stderr);
  const output = JSON.parse(decrypt.stdout);
  assert.equal(output.code, 'TOKEN_DECRYPTION_FAILED');
  assert.match(output.message, /restore the previous TOKEN_ENCRYPTION_KEY|reconnect/i);
});

test('credential decryption failures are never auto-rescheduled', () => {
  const { isRetryablePublishingError } = require('../src/services/publishingRetryPolicyService');
  assert.equal(isRetryablePublishingError('Unsupported state or unable to authenticate data'), false);
  assert.equal(isRetryablePublishingError('Stored social account credentials cannot be decrypted.'), false);
  assert.equal(isRetryablePublishingError('TOKEN_ENCRYPTION_KEY is not configured.'), false);
  assert.equal(isRetryablePublishingError('Provider request timed out'), true);
});
