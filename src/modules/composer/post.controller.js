const Brand = require('../../models/Brand');
const Post = require('../../models/Post');
const Media = require('../../models/Media');
const Notification = require('../../models/Notification');
const SocialAccount = require('../../models/SocialAccount');
const UsageLog = require('../../models/UsageLog');
const { enqueuePost } = require('../../services/schedulerService');
const { publishPost } = require('../../services/publishingService');
const { spendCredits } = require('../../services/creditService');
const {
  SCHEDULED_POST_STATUSES,
  assertCanCreateAutoPosts,
  assertCanCreateHandoffPosts,
  assertCanGenerateText,
  assertCanSchedulePost
} = require('../../services/usageLimitService');
const { buildPlatformPreview } = require('../../services/platformPreviewService');
const { generatePostIdea, generateImageAsset, buildCreativePackage, buildScheduleSlots } = require('../../services/aiContentService');
const { creditsForGeneration, normalizeGenerationControls } = require('../../services/aiContentGeneration.service');
const { createScheduledPostsFromBatch } = require('../../services/autoCampaignService');
const { buildMediaInsights } = require('../../services/mediaInsightService');
const { generateVideo } = require('../../services/ai.service');
const { createPlatformVariations } = require('../../services/composer/platformVariation.service');
const { validateComposerSubmission } = require('../../services/composer/composerPayloadValidation.service');
const { resolveComposerMediaIntent, mediaIntentAllowsType } = require('../../services/composer/mediaIntent.service');

const platforms = ['facebook', 'instagram', 'google_business', 'linkedin', 'pinterest', 'tiktok', 'youtube', 'x', 'threads'];
const postTypes = ['text', 'image', 'carousel', 'video', 'reel', 'story', 'link', 'article', 'campaign'];
const contentTypes = ['promo', 'educational', 'testimonial', 'offer', 'product', 'announcement', 'engagement', 'behind_the_scenes', 'proof', 'faq', 'launch'];
const contentGoals = ['awareness', 'engagement', 'sales', 'traffic', 'lead_generation', 'community', 'customer_support', 'launch', 'event', 'other'];

function normalizeContentGoal(value) {
  const goal = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return contentGoals.includes(goal) ? goal : 'awareness';
}

const APP_TIME_ZONE = process.env.APP_TIME_ZONE || process.env.TIME_ZONE || process.env.TZ || 'Africa/Kampala';

function timeZoneOffsetMinutes(timeZone, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).reduce((map, part) => {
    if (part.type !== 'literal') map[part.type] = part.value;
    return map;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour || 0),
    Number(parts.minute || 0),
    Number(parts.second || 0)
  );
  return (asUtc - date.getTime()) / 60000;
}

function zonedLocalTimeToUtc(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
  let utc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let offset = timeZoneOffsetMinutes(APP_TIME_ZONE, new Date(utc));
  utc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - offset * 60000;
  offset = timeZoneOffsetMinutes(APP_TIME_ZONE, new Date(utc));
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - offset * 60000);
}

function parseScheduledDateInput(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value).trim();
  if (!text) return null;
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(text)) return new Date(text);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    return zonedLocalTimeToUtc(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      Number(match[4] || 0),
      Number(match[5] || 0),
      Number(match[6] || 0),
      0
    );
  }
  return new Date(text);
}

function nextDefaultScheduleDate() {
  const next = new Date(Date.now() + 60 * 60 * 1000);
  next.setSeconds(0, 0);
  return next;
}

function scheduleDateFromBody(value, { allowDefault = true } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return allowDefault ? nextDefaultScheduleDate() : null;
  }
  const scheduledAt = parseScheduledDateInput(value);
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return null;
  return scheduledAt;
}

async function tryEnqueue(post, userId) {
  try {
    await enqueuePost(post);
  } catch (error) {
    await Notification.create({
      user: userId,
      type: 'queue_unavailable',
      title: 'Queue unavailable',
      message: 'Post was saved. Redis/BullMQ is not reachable, so the built-in due-post fallback will publish it while the app server is running.',
      entityType: 'Post',
      entityId: post._id
    });
  }
}

