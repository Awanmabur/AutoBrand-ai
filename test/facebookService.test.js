const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const env = require('../src/config/env');
const { cloudinary } = require('../src/config/cloudinary');
const {
  buildFacebookAuthUrl,
  connectFacebookPageToken,
  exchangeCodeForPageAccounts,
  facebookConnectionChecklist,
  publishFacebookPost
} = require('../src/services/facebookService');
const { decryptToken, encryptToken } = require('../src/services/tokenCryptoService');

function facebookState() {
  const url = new URL(buildFacebookAuthUrl({
    brandId: '507f1f77bcf86cd799439011',
    userId: '507f1f77bcf86cd799439012'
  }));
  return url.searchParams.get('state');
}

test('buildFacebookAuthUrl uses configured app and callback', () => {
  env.facebookAppId = 'app_123';
  env.facebookAppSecret = 'secret_123';
  env.facebookCallbackUrl = 'http://localhost:3100/social/facebook/callback';
  env.facebookLoginConfigId = '';
  env.facebookAllowClassicOAuth = true;
  env.facebookScopes = 'pages_show_list,pages_manage_posts,pages_read_engagement';

  const url = new URL(buildFacebookAuthUrl({ brandId: 'brand', userId: 'user' }));

  assert.equal(url.host, 'www.facebook.com');
  assert.equal(url.pathname, '/v20.0/dialog/oauth');
  assert.equal(url.searchParams.get('client_id'), 'app_123');
  assert.equal(url.searchParams.get('redirect_uri'), env.facebookCallbackUrl);
  assert.match(url.searchParams.get('scope'), /pages_manage_posts/);
  assert.doesNotMatch(url.searchParams.get('scope'), /instagram_content_publish/);
  assert.doesNotMatch(url.searchParams.get('scope'), /whatsapp_business_messaging/);
});

test('Facebook config accepts META_* environment aliases from .env', () => {
  const original = {
    facebookAppId: env.facebookAppId,
    facebookAppSecret: env.facebookAppSecret,
    facebookCallbackUrl: env.facebookCallbackUrl
  };

  env.facebookAppId = 'meta_app';
  env.facebookAppSecret = 'meta_secret';
  env.facebookCallbackUrl = 'http://localhost:3100/social/facebook/callback';

  try {
    assert.equal(buildFacebookAuthUrl({ brandId: 'brand', userId: 'user' }).includes('client_id=meta_app'), true);
  } finally {
    Object.assign(env, original);
  }
});

test('buildFacebookAuthUrl uses Business Login config when configured', () => {
  env.facebookAppId = 'app_123';
  env.facebookAppSecret = 'secret_123';
  env.facebookCallbackUrl = 'http://localhost:3100/social/facebook/callback';
  env.facebookLoginConfigId = 'config_123';
  env.facebookAllowClassicOAuth = false;

  const url = new URL(buildFacebookAuthUrl({ brandId: 'brand', userId: 'user' }));

  assert.equal(url.searchParams.get('config_id'), 'config_123');
  assert.equal(url.searchParams.get('override_default_response_type'), 'true');
  assert.equal(url.searchParams.get('scope'), null);
});

test('facebookConnectionChecklist validates callback domain against configured app domains', () => {
  env.facebookAppId = 'app_123';
  env.facebookAppSecret = 'secret_123';
  env.facebookCallbackUrl = 'https://app.autobrand.test/social/facebook/callback';
  env.facebookLoginConfigId = 'config_123';
  env.facebookAllowClassicOAuth = false;
  env.facebookAppDomains = ['autobrand.test'];

  const setup = facebookConnectionChecklist();

  assert.equal(setup.callbackDomain, 'app.autobrand.test');
  assert.equal(setup.validOAuthRedirectUri, env.facebookCallbackUrl);
  assert.equal(setup.appDomainReady, true);
  assert.equal(setup.canStartOAuth, true);
});

test('facebookConnectionChecklist blocks OAuth when callback domain is not in app domains', () => {
  env.facebookAppId = 'app_123';
  env.facebookAppSecret = 'secret_123';
  env.facebookCallbackUrl = 'https://wrong.test/social/facebook/callback';
  env.facebookLoginConfigId = 'config_123';
  env.facebookAllowClassicOAuth = false;
  env.facebookAppDomains = ['autobrand.test'];

  const setup = facebookConnectionChecklist();

  assert.equal(setup.appDomainReady, false);
  assert.equal(setup.canStartOAuth, false);
  assert.match(setup.issues.join(' '), /FACEBOOK_CALLBACK_URL uses wrong.test/);
});

