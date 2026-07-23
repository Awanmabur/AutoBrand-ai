const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

process.env.TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || 'test-token-encryption-key-'.padEnd(48, 'x');

const root = path.join(__dirname, '..');

function readEnv(extra = {}) {
  const script = `const e=require('./src/config/env'); console.log(JSON.stringify({paused:e.publishingPaused, scheduled:e.scheduledPublishingEnabled, mode:e.aiGenerationWorkerMode, web:e.runAiGenerationWorkerInWeb, app:e.appUrl, public:e.publicAppUrl, meta:e.facebookGraphVersion, linkedin:e.linkedinVersion}));`;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'development',
      TOKEN_ENCRYPTION_KEY: 'test-token-encryption-key-'.padEnd(48, 'x'),
      PORT: '3200',
      ...extra
    },
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test('legacy false flags cannot silently disable publishing or AI generation', () => {
  const config = readEnv({
    ENABLE_SCHEDULED_PUBLISHING: 'false',
    RUN_AI_GENERATION_WORKER_IN_WEB: 'false'
  });
  assert.equal(config.scheduled, true);
  assert.equal(config.paused, false);
  assert.equal(config.mode, 'web');
  assert.equal(config.web, true);
});

test('explicit maintenance controls remain available', () => {
  const config = readEnv({
    PAUSE_PUBLISHING: 'true',
    AI_GENERATION_WORKER_MODE: 'off'
  });
  assert.equal(config.scheduled, false);
  assert.equal(config.paused, true);
  assert.equal(config.mode, 'off');
  assert.equal(config.web, false);
});

test('PUBLIC_APP_URL supplies canonical callback origin and current provider versions', () => {
  const config = readEnv({ PUBLIC_APP_URL: 'https://social.example.test/' });
  assert.equal(config.app, 'https://social.example.test');
  assert.equal(config.public, 'https://social.example.test/');
  assert.equal(config.meta, 'v25.0');
  assert.equal(config.linkedin, '202607');
});

test('local media paths become externally reachable URLs only with a public origin', () => {
  const script = `const s=require('./src/services/publicMediaUrlService'); console.log(JSON.stringify({url:s.publicMediaUrl('/uploads/demo.jpg'), ok:s.isPublicHttpUrl(s.publicMediaUrl('/uploads/demo.jpg'))}));`;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: root,
    env: { PATH: process.env.PATH, NODE_ENV: 'development', TOKEN_ENCRYPTION_KEY: 'test-token-encryption-key-'.padEnd(48, 'x'), PUBLIC_APP_URL: 'https://social.example.test' },
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout.trim());
  assert.equal(output.url, 'https://social.example.test/uploads/demo.jpg');
  assert.equal(output.ok, true);
});

test('Kampala calendar time converts consistently on UTC hosts', () => {
  const script = `const {zonedLocalTimeToUtc}=require('./src/utils/timeZone'); console.log(zonedLocalTimeToUtc({year:2026,month:7,day:23,hour:9,minute:0,timeZone:'Africa/Kampala'}).toISOString());`;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: root,
    env: { PATH: process.env.PATH, TZ: 'UTC', NODE_ENV: 'development', TOKEN_ENCRYPTION_KEY: 'test-token-encryption-key-'.padEnd(48, 'x') },
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '2026-07-23T06:00:00.000Z');
});


test('X reconnects old OAuth grants before media publishing', async () => {
  const { encryptToken } = require('../src/services/tokenCryptoService');
  const { publishXPost } = require('../src/services/xService');
  await assert.rejects(
    publishXPost({
      post: {
        _id: 'post_x_old_scope',
        caption: 'Image update',
        media: [{ fileType: 'image', fileUrl: 'https://cdn.example.test/image.jpg', mimeType: 'image/jpeg' }]
      },
      account: {
        accessTokenEncrypted: encryptToken('x_access'),
        permissions: ['tweet.read', 'tweet.write', 'users.read', 'offline.access']
      }
    }),
    /Reconnect the X account.*media\.write/
  );
});