function splitHashtags(value) {
  return String(value || '')
    .split(/\s|,/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function splitLines(value) {
  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mediaKind(mimeType, fallbackUrl = '') {
  if (mimeType?.startsWith('image/')) return 'image';
  if (mimeType?.startsWith('video/')) return 'video';
  const url = String(fallbackUrl).toLowerCase().split('?')[0];
  if (/\.(png|jpe?g|webp|gif)$/.test(url)) return 'image';
  if (/\.(mp4|mov|webm|m4v)$/.test(url)) return 'video';
  return 'other';
}

function selectedAccountsFromBody(body) {
  return toArray(body.targetAccounts || body.socialAccounts || body.pages);
}

function selectedMediaFromBody(body) {
  return toArray(body.media || body.mediaIds);
}

function idsFromBody(value) {
  return toArray(value)
    .flatMap((item) => String(item || '').split(/[\s,]+/))
    .map((item) => item.trim())
    .filter(Boolean);
}


function brandPrimaryOffer(brand) {
  const offer = brand.offers?.[0];
  if (!offer) return '';
  return [offer.title, offer.description].filter(Boolean).join(': ');
}

function applyBrandBrainDefaults(body, brand) {
  const next = { ...body };
  next.platform = next.platform || 'facebook';
  next.creationMode = next.creationMode || 'ai';
  next.contentType = next.contentType || brand.autoPosting?.contentMix?.[0] || 'promo';
  next.audience = next.audience || brand.targetAudience || '';
  next.goal = next.goal || brand.autoPosting?.customerGoal || 'get customers immediately with a clear offer and CTA';
  next.offer = next.offer || brandPrimaryOffer(brand) || brand.preferredCta || '';
  next.tone = next.tone || brand.tone || '';
  const mediaMix = Array.isArray(brand.autoPosting?.mediaMix) && brand.autoPosting.mediaMix.length ? brand.autoPosting.mediaMix : ['auto', 'image', 'slides', 'video'];
  const wantsMedia = brand.autoPosting?.requireMedia !== false;
  if (wantsMedia && !selectedMediaFromBody(next).length && !next.externalMediaUrl) {
    const chosen = mediaMix.find((item) => ['video', 'slides', 'image'].includes(String(item).toLowerCase())) || 'image';
    if (!next.type) next.type = chosen === 'video' ? 'video' : 'image';
    next.generateImage = 'on';
    next.mediaHandoff = next.mediaHandoff || 'generate_openai_image';
    next.imageCount = next.imageCount || brand.autoPosting?.imagesPerPostMax || (chosen === 'slides' ? 3 : 1);
    next.mediaFormat = chosen === 'slides' ? 'carousel_slides' : chosen === 'video' ? 'short_video' : 'text_image';
  }
  return next;
}


function normalizeMediaPreset(body = {}) {
  return resolveComposerMediaIntent(body);
}


function mediaPresetValue(form = {}) {
  const type = String(form.mediaPreset || '').trim().toLowerCase();
  if (type) return type;
  const postType = String(form.type || 'image').toLowerCase();
  const count = Math.max(1, Math.min(5, Number(form.imageCount || (postType === 'carousel' ? 3 : 1))));
  if (postType === 'video') return 'video';
  if (postType === 'text') return 'text';
  if (postType === 'carousel') return `carousel-${Math.max(2, count)}`;
  return `image-${count}`;
}
function generatedImageCount(body, brand) {
  const requestedType = String(body.type || '').toLowerCase();
  const max = Math.max(1, Math.min(5, Number(body.imageCount || body.imagesPerPostMax || brand.autoPosting?.imagesPerPostMax || 1)));
  const min = Math.max(1, Math.min(max, Number(body.imagesPerPostMin || brand.autoPosting?.imagesPerPostMin || 1)));
  if (requestedType === 'carousel' || body.mediaFormat === 'carousel_slides') return Math.max(2, max);
  if (requestedType === 'video' || body.mediaFormat === 'short_video') return 1;
  if (requestedType === 'image') return Math.max(1, Math.min(5, Number(body.imageCount || max || 1)));
  return Math.max(min, Math.min(max, Number(body.imageCount || min)));
}

function buildCreativePlan(body, generated = null) {
  const packageData = generated ? buildCreativePackage({ brand: body.__brand || {}, platform: body.platform || 'facebook', goal: body.goal || body.offer || '', contentType: body.contentType || 'promo', sourceMedia: body.__sourceMedia || null }) : null;
  return {
    creationMode: body.creationMode || 'ai',
    goal: body.goal || '',
    contentType: body.contentType || '',
    audience: body.audience || '',
    offer: body.offer || '',
    tone: body.tone || '',
    imageMode: body.imageMode || 'manual_upload',
    imagePrompt: body.imagePrompt || generated?.imagePrompt || '',
    imageIdea: body.imageIdea || generated?.imageIdea || '',
    videoMode: body.videoMode || 'manual_upload',
    videoPrompt: body.videoPrompt || generated?.videoScript || '',
    videoScript: body.videoScript || generated?.videoScript || '',
    imageProvider: body.imageProvider || 'prompt_or_default',
    videoProvider: body.videoProvider || 'prompt_or_default',
    mediaHandoff: body.mediaHandoff || 'prepare_prompt',
    selectedOwnerMediaConsent: body.selectedOwnerMediaConsent === 'on',
    imageChecklist: packageData?.imageGenerationChecklist || [],
    videoChecklist: packageData?.videoGenerationChecklist || [],
    handoffSteps: packageData?.handoffSteps || [],
    qualityChecklist: [
      'Brand-specific offer or value promise included',
      'Clear call to action included',
      'Caption is readable and platform-safe',
      'Media/prompt prepared for image or video creative',
      'Selected Pages are explicit before publish'
    ],
    generatedAt: generated ? new Date() : null,
    generatedProvider: generated?.provider || null,
    generatedScore: generated?.contentScore || null,
    generatedBundle: generated?.generatedBundle || null,
    platformOutputs: generated?.platformOutputs || [],
    campaignPlan: generated?.campaignPlan || [],
    carouselSlides: generated?.carouselSlides || [],
    videoScenes: generated?.videoScenes || [],
    warnings: {
      brandRuleWarnings: generated?.brandRuleWarnings || [],
      blockedWordWarnings: generated?.blockedWordWarnings || [],
      riskWarnings: generated?.riskWarnings || []
    },
    improvementSuggestion: generated?.improvementSuggestion || null,
    safetyNotes: generated?.safetyNotes || null
  };
}

async function loadPostComposerData(userId, selectedBrandId = '') {
  const brands = await Brand.find({ owner: userId, status: 'active' }).sort({ name: 1 });
  const brandIds = brands.map((brand) => brand._id);
  const activeBrandId = selectedBrandId || brands[0]?._id?.toString() || '';

  const [media, socialAccounts] = await Promise.all([
    Media.find({ uploadedBy: userId, brand: { $in: brandIds } }).populate('brand').sort({ createdAt: -1 }).limit(120),
    SocialAccount.find({ owner: userId, brand: { $in: brandIds }, status: { $in: ['connected', 'mock'] } })
      .populate('brand')
      .sort({ platform: 1, accountName: 1 })
  ]);

  return { brands, media, socialAccounts, activeBrandId, platforms, postTypes, contentTypes, contentGoals };
}

function defaultOneOffForm(brand, brandId) {
  if (!brand) {
    return {
      brand: brandId,
      platform: 'facebook',
      type: 'image',
      mediaPreset: 'image-1',
      creationMode: 'ai',
      contentType: 'promo',
      contentGoal: 'awareness',
      workflowMode: 'manual',
      generateImage: 'on',
      imageMode: 'openai_image',
      imageCount: 1
    };
  }

  return applyBrandBrainDefaults({
    brand: brand._id.toString(),
    platform: 'facebook',
    creationMode: 'ai',
    contentType: 'promo',
    contentGoal: 'awareness',
    workflowMode: 'manual',
    type: 'image',
    mediaPreset: 'image-1',
    generateImage: 'on',
    imageMode: 'openai_image',
    imageCount: 1
  }, brand);
}

function defaultHandoffForm(brand, brandId) {
  const auto = brand?.autoPosting || {};
  return {
    brand: brand?._id?.toString() || brandId,
    platforms: ['facebook', 'instagram', 'google_business', 'linkedin', 'pinterest', 'tiktok', 'youtube', 'x', 'threads'],
    frequencyUnit: auto.frequencyUnit || 'week',
    postsPerDay: auto.postsPerDay || 1,
    postsPerWeek: auto.postsPerWeek || 7,
    postsPerMonth: auto.postsPerMonth || 30,
    preferredSlots: auto.preferredSlots?.length ? auto.preferredSlots : ['morning', 'evening'],
    contentMix: ['promo', 'educational', 'testimonial', 'offer', 'faq'],
    mediaMix: auto.mediaMix?.length ? auto.mediaMix : ['auto', 'image', 'slides', 'video'],
    imagesPerPostMin: auto.imagesPerPostMin || 1,
    imagesPerPostMax: auto.imagesPerPostMax || 3,
    customerGoal: auto.customerGoal || brand?.goals?.[0] || 'get customers immediately with clear offers, proof, and a direct call to action',
    strengthTarget: auto.strengthTarget || 90,
    generateImages: 'on'
  };
}

async function selectedOrDefaultAccounts({ body, userId, brand, platforms: platformList }) {
  const selected = selectedAccountsFromBody(body);
  if (selected.length) return selected;

  const filter = {
    owner: userId,
    brand: brand._id,
    status: { $in: ['connected', 'mock'] }
  };
  const allowedPlatforms = toArray(platformList).filter(Boolean);
  if (allowedPlatforms.length) filter.platform = { $in: allowedPlatforms };
  const accounts = await SocialAccount.find(filter).select('_id').sort({ platform: 1, accountName: 1 });
  return accounts.map((account) => account._id);
}

function wantsGeneratedImage(body) {
  const requestedType = String(body.type || '').toLowerCase();
  if (['text', 'article', 'link'].includes(requestedType)) return false;
  if (requestedType === 'carousel') return true;
  if (requestedType === 'image') return true;
  if (requestedType === 'video') return false;
  if (body.mediaFormat === 'short_video') return false;
  return body.generateImage === 'on' || ['ai_image', 'openai_image', 'replicate_image', 'gemini_image'].includes(body.imageMode) || ['generate_ai_image', 'generate_openai_image'].includes(body.mediaHandoff);
}

async function createGeneratedImageMedia({ req, brand, prompt, sourceMedia, contextLabel = 'post' }) {
  if (!wantsGeneratedImage(req.body)) return { mediaIds: [], errors: [] };
  const count = generatedImageCount(req.body, brand);
  const created = [];
  const errors = [];
  const requestedType = String(req.body.type || '').toLowerCase() || 'image';
  for (let index = 0; index < count; index += 1) {
    const creativePrefix = requestedType === 'carousel'
      ? `Facebook carousel card ${index + 1} of ${count}. Create a distinct real-looking commercial/lifestyle/product/service image, not a text slide and not a static poster. `
      : count > 1
        ? `Variation ${index + 1} of ${count}. Create a distinct real-looking branded image variation, not a duplicate and not a text card. `
        : '';
    const result = await generateImageAsset({
      brand,
      userId: req.user._id,
      prompt: `${creativePrefix}${prompt || req.body.imagePrompt || req.body.caption || req.body.goal || req.body.offer || `Social post image for ${brand.name}`}`,
      platform: req.body.platform || 'facebook',
      aspectRatio: req.body.aspectRatio || req.body.imageAspectRatio || (req.body.type === 'video' ? '9:16' : '1:1'),
      size: req.body.imageSize || undefined,
      sourceMedia,
      postType: requestedType,
      slideIndex: index,
      slideCount: count
    });

    if (!result.ok) {
      errors.push(result.message || 'Image generation failed.');
      continue;
    }

    const media = await Media.create({
      brand: brand._id,
      uploadedBy: req.user._id,
      fileName: result.fileName || `${brand.name} ${contextLabel} image ${index + 1}`,
      fileUrl: result.fileUrl,
      publicId: result.publicId || result.fileUrl,
      fileType: 'image',
      mimeType: result.mimeType || 'image/png',
      size: result.size || 0,
      folder: result.folder || 'openai-generated',
      tags: [result.provider || 'ai', 'generated', contextLabel, requestedType === 'carousel' ? 'carousel-slide' : count > 1 ? 'image-variation' : 'single-image'],
      aiPrompt: result.aiPrompt,
      aiInsights: {
        summary: `${result.provider || 'AI'} generated image for ${brand.name}.`,
        visualPrompt: result.aiPrompt,
        contentAngles: [req.body.goal, req.body.offer, req.body.contentType].filter(Boolean),
        recommendedPlatforms: [req.body.platform || 'facebook'],
        safetyNotes: [`Generated through ${result.provider || 'AI'} image generation. Review before publishing.`],
        reuseInstructions: ['Use this asset in posts for the selected brand and campaign.'],
        generatedFrom: `${result.provider || 'ai'}_image_api`,
        generatedAt: new Date()
      },
      variants: [{
        kind: `${result.provider || 'ai'}_generated_image`,
        label: result.providerModel || `${result.provider || 'AI'} generated image`,
        url: result.fileUrl,
        prompt: result.aiPrompt,
        status: 'ready',
        metadata: result.metadata || {},
        createdAt: new Date()
      }]
    });
    created.push(media._id);
  }
  return { mediaIds: created, errors };
}

function firstGenerationError(errors) {
  return [...new Set((errors || []).filter(Boolean))][0] || 'Image generation failed. Check your image provider settings and try again.';
}

function normalizedProvider(value) {
  const provider = String(value || '').toLowerCase().trim();
  return ['openai', 'replicate', 'gemini'].includes(provider) ? provider : undefined;
}

async function createGeneratedVideoMedia({ req, brand, prompt, sourceMedia, contextLabel = 'post-video' }) {
  if (req.body.type !== 'video' && req.body.mediaFormat !== 'short_video') return { mediaIds: [], warning: '' };
  const result = await generateVideo({
    preferredProvider: normalizedProvider(req.body.videoProvider),
    brand,
    userId: req.user._id,
    sourceMedia,
    prompt: prompt || req.body.videoScript || req.body.caption || req.body.goal || `Short marketing video for ${brand.name}`,
    aspectRatio: req.body.videoAspectRatio || '9:16',
    durationSeconds: req.body.videoDurationSeconds || 8,
    model: req.body.videoModel || undefined
  });
  if (!result.ok || !result.outputUrl) return { mediaIds: [], warning: result.message || 'Video renderer did not return a file. Storyboard images were attached instead.' };
  const media = await Media.create({
    brand: brand._id,
    uploadedBy: req.user._id,
    fileName: result.fileName || `${brand.name} ${contextLabel}.mp4`,
    fileUrl: result.outputUrl,
    publicId: result.providerJobId || result.outputUrl,
    fileType: 'video',
    mimeType: 'video/mp4',
    size: result.size || 0,
    folder: `${result.provider || 'ai'}-generated-video`,
    tags: [result.provider || 'ai', 'generated', 'video', contextLabel],
    aiPrompt: prompt,
    aiInsights: {
      summary: `${result.provider || 'AI'} generated video for ${brand.name}.`,
      visualPrompt: prompt,
      contentAngles: [req.body.goal, req.body.offer, req.body.contentType].filter(Boolean),
      recommendedPlatforms: [req.body.platform || 'facebook'],
      safetyNotes: ['Review generated video before publishing.'],
      reuseInstructions: ['Use this asset in posts for the selected brand and campaign.'],
      generatedFrom: `${result.provider || 'ai'}_video_api`,
      generatedAt: new Date()
    },
    variants: [{ kind: `${result.provider || 'ai'}_generated_video`, label: result.providerModel || `${result.provider || 'AI'} generated video`, url: result.outputUrl, prompt, status: 'ready', metadata: { providerJobId: result.providerJobId }, createdAt: new Date() }]
  });
  return { mediaIds: [media._id], warning: '' };
}

async function mediaIdsHaveVideo(mediaIds, userId) {
  if (!mediaIds.length) return false;
  return Boolean(await Media.exists({ _id: { $in: mediaIds }, uploadedBy: userId, fileType: 'video' }));
}

async function filterMediaIdsForIntent(mediaIds = [], userId, intent = {}) {
  const ids = [...new Set((mediaIds || []).map((id) => String(id)).filter(Boolean))];
  const allowed = Array.isArray(intent.allowedMediaTypes) ? intent.allowedMediaTypes : [];
  if (!ids.length) return [];
  if (!allowed.length) return [];

  const mediaRows = await Media.find({ _id: { $in: ids }, uploadedBy: userId }).select('_id fileType').lean();
  const allowedIds = new Set(mediaRows
    .filter((item) => mediaIntentAllowsType(intent, item.fileType))
    .map((item) => String(item._id)));
  return ids.filter((id) => allowedIds.has(String(id)));
}

async function createExternalMedia({ req, brand, mediaIntent = null }) {
  const created = [];
  const urls = toArray(req.body.externalMediaUrl)
    .flatMap((value) => String(value).split('\n'))
    .map((value) => value.trim())
    .filter(Boolean);

  for (const url of urls) {
    const mimeType = req.body.externalMediaMimeType || '';
    const detectedType = mediaKind(mimeType, url);
    const requestedFileType = req.body.externalMediaType || detectedType;
    const allowedMediaTypes = mediaIntent && Array.isArray(mediaIntent.allowedMediaTypes) ? mediaIntent.allowedMediaTypes : null;
    if (allowedMediaTypes && !allowedMediaTypes.length) continue;
    if (allowedMediaTypes && detectedType !== 'other' && !allowedMediaTypes.includes(detectedType)) continue;
    if (allowedMediaTypes && requestedFileType !== 'other' && !allowedMediaTypes.includes(requestedFileType)) continue;
    const media = await Media.create({
      brand: brand._id,
      uploadedBy: req.user._id,
      fileName: req.body.externalMediaName || url.split('/').pop() || url,
      fileUrl: url,
      publicId: url,
      fileType: requestedFileType,
      mimeType: mimeType || 'application/octet-stream',
      size: 0,
      folder: 'post-composer',
      tags: splitHashtags(req.body.externalMediaTags || '').map((tag) => tag.replace('#', '')),
      consentRequired: req.body.externalMediaConsent === 'on',
      consentStatus: req.body.externalMediaConsent === 'on' ? 'pending' : 'not_required'
    });
    media.aiInsights = buildMediaInsights(media, brand);
    media.aiPrompt = media.aiInsights.visualPrompt;
    await media.save();
    created.push(media._id);
  }

  return created;
}

function redirectWithDashboardMessage(res, path, message, status = 303) {
  const query = message ? `?error=${encodeURIComponent(message)}` : '';
  return res.redirect(status, `${path}${query}`);
}

async function newPost(req, res, next) {
  try {
    return res.redirect(303, '/dashboard/quick-create');
  } catch (error) {
    if (error.status === 402) {
      return res.redirect(`/dashboard/billing?error=${encodeURIComponent(error.message)}`);
    }
    return next(error);
  }
}

async function createPost(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id, status: 'active' });
    if (!brand) {
      return redirectWithDashboardMessage(res, '/dashboard/quick-create', 'Choose a valid brand.');
    }

    req.body = normalizeMediaPreset(req.body);
    req.body = applyBrandBrainDefaults(req.body, brand);
    req.body = normalizeMediaPreset(req.body);
    req.body.mediaPreset = mediaPresetValue(req.body);
    if (req.body.action === 'regenerate') {
      req.body.creationMode = 'ai';
      req.body.caption = '';
    }
    const mediaIntent = req.body.__mediaIntent || resolveComposerMediaIntent(req.body).__mediaIntent;
    const externalMediaIds = await createExternalMedia({ req, brand, mediaIntent });
    let selectedMediaIds = selectedMediaFromBody(req.body).concat(externalMediaIds);
    selectedMediaIds = await filterMediaIdsForIntent(selectedMediaIds, req.user._id, mediaIntent);
    const sourceMedia = selectedMediaIds.length ? await Media.findOne({ _id: selectedMediaIds[0], uploadedBy: req.user._id }) : null;

    let generated = null;
    if (req.body.creationMode !== 'manual' || wantsGeneratedImage(req.body) || req.body.type === 'video') {
      await assertCanGenerateText(req.user);
      generated = await generatePostIdea({
        brand,
        platform: req.body.platform || 'facebook',
        platforms: toArray(req.body.platforms || req.body.platform || 'facebook'),
        goal: [req.body.goal, req.body.offer, req.body.audience].filter(Boolean).join(' | '),
        contentType: req.body.contentType || 'promo',
        outputType: req.body.outputType,
        tone: req.body.toneOverride || req.body.tone,
        audience: req.body.audience,
        length: req.body.length,
        emojiLevel: req.body.emojiLevel,
        hashtagCount: req.body.hashtagCount,
        ctaType: req.body.ctaStyle,
        language: req.body.language,
        sourceMedia
      });
    }

    const generatedImages = await createGeneratedImageMedia({
      req,
      brand,
      prompt: req.body.imagePrompt || generated?.imagePrompt,
      sourceMedia,
      contextLabel: 'post'
    });
    const generatedMediaIds = generatedImages.mediaIds;
    selectedMediaIds.push(...generatedMediaIds);
    const generatedVideo = await createGeneratedVideoMedia({
      req,
      brand,
      prompt: req.body.videoPrompt || req.body.videoScript || generated?.videoScript || generated?.caption,
      sourceMedia: generatedMediaIds.length ? await Media.findById(generatedMediaIds[0]) : sourceMedia,
      contextLabel: 'post'
    });
    const generatedVideoIds = generatedVideo.mediaIds;
    selectedMediaIds.unshift(...generatedVideoIds);

    const requestedTypeForMedia = String(req.body.type || '').toLowerCase();
    if (requestedTypeForMedia === 'video') {
      const selectedVideoIds = await Media.find({ _id: { $in: selectedMediaIds }, uploadedBy: req.user._id, fileType: 'video' }).distinct('_id');
      const finalVideoIds = generatedVideoIds.length ? generatedVideoIds : selectedVideoIds;
      const seenVideoIds = new Set();
      selectedMediaIds.splice(
        0,
        selectedMediaIds.length,
        ...finalVideoIds.filter((id) => {
          const key = String(id);
          if (seenVideoIds.has(key)) return false;
          seenVideoIds.add(key);
          return true;
        })
      );
    }

    const hasVideoMedia = await mediaIdsHaveVideo(selectedMediaIds, req.user._id);
    if (requestedTypeForMedia === 'video' && !hasVideoMedia) {
      return redirectWithDashboardMessage(res, '/dashboard/quick-create', `Video generation failed: ${generatedVideo.warning || 'No MP4 video file was created.'}`);
    }

    if (wantsGeneratedImage(req.body) && generatedImages.errors.length && !generatedMediaIds.length && !generatedVideoIds.length && !selectedMediaIds.length) {
      return redirectWithDashboardMessage(res, '/dashboard/quick-create', `Image generation failed: ${firstGenerationError(generatedImages.errors)}`);
    }

    const caption = req.body.caption || generated?.caption;
    if (!caption) {
      return redirectWithDashboardMessage(res, '/dashboard/quick-create', 'Write a caption or use AI generation.');
    }

    const selectedPlatforms = [...new Set(toArray(req.body.platforms || req.body.platform || 'facebook'))];
    const primaryPlatform = selectedPlatforms[0] || req.body.platform || 'facebook';
    const targetAccounts = await selectedOrDefaultAccounts({ body: req.body, userId: req.user._id, brand, platforms: selectedPlatforms });
    const requestedType = String(req.body.type || '').toLowerCase();
    const inferredType = requestedType || (generatedVideoIds.length
      ? 'video'
      : selectedMediaIds.length > 1
        ? 'carousel'
        : selectedMediaIds.length
        ? 'image'
        : sourceMedia?.fileType === 'video' ? 'video' : 'text');
    const baseContent = {
      title: req.body.title || generated?.title || `${brand.name} post`,
      description: req.body.description || generated?.description || '',
      caption,
      hashtags: splitHashtags(req.body.hashtags || generated?.hashtags?.join(' ') || brand.preferredHashtags?.join(' ') || ''),
      firstComment: req.body.firstComment || '',
      altText: req.body.altText || '',
      thumbnail: req.body.thumbnail || '',
      videoTitle: req.body.videoTitle || req.body.title || generated?.title || '',
      videoDescription: req.body.videoDescription || req.body.description || generated?.description || '',
      shortVideoHook: req.body.shortVideoHook || '',
      ctaStyle: req.body.ctaStyle || brand.ctaStyle || brand.preferredCta || '',
      toneOverride: req.body.toneOverride || '',
      type: inferredType,
      link: req.body.link || '',
      mediaCount: selectedMediaIds.length
    };
    const platformVariations = await createPlatformVariations({ baseContent, brand, platforms: selectedPlatforms, accounts: targetAccounts });
    const selectedMediaDocs = selectedMediaIds.length
      ? await Media.find({ _id: { $in: selectedMediaIds }, uploadedBy: req.user._id }).lean()
      : [];
    const composerWarnings = await validateComposerSubmission({
      ...baseContent,
      platform: primaryPlatform,
      platforms: selectedPlatforms,
      media: selectedMediaDocs,
      link: req.body.link || ''
    });
    const validationWarnings = [...new Set(platformVariations.flatMap((item) => item.validationWarnings || []).concat(composerWarnings))];
    const average = (field) => Math.round((platformVariations.reduce((total, item) => total + Number(item[field] || 0), 0) / Math.max(platformVariations.length, 1)) || 0);
    if (req.body.workflowMode === 'handoff') await assertCanCreateHandoffPosts(req.user);
    if (req.body.workflowMode === 'auto' || req.body.autoPublishEnabled === 'on') await assertCanCreateAutoPosts(req.user);
    const post = await Post.create({
      brand: brand._id,
      platform: primaryPlatform,
      platforms: selectedPlatforms,
      type: inferredType,
      contentGoal: normalizeContentGoal(req.body.contentGoal || req.body.goal),
      workflowMode: req.body.workflowMode || 'manual',
      autoPublishEnabled: req.body.autoPublishEnabled === 'on',
      publishAfterApproval: req.body.publishAfterApproval === 'on',
      approvalRequired: req.body.approvalRequired === 'on' || brand.approvalRequiredByDefault === true,
      handoffStatus: req.body.workflowMode === 'handoff' ? 'ready' : 'none',
      handoffReviewerEmail: String(req.body.handoffReviewerEmail || '').trim().toLowerCase(),
      handoffNotes: req.body.handoffNotes || '',
      title: baseContent.title,
      description: baseContent.description,
      caption,
      hashtags: baseContent.hashtags,
      firstComment: baseContent.firstComment,
      altText: baseContent.altText,
      thumbnail: baseContent.thumbnail,
      videoTitle: baseContent.videoTitle,
      videoDescription: baseContent.videoDescription,
      shortVideoHook: baseContent.shortVideoHook,
      ctaStyle: baseContent.ctaStyle,
      toneOverride: baseContent.toneOverride,
      aiProvider: req.body.aiProvider || '',
      aiModel: req.body.aiModel || '',
      platformVariations,
      validationWarnings,
      contentScore: average('contentScore'),
      brandFitScore: average('brandFitScore'),
      riskScore: average('riskScore'),
      media: selectedMediaIds,
      link: req.body.link || '',
      targetAccounts,
      status: 'draft',
      platformMetadata: {
        ...buildCreativePlan({ ...req.body, __brand: brand, __sourceMedia: sourceMedia }, generated),
        selectedPlatforms,
        imageWarning: generatedImages.errors.join(' | '),
        videoWarning: generatedVideo.warning || ''
      },
      createdBy: req.user._id
    });

    if (generated) {
      const generationControls = normalizeGenerationControls({
        ...req.body,
        platforms: selectedPlatforms,
        outputType: generated.generatedBundle?.outputType || req.body.outputType
      });
      const generationCredits = creditsForGeneration(generationControls);
      await spendCredits({
        user: req.user,
        amount: generationCredits,
        reason: `Composer ${generationControls.outputType} generation`,
        referenceType: 'Post',
        referenceId: post._id
      });
      await UsageLog.create({
        user: req.user._id,
        brand: brand._id,
        action: 'ai_generate_content',
        provider: generated.provider,
        credits: generationCredits,
        metadata: {
          post: post._id,
          controls: generationControls,
          outputType: generationControls.outputType,
          mediaGenerated: selectedMediaIds.length
        }
      });
    }

    const action = req.body.action || 'save';
    if (action === 'schedule') {
      const scheduledAt = scheduleDateFromBody(req.body.scheduledAt);
      if (!scheduledAt) {
        return redirectWithDashboardMessage(res, '/dashboard/quick-create', 'Choose a valid schedule date.');
      }
      await assertCanSchedulePost(req.user);
      post.status = post.approvalRequired ? 'pending_approval' : 'scheduled';
      post.scheduledAt = scheduledAt;
      await post.save();
      if (post.status === 'pending_approval') {
        return res.redirect('/dashboard/approvals');
      }
      await tryEnqueue(post, req.user._id);
      return res.redirect('/dashboard/calendar');
    }

    if (action === 'publish') {
      if (post.approvalRequired) {
        post.status = 'pending_approval';
        await post.save();
        return res.redirect('/dashboard/approvals');
      }
      post.status = 'publishing';
      post.scheduledAt = new Date();
      await post.save();
      await publishPost(post._id);
      return res.redirect('/dashboard/calendar');
    }

    return res.redirect('/dashboard/content-library');
  } catch (error) {
    return next(error);
  }
}

