const PlatformContentRule = require('../../models/PlatformContentRule');
const { DEFAULT_PLATFORM_RULES } = require('./defaultPlatformRules');

async function getPlatformRule(platform) {
  const key = String(platform || 'facebook').toLowerCase();
  const dbRule = await PlatformContentRule.findOne({ platform: key, isActive: true });
  return dbRule || { platform: key, ...(DEFAULT_PLATFORM_RULES[key] || DEFAULT_PLATFORM_RULES.facebook) };
}

function extractHashtags(caption = '', hashtags = []) {
  const fromCaption = String(caption).match(/#[\p{L}\p{N}_-]+/gu) || [];
  return [...new Set([...fromCaption, ...(hashtags || []).map((tag) => String(tag).startsWith('#') ? tag : `#${tag}`)])];
}

function validateAgainstRule(content = {}, rule = {}) {
  const warnings = [];
  const caption = content.caption || '';
  const hashtags = extractHashtags(caption, content.hashtags);
  const contentType = content.type || content.contentType || 'text';
  if (rule.characterLimit && caption.length > rule.characterLimit) warnings.push(`${rule.displayName || rule.platform} caption is ${caption.length - rule.characterLimit} characters too long.`);
  if (rule.hashtagLimit >= 0 && hashtags.length > rule.hashtagLimit) warnings.push(`${rule.displayName || rule.platform} supports up to ${rule.hashtagLimit} hashtags.`);
  if (rule.mediaTypes?.length && !rule.mediaTypes.includes(contentType) && !(contentType === 'short' && rule.mediaTypes.includes('video'))) warnings.push(`${rule.displayName || rule.platform} may not support ${contentType} posts.`);
  if (content.firstComment && !rule.supportsFirstComment) warnings.push(`${rule.displayName || rule.platform} does not support first-comment publishing.`);
  if (content.altText && !rule.supportsAltText) warnings.push(`${rule.displayName || rule.platform} does not support alt text through this API.`);
  if (content.link && rule.supportsLinks === false) warnings.push(`${rule.displayName || rule.platform} captions do not support clickable links.`);
  if (content.thumbnail && !rule.supportsThumbnail) warnings.push(`${rule.displayName || rule.platform} does not support custom thumbnails through this integration yet.`);
  return warnings;
}

async function validateComposerPayload(payload = {}) {
  const platforms = payload.platforms?.length ? payload.platforms : [payload.platform || 'facebook'];
  const results = [];
  for (const platform of platforms) {
    const rule = await getPlatformRule(platform);
    const variation = payload.platformVariations?.find((item) => item.platform === platform) || payload;
    results.push({ platform, warnings: validateAgainstRule(variation, rule), rule });
  }
  return results;
}

module.exports = { extractHashtags, getPlatformRule, validateAgainstRule, validateComposerPayload };
