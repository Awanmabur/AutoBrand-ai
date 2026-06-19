const { generateJsonText } = require('./aiProviderService');
const { scoreContent } = require('./composer/contentScore.service');
const { checkBrandFit } = require('./composer/brandFitChecker.service');
const { checkRisk } = require('./composer/riskChecker.service');

const SUPPORTED_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'x', 'tiktok', 'youtube', 'whatsapp', 'threads', 'pinterest', 'google_business'];
const OUTPUT_TYPES = [
  'single_post',
  'platform_captions',
  'hashtags',
  '7_day_campaign',
  '30_day_content_calendar',
  'product_launch',
  'event_promotion',
  'offer_sale',
  'carousel_copy',
  'reel_script',
  'whatsapp_message',
  'linkedin_post',
  'facebook_post',
  'instagram_caption',
  'x_post',
  'youtube_shorts_description'
];

const PLATFORM_BY_OUTPUT = {
  whatsapp_message: 'whatsapp',
  linkedin_post: 'linkedin',
  facebook_post: 'facebook',
  instagram_caption: 'instagram',
  x_post: 'x',
  youtube_shorts_description: 'youtube',
  reel_script: 'tiktok'
};

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value)
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeToken(value, fallback) {
  return String(value || fallback || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function normalizePlatform(value) {
  const platform = normalizeToken(value, 'facebook');
  if (platform === 'twitter') return 'x';
  if (platform === 'youtube_shorts') return 'youtube';
  return SUPPORTED_PLATFORMS.includes(platform) ? platform : 'facebook';
}

function normalizeOutputType(value, body = {}) {
  const raw = normalizeToken(value || body.aiOutputType || body.contentFormat || body.generationType, '');
  if (OUTPUT_TYPES.includes(raw)) return raw;
  if (raw === 'twitter_post') return 'x_post';
  if (raw === 'shorts_description') return 'youtube_shorts_description';
  if (raw === 'sale_campaign') return 'offer_sale';
  if (raw === 'launch_campaign') return 'product_launch';
  if (raw === 'event_campaign') return 'event_promotion';
  if (body.type === 'carousel') return 'carousel_copy';
  if (body.type === 'reel') return 'reel_script';
  return 'single_post';
}

function normalizeGenerationControls(body = {}) {
  const outputType = normalizeOutputType(body.outputType, body);
  const forcedPlatform = PLATFORM_BY_OUTPUT[outputType];
  const platforms = forcedPlatform
    ? [forcedPlatform]
    : (asArray(body.platforms).length ? asArray(body.platforms) : asArray(body.platform || 'facebook')).map(normalizePlatform);
  const durationDays = outputType === '30_day_content_calendar'
    ? 30
    : outputType === '7_day_campaign'
      ? 7
      : clamp(body.durationDays, 1, 30, outputType === 'product_launch' || outputType === 'event_promotion' || outputType === 'offer_sale' ? 7 : 1);
  return {
    outputType,
    campaignType: normalizeToken(body.campaignType || (['product_launch', 'event_promotion', 'offer_sale'].includes(outputType) ? outputType : body.goal), 'general'),
    durationDays,
    platforms: [...new Set(platforms.length ? platforms : ['facebook'])],
    platform: normalizePlatform(forcedPlatform || platforms[0] || body.platform || 'facebook'),
    goal: String(body.goal || body.contentGoal || '').trim(),
    tone: String(body.tone || body.toneOverride || '').trim(),
    audience: String(body.audience || body.targetAudience || '').trim(),
    length: ['short', 'medium', 'long'].includes(normalizeToken(body.length, 'medium')) ? normalizeToken(body.length, 'medium') : 'medium',
    emojiLevel: ['none', 'low', 'medium', 'high'].includes(normalizeToken(body.emojiLevel, 'low')) ? normalizeToken(body.emojiLevel, 'low') : 'low',
    hashtagCount: clamp(body.hashtagCount, 0, 30, 6),
    ctaType: normalizeToken(body.ctaType || body.ctaStyle, 'brand_default'),
    language: String(body.language || '').trim() || 'English',
    source: String(body.source || '').trim()
  };
}

function productList(brand = {}) {
  return [...(brand.products || []), ...(brand.services || [])].filter((item) => item && (item.name || item.description));
}

function firstOffer(brand = {}) {
  const offer = (brand.offers || [])[0];
  if (offer) return [offer.title, offer.description].filter(Boolean).join(': ');
  const product = productList(brand)[0];
  if (product) return [product.name, product.price, product.description].filter(Boolean).join(' - ');
  return brand.preferredCta || brand.uniqueSellingPoint || brand.description || '';
}

function ctaFor(brand = {}, controls = {}) {
  const ctas = {
    brand_default: brand.ctaStyle || brand.preferredCta || 'Contact us today',
    soft: 'Learn more when you are ready',
    direct: 'Book now',
    urgent: 'Claim this offer today',
    educational: 'Learn more',
    lead_magnet: 'Get the free guide',
    book_call: 'Book a call',
    shop_now: 'Shop now',
    whatsapp: 'Message us on WhatsApp'
  };
  return ctas[controls.ctaType] || brand.preferredCta || 'Contact us today';
}

function emojiFor(level) {
  if (level === 'none') return '';
  if (level === 'high') return ' 🚀✨';
  if (level === 'medium') return ' ✨';
  return '';
}

function hashtagify(value) {
  const text = String(value || '').replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  if (!text) return '';
  return `#${text.split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`;
}

function hashtagsFor(brand = {}, controls = {}, platform = '') {
  if (controls.hashtagCount <= 0 || platform === 'whatsapp') return [];
  const candidates = [
    ...(brand.preferredHashtags || []),
    hashtagify(brand.name),
    hashtagify(brand.industry || brand.businessType),
    hashtagify(controls.goal),
    ...(brand.keywords || []).map(hashtagify),
    ...(brand.contentPillars || []).map(hashtagify),
    platform === 'linkedin' ? '#BusinessGrowth' : '',
    platform === 'instagram' ? '#InstaBusiness' : '',
    platform === 'x' ? '#Marketing' : ''
  ].filter(Boolean).map((tag) => tag.startsWith('#') ? tag : `#${tag}`);
  return [...new Set(candidates)].slice(0, controls.hashtagCount);
}

function shorten(value, limit) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!limit || text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function baseCaption(brand = {}, controls = {}, angle = '') {
  const audience = controls.audience || brand.targetAudience || 'your customers';
  const goal = controls.goal || brand.goals?.[0] || 'take the next step';
  const offer = firstOffer(brand) || 'a practical solution';
  const proof = brand.testimonials?.[0]?.quote
    ? `Proof: ${brand.testimonials[0].quote}`
    : brand.uniqueSellingPoint || brand.differentiationNotes || '';
  const cta = ctaFor(brand, controls);
  const hook = angle || offer;
  const lines = [
    `${brand.name || 'This brand'} helps ${audience} ${goal}.`,
    `Today, the focus is ${hook}.`
  ];
  if (controls.length !== 'short') lines.push(`Why it matters: ${brand.customerPainPoints?.[0] || brand.description || offer}.`);
  if (controls.length === 'long' && proof) lines.push(proof);
  lines.push(cta);
  return `${lines.filter(Boolean).join(' ')}${emojiFor(controls.emojiLevel)}`;
}

function platformCaption(platform, brand, controls, angle = '') {
  const hashtags = hashtagsFor(brand, controls, platform);
  const base = baseCaption(brand, controls, angle);
  if (platform === 'x') return shorten(`${base} ${hashtags.slice(0, 2).join(' ')}`, 280);
  if (platform === 'linkedin') {
    return [
      `${brand.name || 'Brand'} update: ${controls.goal || 'growth'}`,
      base,
      'A practical next step matters more than hype.',
      hashtags.slice(0, 4).join(' ')
    ].filter(Boolean).join('\n\n');
  }
  if (platform === 'instagram') return `${base}\n\n${hashtags.join(' ')}`.trim();
  if (platform === 'whatsapp') return `Hi, ${base}`.replace(/\s+/g, ' ').trim();
  if (platform === 'youtube') return `${base}\n\nShorts idea: open with the customer problem, show the offer, close with ${ctaFor(brand, controls)}.`;
  return `${base}\n\n${hashtags.join(' ')}`.trim();
}

function campaignThemes(type) {
  if (type === 'product_launch') return ['Teaser', 'Problem', 'Product reveal', 'How it works', 'Proof', 'Launch day CTA', 'FAQ'];
  if (type === 'event_promotion') return ['Announcement', 'Why attend', 'Agenda', 'Speaker/proof', 'Reminder', 'Last call', 'Day-of update'];
  if (type === 'offer_sale') return ['Offer reveal', 'Benefit', 'Proof', 'Objection answer', 'Reminder', 'Urgency', 'Final call'];
  return ['Offer', 'Education', 'Trust', 'Behind the scenes', 'FAQ', 'Proof', 'CTA'];
}

function buildCampaignPlan(brand = {}, controls = {}) {
  const days = Math.max(1, Math.min(30, Number(controls.durationDays || 7)));
  const themes = campaignThemes(controls.campaignType || controls.outputType);
  return Array.from({ length: days }, (_, index) => {
    const platform = controls.platforms[index % controls.platforms.length] || 'facebook';
    const theme = themes[index % themes.length];
    return {
      day: index + 1,
      platform,
      contentType: theme.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      title: `${theme} for ${brand.name || 'brand'}`,
      caption: platformCaption(platform, brand, controls, theme),
      hashtags: hashtagsFor(brand, controls, platform),
      bestTimeHint: index % 2 ? '1:00 PM' : '7:00 PM'
    };
  });
}

function buildCarouselSlides(brand = {}, controls = {}) {
  const offer = firstOffer(brand) || 'the offer';
  const cta = ctaFor(brand, controls);
  const slides = [
    ['Hook', offer],
    ['Problem', brand.customerPainPoints?.[0] || `What ${brand.targetAudience || 'customers'} need solved`],
    ['Solution', brand.description || `${brand.name || 'The brand'} makes the next step easier`],
    ['Proof', brand.testimonials?.[0]?.quote || brand.uniqueSellingPoint || 'Built around real customer needs'],
    ['CTA', cta]
  ];
  return slides.map(([headline, body], index) => ({
    slide: index + 1,
    headline,
    body,
    visualDirection: `Use ${brand.name || 'the brand'} colors and a clear ${headline.toLowerCase()} visual.`,
    speakerNote: index === slides.length - 1 ? cta : ''
  }));
}

function buildVideoScenes(brand = {}, controls = {}) {
  const cta = ctaFor(brand, controls);
  return [
    { order: 1, title: 'Hook', narration: `Need ${firstOffer(brand) || 'a better option'}?`, visualPrompt: 'Fast opening shot with the customer problem.', durationSeconds: 3 },
    { order: 2, title: 'Problem', narration: brand.customerPainPoints?.[0] || 'The usual way takes too much time.', visualPrompt: 'Show the friction or missed opportunity.', durationSeconds: 4 },
    { order: 3, title: 'Solution', narration: `${brand.name || 'This brand'} makes it simpler.`, visualPrompt: 'Show the product, service, or team in action.', durationSeconds: 5 },
    { order: 4, title: 'Proof', narration: brand.testimonials?.[0]?.quote || brand.uniqueSellingPoint || 'Customers get a clearer next step.', visualPrompt: 'Show proof, result, testimonial, or trust marker.', durationSeconds: 4 },
    { order: 5, title: 'CTA', narration: cta, visualPrompt: 'End with a clean branded CTA frame.', durationSeconds: 3 }
  ];
}

function outputHeadline(outputType, brand) {
  const name = brand?.name || 'Brand';
  const labels = {
    platform_captions: `${name} platform caption pack`,
    hashtags: `${name} hashtag pack`,
    '7_day_campaign': `${name} 7-day campaign`,
    '30_day_content_calendar': `${name} 30-day content calendar`,
    product_launch: `${name} product launch campaign`,
    event_promotion: `${name} event promotion campaign`,
    offer_sale: `${name} offer campaign`,
    carousel_copy: `${name} carousel copy`,
    reel_script: `${name} short-video script`,
    whatsapp_message: `${name} WhatsApp promo`,
    linkedin_post: `${name} LinkedIn post`,
    facebook_post: `${name} Facebook post`,
    instagram_caption: `${name} Instagram caption`,
    x_post: `${name} X post`,
    youtube_shorts_description: `${name} YouTube Shorts description`
  };
  return labels[outputType] || `${name} social post`;
}

function collectBundleText(bundle = {}) {
  return [
    bundle.caption,
    bundle.description,
    bundle.videoScript,
    bundle.whatsappMessage,
    bundle.youtubeShortsDescription,
    ...(bundle.platformOutputs || []).map((item) => item.caption),
    ...(bundle.campaignPlan || []).map((item) => item.caption),
    ...(bundle.carouselSlides || []).flatMap((item) => [item.headline, item.body])
  ].filter(Boolean).join('\n');
}

function warningsFor(text, brand = {}) {
  const lowered = String(text || '').toLowerCase();
  const blocked = [...(brand.blockedWords || []), ...(brand.bannedWords || [])]
    .map((word) => String(word || '').trim())
    .filter(Boolean);
  const blockedHits = [...new Set(blocked.filter((word) => lowered.includes(word.toLowerCase())))];
  const risk = checkRisk({ caption: text }, brand);
  const brandRuleWarnings = [];
  if (!brand.brandRules?.length) brandRuleWarnings.push('No Brand Brain rules are saved yet.');
  if (blockedHits.length) brandRuleWarnings.push('Generated copy conflicts with blocked-word rules.');
  if (risk.warning) brandRuleWarnings.push(risk.warning);
  return {
    blockedWordWarnings: blockedHits.map((word) => `Blocked word detected: ${word}`),
    brandRuleWarnings: [...new Set(brandRuleWarnings)],
    riskWarnings: risk.risks || []
  };
}

function scoreBundle(bundle = {}, brand = {}) {
  const content = { caption: bundle.caption, hashtags: bundle.hashtags || [], type: bundle.postType || 'text', mediaCount: bundle.postType === 'text' ? 0 : 1 };
  const contentScore = scoreContent(content);
  const brandFit = checkBrandFit(content, brand);
  const risk = checkRisk(content, brand);
  return {
    contentScore: contentScore.score,
    brandFitScore: brandFit.score,
    riskScore: risk.score,
    notes: [...contentScore.notes, brandFit.offBrandWarning, risk.warning].filter(Boolean)
  };
}

function buildFallbackBundle(brand = {}, body = {}) {
  const controls = normalizeGenerationControls(body);
  const campaignLike = ['7_day_campaign', '30_day_content_calendar', 'product_launch', 'event_promotion', 'offer_sale'].includes(controls.outputType);
  const platformOutputs = controls.platforms.map((platform) => ({
    platform,
    caption: platformCaption(platform, brand, controls),
    hashtags: hashtagsFor(brand, controls, platform),
    callToAction: ctaFor(brand, controls)
  }));
  const campaignPlan = campaignLike ? buildCampaignPlan(brand, controls) : [];
  const carouselSlides = controls.outputType === 'carousel_copy' ? buildCarouselSlides(brand, controls) : [];
  const videoScenes = controls.outputType === 'reel_script' ? buildVideoScenes(brand, controls) : [];
  const primaryPlatform = controls.platform;
  const caption = platformOutputs.find((item) => item.platform === primaryPlatform)?.caption || platformOutputs[0]?.caption || baseCaption(brand, controls);
  const hashtags = hashtagsFor(brand, controls, primaryPlatform);
  const videoScript = videoScenes.length
    ? videoScenes.map((scene) => `Scene ${scene.order}: ${scene.title} - ${scene.narration}`).join('\n')
    : `Hook: ${firstOffer(brand) || controls.goal || 'Start strong'}\nCTA: ${ctaFor(brand, controls)}`;
  const bundle = {
    outputType: controls.outputType,
    title: outputHeadline(controls.outputType, brand),
    caption,
    hashtags,
    callToAction: ctaFor(brand, controls),
    description: campaignLike ? `${campaignPlan.length}-day ${controls.campaignType.replace(/_/g, ' ')} plan for ${brand.name}.` : caption,
    imageIdea: `A clean branded ${primaryPlatform} visual for ${brand.name || 'the brand'} using ${brand.brandColors?.join(', ') || 'saved brand colors'}.`,
    imagePrompt: `Create a polished ${primaryPlatform} visual for ${brand.name || 'the brand'} about ${firstOffer(brand) || controls.goal || 'the offer'}.`,
    videoScript,
    videoScenes,
    youtubeTags: hashtags.map((tag) => tag.replace(/^#/, '')).slice(0, 12),
    youtubeShortsDescription: controls.outputType === 'youtube_shorts_description' ? platformCaption('youtube', brand, controls) : '',
    whatsappMessage: controls.outputType === 'whatsapp_message' ? platformCaption('whatsapp', brand, controls) : '',
    platformOutputs,
    campaignPlan,
    carouselSlides,
    bestPostingTime: '7:00 PM',
    improvementSuggestion: 'Review the warnings, then save to drafts or continue in the composer.',
    safetyNotes: 'Review generated copy before publishing.',
    controls
  };
  bundle.warnings = warningsFor(collectBundleText(bundle), brand);
  bundle.scores = scoreBundle(bundle, brand);
  return bundle;
}

function normalizeArray(value, fallback = []) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') return asArray(value);
  return fallback;
}

function normalizeBundle(raw = {}, fallback = {}, brand = {}) {
  const bundle = {
    ...fallback,
    ...raw,
    hashtags: normalizeArray(raw.hashtags, fallback.hashtags),
    youtubeTags: normalizeArray(raw.youtubeTags, fallback.youtubeTags),
    platformOutputs: Array.isArray(raw.platformOutputs) && raw.platformOutputs.length ? raw.platformOutputs : fallback.platformOutputs,
    campaignPlan: Array.isArray(raw.campaignPlan) && raw.campaignPlan.length ? raw.campaignPlan : fallback.campaignPlan,
    carouselSlides: Array.isArray(raw.carouselSlides) && raw.carouselSlides.length ? raw.carouselSlides : fallback.carouselSlides,
    videoScenes: Array.isArray(raw.videoScenes) && raw.videoScenes.length ? raw.videoScenes : fallback.videoScenes
  };
  bundle.warnings = warningsFor(collectBundleText(bundle), brand);
  bundle.scores = scoreBundle(bundle, brand);
  return bundle;
}

function buildGenerationPrompt(brand = {}, controls = {}, fallback = {}) {
  return [
    'Generate AI social media content as strict JSON only.',
    `Output type: ${controls.outputType}.`,
    `Platforms: ${controls.platforms.join(', ')}.`,
    `Controls: goal=${controls.goal || 'brand growth'}, tone=${controls.tone || brand.tone || 'brand default'}, audience=${controls.audience || brand.targetAudience || 'saved audience'}, length=${controls.length}, emoji=${controls.emojiLevel}, hashtagCount=${controls.hashtagCount}, cta=${controls.ctaType}, language=${controls.language}.`,
    `Brand: ${brand.name}. Industry: ${brand.industry || brand.businessType || 'not set'}.`,
    `Description: ${brand.description || 'not set'}. Website: ${brand.website || 'not set'}. Location: ${brand.location || 'not set'}.`,
    `Products/services: ${productList(brand).map((item) => [item.name, item.price, item.description].filter(Boolean).join(' - ')).join('; ') || 'not set'}.`,
    `Offers: ${(brand.offers || []).map((item) => [item.title, item.description].filter(Boolean).join(' - ')).join('; ') || 'not set'}.`,
    `Keywords: ${(brand.keywords || []).join(', ') || 'not set'}. Blocked words: ${[...(brand.blockedWords || []), ...(brand.bannedWords || [])].join(', ') || 'none'}.`,
    `Brand rules: ${(brand.brandRules || []).join('; ') || 'none'}.`,
    'Return keys: title, caption, hashtags, callToAction, description, imageIdea, imagePrompt, videoScript, videoScenes, youtubeTags, youtubeShortsDescription, whatsappMessage, platformOutputs, campaignPlan, carouselSlides, bestPostingTime, improvementSuggestion, safetyNotes.',
    `Fallback shape example: ${JSON.stringify(fallback).slice(0, 5000)}`
  ].join('\n');
}

async function generateContentBundle(input = {}) {
  const controls = normalizeGenerationControls(input);
  const fallback = buildFallbackBundle(input.brand || {}, { ...input, ...controls });
  const result = await generateJsonText({
    prompt: buildGenerationPrompt(input.brand || {}, controls, fallback),
    fallback,
    preferredProvider: input.provider || input.aiProvider || input.preferredProvider
  });
  return {
    ...normalizeBundle(result.data, fallback, input.brand || {}),
    provider: result.provider || 'local',
    ok: result.ok,
    message: result.message || ''
  };
}

function creditsForGeneration(controlsOrBody = {}) {
  const controls = controlsOrBody.outputType ? controlsOrBody : normalizeGenerationControls(controlsOrBody);
  if (controls.outputType === '30_day_content_calendar') return 12;
  if (['7_day_campaign', 'product_launch', 'event_promotion', 'offer_sale'].includes(controls.outputType)) return 5;
  if (['carousel_copy', 'reel_script', 'platform_captions'].includes(controls.outputType)) return 2;
  return 1;
}

function postTypeForOutput(outputType) {
  if (outputType === 'carousel_copy') return 'carousel';
  if (outputType === 'reel_script' || outputType === 'youtube_shorts_description') return 'video';
  if (['7_day_campaign', '30_day_content_calendar', 'product_launch', 'event_promotion', 'offer_sale'].includes(outputType)) return 'campaign';
  return 'text';
}

module.exports = {
  OUTPUT_TYPES,
  SUPPORTED_PLATFORMS,
  buildFallbackBundle,
  creditsForGeneration,
  generateContentBundle,
  normalizeGenerationControls,
  postTypeForOutput
};
