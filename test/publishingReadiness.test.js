const test = require('node:test');
const assert = require('node:assert/strict');
const PlatformContentRule = require('../src/models/PlatformContentRule');
const {
  blockingPublishingWarnings,
  buildPublishingReadiness,
  publicUrlFromPublishResult
} = require('../src/services/publishingReadiness.service');

test('publishing readiness separates blocking warnings from optimization warnings', () => {
  const warnings = [
    'Caption is required.',
    'Facebook prefers 1:1 media; selected media is 9:16.',
    'Instagram may not support text posts.'
  ];

  assert.deepEqual(blockingPublishingWarnings(warnings), [
    'Caption is required.',
    'Instagram may not support text posts.'
  ]);
});

test('publishing readiness blocks invalid publish payloads', async () => {
  const originalFindOne = PlatformContentRule.findOne;
  PlatformContentRule.findOne = () => null;
  try {
    const readiness = await buildPublishingReadiness({
      platform: 'instagram',
      type: 'text',
      caption: '',
      hashtags: [],
      media: []
    });

    assert.equal(readiness.ready, false);
    assert.match(readiness.blockers.join(' | '), /Caption is required/);
    assert.match(readiness.blockers.join(' | '), /may not support text posts/);
  } finally {
    PlatformContentRule.findOne = originalFindOne;
  }
});

test('publishing readiness extracts public provider urls from common result shapes', () => {
  assert.equal(publicUrlFromPublishResult({ platformPostUrl: 'https://post.test/a' }), 'https://post.test/a');
  assert.equal(publicUrlFromPublishResult({ raw: { permalink_url: 'https://post.test/b' } }), 'https://post.test/b');
  assert.equal(publicUrlFromPublishResult({ id: '123' }), '');
});
