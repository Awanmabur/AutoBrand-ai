const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function source(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('startup stops undecryptable credential posts before the due publisher starts', () => {
  const server = source('server.js');
  assert.match(server, /markUndecryptableSocialAccountsForReconnect/);
  assert.ok(server.indexOf('await markUndecryptableSocialAccountsForReconnect()') < server.indexOf('startDuePostPublisher()'));
});

test('credential crypto failures are permanent and require reconnect', () => {
  const retry = source('src/services/publishingRetryPolicyService.js');
  const publishing = source('src/services/publishingService.js');
  const readiness = source('src/services/socialCredentialReadiness.service.js');
  assert.match(retry, /unsupported state or unable to authenticate data/i);
  assert.match(retry, /TOKEN_ENCRYPTION_KEY/);
  assert.match(publishing, /isTokenDecryptionError/);
  assert.match(readiness, /credential_reconnect_required/);
  assert.match(readiness, /status: 'failed'/);
  assert.match(readiness, /scheduledAt: null/);
});

test('development uses a persistent token key and rotations accept previous keys', () => {
  const env = source('src/config/env.js');
  const crypto = source('src/services/tokenCryptoService.js');
  assert.match(env, /\.autobrand-token-key/);
  assert.match(env, /TOKEN_ENCRYPTION_KEY_PREVIOUS/);
  assert.match(crypto, /v2/);
  assert.match(crypto, /env\.tokenEncryptionKeyPrevious/);
});