test('facebookConnectionChecklist allows localhost callback during development', () => {
  env.facebookAppId = 'app_123';
  env.facebookAppSecret = 'secret_123';
  env.facebookCallbackUrl = 'http://localhost:3100/social/facebook/callback';
  env.facebookLoginConfigId = '';
  env.facebookAllowClassicOAuth = true;
  env.facebookAppDomains = [];

  const setup = facebookConnectionChecklist();

  assert.equal(setup.localCallback, true);
  assert.equal(setup.canStartOAuth, true);
});

test('exchangeCodeForPageAccounts exchanges code and maps pages', async () => {
  env.facebookAppId = 'app_123';
  env.facebookAppSecret = 'secret_123';
  env.facebookCallbackUrl = 'http://localhost:3100/social/facebook/callback';
  env.facebookLoginConfigId = '';
  env.facebookAllowClassicOAuth = true;
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/oauth/access_token')) {
      return Response.json({ access_token: 'user_token', expires_in: 3600 });
    }
    if (String(url).includes('/page_1')) {
      return Response.json({}, { status: 403 });
    }
    return Response.json({
      data: [
        { id: 'page_1', name: 'Page One', access_token: 'page_token', tasks: ['CREATE_CONTENT'] }
      ]
    });
  };

  try {
    const accounts = await exchangeCodeForPageAccounts({ code: 'code_123', state: facebookState() });
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].accountId, 'page_1');
    assert.equal(accounts[0].accountName, 'Page One');
    assert.equal(accounts[0].status, 'connected');
    assert.ok(accounts[0].accessTokenEncrypted);
    assert.equal(calls.length, 3);
    assert.match(calls[1], /fields=id%2Cname%2Caccess_token%2Ctasks/);
    assert.doesNotMatch(calls[1], /instagram_business_account/);
    assert.match(calls[2], /instagram_business_account/);
    assert.doesNotMatch(calls[1], /perms/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('exchangeCodeForPageAccounts also maps linked Instagram assets from Meta', async () => {
  env.facebookAppId = 'app_123';
  env.facebookAppSecret = 'secret_123';
  env.facebookCallbackUrl = 'http://localhost:3100/social/facebook/callback';
  env.facebookLoginConfigId = '';
  env.facebookAllowClassicOAuth = true;
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    const target = String(url);
    if (target.includes('/oauth/access_token')) {
      return Response.json({ access_token: 'user_token', expires_in: 3600 });
    }
    if (target.includes('/me/accounts')) {
      return Response.json({
        data: [{
          id: 'page_1',
          name: 'Page One',
          access_token: 'page_token',
          tasks: ['CREATE_CONTENT']
        }]
      });
    }
    if (target.includes('/page_1')) {
      return Response.json({ instagram_business_account: { id: 'ig_1', username: 'classicacademy' } });
    }
    return Response.json({}, { status: 404 });
  };

  try {
    const accounts = await exchangeCodeForPageAccounts({ code: 'code_123', state: facebookState() });
    assert.equal(accounts.length, 2);
    assert.equal(accounts.find((account) => account.platform === 'facebook').accountId, 'page_1');
    assert.equal(accounts.find((account) => account.platform === 'instagram').accountId, 'ig_1');
    assert.equal(accounts.find((account) => account.platform === 'instagram').accountName, '@classicacademy');
  } finally {
    global.fetch = originalFetch;
  }
});

test('exchangeCodeForPageAccounts rejects unsigned state', async () => {
  env.facebookAppId = 'app_123';
  env.facebookAppSecret = 'secret_123';
  env.facebookCallbackUrl = 'http://localhost:3100/social/facebook/callback';
  env.facebookLoginConfigId = '';

  await assert.rejects(
    () => exchangeCodeForPageAccounts({ code: 'code_123', state: Buffer.from('{}').toString('base64url') }),
    /state is missing or invalid/
  );
});

