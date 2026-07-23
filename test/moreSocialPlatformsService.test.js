const test = require('node:test');
const assert = require('node:assert/strict');

const env = require('../src/config/env');
const { encryptToken } = require('../src/services/tokenCryptoService');
const {
  buildGoogleBusinessAuthUrl,
  exchangeCodeForGoogleBusinessLocations,
  publishGoogleBusinessPost,
  __private: googleBusinessPrivate
} = require('../src/services/googleBusinessProfileService');
const {
  buildPinterestAuthUrl,
  exchangeCodeForPinterestBoards,
  publishPinterestPin,
  __private: pinterestPrivate
} = require('../src/services/pinterestService');
const {
  buildXAuthUrl,
  exchangeCodeForXAccount,
  publishXPost,
  __private: xPrivate
} = require('../src/services/xService');
const {
  buildThreadsAuthUrl,
  exchangeCodeForThreadsAccount,
  publishThreadsPost,
  __private: threadsPrivate
} = require('../src/services/threadsService');

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

test('Google Business Profile OAuth URL and callback map Business Profile locations', async () => {
  await withEnv({
    googleBusinessClientId: 'gbp_client',
    googleBusinessClientSecret: 'gbp_secret',
    googleBusinessCallbackUrl: 'http://localhost:3000/social/google-business/callback',
    googleBusinessScopes: 'https://www.googleapis.com/auth/business.manage'
  }, async () => {
    const authUrl = new URL(buildGoogleBusinessAuthUrl({ brandId: 'brand_1', userId: 'user_1' }));
    assert.equal(authUrl.origin + authUrl.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(authUrl.searchParams.get('client_id'), 'gbp_client');
    assert.equal(authUrl.searchParams.get('access_type'), 'offline');
    assert.match(authUrl.searchParams.get('scope'), /business\.manage/);
    assert.equal(googleBusinessPrivate.verifyState(authUrl.searchParams.get('state')).brandId, 'brand_1');

    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      const target = String(url);
      if (target === 'https://oauth2.googleapis.com/token') {
        return Response.json({ access_token: 'gbp_access', refresh_token: 'gbp_refresh', expires_in: 3600 });
      }
      if (target === 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts') {
        return Response.json({ accounts: [{ name: 'accounts/123', accountName: 'Acme Owner' }] });
      }
      if (target.includes('mybusinessbusinessinformation.googleapis.com/v1/accounts/123/locations')) {
        return Response.json({ locations: [{ name: 'locations/456', title: 'Acme Kampala' }] });
      }
      return Response.json({}, { status: 404 });
    };

    try {
      const accounts = await exchangeCodeForGoogleBusinessLocations({ code: 'code_1', state: authUrl.searchParams.get('state') });
      assert.equal(accounts.length, 1);
      assert.equal(accounts[0].platform, 'google_business');
      assert.equal(accounts[0].accountId, '123|456');
      assert.equal(accounts[0].accountName, 'Acme Kampala (Acme Owner)');
      assert.equal(accounts[0].providerMeta.locationId, '456');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('publishGoogleBusinessPost creates a local post on the saved location', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return Response.json({ name: 'accounts/123/locations/456/localPosts/789' });
  };

  try {
    const result = await publishGoogleBusinessPost({
      post: {
        _id: 'post_gbp',
        title: 'Opening day',
        caption: 'We are open today',
        brand: { website: 'https://example.test' },
        media: [{ fileType: 'image', fileUrl: 'https://cdn.example.test/photo.jpg' }]
      },
      account: {
        accountId: '123|456',
        accessTokenEncrypted: encryptToken('gbp_access')
      }
    });

    assert.equal(result.id, 'accounts/123/locations/456/localPosts/789');
    assert.equal(calls[0].url, 'https://mybusiness.googleapis.com/v4/accounts/123/locations/456/localPosts');
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.summary, 'We are open today');
    assert.equal(body.media[0].sourceUrl, 'https://cdn.example.test/photo.jpg');
  } finally {
    global.fetch = originalFetch;
  }
});

test('Pinterest OAuth callback maps boards as publishable accounts', async () => {
  await withEnv({
    pinterestClientId: 'pin_client',
    pinterestClientSecret: 'pin_secret',
    pinterestCallbackUrl: 'http://localhost:3000/social/pinterest/callback',
    pinterestScopes: 'boards:read,pins:read,pins:write,user_accounts:read'
  }, async () => {
    const authUrl = new URL(buildPinterestAuthUrl({ brandId: 'brand_1', userId: 'user_1' }));
    assert.equal(authUrl.origin + authUrl.pathname, 'https://www.pinterest.com/oauth/');
    assert.equal(authUrl.searchParams.get('client_id'), 'pin_client');
    assert.match(authUrl.searchParams.get('scope'), /boards:read/);
    assert.equal(pinterestPrivate.verifyState(authUrl.searchParams.get('state')).userId, 'user_1');

    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      const target = String(url);
      if (target === 'https://api.pinterest.com/v5/oauth/token') {
        return Response.json({ access_token: 'pin_access', refresh_token: 'pin_refresh', expires_in: 3600 });
      }
      if (target === 'https://api.pinterest.com/v5/user_account') {
        return Response.json({ id: 'user_123', username: 'acme' });
      }
      if (target === 'https://api.pinterest.com/v5/boards?page_size=100') {
        return Response.json({ items: [{ id: 'board_1', name: 'Campaign Ideas', privacy: 'PUBLIC' }] });
      }
      return Response.json({}, { status: 404 });
    };

    try {
      const boards = await exchangeCodeForPinterestBoards({ code: 'code_1', state: authUrl.searchParams.get('state') });
      assert.equal(boards.length, 1);
      assert.equal(boards[0].platform, 'pinterest');
      assert.equal(boards[0].accountId, 'board_1');
      assert.equal(boards[0].accountName, 'Campaign Ideas (acme)');
      assert.equal(boards[0].providerMeta.boardName, 'Campaign Ideas');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('publishPinterestPin creates a pin on the selected board', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return Response.json({ id: 'pin_1' });
  };

  try {
    const result = await publishPinterestPin({
      post: {
        _id: 'post_pin',
        title: 'Design idea',
        caption: 'Pin this offer',
        brand: { website: 'https://example.test' },
        media: [{ fileType: 'image', fileUrl: 'https://cdn.example.test/pin.jpg' }]
      },
      account: {
        accountId: 'board_1',
        accessTokenEncrypted: encryptToken('pin_access')
      }
    });

    assert.equal(result.id, 'pin_1');
    assert.equal(calls[0].url, 'https://api.pinterest.com/v5/pins');
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.board_id, 'board_1');
    assert.equal(body.media_source.url, 'https://cdn.example.test/pin.jpg');
  } finally {
    global.fetch = originalFetch;
  }
});

test('X OAuth uses PKCE and maps the authenticated user profile', async () => {
  await withEnv({
    xClientId: 'x_client',
    xClientSecret: 'x_secret',
    xCallbackUrl: 'http://localhost:3000/social/x/callback',
    xScopes: 'tweet.read tweet.write users.read offline.access media.write'
  }, async () => {
    const authUrl = new URL(buildXAuthUrl({ brandId: 'brand_1', userId: 'user_1' }));
    assert.equal(authUrl.origin + authUrl.pathname, 'https://x.com/i/oauth2/authorize');
    assert.equal(authUrl.searchParams.get('client_id'), 'x_client');
    assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
    assert.match(authUrl.searchParams.get('scope'), /tweet\.write/);
    assert.match(authUrl.searchParams.get('scope'), /media\.write/);
    const state = xPrivate.verifyState(authUrl.searchParams.get('state'));
    assert.equal(state.brandId, 'brand_1');
    assert.ok(state.codeVerifier);

    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      const target = String(url);
      if (target === 'https://api.x.com/2/oauth2/token') {
        return Response.json({ access_token: 'x_access', refresh_token: 'x_refresh', expires_in: 7200 });
      }
      if (target === 'https://api.x.com/2/users/me?user.fields=profile_image_url,username,name') {
        return Response.json({ data: { id: '111', username: 'acme', name: 'Acme' } });
      }
      return Response.json({}, { status: 404 });
    };

    try {
      const account = await exchangeCodeForXAccount({ code: 'code_1', state: authUrl.searchParams.get('state') });
      assert.equal(account.platform, 'x');
      assert.equal(account.accountId, '111');
      assert.equal(account.accountName, '@acme');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('publishXPost posts text through the X v2 tweets endpoint', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return Response.json({ data: { id: 'tweet_1' } });
  };

  try {
    const result = await publishXPost({
      post: { _id: 'post_x', caption: 'Fresh update', hashtags: ['#Brand'], brand: { website: 'https://example.test' } },
      account: { accessTokenEncrypted: encryptToken('x_access') }
    });

    assert.equal(result.id, 'tweet_1');
    assert.equal(calls[0].url, 'https://api.x.com/2/tweets');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer x_access');
    assert.equal(JSON.parse(calls[0].options.body).text, 'Fresh update #Brand https://example.test');
  } finally {
    global.fetch = originalFetch;
  }
});

test('Threads OAuth exchanges a code and maps the Threads profile', async () => {
  await withEnv({
    threadsAppId: 'threads_app',
    threadsAppSecret: 'threads_secret',
    threadsCallbackUrl: 'https://example.test/social/threads/callback',
    threadsScopes: 'threads_basic,threads_content_publish',
    threadsGraphVersion: 'v1.0'
  }, async () => {
    const authUrl = new URL(buildThreadsAuthUrl({ brandId: 'brand_1', userId: 'user_1' }));
    assert.equal(authUrl.origin + authUrl.pathname, 'https://www.threads.net/oauth/authorize');
    assert.equal(authUrl.searchParams.get('client_id'), 'threads_app');
    assert.match(authUrl.searchParams.get('scope'), /threads_content_publish/);
    assert.equal(threadsPrivate.verifyState(authUrl.searchParams.get('state')).brandId, 'brand_1');

    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      const target = String(url);
      if (target === 'https://graph.threads.net/oauth/access_token') {
        return Response.json({ access_token: 'threads_short', user_id: '1781', expires_in: 3600 });
      }
      if (target.startsWith('https://graph.threads.net/access_token?')) {
        return Response.json({ access_token: 'threads_long', expires_in: 5184000 });
      }
      if (target.startsWith('https://graph.threads.net/v1.0/me?')) {
        return Response.json({ id: '1781', username: 'acme_threads', name: 'Acme Threads' });
      }
      return Response.json({}, { status: 404 });
    };

    try {
      const account = await exchangeCodeForThreadsAccount({ code: 'code_1', state: authUrl.searchParams.get('state') });
      assert.equal(account.platform, 'threads');
      assert.equal(account.accountId, '1781');
      assert.equal(account.accountName, '@acme_threads');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('publishThreadsPost uses the create-container then publish flow', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/threads')) return Response.json({ id: 'container_1' });
    if (String(url).endsWith('/threads_publish')) return Response.json({ id: 'thread_1' });
    return Response.json({}, { status: 404 });
  };

  try {
    const result = await publishThreadsPost({
      post: {
        _id: 'post_threads',
        caption: 'Thread this update',
        hashtags: ['#Launch'],
        media: [{ fileType: 'image', fileUrl: 'https://cdn.example.test/thread.jpg' }]
      },
      account: {
        accountId: '1781',
        accessTokenEncrypted: encryptToken('threads_access'),
        tokenExpiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
      }
    });

    assert.equal(result.id, 'thread_1');
    assert.equal(calls[0].url, 'https://graph.threads.net/v1.0/1781/threads');
    assert.match(String(calls[0].options.body), /media_type=IMAGE/);
    assert.match(String(calls[0].options.body), /image_url=https%3A%2F%2Fcdn.example.test%2Fthread.jpg/);
    assert.equal(calls[1].url, 'https://graph.threads.net/v1.0/1781/threads_publish');
    assert.match(String(calls[1].options.body), /creation_id=container_1/);
  } finally {
    global.fetch = originalFetch;
  }
});