async function drafts(req, res, next) {
  try {
    const filters = { createdBy: req.user._id };
    if (req.query.status) filters.status = req.query.status;
    if (req.query.platform) filters.platform = req.query.platform;
    if (req.query.brand) filters.brand = req.query.brand;

    const [posts, brands] = await Promise.all([
      Post.find(filters)
        .populate('brand')
        .populate('targetAccounts')
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(200),
      Brand.find({ owner: req.user._id, status: 'active' }).sort({ name: 1 })
    ]);

    const stats = posts.reduce(
      (acc, post) => {
        acc.total += 1;
        acc[post.status] = (acc[post.status] || 0) + 1;
        return acc;
      },
      { total: 0, draft: 0, scheduled: 0, publishing: 0, published: 0, failed: 0, cancelled: 0 }
    );

    return res.redirect(303, '/dashboard/content-library');
  } catch (error) {
    next(error);
  }
}

async function edit(req, res, next) {
  try {
    const post = await Post.findOne({ _id: req.params.id, createdBy: req.user._id }).populate('brand').populate('media').populate('targetAccounts');
    if (!post) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    const [media, socialAccounts] = await Promise.all([
      Media.find({ brand: post.brand._id, uploadedBy: req.user._id }).sort({ createdAt: -1 }),
      SocialAccount.find({ brand: post.brand._id, owner: req.user._id, platform: post.platform, status: { $in: ['connected', 'mock'] } }).sort({ accountName: 1 })
    ]);

    return res.redirect(303, `/dashboard/content-library?edit=${encodeURIComponent(String(post._id))}`);
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const post = await Post.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!post) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    if (Object.prototype.hasOwnProperty.call(req.body, 'title')) post.title = req.body.title;
    if (Object.prototype.hasOwnProperty.call(req.body, 'description')) post.description = req.body.description;
    if (Object.prototype.hasOwnProperty.call(req.body, 'caption')) post.caption = req.body.caption;
    if (Object.prototype.hasOwnProperty.call(req.body, 'hashtags')) post.hashtags = splitHashtags(req.body.hashtags);
    post.platform = req.body.platform || post.platform;
    post.type = req.body.type || post.type;
    if (Object.prototype.hasOwnProperty.call(req.body, 'link')) post.link = req.body.link;
    if (Object.prototype.hasOwnProperty.call(req.body, 'status') && req.body.status) post.status = req.body.status;
    if (Object.prototype.hasOwnProperty.call(req.body, 'scheduledAt')) {
      post.scheduledAt = req.body.scheduledAt ? parseScheduledDateInput(req.body.scheduledAt) : undefined;
    }
    const selectedMedia = selectedMediaFromBody(req.body);
    const selectedAccounts = selectedAccountsFromBody(req.body);
    if (selectedMedia.length || Object.prototype.hasOwnProperty.call(req.body, 'media')) post.media = selectedMedia;
    if (selectedAccounts.length || Object.prototype.hasOwnProperty.call(req.body, 'targetAccounts')) post.targetAccounts = selectedAccounts;
    post.platformMetadata = {
      ...(post.platformMetadata || {}),
      imagePrompt: req.body.imagePrompt || post.platformMetadata?.imagePrompt,
      videoScript: req.body.videoScript || post.platformMetadata?.videoScript,
      editedAt: new Date()
    };
    const validationMedia = post.media?.length
      ? await Media.find({ _id: { $in: post.media }, uploadedBy: req.user._id }).lean()
      : [];
    post.validationWarnings = await validateComposerSubmission({
      type: post.type,
      platform: post.platform,
      platforms: post.platforms?.length ? post.platforms : [post.platform],
      caption: post.caption,
      hashtags: post.hashtags,
      firstComment: post.firstComment,
      altText: post.altText,
      thumbnail: post.thumbnail,
      link: post.link,
      media: validationMedia
    });
    await post.save();

    return res.redirect('/dashboard/content-library');
  } catch (error) {
    return next(error);
  }
}

