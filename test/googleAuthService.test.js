const test = require('node:test');
const assert = require('node:assert/strict');

const env = require('../src/config/env');
const {
  buildGoogleAuthUrl,
  exchangeCodeForProfile,
  GoogleOAuthNetworkError,
  __private: googleAuthPrivate
} = require('../src/services/googleAuthService');

async function withEnv(patch, fn) {
  const previous = {};
  for (const key of Object.keys(patch)) previous[key] = env[key];
  Object.assign(env, patch);
  try {
    await fn();
  } finally {
    Object.assign(env, previous);
  }
}

test('buildGoogleAuthUrl uses configured Google sign-in callback', async () => {
  await withEnv({
    googleClientId: 'google_client',
    googleCallbackUrl: 'http://localhost:3200/auth/google/callback'
  }, async () => {
    const url = new URL(buildGoogleAuthUrl('state_1'));
    assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(url.searchParams.get('client_id'), 'google_client');
    assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3200/auth/google/callback');
    assert.equal(url.searchParams.get('scope'), 'openid email profile');
    assert.equal(url.searchParams.get('state'), 'state_1');
  });
});

test('exchangeCodeForProfile maps Google token and userinfo responses', async () => {
  await withEnv({
    googleClientId: 'google_client',
    googleClientSecret: 'google_secret',
    googleCallbackUrl: 'http://localhost:3200/auth/google/callback'
  }, async () => {
    const calls = [];
    googleAuthPrivate.setHttpClientForTest(async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url) === 'https://oauth2.googleapis.com/token') {
        return Response.json({ access_token: 'access_1' });
      }
      if (String(url) === 'https://www.googleapis.com/oauth2/v3/userinfo') {
        return Response.json({
          sub: 'google_user_1',
          email: 'owner@example.test',
          name: 'Owner Example',
          picture: 'https://example.test/avatar.png',
          email_verified: true
        });
      }
      return Response.json({}, { status: 404 });
    });

    try {
      const profile = await exchangeCodeForProfile('code_1');
      assert.equal(profile.googleId, 'google_user_1');
      assert.equal(profile.email, 'owner@example.test');
      assert.equal(profile.name, 'Owner Example');
      assert.equal(profile.isVerified, true);
      assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
      assert.match(String(calls[0].options.body), /redirect_uri=http%3A%2F%2Flocalhost%3A3200%2Fauth%2Fgoogle%2Fcallback/);
      assert.equal(calls[1].options.headers.Authorization, 'Bearer access_1');
    } finally {
      googleAuthPrivate.setHttpClientForTest(null);
    }
  });
});

test('exchangeCodeForProfile wraps backend network failures with an actionable error', async () => {
  googleAuthPrivate.setHttpClientForTest(async () => {
    const error = new TypeError('fetch failed');
    error.cause = { code: 'UND_ERR_CONNECT_TIMEOUT' };
    throw error;
  });

  try {
    await assert.rejects(
      () => exchangeCodeForProfile('code_1'),
      (error) => {
        assert.ok(error instanceof GoogleOAuthNetworkError);
        assert.equal(error.status, 503);
        assert.match(error.message, /could not reach Google from the Node\.js backend/);
        assert.match(error.message, /GOOGLE_OAUTH_DNS_ORDER=ipv4first/);
        return true;
      }
    );
  } finally {
    googleAuthPrivate.setHttpClientForTest(null);
  }
});
