const { validateComposerSubmission } = require('./composer/composerPayloadValidation.service');
const { isCloudinaryConfigured } = require('../config/cloudinary');
const {
  configuredPublicOrigin,
  isPublicHttpUrl
} = require('./publicMediaUrlService');
const {
  partitionAvailableMedia
} = require('./mediaAvailability.service');

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

function platformMediaBlockers(post, mediaRows, availability) {
  const blockers = [];
  if (availability.missing.length) {
    const labels = availability.missing.map((item) => item.row?.fileName || item.fileUrl || 'media').slice(0, 5);
    blockers.push(`Media file missing from storage: ${labels.join(', ')}. Regenerate or upload the media again.`);
  }

  const platform = String(post.platform || '').toLowerCase();
  if (platform === 'instagram' && mediaRows.length) {
    const hasOnlyPublicUrls = mediaRows.every((media) => isPublicHttpUrl(media?.fileUrl));
    const canPromoteLocalMedia = Boolean(configuredPublicOrigin() || isCloudinaryConfigured());
    if (!hasOnlyPublicUrls && !canPromoteLocalMedia) {
      blockers.push('Instagram requires a public HTTPS image/video URL. Configure Cloudinary or set PUBLIC_APP_URL to a public HTTPS domain; localhost media cannot be fetched by Instagram.');
    }
  }

  return blockers;
}

async function buildPublishingReadiness(post = {}) {
  const mediaRows = Array.isArray(post.media) ? post.media.filter(Boolean) : [];
  const availability = await partitionAvailableMedia(mediaRows);
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
    media: availability.available
  });
  const blockers = [
    ...blockingPublishingWarnings(warnings),
    ...platformMediaBlockers(post, mediaRows, availability)
  ];

  return {
    ready: blockers.length === 0,
    warnings,
    blockers: [...new Set(blockers)],
    mediaAvailability: {
      available: availability.available.length,
      missing: availability.missing.map((item) => ({
        id: item.row?._id,
        fileName: item.row?.fileName || '',
        fileUrl: item.fileUrl || '',
        reason: item.reason
      }))
    },
    checkedAt: new Date()
  };
}

module.exports = {
  blockingPublishingWarnings,
  buildPublishingReadiness,
  publicUrlFromPublishResult
};