async function schedule(req, res, next) {
  try {
    const post = await Post.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!post) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    const scheduledAt = scheduleDateFromBody(req.body.scheduledAt);
    if (!scheduledAt) {
      return redirectWithDashboardMessage(res, '/dashboard/calendar', 'Choose a valid schedule date.');
    }

    await assertCanSchedulePost(req.user, SCHEDULED_POST_STATUSES.includes(post.status) ? 0 : 1);
    post.scheduledAt = scheduledAt;
    post.status = 'scheduled';
    await post.save();
    await tryEnqueue(post, req.user._id);

    await Notification.create({
      user: req.user._id,
      type: 'post_scheduled',
      title: 'Post scheduled',
      message: `${post.title || post.platform} was scheduled.`,
      entityType: 'Post',
      entityId: post._id
    });

    return res.redirect('/dashboard/calendar');
  } catch (error) {
    return next(error);
  }
}

async function bulkReschedule(req, res, next) {
  try {
    const postIds = idsFromBody(req.body.postIds);
    if (!postIds.length) {
      return redirectWithDashboardMessage(res, '/dashboard/calendar', 'Select at least one post to reschedule.');
    }

    const dayOffset = Number(req.body.dayOffset || 0);
    const hasOffset = Number.isFinite(dayOffset) && dayOffset !== 0;
    const startAt = scheduleDateFromBody(req.body.scheduledAt, { allowDefault: false });
    if (!hasOffset && !startAt) {
      return redirectWithDashboardMessage(res, '/dashboard/calendar', 'Choose a start time or day offset for bulk reschedule.');
    }

    const spacingMinutes = Math.max(0, Math.min(1440, Number(req.body.spacingMinutes || 30)));
    const posts = await Post.find({ _id: { $in: postIds }, createdBy: req.user._id }).sort({ scheduledAt: 1, createdAt: 1 });
    const newlyScheduled = posts.filter((post) => !SCHEDULED_POST_STATUSES.includes(post.status)).length;
    if (newlyScheduled) await assertCanSchedulePost(req.user, newlyScheduled);
    let updated = 0;

    for (let index = 0; index < posts.length; index += 1) {
      const post = posts[index];
      const current = post.scheduledAt || post.createdAt || nextDefaultScheduleDate();
      const scheduledAt = hasOffset
        ? new Date(new Date(current).getTime() + dayOffset * 24 * 60 * 60 * 1000)
        : new Date(startAt.getTime() + index * spacingMinutes * 60 * 1000);
      post.scheduledAt = scheduledAt;
      post.status = 'scheduled';
      if (post.errorMessage) post.errorMessage = '';
      post.platformMetadata = {
        ...(post.platformMetadata || {}),
        bulkRescheduledAt: new Date(),
        bulkRescheduleSource: hasOffset ? `${dayOffset} day offset` : 'shared start time'
      };
      await post.save();
      await tryEnqueue(post, req.user._id);
      updated += 1;
    }

    if (updated) {
      await Notification.create({
        user: req.user._id,
        type: 'posts_bulk_rescheduled',
        title: 'Posts rescheduled',
        message: `${updated} post(s) were moved on the calendar.`,
        entityType: 'Post'
      });
    }

    return res.redirect(`/dashboard/calendar?bulk_rescheduled=${encodeURIComponent(String(updated))}`);
  } catch (error) {
    return next(error);
  }
}