test('connectFacebookPageToken validates token and maps Page', async () => {
  const originalFetch = global.fetch;
  let requestUrl = '';

  global.fetch = async (url) => {
    requestUrl = String(url);
    return Response.json({ id: 'page_manual', name: 'Manual Page', tasks: ['CREATE_CONTENT'] });
  };

  try {
    const account = await connectFacebookPageToken({
      brandId: 'brand_1',
      userId: 'user_1',
      pageAccessToken: 'manual_page_token'
    });

    assert.match(requestUrl, /\/me\?/);
    assert.match(requestUrl, /access_token=manual_page_token/);
    assert.equal(account.accountId, 'page_manual');
    assert.equal(account.accountName, 'Manual Page');
    assert.equal(account.status, 'connected');
    assert.equal(decryptToken(account.accessTokenEncrypted), 'manual_page_token');
  } finally {
    global.fetch = originalFetch;
  }
});

test('publishFacebookPost posts to feed with decrypted page token', async () => {
  env.facebookAppId = 'app_123';
  env.facebookAppSecret = 'secret_123';
  env.facebookCallbackUrl = 'http://localhost:3100/social/facebook/callback';
  env.facebookLoginConfigId = '';
  const originalFetch = global.fetch;
  let bodyText = '';
  let requestUrl = '';

  global.fetch = async (url, options) => {
    requestUrl = String(url);
    bodyText = options.body.toString();
    return Response.json({ id: 'page_1_post_1' });
  };

  try {
    const result = await publishFacebookPost({
      post: { _id: 'post_1', caption: 'Hello Facebook', hashtags: ['#AutoBrand'], media: [] },
      account: {
        accountId: 'page_1',
        status: 'connected',
        accessTokenEncrypted: encryptToken('page_token')
      }
    });

    assert.equal(result.id, 'page_1_post_1');
    assert.match(requestUrl, /\/page_1\/feed$/);
    assert.match(bodyText, /message=Hello\+Facebook/);
    assert.match(bodyText, /access_token=page_token/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('publishFacebookPost posts multiple images as a Facebook carousel', async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: options.body?.toString() || '' });
    return Response.json({ id: 'page_1_carousel_1' });
  };

  try {
    const result = await publishFacebookPost({
      post: {
        _id: 'post_2',
        caption: 'Carousel',
        title: 'Carousel title',
        description: 'Carousel description',
        hashtags: ['#Slides'],
        link: 'https://example.test',
        media: [
          { fileType: 'image', fileUrl: 'https://example.test/one.png' },
          { fileType: 'image', fileUrl: 'https://example.test/two.png' }
        ]
      },
      account: {
        accountId: 'page_1',
        status: 'connected',
        accessTokenEncrypted: encryptToken('page_token')
      }
    });

    assert.equal(result.id, 'page_1_carousel_1');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/page_1\/feed$/);
    const body = new URLSearchParams(calls[0].body);
    const cards = JSON.parse(body.get('child_attachments'));
    assert.equal(cards.length, 2);
    assert.equal(cards[0].picture, 'https://example.test/one.png');
    assert.equal(cards[1].picture, 'https://example.test/two.png');
    assert.equal(body.get('multi_share_optimized'), 'false');
    assert.equal(body.has('attached_media'), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('publishFacebookPost uploads local carousel images to Cloudinary before posting cards', async () => {
  const originalFetch = global.fetch;
  const originalUpload = cloudinary.uploader.upload;
  const originalCloudName = env.cloudinaryCloudName;
  const originalApiKey = env.cloudinaryApiKey;
  const originalApiSecret = env.cloudinaryApiSecret;
  const localDir = path.join(__dirname, '..', 'public', 'uploads', 'ai');
  const localFile = path.join(localDir, 'carousel-local-test.png');
  const calls = [];
  const uploads = [];

  await fs.mkdir(localDir, { recursive: true });
  await fs.writeFile(localFile, Buffer.from('not-a-real-image'));

  env.cloudinaryCloudName = 'cloud';
  env.cloudinaryApiKey = 'key';
  env.cloudinaryApiSecret = 'secret';
  cloudinary.uploader.upload = async (filePath) => {
    uploads.push(filePath);
    return {
      secure_url: `https://res.cloudinary.com/demo/${uploads.length}.jpg`,
      public_id: `demo/${uploads.length}`
    };
  };
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: options.body?.toString() || '' });
    return Response.json({ id: 'page_1_carousel_local' });
  };

  try {
    const result = await publishFacebookPost({
      post: {
        _id: 'post_local_carousel',
        type: 'carousel',
        caption: 'Local carousel',
        link: 'https://example.test',
        media: [
          { fileType: 'image', fileUrl: '/uploads/ai/carousel-local-test.png' },
          { fileType: 'image', fileUrl: '/uploads/ai/carousel-local-test.png' }
        ]
      },
      account: {
        accountId: 'page_1',
        status: 'connected',
        accessTokenEncrypted: encryptToken('page_token')
      }
    });

    const body = new URLSearchParams(calls[0].body);
    const cards = JSON.parse(body.get('child_attachments'));
    assert.equal(result.id, 'page_1_carousel_local');
    assert.equal(uploads.length, 2);
    assert.equal(cards[0].picture, 'https://res.cloudinary.com/demo/1.jpg');
    assert.equal(cards[1].picture, 'https://res.cloudinary.com/demo/2.jpg');
  } finally {
    global.fetch = originalFetch;
    cloudinary.uploader.upload = originalUpload;
    env.cloudinaryCloudName = originalCloudName;
    env.cloudinaryApiKey = originalApiKey;
    env.cloudinaryApiSecret = originalApiSecret;
    await fs.unlink(localFile).catch(() => {});
  }
});

