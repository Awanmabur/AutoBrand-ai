const Brand = require('../../models/Brand');
const AiJob = require('../../models/AiJob');
const Approval = require('../../models/Approval');
const Post = require('../../models/Post');
const Media = require('../../models/Media');
const Notification = require('../../models/Notification');
const SocialAccount = require('../../models/SocialAccount');
const UsageLog = require('../../models/UsageLog');
const { dispatchScheduledPost } = require('../../services/postDispatchService');
const { spendCredits } = require('../../services/creditService');
const {
  SCHEDULED_POST_STATUSES,
  assertCanCreateAutoPosts,
  assertCanCreateVideo,
  assertCanCreateHandoffPosts,
  assertCanGenerateImage,
  assertCanGenerateText,
  assertCanSchedulePost
} = require('../../services/usageLimitService');
const { buildPlatformPreview } = require('../../services/platformPreviewService');
const { generatePostIdea, generateImageAsset, buildCreativePackage, buildScheduleSlots } = require('../../services/aiContentService');
const { creditsForGeneration, normalizeGenerationControls } = require('../../services/aiContentGeneration.service');
const { createScheduledPostsFromBatch } = require('../../services/autoCampaignService');
const { buildMediaInsights } = require('../../services/mediaInsightService');
const { createPlatformVariations } = require('../../services/composer/platformVariation.service');
const { validateComposerSubmission } = require('../../services/composer/composerPayloadValidation.service');
const { resolveComposerMediaIntent, mediaIntentAllowsType } = require('../../services/composer/mediaIntent.service');
const { buildPostGenerationPlan, enqueuePostGeneration } = require('../../services/postGeneration.service');
const { DEFAULT_TIME_ZONE, zonedLocalTimeToUtc } = require('../../utils/timeZone');
const env = require('../../config/env');
const { canDecryptToken } = require('../../services/tokenCryptoService');
const { buildComposerDestinationCatalog, resolvePublishingTargets } = require('../../services/social/socialDestination.service');

const postTypes = ['text', 'image', 'carousel', 'video', 'reel', 'story', 'link', 'article', 'campaign'];
const contentTypes = ['promo', 'educational', 'testimonial', 'offer', 'product', 'announcement', 'engagement', 'behind_the_scenes', 'proof', 'faq', 'launch'];
const contentGoals = ['awareness', 'engagement', 'sales', 'traffic', 'lead_generation', 'community', 'customer_support', 'launch', 'event', 'other'];


function publishableAccountStatuses() {
  // Mock accounts are UI/testing records only. They must never appear as live
  // publishing destinations, even while NODE_ENV=development.
  return ['connected'];
}

async function notifySafely(payload) {
  try {
    await Notification.create(payload);
  } catch (error) {
    console.warn('[composer] notification could not be saved', {
      type: payload?.type,
      entityId: payload?.entityId ? String(payload.entityId) : undefined,
      message: error?.message
    });
  }
}

function normalizeContentGoal(value) {
  const goal = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return contentGoals.includes(goal) ? goal : 'awareness';
}

function parseScheduledDateInput(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value).trim();
  if (!text) return null;
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(text)) return new Date(text);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    return zonedLocalTimeToUtc({
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4] || 0),
      minute: Number(match[5] || 0),
      second: Number(match[6] || 0),
      millisecond: 0,
      timeZone: DEFAULT_TIME_ZONE
    });
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

async function activeGenerationJobForPost(post, userId) {
  return AiJob.findOne({
    user: userId,
    'metadata.postId': String(post._id),
    taskType: { $in: ['post_content_generation', 'post_video_generation'] },
    status: { $in: ['queued', 'running'] }
  }).sort({ createdAt: -1 });
}

function generationActionBlocker(post) {
  const generation = post?.platformMetadata?.generation || {};
  const status = String(generation.status || '').toLowerCase();
  if (['queued', 'running'].includes(status)) {
    return 'This post is still waiting for AI generation. The built-in worker will recover it automatically; refresh Content Library before publishing.';
  }
  if (status === 'failed') {
    return generation.error || post.errorMessage || 'AI generation failed. Regenerate the post or change it to a complete manual/text post before publishing.';
  }
  return '';
}