async function retry(req, res, next) {
  try {
    const post = await Post.findOne({ _id: req.params.id, createdBy: req.user._id, status: 'failed' });
    if (!post) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    const scheduledAt = scheduleDateFromBody(req.body.scheduledAt, { allowDefault: false }) || new Date(Date.now() + 5 * 60 * 1000);
    await assertCanSchedulePost(req.user);
    post.status = 'scheduled';
    post.scheduledAt = scheduledAt;
    post.retryCount = Number(post.retryCount || 0) + 1;
    post.errorMessage = '';
    post.platformMetadata = {
      ...(post.platformMetadata || {}),
      manualRetryAt: new Date(),
      retry: {
        ...(post.platformMetadata?.retry || {}),
        manual: true,
        nextRetryAt: scheduledAt
      }
    };
    await post.save();
    await tryEnqueue(post, req.user._id);

    await Notification.create({
      user: req.user._id,
      type: 'post_retry_scheduled',
      title: 'Post retry scheduled',
      message: `${post.title || post.platform} will retry shortly.`,
      entityType: 'Post',
      entityId: post._id
    });

    return res.redirect('/dashboard/calendar?retry_scheduled=1');
  } catch (error) {
    return next(error);
  }
}

async function duplicate(req, res, next) {
  try {
    const post = await Post.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!post) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    const copy = await Post.create({
      brand: post.brand,
      campaign: post.campaign,
      platform: req.body.platform || post.platform,
      type: post.type,
      title: `${post.title || 'Post'} copy`,
      description: post.description,
      caption: post.caption,
      hashtags: post.hashtags,
      media: post.media,
      link: post.link,
      targetAccounts: post.targetAccounts,
      platformMetadata: post.platformMetadata,
      status: 'draft',
      createdBy: req.user._id
    });

    return res.redirect('/dashboard/content-library');
  } catch (error) {
    return next(error);
  }
}

