const test = require('node:test');
const assert = require('node:assert/strict');

const env = require('../src/config/env');
const { buildTikTokAuthUrl, createCodeChallenge, getTikTokSetupIssue } = require('../src/services/tiktokService');

test('buildTikTokAuthUrl includes PKCE code challenge required by TikTok', () => {
  const previous = {
    tiktokClientKey: env.tiktokClientKey,
    tiktokClientSecret: env.tiktokClientSecret,
    tiktokCallbackUrl: env.tiktokCallbackUrl,
    tiktokScopes: env.tiktokScopes
  };
  env.tiktokClientKey = 'client_key_123';
  env.tiktokClientSecret = 'client_secret_123';
  env.tiktokCallbackUrl = 'http://localhost:3000/social/tiktok/callback';
  env.tiktokScopes = 'user.info.basic,video.upload,video.publish';

  try {
    const url = new URL(buildTikTokAuthUrl({ brandId: 'brand_1', userId: 'user_1' }));
    assert.equal(url.origin + url.pathname, 'https://www.tiktok.com/v2/auth/authorize/');
    assert.equal(url.searchParams.get('client_key'), 'client_key_123');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.match(url.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43,128}$/);
    assert.ok(url.searchParams.get('state'));
  } finally {
    Object.assign(env, previous);
  }
});

test('createCodeChallenge creates the expected S256 challenge', () => {
  assert.equal(
    createCodeChallenge('abc'),
    'ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0'
  );
});


test('TikTok setup validation rejects placeholder client keys before redirecting to TikTok', () => {
  const previous = {
    tiktokClientKey: env.tiktokClientKey,
    tiktokClientSecret: env.tiktokClientSecret,
    tiktokCallbackUrl: env.tiktokCallbackUrl
  };
  env.tiktokClientKey = 'your_tiktok_client_key';
  env.tiktokClientSecret = 'real_secret';
  env.tiktokCallbackUrl = 'http://localhost:3000/social/tiktok/callback';

  try {
    assert.match(getTikTokSetupIssue(), /Client Key/);
    assert.throws(() => buildTikTokAuthUrl({ brandId: 'brand_1', userId: 'user_1' }), /Client Key/);
  } finally {
    Object.assign(env, previous);
  }
});