test('publishFacebookPost posts requested multi-image image posts to Facebook feed', async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options) => {
    calls.push({ url: String(url), body: options.body?.toString() || '' });
    if (String(url).endsWith('/photos')) {
      return Response.json({ id: `photo_${calls.length}` });
    }
    return Response.json({ id: 'page_1_gallery_1' });
  };

  try {
    const result = await publishFacebookPost({
      post: {
        _id: 'post_2b',
        type: 'image',
        caption: 'Image set',
        media: [
          { fileType: 'image', fileUrl: 'https://example.test/one.png' },
          { fileType: 'image', fileUrl: 'https://example.test/two.png' }
        ]
      },
      account: {
        accountId: 'page_1',
        status: 'connected',
        accessTokenEncrypted: encryptToken('page_token')
      }
    });

    assert.equal(result.id, 'page_1_gallery_1');
    assert.equal(calls.length, 3);
    assert.match(calls[0].url, /\/page_1\/photos$/);
    assert.match(calls[1].url, /\/page_1\/photos$/);
    assert.match(calls[2].url, /\/page_1\/feed$/);
    assert.match(calls[2].body, /attached_media/);
  } finally {
    global.fetch = originalFetch;
  }
});
test('publishFacebookPost posts video media to Facebook videos', async () => {
  const originalFetch = global.fetch;
  let requestUrl = '';
  let bodyText = '';

  global.fetch = async (url, options) => {
    requestUrl = String(url);
    bodyText = options.body.toString();
    return Response.json({ id: 'page_1_video_1' });
  };

  try {
    const result = await publishFacebookPost({
      post: {
        _id: 'post_3',
        caption: 'Video',
        hashtags: ['#Watch'],
        media: [{ fileType: 'video', fileUrl: 'https://example.test/video.mp4' }]
      },
      account: {
        accountId: 'page_1',
        status: 'connected',
        accessTokenEncrypted: encryptToken('page_token')
      }
    });

    assert.equal(result.id, 'page_1_video_1');
    assert.match(requestUrl, /\/page_1\/videos$/);
    assert.match(bodyText, /file_url=https%3A%2F%2Fexample.test%2Fvideo.mp4/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('publishFacebookPost uploads local video files with an mp4 filename', async () => {
  const originalFetch = global.fetch;
  const originalCloudName = env.cloudinaryCloudName;
  const originalApiKey = env.cloudinaryApiKey;
  const originalApiSecret = env.cloudinaryApiSecret;
  const localDir = path.join(__dirname, '..', 'public', 'uploads', 'ai');
  const localFile = path.join(localDir, 'fb-video-upload-test.mp4');
  let uploadedFile;

  env.cloudinaryCloudName = '';
  env.cloudinaryApiKey = '';
  env.cloudinaryApiSecret = '';

  await fs.mkdir(localDir, { recursive: true });
  await fs.writeFile(localFile, Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31
  ]));

  global.fetch = async (url, options) => {
    uploadedFile = options.body.get('source');
    return Response.json({ id: 'page_1_video_local' });
  };

  try {
    const result = await publishFacebookPost({
      post: {
        _id: 'post_3_local',
        type: 'video',
        caption: 'Local video',
        media: [{
          fileType: 'video',
          fileUrl: '/uploads/ai/fb-video-upload-test.mp4',
          fileName: 'Generated Video',
          mimeType: 'video/mp4'
        }]
      },
      account: {
        accountId: 'page_1',
        status: 'connected',
        accessTokenEncrypted: encryptToken('page_token')
      }
    });

    assert.equal(result.id, 'page_1_video_local');
    assert.equal(uploadedFile.type, 'video/mp4');
    assert.match(uploadedFile.name, /\.mp4$/);
  } finally {
    global.fetch = originalFetch;
    env.cloudinaryCloudName = originalCloudName;
    env.cloudinaryApiKey = originalApiKey;
    env.cloudinaryApiSecret = originalApiSecret;
    await fs.unlink(localFile).catch(() => {});
  }
});

test('publishFacebookPost uploads local video to Cloudinary before Facebook publish when configured', async () => {
  const originalFetch = global.fetch;
  const originalUpload = cloudinary.uploader.upload;
  const originalCloudName = env.cloudinaryCloudName;
  const originalApiKey = env.cloudinaryApiKey;
  const originalApiSecret = env.cloudinaryApiSecret;
  const localDir = path.join(__dirname, '..', 'public', 'uploads', 'ai');
  const localFile = path.join(localDir, 'fb-video-cloudinary-test.mp4');
  const uploads = [];
  let bodyText = '';

  await fs.mkdir(localDir, { recursive: true });
  await fs.writeFile(localFile, Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31
  ]));

  env.cloudinaryCloudName = 'cloud';
  env.cloudinaryApiKey = 'key';
  env.cloudinaryApiSecret = 'secret';
  cloudinary.uploader.upload = async (filePath, options) => {
    uploads.push({ filePath, options });
    return {
      secure_url: 'https://res.cloudinary.com/demo/video/upload/fb-video-cloudinary-test.mp4',
      public_id: 'demo/fb-video-cloudinary-test',
      bytes: 24
    };
  };
  global.fetch = async (url, options) => {
    bodyText = options.body.toString();
    return Response.json({ id: 'page_1_video_cloudinary' });
  };

  try {
    const result = await publishFacebookPost({
      post: {
        _id: 'post_3_cloudinary',
        type: 'video',
        caption: 'Cloudinary video',
        media: [{
          fileType: 'video',
          fileUrl: '/uploads/ai/fb-video-cloudinary-test.mp4',
          fileName: 'Generated Video.mp4',
          mimeType: 'video/mp4'
        }]
      },
      account: {
        accountId: 'page_1',
        status: 'connected',
        accessTokenEncrypted: encryptToken('page_token')
      }
    });

    assert.equal(result.id, 'page_1_video_cloudinary');
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].options.resource_type, 'video');
    assert.match(bodyText, /file_url=https%3A%2F%2Fres.cloudinary.com%2Fdemo%2Fvideo%2Fupload%2Ffb-video-cloudinary-test.mp4/);
  } finally {
    global.fetch = originalFetch;
    cloudinary.uploader.upload = originalUpload;
    env.cloudinaryCloudName = originalCloudName;
    env.cloudinaryApiKey = originalApiKey;
    env.cloudinaryApiSecret = originalApiSecret;
    await fs.unlink(localFile).catch(() => {});
  }
});

test('publishFacebookPost rejects video posts that only have image media', async () => {
  await assert.rejects(
    () => publishFacebookPost({
      post: {
        _id: 'post_video_missing_mp4',
        type: 'video',
        caption: 'Needs video',
        media: [{ fileType: 'image', fileUrl: 'https://example.test/cover.png' }]
      },
      account: {
        accountId: 'page_1',
        status: 'connected',
        accessTokenEncrypted: encryptToken('page_token')
      }
    }),
    /Video posts require a video media file/
  );
});
