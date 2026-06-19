const { extractHashtags, getPlatformRule, validateAgainstRule } = require('./composerValidation.service');

const MEDIA_REQUIRED_TYPES = new Set(['image', 'carousel', 'video', 'reel', 'story']);
const TEXT_LIKE_TYPES = new Set(['text', 'article', 'link', 'whatsapp_message']);
const DEFAULT_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_VIDEO_BYTES = 200 * 1024 * 1024;

function normalizeComposerType(value = '') {
  const type = String(value || 'text').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (type === 'short' || type === 'short_video' || type === 'tiktok') return 'reel';
  if (type === 'whatsapp') return 'whatsapp_message';
  return type;
}

function mediaKind(media = {}) {
  const fileType = String(media.fileType || '').toLowerCase();
  if (fileType) return fileType;
  const mimeType = String(media.mimeType || '').toLowerCase();
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'other';
}

function mediaAspectRatio(media = {}) {
  const direct = media.aspectRatio || media.metadata?.aspectRatio || media.aiInsights?.aspectRatio;
  if (direct) return String(direct);
  const variantRatio = (media.variants || []).map((variant) => variant?.metadata?.aspectRatio || variant?.aspectRatio).find(Boolean);
  if (variantRatio) return String(variantRatio);
  const width = Number(media.width || media.metadata?.width);
  const height = Number(media.height || media.metadata?.height);
  if (width > 0 && height > 0) {
    const ratio = width / height;
    if (Math.abs(ratio - 1) < 0.08) return '1:1';
    if (Math.abs(ratio - 0.8) < 0.08) return '4:5';
    if (Math.abs(ratio - 1.777) < 0.12) return '16:9';
    if (Math.abs(ratio - 0.5625) < 0.08) return '9:16';
  }
  return '';
}

function hasMediaOfKind(media = [], kind) {
  return media.some((item) => mediaKind(item) === kind);
}

function sizeWarning(media, rule) {
  const kind = mediaKind(media);
  const size = Number(media.size || 0);
  if (!size) return '';
  const limit = kind === 'video'
    ? Number(rule.maxVideoBytes || DEFAULT_VIDEO_BYTES)
    : Number(rule.maxImageBytes || DEFAULT_IMAGE_BYTES);
  if (size <= limit) return '';
  const mb = Math.ceil((size - limit) / (1024 * 1024));
  return `${rule.displayName || rule.platform} media file is about ${mb} MB over the recommended ${kind} size.`;
}

function mediaTypeWarning(media, rule) {
  const kind = mediaKind(media);
  if (!kind || kind === 'other' || !Array.isArray(rule.mediaTypes)) return '';
  if (rule.mediaTypes.includes(kind)) return '';
  return `${rule.displayName || rule.platform} may not support ${kind} media for this post.`;
}

function aspectWarning(media, rule) {
  const ratio = mediaAspectRatio(media);
  if (!ratio || !Array.isArray(rule.aspectRatios) || !rule.aspectRatios.length) return '';
  if (rule.aspectRatios.includes(ratio)) return '';
  return `${rule.displayName || rule.platform} prefers ${rule.aspectRatios.join(', ')} media; selected media is ${ratio}.`;
}

async function validateComposerSubmission(payload = {}) {
  const type = normalizeComposerType(payload.type);
  const platforms = payload.platforms?.length ? payload.platforms : [payload.platform || 'facebook'];
  const media = Array.isArray(payload.media) ? payload.media : [];
  const warnings = [];

  if (!String(payload.caption || '').trim()) warnings.push('Caption is required.');
  if (type === 'link' && !String(payload.link || '').trim()) warnings.push('Link posts need a destination URL.');
  if (MEDIA_REQUIRED_TYPES.has(type) && !media.length) warnings.push(`${type.replace(/_/g, ' ')} posts need matching media.`);
  if (type === 'carousel' && media.filter((item) => mediaKind(item) === 'image').length < 2) warnings.push('Carousel posts need at least two image assets.');
  if ((type === 'video' || type === 'reel') && !hasMediaOfKind(media, 'video')) warnings.push(`${type === 'reel' ? 'Reel/Short/TikTok' : 'Video'} posts need a video asset.`);
  if (type === 'whatsapp_message' && !platforms.includes('whatsapp')) warnings.push('WhatsApp message drafts should include the WhatsApp platform.');

  for (const platform of platforms) {
    const rule = await getPlatformRule(platform);
    warnings.push(...validateAgainstRule({
      caption: payload.caption,
      hashtags: payload.hashtags,
      firstComment: payload.firstComment,
      altText: payload.altText,
      thumbnail: payload.thumbnail,
      link: payload.link,
      type
    }, rule));
    for (const item of media) {
      warnings.push(mediaTypeWarning(item, rule), sizeWarning(item, rule), aspectWarning(item, rule));
    }
  }

  const hashtags = extractHashtags(payload.caption, payload.hashtags);
  if (type === 'whatsapp_message' && hashtags.length) warnings.push('WhatsApp promotional messages should avoid hashtags.');
  if (TEXT_LIKE_TYPES.has(type) && media.length && type !== 'link') warnings.push(`${type.replace(/_/g, ' ')} posts usually do not need attached media.`);

  return [...new Set(warnings.filter(Boolean))];
}

module.exports = {
  mediaAspectRatio,
  mediaKind,
  normalizeComposerType,
  validateComposerSubmission
};
