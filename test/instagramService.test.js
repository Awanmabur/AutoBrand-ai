const test = require('node:test');
const assert = require('node:assert/strict');

const { publishInstagramPost } = require('../src/services/instagramService');
const { encryptToken } = require('../src/services/tokenCryptoService');

test('publishInstagramPost publishes a single image through Instagram media containers', async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: options.body?.toString() || '' });
    if (String(url).endsWith('/ig_1/media')) return Response.json({ id: 'container_1' });
    if (String(url).endsWith('/ig_1/media_publish')) return Response.json({ id: 'ig_post_1' });
    return Response.json({}, { status: 404 });
  };

  try {
    const result = await publishInstagramPost({
      post: {
        _id: 'post_ig_image',
        type: 'image',
        caption: 'Instagram image',
        hashtags: ['#AutoBrand'],
        media: [{ fileType: 'image', fileUrl: 'https://cdn.example.test/image.jpg' }]
      },
      account: {
        accountId: 'ig_1',
        accessTokenEncrypted: encryptToken('ig_page_token')
      }
    });

    assert.equal(result.id, 'ig_post_1');
    const createBody = new URLSearchParams(calls[0].body);
    assert.equal(createBody.get('image_url'), 'https://cdn.example.test/image.jpg');
    assert.equal(createBody.get('caption'), 'Instagram image\n\n#AutoBrand');
    assert.equal(createBody.get('access_token'), 'ig_page_token');
    const publishBody = new URLSearchParams(calls[1].body);
    assert.equal(publishBody.get('creation_id'), 'container_1');
  } finally {
    global.fetch = originalFetch;
  }
});

test('publishInstagramPost creates child containers for carousel images', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  let nextId = 1;

  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: options.body?.toString() || '' });
    if (String(url).endsWith('/ig_1/media')) return Response.json({ id: `container_${nextId++}` });
    if (String(url).endsWith('/ig_1/media_publish')) return Response.json({ id: 'ig_carousel_1' });
    return Response.json({}, { status: 404 });
  };

  try {
    const result = await publishInstagramPost({
      post: {
        _id: 'post_ig_carousel',
        type: 'carousel',
        caption: 'Instagram carousel',
        media: [
          { fileType: 'image', fileUrl: 'https://cdn.example.test/one.jpg' },
          { fileType: 'image', fileUrl: 'https://cdn.example.test/two.jpg' }
        ]
      },
      account: {
        accountId: 'ig_1',
        accessTokenEncrypted: encryptToken('ig_page_token')
      }
    });

    assert.equal(result.id, 'ig_carousel_1');
    assert.equal(calls.length, 4);
    assert.equal(new URLSearchParams(calls[0].body).get('is_carousel_item'), 'true');
    assert.equal(new URLSearchParams(calls[1].body).get('is_carousel_item'), 'true');
    const parentBody = new URLSearchParams(calls[2].body);
    assert.equal(parentBody.get('media_type'), 'CAROUSEL');
    assert.equal(parentBody.get('children'), 'container_1,container_2');
  } finally {
    global.fetch = originalFetch;
  }
});