async function deferActionUntilGeneration({ post, job, action, scheduledAt }) {
  job.metadata = {
    ...(job.metadata || {}),
    requestedAction: action,
    scheduledAt: scheduledAt || null,
    actionUpdatedAt: new Date()
  };
  job.markModified('metadata');
  await job.save();

  post.status = 'draft';
  post.scheduledAt = scheduledAt || post.scheduledAt;
  post.platformMetadata = {
    ...(post.platformMetadata || {}),
    generation: {
      ...(post.platformMetadata?.generation || {}),
      status: job.status,
      requestedAction: action,
      scheduledAt: scheduledAt || null,
      updatedAt: new Date()
    }
  };
  post.markModified('platformMetadata');
  await post.save();
  return post;
}

async function hasPublishingApproval(post) {
  if (!post.approvalRequired) return true;
  if (post.status === 'approved' || post.handoffStatus === 'approved') return true;
  return Boolean(await Approval.exists({
    post: post._id,
    $or: [{ status: 'approved' }, { decision: 'approved' }]
  }));
}

function preparePostForApproval(post, scheduledAt) {
  post.status = 'pending_approval';
  post.publishAfterApproval = true;
  post.scheduledAt = scheduledAt;
  post.scheduleVersion = Number(post.scheduleVersion || 0) + 1;
  post.publishingStartedAt = undefined;
  post.publishingAttemptId = '';
  return post;
}

function preparePostForSchedule(post, scheduledAt) {
  const isRepost = post.status === 'published';
  post.scheduledAt = scheduledAt;
  post.status = 'scheduled';
  if (isRepost) {
    post.publishResults = [];
    post.platformPostId = undefined;
    post.platformPostUrl = undefined;
    post.publishedAt = undefined;
    post.retryCount = 0;
  }
  post.scheduleVersion = Number(post.scheduleVersion || 0) + 1;
  post.publishingStartedAt = undefined;
  post.publishingAttemptId = '';
  if (post.errorMessage) post.errorMessage = '';
  return post;
}

async function tryEnqueue(post, userId) {
  return dispatchScheduledPost(post, { userId });
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
    SocialAccount.find({ owner: userId, brand: { $in: brandIds }, status: { $in: publishableAccountStatuses() } })
      .populate('brand')
      .sort({ platform: 1, accountName: 1 })
  ]);

  const destinationCatalog = buildComposerDestinationCatalog(socialAccounts, { verifyEncryption: true });
  return {
    brands,
    media,
    socialAccounts: destinationCatalog.accounts,
    activeBrandId,
    platforms: destinationCatalog.platformKeys,
    platformOptions: destinationCatalog.platforms,
    postTypes,
    contentTypes,
    contentGoals
  };
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
    platforms: [],
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

function publishingTargetError(message) {
  const error = new Error(message);
  error.code = 'PUBLISHING_TARGETS_UNAVAILABLE';
  error.status = 400;
  return error;
}

async function resolveComposerTargets({ body, userId, brand, platforms: platformList }) {
  return resolvePublishingTargets({
    ownerId: userId,
    brandId: brand._id,
    requestedPlatforms: toArray(platformList),
    requestedAccountIds: selectedAccountsFromBody(body),
    requireReady: true,
    allowPlatformDefaults: true
  });
}

async function selectedOrDefaultAccounts(args) {
  const targets = await resolveComposerTargets(args);
  return targets.accountIds;
}

async function assertPostHasLiveTargets(post, userId) {
  return selectedOrDefaultAccounts({
    body: { targetAccounts: post.targetAccounts || [] },
    userId,
    brand: { _id: post.brand?._id || post.brand },
    platforms: post.platforms?.length ? post.platforms : [post.platform].filter(Boolean),
    requireLive: true
  });
}

function wantsGeneratedImage(body) {
  if (body.__skipAiGeneration) return false;
  const requestedType = String(body.type || '').toLowerCase();
  if (['text', 'article', 'link'].includes(requestedType)) return false;
  if (requestedType === 'carousel') return true;
  if (requestedType === 'image') return true;
  if (requestedType === 'video') return false;
  if (body.mediaFormat === 'short_video') return false;
  return body.generateImage === 'on' || ['ai_image', 'openai_image', 'replicate_image', 'gemini_image'].includes(body.imageMode) || ['generate_ai_image', 'generate_openai_image'].includes(body.mediaHandoff);
}

