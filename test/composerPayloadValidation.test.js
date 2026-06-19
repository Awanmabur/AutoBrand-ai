const test = require('node:test');
const assert = require('node:assert/strict');
const PlatformContentRule = require('../src/models/PlatformContentRule');
const { validateAgainstRule } = require('../src/services/composer/composerValidation.service');
const { normalizeComposerType, validateComposerSubmission } = require('../src/services/composer/composerPayloadValidation.service');

test('link and WhatsApp formats validate as text-like platform content', () => {
  const rule = { platform: 'whatsapp', displayName: 'WhatsApp', characterLimit: 4096, hashtagLimit: 0, mediaTypes: ['text', 'image', 'video'], supportsLinks: true };

  assert.deepEqual(validateAgainstRule({ type: 'whatsapp_message', caption: 'Hi there', hashtags: [] }, rule), []);
  assert.deepEqual(validateAgainstRule({ type: 'link', caption: 'Read more', link: 'https://example.test' }, rule), []);
  assert.equal(normalizeComposerType('whatsapp'), 'whatsapp_message');
  assert.equal(normalizeComposerType('short_video'), 'reel');
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