async function publishNow(req, res, next) {
  try {
    const post = await Post.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!post) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    post.status = 'publishing';
    post.scheduledAt = new Date();
    await post.save();
    await publishPost(post._id);

    return res.redirect('/dashboard/calendar');
  } catch (error) {
    return next(error);
  }
}

async function cancel(req, res, next) {
  try {
    const post = await Post.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!post) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    post.status = 'cancelled';
    await post.save();
    return res.redirect('/dashboard/calendar');
  } catch (error) {
    return next(error);
  }
}

async function destroy(req, res, next) {
  try {
    await Post.deleteOne({ _id: req.params.id, createdBy: req.user._id });
    return res.redirect('/dashboard/content-library');
  } catch (error) {
    return next(error);
  }
}

async function handoff(req, res, next) {
  try {
    return res.redirect(303, '/dashboard/approvals');
  } catch (error) {
    return next(error);
  }
}

async function createHandoff(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id, status: 'active' });
    if (!brand) {
      return redirectWithDashboardMessage(res, '/dashboard/approvals', 'Choose a valid brand.');
    }

    const selectedPlatforms = toArray(req.body.platforms || req.body.platform || 'facebook');
    const targetAccounts = await selectedOrDefaultAccounts({ body: req.body, userId: req.user._id, brand, platforms: selectedPlatforms });
    if (!targetAccounts.length) {
      return redirectWithDashboardMessage(res, '/dashboard/social', 'Connect at least one Facebook Page/account first.');
    }

    const contentMix = toArray(req.body.contentMix).length ? toArray(req.body.contentMix) : ['promo', 'educational', 'testimonial', 'offer', 'faq'];
    const mediaMix = toArray(req.body.mediaMix).length ? toArray(req.body.mediaMix) : ['auto', 'image', 'slides', 'video'];
    const frequencyUnit = req.body.frequencyUnit || 'week';
    const count = frequencyUnit === 'day'
      ? Number(req.body.postsPerDay || 1)
      : frequencyUnit === 'month'
        ? Number(req.body.postsPerMonth || 30)
        : Number(req.body.postsPerWeek || 7);
    const requestedCount = Number.isFinite(count) ? Math.max(1, Math.min(90, count)) : 1;
    await assertCanSchedulePost(req.user, requestedCount);
    await assertCanCreateHandoffPosts(req.user, requestedCount);

    const result = await createScheduledPostsFromBatch({
      userId: req.user._id,
      brand,
      targetAccounts,
      enqueue: (post) => tryEnqueue(post, req.user._id),
      input: {
        platforms: selectedPlatforms,
        frequencyUnit,
        count: requestedCount,
        workflowMode: 'handoff',
        startDate: req.body.startDate,
        preferredSlots: splitLines(req.body.preferredSlots || '').length ? splitLines(req.body.preferredSlots) : toArray(req.body.preferredSlots),
        contentMix,
        mediaMix,
        imagesPerPostMin: Number(req.body.imagesPerPostMin || brand.autoPosting?.imagesPerPostMin || 1),
        imagesPerPostMax: Number(req.body.imagesPerPostMax || brand.autoPosting?.imagesPerPostMax || 3),
        imageSize: req.body.imageSize || '1024x1024',
        generateImages: req.body.generateImages !== 'off',
        customerGoal: req.body.customerGoal || req.body.campaignGoal || brand.autoPosting?.customerGoal,
        strengthTarget: Number(req.body.strengthTarget || brand.autoPosting?.strengthTarget || 90)
      }
    });

    await Notification.create({
      user: req.user._id,
      type: 'handoff_created',
      title: 'OpenAI auto campaign scheduled',
      message: `${result.createdPosts.length} post(s) were generated and scheduled for ${brand.name}.`,
      entityType: 'Brand',
      entityId: brand._id
    });

    return res.redirect(303, `/dashboard/calendar?handoff_created=${encodeURIComponent(String(result.createdPosts.length))}`);
  } catch (error) {
    return next(error);
  }
}

module.exports = { newPost, createPost, handoff, createHandoff, drafts, edit, update, schedule, bulkReschedule, retry, duplicate, publishNow, cancel, destroy };
