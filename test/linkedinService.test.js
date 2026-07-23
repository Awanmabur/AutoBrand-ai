const test = require('node:test');
const assert = require('node:assert/strict');

const env = require('../src/config/env');
const {
  buildLinkedInAuthUrl,
  exchangeCodeForLinkedInAccounts,
  publishLinkedInPost,
  __private
} = require('../src/services/linkedinService');
const { encryptToken } = require('../src/services/tokenCryptoService');

function withLinkedInEnv(fn) {
  return async () => {
    const original = {
      linkedinClientId: env.linkedinClientId,
      linkedinClientSecret: env.linkedinClientSecret,
      linkedinCallbackUrl: env.linkedinCallbackUrl,
      linkedinScopes: env.linkedinScopes,
      linkedinVersion: env.linkedinVersion
    };
    env.linkedinClientId = 'linkedin_client';
    env.linkedinClientSecret = 'linkedin_secret';
    env.linkedinCallbackUrl = 'http://localhost:3000/social/linkedin/callback';
    env.linkedinScopes = 'openid profile email w_member_social w_organization_social r_organization_social';
    env.linkedinVersion = '202607';
    try {
      await fn();
    } finally {
      Object.assign(env, original);
    }
  };
}

test('buildLinkedInAuthUrl creates a LinkedIn OAuth URL with signed state', withLinkedInEnv(async () => {
  const url = new URL(buildLinkedInAuthUrl({ brandId: 'brand_1', userId: 'user_1' }));

  assert.equal(url.origin + url.pathname, 'https://www.linkedin.com/oauth/v2/authorization');
  assert.equal(url.searchParams.get('client_id'), 'linkedin_client');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3000/social/linkedin/callback');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.match(url.searchParams.get('scope'), /w_member_social/);

  const state = __private.verifyState(url.searchParams.get('state'));
  assert.equal(state.brandId, 'brand_1');
  assert.equal(state.userId, 'user_1');
}));

test('exchangeCodeForLinkedInAccounts maps organization pages and member profile', withLinkedInEnv(async () => {
  const originalFetch = global.fetch;
  const state = __private.signState({ brandId: 'brand_1', userId: 'user_1' });

  global.fetch = async (url) => {
    const target = String(url);
    if (target === 'https://www.linkedin.com/oauth/v2/accessToken') {
      return Response.json({ access_token: 'linkedin_access', refresh_token: 'linkedin_refresh', expires_in: 3600 });
    }
    if (target === 'https://api.linkedin.com/v2/userinfo') {
      return Response.json({ sub: 'person_1', name: 'Classic Owner' });
    }
    if (target.includes('/rest/organizationAcls')) {
      return Response.json({ elements: [{ organization: 'urn:li:organization:12345' }] });
    }
    return Response.json({}, { status: 404 });
  };

  try {
    const accounts = await exchangeCodeForLinkedInAccounts({ code: 'oauth_code', state });

    assert.equal(accounts.length, 2);
    assert.equal(accounts[0].accountId, 'urn:li:organization:12345');
    assert.equal(accounts[0].accountName, 'LinkedIn Organization 12345');
    assert.equal(accounts[1].accountId, 'urn:li:person:person_1');
    assert.equal(accounts[1].accountName, 'Classic Owner');
  } finally {
    global.fetch = originalFetch;
  }
}));

test('publishLinkedInPost creates a text post through the versioned Posts API', withLinkedInEnv(async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === 'https://api.linkedin.com/rest/posts') {
      return Response.json({}, {
        status: 201,
        headers: { 'x-restli-id': 'urn:li:share:1' }
      });
    }
    return Response.json({}, { status: 404 });
  };

  try {
    const result = await publishLinkedInPost({
      post: {
        _id: 'post_1',
        title: 'LinkedIn update',
        caption: 'A practical update for customers',
        hashtags: ['#Brand']
      },
      account: {
        accountId: 'urn:li:person:person_1',
        accessTokenEncrypted: encryptToken('linkedin_access'),
        permissions: ['w_member_social']
      }
    });

    assert.equal(result.id, 'urn:li:share:1');
    assert.equal(calls[0].options.headers['Linkedin-Version'], '202607');
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.author, 'urn:li:person:person_1');
    assert.equal(body.commentary, 'A practical update for customers #Brand');
    assert.equal(body.visibility, 'PUBLIC');
    assert.equal(body.content, undefined);
  } finally {
    global.fetch = originalFetch;
  }
}));

test('publishLinkedInPost uploads image media before creating the post', withLinkedInEnv(async () => {
  const originalFetch = global.fetch;
  const calls = [];
  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  global.fetch = async (url, options = {}) => {
    const target = String(url);
    calls.push({ url: target, options });
    if (target.includes('/rest/images?action=initializeUpload')) {
      return Response.json({ value: { uploadUrl: 'https://upload.linkedin.test/image', image: 'urn:li:image:abc' } });
    }
    if (target === 'https://upload.linkedin.test/image') {
      return new Response('', { status: 201 });
    }
    if (target === 'https://api.linkedin.com/rest/posts') {
      return Response.json({}, { status: 201, headers: { 'x-restli-id': 'urn:li:share:2' } });
    }
    return Response.json({}, { status: 404 });
  };

  try {
    const result = await publishLinkedInPost({
      post: {
        _id: 'post_2',
        type: 'image',
        title: 'Image update',
        caption: 'Visual proof',
        media: [{ fileType: 'image', fileUrl: 'https://cdn.example.test/image.png', fileName: 'proof.png', mimeType: 'image/png' }]
      },
      account: {
        accountId: 'urn:li:organization:12345',
        accessTokenEncrypted: encryptToken('linkedin_access'),
        permissions: ['w_organization_social']
      },
      downloadRemote: async () => ({
        buffer: imageBytes,
        size: imageBytes.length,
        mimeType: 'image/png'
      })
    });

    assert.equal(result.id, 'urn:li:share:2');
    const postCall = calls.find((call) => call.url === 'https://api.linkedin.com/rest/posts');
    const body = JSON.parse(postCall.options.body);
    assert.equal(body.author, 'urn:li:organization:12345');
    assert.equal(body.content.media.id, 'urn:li:image:abc');
    assert.equal(calls.find((call) => call.url === 'https://upload.linkedin.test/image').options.body.length, imageBytes.length);
  } finally {
    global.fetch = originalFetch;
  }
}));
