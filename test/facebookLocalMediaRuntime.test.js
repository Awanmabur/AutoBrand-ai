const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const Module = require('node:module');
const path = require('node:path');

const root = path.join(__dirname, '..');

async function withMockedModule(relativePath, mocks, callback) {
  const absolute = path.join(root, relativePath);
  delete require.cache[require.resolve(absolute)];
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return await callback(require(absolute));
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve(absolute)];
  }
}

test('Facebook Page publishing uploads an existing localhost image as multipart bytes', async () => {
  const relativeUrl = '/uploads/test-facebook-local.jpg';
  const absolutePath = path.join(root, 'public', 'uploads', 'test-facebook-local.jpg');
  await fs.writeFile(absolutePath, Buffer.from('local-facebook-image'));
  const requests = [];

  try {
    await withMockedModule('src/services/facebookService.js', {
      '../utils/fetchWithTimeout': {
        fetchWithTimeout: async (url, options = {}) => {
          requests.push({ url: String(url), options });
          return new Response(JSON.stringify({ id: 'facebook_photo_1' }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
      },
      '../config/env': {
        facebookGraphVersion: 'v25.0',
        facebookScopes: '',
        facebookAppDomains: [],
        csrfSecret: 'a'.repeat(32),
        cookieSecret: 'b'.repeat(32),
        jwtRefreshSecret: 'c'.repeat(32),
        appUrl: 'http://localhost:3200',
        publicAppUrl: 'http://localhost:3200'
      },
      '../config/cloudinary': {
        cloudinary: { uploader: { upload: async () => ({}) } },
        isCloudinaryConfigured: () => false
      },
      './tokenCryptoService': {
        decryptToken: () => 'page-access-token',
        encryptToken: (value) => value
      }
    }, async ({ publishFacebookPost }) => {
      const result = await publishFacebookPost({
        post: {
          _id: 'post_fb_local',
          type: 'image',
          caption: 'Local image post',
          hashtags: [],
          media: [{
            fileType: 'image',
            fileUrl: relativeUrl,
            fileName: 'local.jpg',
            mimeType: 'image/jpeg'
          }]
        },
        account: {
          status: 'connected',
          accountId: 'page_123',
          accessTokenEncrypted: 'encrypted'
        }
      });
      assert.equal(result.id, 'facebook_photo_1');
    });

    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /graph\.facebook\.com\/v25\.0\/page_123\/photos/);
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(requests[0].options.body instanceof FormData, true);
    assert.equal(requests[0].options.body.get('access_token'), 'page-access-token');
    assert.ok(requests[0].options.body.get('source'));
  } finally {
    await fs.rm(absolutePath, { force: true });
  }
});
