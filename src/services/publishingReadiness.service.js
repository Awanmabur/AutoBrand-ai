const { validateComposerSubmission } = require('./composer/composerPayloadValidation.service');

const BLOCKING_WARNING_PATTERNS = [
  /caption is required/i,
  /destination url/i,
  /need matching media/i,
  /need at least two image assets/i,
  /need a video asset/i,
  /may not support .* posts/i,
  /whatsapp message drafts should include/i
];

function blockingPublishingWarnings(warnings = []) {
  return (warnings || []).filter((warning) =>
    BLOCKING_WARNING_PATTERNS.some((pattern) => pattern.test(String(warning || '')))
  );
}

function publicUrlFromPublishResult(result = {}) {
  return result.platformPostUrl
    || result.publicUrl
    || result.permalink
    || result.permalinkUrl
    || result.postUrl
    || result.shareUrl
    || result.url
    || result.raw?.permalink_url
    || result.raw?.permalink
    || result.raw?.searchUrl
    || result.raw?.url
    || '';
}

async function buildPublishingReadiness(post = {}) {
  const warnings = await validateComposerSubmission({
    type: post.type,
    platform: post.platform,
    platforms: [post.platform || 'facebook'],
    caption: post.caption,
    hashtags: post.hashtags || [],
    firstComment: post.firstComment,
    altText: post.altText,
    thumbnail: post.thumbnail,
    link: post.link,
    media: post.media || []
  });
  const blockers = blockingPublishingWarnings(warnings);

  return {
    ready: blockers.length === 0,
    warnings,
    blockers,
    checkedAt: new Date()
  };
}

module.exports = {
  blockingPublishingWarnings,
  buildPublishingReadiness,
  publicUrlFromPublishResult
};
