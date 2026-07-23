const { getPlatformRule, validateAgainstRule } = require('./composerValidation.service');
const { scoreContent } = require('./contentScore.service');
const { checkBrandFit } = require('./brandFitChecker.service');
const { checkRisk } = require('./riskChecker.service');

function shorten(text, limit) {
  const value = String(text || '').trim();
  if (!limit || value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function adaptCaption(caption, rule, platform) {
  let adapted = String(caption || '').trim();
  if (platform === 'x') adapted = shorten(adapted, Math.min(rule.characterLimit || 280, 280));
  else adapted = shorten(adapted, rule.characterLimit || 2200);
  if (platform === 'linkedin' && !/^\w/.test(adapted)) adapted = `Insight: ${adapted}`;
  if (platform === 'threads' && adapted.length < 120) adapted = `${adapted}\n\nWhat do you think?`;
  return adapted;
}

async function createPlatformVariation({ baseContent = {}, brand, platform, account }) {
  const rule = await getPlatformRule(platform);
  const caption = adaptCaption(baseContent.caption || baseContent.description || '', rule, platform);
  const variation = {
    platform,
    account,
    caption,
    hashtags: baseContent.hashtags || [],
    firstComment: rule.supportsFirstComment ? baseContent.firstComment || '' : '',
    altText: rule.supportsAltText ? baseContent.altText || '' : '',
    thumbnail: rule.supportsThumbnail ? baseContent.thumbnail || '' : '',
    videoTitle: baseContent.videoTitle || baseContent.title || '',
    videoDescription: baseContent.videoDescription || baseContent.description || '',
    shortVideoHook: baseContent.shortVideoHook || caption.split(/[.!?]/)[0],
    ctaStyle: baseContent.ctaStyle || brand?.ctaStyle || brand?.preferredCta || '',
    toneOverride: baseContent.toneOverride || ''
  };
  const contentScore = scoreContent(variation);
  const brandFit = checkBrandFit(variation, brand);
  const risk = checkRisk(variation, brand);
  return {
    ...variation,
    validationWarnings: validateAgainstRule({ ...variation, type: baseContent.type || 'text', link: baseContent.link }, rule),
    contentScore: contentScore.score,
    brandFitScore: brandFit.score,
    riskScore: risk.score,
    metadata: { contentNotes: contentScore.notes, brandFit, risk, rule: rule.platform || platform }
  };
}

async function createPlatformVariations({ baseContent, brand, platforms = [], accounts = [] }) {
  const selected = platforms.length ? platforms : [...new Set(accounts.map((account) => account.platform).filter(Boolean))];
  return Promise.all(selected.map(async (platform) => {
    const account = accounts.find((item) => item.platform === platform)?._id;
    return createPlatformVariation({ baseContent, brand, platform, account });
  }));
}

module.exports = { adaptCaption, createPlatformVariation, createPlatformVariations };