async function mapWithConcurrency(items, limit, task) {
  const queue = Array.from(items || []);
  const results = new Array(queue.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(Number(limit || 1), queue.length || 1));

  async function worker() {
    while (nextIndex < queue.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(queue[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function createGeneratedImageMedia({ req, brand, prompt, sourceMedia, contextLabel = 'post' }) {
  if (!wantsGeneratedImage(req.body)) return { mediaIds: [], errors: [] };
  const count = generatedImageCount(req.body, brand);
  const requestedType = String(req.body.type || '').toLowerCase() || 'image';
  const jobs = await mapWithConcurrency(Array.from({ length: count }), 3, async (_item, index) => {
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
      return { mediaId: null, error: result.message || 'Image generation failed.' };
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
    return { mediaId: media._id, error: '' };
  });

  return {
    mediaIds: jobs.map((item) => item?.mediaId).filter(Boolean),
    errors: jobs.map((item) => item?.error).filter(Boolean)
  };
}

function firstGenerationError(errors) {
  return [...new Set((errors || []).filter(Boolean))][0] || 'Image generation failed. Check your image provider settings and try again.';
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

function serializableGenerationBody(body = {}) {
  const output = { ...body };
  delete output.__brand;
  delete output.__mediaIntent;
  delete output.__skipAiGeneration;
  return JSON.parse(JSON.stringify(output));
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

    const action = req.body.action || 'save';
    let requestedScheduledAt = null;
    if (action === 'schedule') {
      requestedScheduledAt = scheduleDateFromBody(req.body.scheduledAt);
      if (!requestedScheduledAt) {
        return redirectWithDashboardMessage(res, '/dashboard/quick-create', 'Choose a valid schedule date.');
      }
      await assertCanSchedulePost(req.user);
    }

    const mediaIntent = req.body.__mediaIntent || resolveComposerMediaIntent(req.body).__mediaIntent;
    const externalMediaIds = await createExternalMedia({ req, brand, mediaIntent });
    let selectedMediaIds = selectedMediaFromBody(req.body).concat(externalMediaIds);
    selectedMediaIds = await filterMediaIdsForIntent(selectedMediaIds, req.user._id, mediaIntent);
    const sourceMedia = selectedMediaIds.length
      ? await Media.findOne({ _id: selectedMediaIds[0], uploadedBy: req.user._id })
      : null;

    const initialSelectedMediaRows = selectedMediaIds.length
      ? await Media.find({ _id: { $in: selectedMediaIds }, uploadedBy: req.user._id, status: { $ne: 'archived' } })
      : [];
    const generationPlan = buildPostGenerationPlan(req.body, initialSelectedMediaRows, brand);

    if (generationPlan.needsGeneration) {
      if (generationPlan.needsText) await assertCanGenerateText(req.user);
      if (generationPlan.imagesToGenerate > 0) await assertCanGenerateImage(req.user, generationPlan.imagesToGenerate);
      if (generationPlan.needsVideo) await assertCanCreateVideo(req.user);
      if (req.body.workflowMode === 'handoff') await assertCanCreateHandoffPosts(req.user);
      if (req.body.workflowMode === 'auto' || req.body.autoPublishEnabled === 'on') await assertCanCreateAutoPosts(req.user);

      const targets = await resolveComposerTargets({
        body: req.body,
        userId: req.user._id,
        brand,
        platforms: toArray(req.body.platforms || req.body.platform)
      });
      const selectedPlatforms = targets.platforms;
      const primaryPlatform = selectedPlatforms[0];
      const targetAccounts = targets.accountIds;
      const provisionalMediaIds = generationPlan.isVideo
        ? generationPlan.existingVideoIds
        : generationPlan.isImage
          ? generationPlan.existingImageIds
          : [];
      const placeholderCaption = String(req.body.caption || '').trim()
        || `AI generation is preparing this ${generationPlan.isVideo ? 'video' : generationPlan.isImage ? 'visual post' : 'post'} for ${brand.name}.`;
      const queuedGeneration = {
        status: 'queued',
        stage: 'queued',
        kind: generationPlan.isVideo ? 'video' : generationPlan.isImage ? 'image' : 'content',
        requestedAction: action,
        queuedAt: new Date(),
        error: ''
      };

      const post = await Post.create({
        brand: brand._id,
        platform: primaryPlatform,
        platforms: selectedPlatforms,
        type: req.body.type || 'text',
        contentGoal: normalizeContentGoal(req.body.contentGoal || req.body.goal),
        workflowMode: req.body.workflowMode || 'manual',
        autoPublishEnabled: req.body.autoPublishEnabled === 'on',
        publishAfterApproval: req.body.publishAfterApproval === 'on',
        approvalRequired: req.body.approvalRequired === 'on' || brand.approvalRequiredByDefault === true,
        handoffStatus: req.body.workflowMode === 'handoff' ? 'drafting' : 'none',
        handoffReviewerEmail: String(req.body.handoffReviewerEmail || '').trim().toLowerCase(),
        handoffNotes: req.body.handoffNotes || '',
        title: req.body.title || `${brand.name} post`,
        description: req.body.description || '',
        caption: placeholderCaption,
        hashtags: splitHashtags(req.body.hashtags || brand.preferredHashtags?.join(' ') || ''),
        firstComment: req.body.firstComment || '',
        altText: req.body.altText || '',
        thumbnail: req.body.thumbnail || '',
        videoTitle: req.body.videoTitle || req.body.title || '',
        videoDescription: req.body.videoDescription || req.body.description || '',
        shortVideoHook: req.body.shortVideoHook || '',
        ctaStyle: req.body.ctaStyle || brand.ctaStyle || brand.preferredCta || '',
        toneOverride: req.body.toneOverride || '',
        aiProvider: req.body.aiProvider || '',
        aiModel: req.body.aiModel || '',
        media: provisionalMediaIds,
        link: req.body.link || '',
        targetAccounts,
        status: 'draft',
        platformMetadata: {
          ...buildCreativePlan({ ...req.body, __brand: brand, __sourceMedia: sourceMedia }, null),
          selectedPlatforms,
          generation: queuedGeneration
        },
        createdBy: req.user._id
      });

      let job;
      try {
        job = await enqueuePostGeneration({
          post,
          brand,
          userId: req.user._id,
          body: serializableGenerationBody(req.body),
          selectedMediaIds,
          plan: generationPlan,
          requestedAction: action,
          scheduledAt: requestedScheduledAt
        });
      } catch (queueError) {
        post.errorMessage = queueError.message || 'Generation could not be queued.';
        post.platformMetadata = {
          ...(post.platformMetadata || {}),
          generation: {
            ...(post.platformMetadata?.generation || queuedGeneration),
            status: 'failed',
            error: post.errorMessage,
            failedAt: new Date(),
            updatedAt: new Date()
          }
        };
        post.markModified('platformMetadata');
        await post.save().catch(() => {});
        throw queueError;
      }
      post.platformMetadata = {
        ...(post.platformMetadata || {}),
        generation: {
          ...(post.platformMetadata?.generation || queuedGeneration),
          jobId: job._id,
          status: job.status || 'queued',
          updatedAt: new Date()
        }
      };
      post.markModified('platformMetadata');
      await post.save();

      console.log('[composer] AI post queued', {
        postId: String(post._id),
        generationJobId: String(job._id),
        requestedAction: action,
        platforms: selectedPlatforms,
        targetAccountIds: targetAccounts.map((id) => String(id)),
        scheduledAt: requestedScheduledAt ? requestedScheduledAt.toISOString() : null
      });

      await Notification.create({
        user: req.user._id,
        type: generationPlan.isVideo ? 'video_generation_queued' : 'post_generation_queued',
        title: generationPlan.isVideo ? 'Video generation started' : 'Post generation started',
        message: `${post.title} was saved immediately. Generation is continuing in the background and the same post will update automatically.`,
        entityType: 'Post',
        entityId: post._id,
        actionUrl: '/dashboard/content-library'
      }).catch(() => {});

      const generationNotice = action === 'publish'
        ? 'post_generation_publish_queued'
        : action === 'schedule'
          ? 'post_generation_schedule_queued'
          : 'post_generation_queued';
      return res.redirect(`/dashboard/content-library?notice=${generationNotice}`);
    }

    req.body.__skipAiGeneration = true;

    let generated = null;
    if (!req.body.__skipAiGeneration && (req.body.creationMode !== 'manual' || wantsGeneratedImage(req.body) || req.body.type === 'video')) {
      await assertCanGenerateText(req.user);
      generated = await generatePostIdea({
        brand,
        platform: req.body.platform || 'facebook',
        platforms: toArray(req.body.platforms || req.body.platform),
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

    const selectedMediaRows = selectedMediaIds.length
      ? await Media.find({ _id: { $in: selectedMediaIds }, uploadedBy: req.user._id })
      : [];
    const requestedType = String(req.body.type || '').toLowerCase();
    const selectedVideoIds = selectedMediaRows
      .filter((media) => media.fileType === 'video')
      .map((media) => media._id);
    const videoSourceMedia = selectedMediaRows.find((media) => media.fileType === 'image') || sourceMedia;

    if (requestedType === 'video') {
      selectedMediaIds = selectedVideoIds;
    }

    if (wantsGeneratedImage(req.body) && generatedImages.errors.length && !generatedMediaIds.length && !selectedMediaIds.length) {
      return redirectWithDashboardMessage(res, '/dashboard/quick-create', `Image generation failed: ${firstGenerationError(generatedImages.errors)}`);
    }

    const caption = req.body.caption || generated?.caption;
    if (!caption) {
      return redirectWithDashboardMessage(res, '/dashboard/quick-create', 'Write a caption or use AI generation.');
    }

    const targets = await resolveComposerTargets({
      body: req.body,
      userId: req.user._id,
      brand,
      platforms: toArray(req.body.platforms || req.body.platform)
    });
    const selectedPlatforms = targets.platforms;
    const primaryPlatform = selectedPlatforms[0];
    const targetAccounts = targets.accountIds;
    const inferredType = requestedType || (selectedMediaIds.length > 1
      ? 'carousel'
      : selectedMediaIds.length
        ? selectedMediaRows.find((media) => media.fileType === 'video') ? 'video' : 'image'
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
        ...buildCreativePlan({ ...req.body, __brand: brand, __sourceMedia: videoSourceMedia || sourceMedia }, generated),
        selectedPlatforms,
        imageWarning: generatedImages.errors.join(' | '),
        videoWarning: ''
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


    if (action === 'schedule') {
      post.scheduledAt = requestedScheduledAt;
      post.scheduleVersion = Number(post.scheduleVersion || 0) + 1;
      post.status = post.approvalRequired ? 'pending_approval' : 'scheduled';
      await post.save();
      if (post.status === 'pending_approval') {
        return res.redirect('/dashboard/approvals');
      }
      await tryEnqueue(post, req.user._id);
      return res.redirect('/dashboard/calendar');
    }

    if (action === 'publish') {
      const publishAt = new Date();
      post.scheduledAt = publishAt;
      post.scheduleVersion = Number(post.scheduleVersion || 0) + 1;
      if (post.approvalRequired) {
        post.status = 'pending_approval';
        await post.save();
        return res.redirect('/dashboard/approvals');
      }
      post.status = 'scheduled';
      post.publishingStartedAt = undefined;
      post.publishingAttemptId = '';
      await post.save();
      const dispatch = await tryEnqueue(post, req.user._id);
      console.log('[composer] immediate post dispatched', {
        postId: String(post._id),
        platforms: selectedPlatforms,
        targetAccountIds: targetAccounts.map((id) => String(id)),
        queueAccepted: Boolean(dispatch?.queued),
        databaseFallbackActive: !dispatch?.queued
      });
      return res.redirect('/dashboard/calendar?notice=publish_queued');
    }

    return res.redirect('/dashboard/content-library');
  } catch (error) {
    if (error.code === 'PUBLISHING_TARGETS_UNAVAILABLE') {
      return redirectWithDashboardMessage(res, '/dashboard/social', error.message);
    }
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
    post.type = req.body.type || post.type;
    if (Object.prototype.hasOwnProperty.call(req.body, 'link')) post.link = req.body.link;
    const requestedStatus = Object.prototype.hasOwnProperty.call(req.body, 'status')
      ? String(req.body.status || '').trim().toLowerCase()
      : '';
    const destinationFieldsSubmitted = Object.prototype.hasOwnProperty.call(req.body, 'targetAccounts')
      || Object.prototype.hasOwnProperty.call(req.body, 'platforms')
      || Object.prototype.hasOwnProperty.call(req.body, 'platform');
    if (destinationFieldsSubmitted) {
      const resolvedTargets = await resolveComposerTargets({
        body: req.body,
        userId: req.user._id,
        brand: { _id: post.brand },
        platforms: toArray(req.body.platforms || req.body.platform || post.platforms || post.platform)
      });
      post.targetAccounts = resolvedTargets.accountIds;
      post.platforms = resolvedTargets.platforms;
      post.platform = resolvedTargets.platforms[0];
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'scheduledAt')) {
      const nextScheduledAt = req.body.scheduledAt ? parseScheduledDateInput(req.body.scheduledAt) : undefined;
      if (req.body.scheduledAt && (!nextScheduledAt || Number.isNaN(nextScheduledAt.getTime()))) {
        return redirectWithDashboardMessage(res, '/dashboard/content-library', 'Choose a valid schedule date.');
      }
      if (
        requestedStatus !== 'scheduled'
        && nextScheduledAt
        && (!post.scheduledAt || nextScheduledAt.getTime() !== new Date(post.scheduledAt).getTime())
      ) {
        post.scheduleVersion = Number(post.scheduleVersion || 0) + 1;
      }
      post.scheduledAt = nextScheduledAt;
    }

    if (requestedStatus === 'scheduled') {
      await assertPostHasLiveTargets(post, req.user._id);
      const scheduledAt = post.scheduledAt || nextDefaultScheduleDate();
      if (await hasPublishingApproval(post)) preparePostForSchedule(post, scheduledAt);
      else preparePostForApproval(post, scheduledAt);
    } else if (['draft', 'cancelled'].includes(requestedStatus)) {
      if (post.status !== requestedStatus || ['scheduled', 'publishing'].includes(post.status)) {
        post.scheduleVersion = Number(post.scheduleVersion || 0) + 1;
      }
      post.status = requestedStatus;
      post.publishingStartedAt = undefined;
      post.publishingAttemptId = '';
    }
    const selectedMedia = selectedMediaFromBody(req.body);
    if (selectedMedia.length || Object.prototype.hasOwnProperty.call(req.body, 'media')) post.media = selectedMedia;
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
    if (post.status === 'scheduled' && post.scheduledAt) {
      const generationJob = await activeGenerationJobForPost(post, req.user._id);
      if (generationJob) {
        await deferActionUntilGeneration({
          post,
          job: generationJob,
          action: 'schedule',
          scheduledAt: post.scheduledAt
        });
      } else {
        const generationBlocker = generationActionBlocker(post);
        if (generationBlocker) {
          post.status = 'draft';
          await post.save();
          return redirectWithDashboardMessage(res, '/dashboard/content-library', generationBlocker);
        }
        await tryEnqueue(post, req.user._id);
      }
    }

    return res.redirect('/dashboard/content-library');
  } catch (error) {
    if (error.code === 'PUBLISHING_TARGETS_UNAVAILABLE') {
      return redirectWithDashboardMessage(res, '/dashboard/social', error.message);
    }
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
    await assertPostHasLiveTargets(post, req.user._id);
    const generationJob = await activeGenerationJobForPost(post, req.user._id);
    if (generationJob) {
      await deferActionUntilGeneration({ post, job: generationJob, action: 'schedule', scheduledAt });
      return res.redirect('/dashboard/calendar?notice=generation_then_schedule');
    }
    const generationBlocker = generationActionBlocker(post);
    if (generationBlocker) return redirectWithDashboardMessage(res, '/dashboard/content-library', generationBlocker);
    if (!(await hasPublishingApproval(post))) {
      preparePostForApproval(post, scheduledAt);
      await post.save();
      return res.redirect('/dashboard/approvals?notice=approval_required');
    }
    preparePostForSchedule(post, scheduledAt);
    await post.save();
    await tryEnqueue(post, req.user._id);

    await notifySafely({
      user: req.user._id,
      type: 'post_scheduled',
      title: 'Post scheduled',
      message: `${post.title || post.platform} was scheduled.`,
      entityType: 'Post',
      entityId: post._id
    });

    return res.redirect('/dashboard/calendar');
  } catch (error) {
    if (error.code === 'PUBLISHING_TARGETS_UNAVAILABLE') {
      return redirectWithDashboardMessage(res, '/dashboard/social', error.message);
    }
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
      const approved = await hasPublishingApproval(post);
      if (approved) preparePostForSchedule(post, scheduledAt);
      else preparePostForApproval(post, scheduledAt);
      post.platformMetadata = {
        ...(post.platformMetadata || {}),
        bulkRescheduledAt: new Date(),
        bulkRescheduleSource: hasOffset ? `${dayOffset} day offset` : 'shared start time'
      };
      await post.save();
      if (post.status === 'scheduled') {
        const generationJob = await activeGenerationJobForPost(post, req.user._id);
        if (generationJob) {
          await deferActionUntilGeneration({ post, job: generationJob, action: 'schedule', scheduledAt });
        } else {
          await tryEnqueue(post, req.user._id);
        }
      }
      updated += 1;
    }

    if (updated) {
      await notifySafely({
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
    await assertPostHasLiveTargets(post, req.user._id);
    preparePostForSchedule(post, scheduledAt);
    post.retryCount = Number(post.retryCount || 0) + 1;
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

    await notifySafely({
      user: req.user._id,
      type: 'post_retry_scheduled',
      title: 'Post retry scheduled',
      message: `${post.title || post.platform} will retry shortly.`,
      entityType: 'Post',
      entityId: post._id
    });

    return res.redirect('/dashboard/calendar?retry_scheduled=1');
  } catch (error) {
    if (error.code === 'PUBLISHING_TARGETS_UNAVAILABLE') {
      return redirectWithDashboardMessage(res, '/dashboard/social', error.message);
    }
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

    await assertPostHasLiveTargets(post, req.user._id);
    const publishAt = new Date();
    const generationJob = await activeGenerationJobForPost(post, req.user._id);
    if (generationJob) {
      await deferActionUntilGeneration({ post, job: generationJob, action: 'publish', scheduledAt: publishAt });
      return res.redirect('/dashboard/calendar?notice=generation_then_publish');
    }
    const generationBlocker = generationActionBlocker(post);
    if (generationBlocker) return redirectWithDashboardMessage(res, '/dashboard/content-library', generationBlocker);
    if (!(await hasPublishingApproval(post))) {
      preparePostForApproval(post, publishAt);
      await post.save();
      return res.redirect('/dashboard/approvals?notice=approval_required');
    }
    preparePostForSchedule(post, publishAt);
    await post.save();
    await tryEnqueue(post, req.user._id);

    return res.redirect('/dashboard/calendar?notice=publish_queued');
  } catch (error) {
    if (error.code === 'PUBLISHING_TARGETS_UNAVAILABLE') {
      return redirectWithDashboardMessage(res, '/dashboard/social', error.message);
    }
    return next(error);
  }
}

async function cancel(req, res, next) {
  try {
    const post = await Post.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!post) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    post.status = 'cancelled';
    post.scheduleVersion = Number(post.scheduleVersion || 0) + 1;
    post.publishingStartedAt = undefined;
    post.publishingAttemptId = '';
    post.platformMetadata = {
      ...(post.platformMetadata || {}),
      generation: {
        ...(post.platformMetadata?.generation || {}),
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date()
      }
    };
    post.markModified('platformMetadata');
    await post.save();
    await AiJob.updateMany(
      {
        user: req.user._id,
        'metadata.postId': String(post._id),
        taskType: { $in: ['post_content_generation', 'post_video_generation'] },
        status: { $in: ['queued', 'running'] }
      },
      { $set: { status: 'cancelled', completedAt: new Date(), error: '' } }
    );
    return res.redirect('/dashboard/content-library');
  } catch (error) {
    return next(error);
  }
}

async function destroy(req, res, next) {
  try {
    await AiJob.updateMany(
      {
        user: req.user._id,
        'metadata.postId': String(req.params.id),
        taskType: { $in: ['post_content_generation', 'post_video_generation'] },
        status: { $in: ['queued', 'running'] }
      },
      { $set: { status: 'cancelled', completedAt: new Date(), error: '' } }
    );
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

    const targets = await resolveComposerTargets({
      body: req.body,
      userId: req.user._id,
      brand,
      platforms: toArray(req.body.platforms || req.body.platform)
    });
    const selectedPlatforms = targets.platforms;
    const targetAccounts = targets.accountIds;

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

    await notifySafely({
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
