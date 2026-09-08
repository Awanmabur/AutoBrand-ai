const test = require('node:test');
const assert = require('node:assert/strict');
const PlatformContentRule = require('../src/models/PlatformContentRule');
const { validateAgainstRule } = require('../src/services/composer/composerValidation.service');
const { normalizeComposerType, validateComposerSubmission } = require('../src/services/composer/composerPayloadValidation.service');

test('link format validates as text-like platform content', () => {
  const rule = { platform: 'facebook', displayName: 'Facebook', characterLimit: 63206, hashtagLimit: 30, mediaTypes: ['text', 'image'], supportsLinks: true };
  assert.deepEqual(validateAgainstRule({ type: 'link', caption: 'Hi there', link: 'https://example.org', hashtags: [] }, rule), []);
  assert.equal(normalizeComposerType('link'), 'link');
});
test('composer submission warnings cover required media, links, size and aspect ratio', async () => {
  const originalFindOne = PlatformContentRule.findOne;
  PlatformContentRule.findOne = () => null;
  try {
    const linkWarnings = await validateComposerSubmission({ type: 'link', platform: 'facebook', caption: 'Visit us', hashtags: [], media: [] });
    assert.match(linkWarnings.join(' | '), /destination URL/);

    const imageWarnings = await validateComposerSubmission({
      type: 'image',
      platform: 'facebook',
      caption: 'Fresh update for you today.',
      hashtags: [],
      media: [{
        fileType: 'image',
        size: 12 * 1024 * 1024,
        variants: [{ metadata: { aspectRatio: '9:16' } }]
      }]
    });
    assert.match(imageWarnings.join(' | '), /recommended image size/);
    assert.match(imageWarnings.join(' | '), /selected media is 9:16/);

    const carouselWarnings = await validateComposerSubmission({
      type: 'carousel',
      platform: 'instagram',
      caption: 'Swipe for the offer today.',
      hashtags: ['#Offer'],
      media: [{ fileType: 'image', size: 1, variants: [{ metadata: { aspectRatio: '1:1' } }] }]
    });
    assert.match(carouselWarnings.join(' | '), /at least two image assets/);
  } finally {
    PlatformContentRule.findOne = originalFindOne;
  }
});
