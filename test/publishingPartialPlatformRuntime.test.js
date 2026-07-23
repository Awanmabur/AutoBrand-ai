const test = require('node:test');
const assert = require('node:assert/strict');
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

function queryResult(value) {
  return {
    populate() { return this; },
    sort() { return this; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
  };
}

test('an Instagram media blocker does not prevent a ready Facebook Page from publishing', async () => {
  const calls = { facebook: 0, instagram: 0 };
  const account = {
    _id: 'fb_account_1',
    platform: 'facebook',
    accountName: 'Real Page',
    status: 'connected',
    providerMeta: {},
    async save() {}
  };
  const post = {
    _id: 'post_1',
    brand: { _id: 'brand_1' },
    createdBy: 'user_1',
    platform: 'facebook',
    platforms: ['facebook', 'instagram'],
    type: 'image',
    caption: 'A real post',
    hashtags: [],
    media: [{ _id: 'media_1', fileType: 'image', fileUrl: '/uploads/ai/image.png' }],
    targetAccounts: ['fb_account_1', 'ig_account_1'],
    status: 'publishing',
    scheduleVersion: 1,
    platformMetadata: {},
    publishResults: [],
    validationWarnings: [],
    toObject() { return { ...this }; },
    async save() {},
  };

  const Post = {
    findOneAndUpdate: async () => ({ _id: post._id }),
    findById: () => queryResult(post)
  };
  const SocialAccount = {
    find(filter) {
      return queryResult(filter.platform === 'facebook' ? [account] : []);
    }
  };

  await withMockedModule('src/services/publishingService.js', {
    '../models/Post': Post,
    '../models/Approval': { exists: async () => false },
    '../config/env': {},
    '../models/SocialAccount': SocialAccount,
    './facebookService': { publishFacebookPost: async () => { calls.facebook += 1; return { id: 'facebook_live_1' }; } },
    './googleBusinessProfileService': { publishGoogleBusinessPost: async () => ({}) },
    './instagramService': { publishInstagramPost: async () => { calls.instagram += 1; return { id: 'instagram_live_1' }; } },
    './linkedinService': { publishLinkedInPost: async () => ({}) },
    './pinterestService': { publishPinterestPin: async () => ({}) },
    './xService': { publishXPost: async () => ({}) },
    './threadsService': { publishThreadsPost: async () => ({}) },
    './tiktokService': { publishTikTokVideo: async () => ({}) },
    './youtubeService': { publishYouTubeVideo: async () => ({}) },
    './auto-handoff/handoff.service': { shouldUseHandoffFallback: () => false },
    './publishingRetryPolicyService': { applyRetryPolicy: async () => ({ scheduled: false }) },
    './publishingReadiness.service': {
      buildPublishingReadiness: async (platformPost) => platformPost.platform === 'facebook'
        ? { ready: true, warnings: [], blockers: [] }
        : { ready: false, warnings: [], blockers: ['Instagram requires a public HTTPS image/video URL.'] },
      publicUrlFromPublishResult: () => ''
    },
    './notification.service': {
      notifyAccountDisconnected: async () => {},
      notifyUser: async () => {}
    }
  }, async ({ publishPost }) => {
    await assert.rejects(
      () => publishPost(post._id, { expectedScheduleVersion: 1 }),
      /instagram: Instagram requires a public HTTPS image\/video URL/
    );
  });

  assert.equal(calls.facebook, 1);
  assert.equal(calls.instagram, 0);
  assert.equal(post.status, 'failed');
  assert.equal(post.publishResults.some((item) => item.platform === 'facebook' && item.status === 'published'), true);
  assert.equal(post.publishResults.some((item) => item.platform === 'instagram' && item.status === 'failed'), true);
});