test('X publishing uploads attached images before creating the post', async () => {
  const { encryptToken } = require('../src/services/tokenCryptoService');
  const { publishXPost } = require('../src/services/xService');
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/2/media/upload')) return Response.json({ data: { id: 'media_1' } });
    if (String(url).endsWith('/2/tweets')) return Response.json({ data: { id: 'tweet_media_1' } });
    return Response.json({ detail: 'not found' }, { status: 404 });
  };
  try {
    const result = await publishXPost({
      post: {
        _id: 'post_x_media',
        caption: 'Visual update',
        media: [{ fileType: 'image', fileUrl: 'https://cdn.example.test/image.jpg', mimeType: 'image/jpeg' }]
      },
      account: { accessTokenEncrypted: encryptToken('x_access') },
      downloadRemote: async () => ({ buffer: Buffer.from('image-bytes'), size: 11, mimeType: 'image/jpeg' })
    });
    assert.equal(result.id, 'tweet_media_1');
    assert.equal(result.platformPostUrl, 'https://x.com/i/web/status/tweet_media_1');
    const uploadBody = JSON.parse(calls[0].options.body);
    assert.equal(uploadBody.media_category, 'tweet_image');
    assert.equal(uploadBody.media, Buffer.from('image-bytes').toString('base64'));
    const postBody = JSON.parse(calls[1].options.body);
    assert.deepEqual(postBody.media.media_ids, ['media_1']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('X publishing uses chunked upload for attached video', async () => {
  const { encryptToken } = require('../src/services/tokenCryptoService');
  const { publishXPost } = require('../src/services/xService');
  const uploadSteps = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.endsWith('/2/media/upload/initialize')) {
      uploadSteps.push('initialize');
      const body = JSON.parse(options.body);
      assert.equal(body.media_category, 'tweet_video');
      return Response.json({ data: { id: 'video_media_1' } });
    }
    if (target.endsWith('/2/media/upload/video_media_1/append')) {
      uploadSteps.push('append');
      assert.equal(options.body instanceof FormData, true);
      assert.equal(options.body.get('segment_index'), '0');
      return new Response('', { status: 200 });
    }
    if (target.endsWith('/2/media/upload/video_media_1/finalize')) {
      uploadSteps.push('finalize');
      return Response.json({ data: { id: 'video_media_1', processing_info: { state: 'succeeded' } } });
    }
    if (target.endsWith('/2/tweets')) {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.media.media_ids, ['video_media_1']);
      return Response.json({ data: { id: 'tweet_video_1' } });
    }
    return Response.json({ detail: 'not found' }, { status: 404 });
  };
  try {
    const result = await publishXPost({
      post: {
        _id: 'post_x_video',
        caption: 'Video update',
        media: [{ fileType: 'video', fileUrl: 'https://cdn.example.test/video.mp4', mimeType: 'video/mp4', fileName: 'video.mp4' }]
      },
      account: { accessTokenEncrypted: encryptToken('x_access') },
      downloadRemote: async () => ({ buffer: Buffer.from('small-video'), size: 11, mimeType: 'video/mp4' })
    });
    assert.equal(result.id, 'tweet_video_1');
    assert.deepEqual(uploadSteps, ['initialize', 'append', 'finalize']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('a stale localhost PUBLIC_APP_URL does not hide a valid public APP_URL', () => {
  const script = `const s=require('./src/services/publicMediaUrlService'); console.log(s.publicMediaUrl('/uploads/demo.jpg'));`;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'development',
      TOKEN_ENCRYPTION_KEY: 'test-token-encryption-key-'.padEnd(48, 'x'),
      PUBLIC_APP_URL: 'http://localhost:3200',
      APP_URL: 'https://public-app.example.test'
    },
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'https://public-app.example.test/uploads/demo.jpg');
});
