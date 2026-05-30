const test = require('node:test');
const assert = require('node:assert/strict');

const env = require('../src/config/env');
const { publishYouTubeVideo } = require('../src/services/youtubeService');
const { encryptToken } = require('../src/services/tokenCryptoService');

test('publishYouTubeVideo uploads a public video URL through YouTube resumable upload', async () => {
  const originalFetch = global.fetch;
  const originalPrivacy = env.youtubeDefaultPrivacy;
  const calls = [];
  const videoBytes = Buffer.from('fake mp4 bytes');
  env.youtubeDefaultPrivacy = 'public';

  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === 'https://cdn.example.test/video.mp4') {
      return new Response(videoBytes, {
        status: 200,
        headers: { 'content-type': 'video/mp4' }
      });
    }
    if (String(url).includes('/upload/youtube/v3/videos')) {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { location: 'https://upload.youtube.test/session' }
      });
    }
    if (String(url) === 'https://upload.youtube.test/session') {
      return Response.json({ id: 'youtube_video_1' });
    }
    return Response.json({}, { status: 404 });
  };

  try {
    const result = await publishYouTubeVideo({
      post: {
        _id: 'post_youtube_remote',
        type: 'video',
        title: 'Remote video',
        caption: 'Uploaded to YouTube',
        hashtags: ['#School'],
        media: [{ fileType: 'video', fileUrl: 'https://cdn.example.test/video.mp4', mimeType: 'video/mp4' }]
      },
      account: {
        accessTokenEncrypted: encryptToken('youtube_access_token')
      }
    });

    assert.equal(result.id, 'youtube_video_1');
    assert.equal(calls[1].options.headers['X-Upload-Content-Type'], 'video/mp4');
    assert.match(calls[1].url, /\/upload\/youtube\/v3\/videos/);
    assert.equal(calls[1].options.headers['X-Upload-Content-Length'], String(videoBytes.length));
    const metadata = JSON.parse(calls[1].options.body);
    assert.equal(metadata.snippet.title, 'Remote video');
    assert.equal(metadata.snippet.categoryId, '22');
    assert.equal(metadata.status.privacyStatus, 'public');
    assert.equal(metadata.status.selfDeclaredMadeForKids, undefined);
    assert.equal(metadata.snippet.tags, undefined);
    assert.equal(calls[2].options.method, 'PUT');
    assert.equal(calls[2].options.body.length, videoBytes.length);
  } finally {
    global.fetch = originalFetch;
    env.youtubeDefaultPrivacy = originalPrivacy;
  }
});

test('publishYouTubeVideo includes detailed Google API upload session errors', async () => {
  const originalFetch = global.fetch;
  const videoBytes = Buffer.from('fake mp4 bytes');

  global.fetch = async (url) => {
    if (String(url) === 'https://cdn.example.test/video.mp4') {
      return new Response(videoBytes, {
        status: 200,
        headers: { 'content-type': 'video/mp4' }
      });
    }
    if (String(url).includes('/upload/youtube/v3/videos')) {
      return Response.json({
        error: {
          message: 'Request contains an invalid argument.',
          errors: [{ reason: 'invalidCategoryId', message: 'Invalid category.' }]
        }
      }, { status: 400 });
    }
    return Response.json({}, { status: 404 });
  };

  try {
    await assert.rejects(
      () => publishYouTubeVideo({
        post: {
          _id: 'post_youtube_error',
          type: 'video',
          title: 'Remote video',
          caption: 'Uploaded to YouTube',
          media: [{ fileType: 'video', fileUrl: 'https://cdn.example.test/video.mp4', mimeType: 'video/mp4' }]
        },
        account: {
          accessTokenEncrypted: encryptToken('youtube_access_token')
        }
      }),
      /invalidCategoryId: Invalid category/
    );
  } finally {
    global.fetch = originalFetch;
  }
});
