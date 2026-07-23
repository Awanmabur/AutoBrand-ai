const Brand = require('../models/Brand');
const Media = require('../models/Media');
const Post = require('../models/Post');
const Campaign = require('../models/Campaign');
const UsageLog = require('../models/UsageLog');
const ApiLog = require('../models/ApiLog');
const { createPlatformVariations } = require('../services/composer/platformVariation.service');
const { spendCredits } = require('../services/creditService');
const { generateImageAsset } = require('../services/aiContentService');
const { assertCanGenerateImage, assertCanGenerateText } = require('../services/usageLimitService');
const { resolvePublishingTargets } = require('../services/social/socialDestination.service');
const {
  creditsForGeneration,
  generateContentBundle,
  normalizeGenerationControls,
  postTypeForOutput
} = require('../services/aiContentGeneration.service');
const {
  aspectRatioForWorkflow,
  buildImageWorkflowPrompt,
  imageCountForWorkflow,
  imageCreditsForResults,
  imageSizeForWorkflow,
  imageTagsForWorkflow,
  normalizeImageWorkflow,
  postTypeForImageWorkflow,
  providerFromBody,
  providerPostTypeForWorkflow,
  workflowLabel
} = require('../services/aiImageWorkflow.service');

async function generator(req, res) {
  return res.redirect(303, '/dashboard/quick-create');
}

function splitList(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value)
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function warningsFromBundle(bundle = {}) {
  return [
    ...(bundle.warnings?.brandRuleWarnings || []),
    ...(bundle.warnings?.blockedWordWarnings || []),
    ...(bundle.warnings?.riskWarnings || [])
  ].filter(Boolean);
}

function campaignPlanDetails(bundle = {}) {
  const campaignPlan = bundle.campaignPlan || [];
  const platforms = [...new Set((bundle.platformOutputs || []).map((item) => item.platform).filter(Boolean))];
  return {
    campaignType: bundle.controls?.campaignType || bundle.controls?.outputType || 'awareness',
    goalLabel: bundle.controls?.campaignType || bundle.controls?.outputType || 'Campaign',
    strategy: {
      objective: bundle.controls?.goal || bundle.description || bundle.title,
      audience: bundle.controls?.audience || '',
      positioning: bundle.improvementSuggestion || bundle.description || '',
      primaryCta: bundle.callToAction || '',
      keywords: bundle.youtubeTags || []
    },
    contentPillars: [...new Set(campaignPlan.map((item) => item.contentType).filter(Boolean))],
    suggestedTimes: [...new Set(campaignPlan.map((item) => item.bestTimeHint).filter(Boolean))],
    postIdeas: campaignPlan,
    captions: campaignPlan.map((item) => ({
      day: item.day,
      platform: item.platform,
      title: item.title,
      caption: item.caption,
      hashtags: item.hashtags || bundle.hashtags || []
    })),
    hashtags: [...new Set([...(bundle.hashtags || []), ...campaignPlan.flatMap((item) => item.hashtags || [])])],
    creativeIdeas: [
      bundle.imageIdea ? { title: 'Image idea', description: bundle.imageIdea, format: 'image', platform: platforms[0] || bundle.controls?.platform || 'facebook' } : null,
      ...(bundle.carouselSlides || []).map((item) => ({
        title: item.headline || `Slide ${item.slide}`,
        description: item.body || item.visualDirection,
        format: 'carousel',
        platform: platforms[0] || 'instagram'
      }))
    ].filter(Boolean),
    videoScripts: bundle.videoScript ? [{
      platform: platforms.find((platform) => ['instagram', 'tiktok', 'youtube'].includes(platform)) || 'instagram',
      title: bundle.title || 'Campaign video script',
      hook: bundle.shortVideoHook || '',
      scenes: bundle.videoScenes || [],
      cta: bundle.callToAction || ''
    }] : [],
    whatsappMessages: bundle.whatsappMessage ? [{ title: 'WhatsApp promo', message: bundle.whatsappMessage }] : [],
    weeklyPlan: campaignPlan.slice(0, 7),
    monthlyPlan: campaignPlan.length >= 30 ? campaignPlan.slice(0, 30) : campaignPlan,
    carouselSlides: bundle.carouselSlides || [],
    videoScenes: bundle.videoScenes || [],
    generatedBundle: bundle
  };
}

function imageDraftCaption(body = {}, brand = {}, workflow = 'prompt') {
  const pieces = [
    body.caption,
    body.offer,
    body.goal,
    brand.preferredCta,
    `Generated ${workflowLabel(workflow).toLowerCase()} for ${brand.name || 'the brand'}.`
  ].filter(Boolean);
  return pieces[0] || `Generated image for ${brand.name || 'the brand'}.`;
}

async function createImageDraft({ req, brand, mediaIds, workflow, prompt }) {
  const platforms = splitList(req.body.platforms || req.body.platform, [req.body.platform || 'facebook']);
  const postType = postTypeForImageWorkflow(workflow);
  const caption = imageDraftCaption(req.body, brand, workflow);
  const baseContent = {
    title: req.body.title || `${brand.name} ${workflowLabel(workflow)}`,
    description: req.body.description || `${workflowLabel(workflow)} generated from Brand Brain.`,
    caption,
    hashtags: splitList(req.body.hashtags, brand.preferredHashtags || []),
    type: postType,
    mediaCount: mediaIds.length,
    ctaStyle: req.body.cta || brand.preferredCta || ''
  };
  const platformVariations = await createPlatformVariations({ baseContent, brand, platforms, accounts: [] });
  const average = (field) => Math.round((platformVariations.reduce((total, item) => total + Number(item[field] || 0), 0) / Math.max(platformVariations.length, 1)) || 0);
  return Post.create({
    brand: brand._id,
    platform: platforms[0] || req.body.platform || 'facebook',
    platforms,
    type: postType,
    title: baseContent.title,
    description: baseContent.description,
    caption,
    hashtags: baseContent.hashtags,
    media: mediaIds,
    platformVariations,
    validationWarnings: platformVariations.flatMap((item) => item.validationWarnings || []),
    contentScore: average('contentScore'),
    brandFitScore: average('brandFitScore'),
    riskScore: average('riskScore'),
    platformMetadata: {
      imageWorkflow: workflow,
      imagePrompt: prompt,
      generatedImageMedia: mediaIds,
      generatedAt: new Date()
    },
    status: 'draft',
    createdBy: req.user._id
  });
}

function shouldCreateImageDraft(body = {}) {
  return ['attach_draft', 'create_draft', 'use_in_composer', 'draft'].includes(String(body.action || '').toLowerCase());
}

async function createGeneratedDraft({ req, brand, sourceMedia, bundle }) {
  const controls = bundle.controls || normalizeGenerationControls(req.body);
  const platforms = controls.platforms?.length ? controls.platforms : [controls.platform || req.body.platform || 'facebook'];
  const baseContent = {
    title: bundle.title,
    description: bundle.description,
    caption: bundle.caption,
    hashtags: bundle.hashtags || [],
    type: postTypeForOutput(bundle.outputType),
    mediaCount: sourceMedia ? 1 : 0,
    ctaStyle: bundle.callToAction || '',
    videoTitle: bundle.title,
    videoDescription: bundle.youtubeShortsDescription || bundle.description,
    shortVideoHook: bundle.videoScenes?.[0]?.narration || ''
  };
  const platformVariations = await createPlatformVariations({ baseContent, brand, platforms, accounts: [] });
  const average = (field) => Math.round((platformVariations.reduce((total, item) => total + Number(item[field] || 0), 0) / Math.max(platformVariations.length, 1)) || 0);
  return Post.create({
    brand: brand._id,
    platform: controls.platform || platforms[0] || 'facebook',
    platforms,
    type: postTypeForOutput(bundle.outputType),
    title: bundle.title,
    description: bundle.description,
    caption: bundle.caption || bundle.description || bundle.title,
    hashtags: bundle.hashtags || [],
    media: sourceMedia ? [sourceMedia._id] : [],
    platformVariations,
    validationWarnings: warningsFromBundle(bundle).concat(platformVariations.flatMap((item) => item.validationWarnings || [])),
    contentScore: bundle.scores?.contentScore || average('contentScore'),
    brandFitScore: bundle.scores?.brandFitScore || average('brandFitScore'),
    riskScore: bundle.scores?.riskScore ?? average('riskScore'),
    platformMetadata: {
      sourceMedia: sourceMedia?._id,
      callToAction: bundle.callToAction,
      imageIdea: bundle.imageIdea,
      imagePrompt: bundle.imagePrompt,
      videoScript: bundle.videoScript,
      videoScenes: bundle.videoScenes || [],
      carouselSlides: bundle.carouselSlides || [],
      campaignPlan: bundle.campaignPlan || [],
      platformOutputs: bundle.platformOutputs || [],
      youtubeShortsDescription: bundle.youtubeShortsDescription || '',
      whatsappMessage: bundle.whatsappMessage || '',
      bestPostingTime: bundle.bestPostingTime,
      contentScore: bundle.scores?.contentScore,
      improvementSuggestion: bundle.improvementSuggestion,
      safetyNotes: bundle.safetyNotes,
      warnings: bundle.warnings,
      controls,
      generatedBundle: bundle
    },
    status: 'draft',
    createdBy: req.user._id
  });
}

async function generateImage(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) {
      return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    }

    const workflow = normalizeImageWorkflow(req.body.imageWorkflow || req.body.workflow || req.body.imageType);
    const count = imageCountForWorkflow(req.body);
    await assertCanGenerateImage(req.user, count);

    const sourceMedia = req.body.sourceMedia
      ? await Media.findOne({ _id: req.body.sourceMedia, uploadedBy: req.user._id, brand: brand._id })
      : null;
    const provider = providerFromBody(req.body);
    const mediaIds = [];
    const generatedResults = [];
    const errors = [];
    let firstPrompt = '';

    for (let index = 0; index < count; index += 1) {
      const prompt = buildImageWorkflowPrompt({ brand, body: req.body, workflow, index, count });
      if (!firstPrompt) firstPrompt = prompt;
      const result = await generateImageAsset({
        brand,
        userId: req.user._id,
        prompt,
        platform: req.body.platform || 'facebook',
        aspectRatio: aspectRatioForWorkflow(req.body),
        size: imageSizeForWorkflow(req.body),
        sourceMedia,
        provider,
        postType: providerPostTypeForWorkflow(workflow),
        slideIndex: index,
        slideCount: count
      });

      if (!result.ok || !result.fileUrl) {
        errors.push(result.message || 'Image generation failed.');
        continue;
      }

      const media = await Media.create({
        brand: brand._id,
        uploadedBy: req.user._id,
        fileName: result.fileName || `${brand.name} ${workflowLabel(workflow)} ${index + 1}.png`,
        fileUrl: result.fileUrl,
        publicId: result.publicId || result.fileUrl,
        fileType: 'image',
        mimeType: result.mimeType || 'image/png',
        size: result.size || 0,
        folder: result.folder || 'ai-generated',
        tags: imageTagsForWorkflow(workflow, req.body),
        aiPrompt: result.aiPrompt || prompt,
        aiInsights: {
          summary: `${workflowLabel(workflow)} generated for ${brand.name}.`,
          visualPrompt: result.aiPrompt || prompt,
          contentAngles: [req.body.goal, req.body.offer, req.body.productName, workflowLabel(workflow)].filter(Boolean),
          recommendedPlatforms: splitList(req.body.platforms || req.body.platform, [req.body.platform || 'facebook']),
          safetyNotes: [
            `Generated through ${result.provider || 'AI'} image generation.`,
            result.warning || '',
            errors.length ? errors.join(' | ') : ''
          ].filter(Boolean),
          reuseInstructions: ['Use in composer, campaigns, reels, stories, or scheduled posts for this brand.'],
          generatedFrom: `${result.provider || 'ai'}_image_workflow`,
          generatedAt: new Date()
        },
        variants: [{
          kind: `${result.provider || 'ai'}_generated_image`,
          label: result.providerModel || `${result.provider || 'AI'} generated image`,
          url: result.fileUrl,
          prompt: result.aiPrompt || prompt,
          status: 'ready',
          metadata: result.metadata || {},
          createdAt: new Date()
        }]
      });
      mediaIds.push(media._id);
      generatedResults.push(result);
    }

    if (!mediaIds.length) {
      return res.redirect(303, `/dashboard/quick-create?error=${encodeURIComponent(errors[0] || 'Image generation failed.')}`);
    }

    const credits = imageCreditsForResults(generatedResults);
    const referenceType = shouldCreateImageDraft(req.body) ? 'Post' : 'Media';
    let draft = null;
    if (shouldCreateImageDraft(req.body)) {
      draft = await createImageDraft({ req, brand, mediaIds, workflow, prompt: firstPrompt });
    }

    await spendCredits({
      user: req.user,
      amount: credits,
      reason: `${workflowLabel(workflow)} generation`,
      referenceType,
      referenceId: draft?._id || mediaIds[0]
    });
    await UsageLog.create({
      user: req.user._id,
      brand: brand._id,
      action: 'ai_generate_image',
      provider: [...new Set(generatedResults.map((item) => item.provider || 'ai'))].join(','),
      credits,
      metadata: {
        workflow,
        count: mediaIds.length,
        requestedCount: count,
        media: mediaIds,
        draft: draft?._id,
        errors,
        providerRequested: provider || 'default'
      }
    });
    await ApiLog.create({
      user: req.user._id,
      provider: generatedResults[0]?.provider || provider || 'local',
      action: 'generate_image',
      status: 'success',
      message: `${workflowLabel(workflow)} generated ${mediaIds.length} image(s).`,
      metadata: { workflow, count: mediaIds.length, draft: draft?._id, media: mediaIds, errors }
    });

    if (draft) return res.redirect(303, `/dashboard/content-library?created=${encodeURIComponent(draft._id.toString())}`);
    return res.redirect(303, `/dashboard/media?created=${encodeURIComponent(String(mediaIds[0]))}`);
  } catch (error) {
    if (error.status === 402) {
      return res.redirect(`/dashboard/billing?error=${encodeURIComponent(error.message)}`);
    }
    return next(error);
  }
}

async function generatePost(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });

    if (!brand) {
      return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    }

    await assertCanGenerateText(req.user);
    const sourceMedia = req.body.sourceMedia
      ? await Media.findOne({ _id: req.body.sourceMedia, uploadedBy: req.user._id, brand: brand._id })
      : null;

    const controls = normalizeGenerationControls(req.body);
    const result = await generateContentBundle({
      ...req.body,
      brand,
      sourceMedia
    });
    const credits = creditsForGeneration(result.controls || controls);

    await ApiLog.create({
      user: req.user._id,
      provider: result.provider?.startsWith('openai') ? 'openai' : 'local',
      action: 'generate_content',
      status: result.provider === 'openai' ? 'success' : 'skipped',
      message: `Generated ${result.outputType || controls.outputType} using ${result.provider}.`,
      metadata: { controls: result.controls || controls, outputType: result.outputType }
    });

    const draft = await createGeneratedDraft({ req, brand, sourceMedia, bundle: result });

    await spendCredits({
      user: req.user,
      amount: credits,
      reason: `AI ${result.outputType || controls.outputType} generation`,
      referenceType: 'Post',
      referenceId: draft._id
    });

    await UsageLog.create({
      user: req.user._id,
      brand: brand._id,
      action: 'ai_generate_content',
      provider: result.provider,
      credits,
      metadata: { controls: result.controls || controls, outputType: result.outputType, sourceMedia: sourceMedia?._id }
    });

    const destination = req.body.action === 'use_in_composer' ? '/dashboard/quick-create' : '/dashboard/content-library';
    return res.redirect(`${destination}?created=${encodeURIComponent(draft._id.toString())}`);
  } catch (error) {
    if (error.status === 402) {
      return res.redirect(`/dashboard/billing?error=${encodeURIComponent(error.message)}`);
    }
    return next(error);
  }
}

async function generateHashtags(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    await assertCanGenerateText(req.user);
    const result = await generateContentBundle({ ...req.body, brand, outputType: 'hashtags' });
    const draft = await createGeneratedDraft({ req, brand, sourceMedia: null, bundle: result });
    const credits = creditsForGeneration(result.controls || { outputType: 'hashtags' });
    await spendCredits({ user: req.user, amount: credits, reason: 'AI hashtag generation', referenceType: 'Post', referenceId: draft._id });
    await UsageLog.create({
      user: req.user._id,
      brand: brand._id,
      action: 'ai_generate_content',
      provider: result.provider,
      credits,
      metadata: { outputType: 'hashtags', draft: draft._id }
    });

    return res.redirect(`/dashboard/content-library?created=${encodeURIComponent(draft._id.toString())}`);
  } catch (error) {
    if (error.status === 402) {
      return res.redirect(`/dashboard/billing?error=${encodeURIComponent(error.message)}`);
    }
    return next(error);
  }
}

async function generateVideoScript(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    const sourceMedia = req.body.sourceMedia
      ? await Media.findOne({ _id: req.body.sourceMedia, uploadedBy: req.user._id, brand: brand._id })
      : null;

    await assertCanGenerateText(req.user);
    const result = await generateContentBundle({
      ...req.body,
      brand,
      sourceMedia,
      outputType: 'reel_script',
      platforms: req.body.platform || 'tiktok'
    });
    if (sourceMedia && Array.isArray(result.videoScenes)) {
      result.videoScenes = result.videoScenes.map((scene) => ({
        ...scene,
        visualPrompt: `${scene.visualPrompt || ''} Use uploaded asset ${sourceMedia.fileName}: ${sourceMedia.aiPrompt || sourceMedia.aiInsights?.visualPrompt || sourceMedia.fileUrl}.`.trim()
      }));
    }
    const draft = await createGeneratedDraft({ req, brand, sourceMedia, bundle: result });
    const credits = creditsForGeneration(result.controls || { outputType: 'reel_script' });
    await spendCredits({ user: req.user, amount: credits, reason: 'AI video script generation', referenceType: 'Post', referenceId: draft._id });
    await UsageLog.create({
      user: req.user._id,
      brand: brand._id,
      action: 'ai_generate_content',
      provider: result.provider,
      credits,
      metadata: { outputType: 'reel_script', draft: draft._id, sourceMedia: sourceMedia?._id }
    });

    return res.redirect(`/dashboard/content-library?created=${encodeURIComponent(draft._id.toString())}`);
  } catch (error) {
    if (error.status === 402) {
      return res.redirect(`/dashboard/billing?error=${encodeURIComponent(error.message)}`);
    }
    return next(error);
  }
}

async function generateCampaign(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    await assertCanGenerateText(req.user);
    const targets = await resolvePublishingTargets({
      ownerId: req.user._id,
      brandId: brand._id,
      requestedPlatforms: splitList(req.body.platforms),
      requestedAccountIds: req.body.targetAccounts || [],
      requireReady: true,
      allowPlatformDefaults: true
    });
    const requestedOutput = req.body.outputType
      || (Number(req.body.durationDays || 7) >= 30 ? '30_day_content_calendar' : req.body.campaignType || '7_day_campaign');
    const result = await generateContentBundle({
      ...req.body,
      outputType: requestedOutput,
      brand,
      platforms: targets.platforms
    });
    const controls = result.controls || normalizeGenerationControls({ ...req.body, outputType: requestedOutput, platforms: targets.platforms });
    const platforms = targets.platforms;
    const credits = creditsForGeneration(controls);
    const aiPlan = campaignPlanDetails(result);
    const campaign = await Campaign.create({
      brand: brand._id,
      createdBy: req.user._id,
      name: req.body.name || result.title || `${brand.name} AI campaign`,
      goal: req.body.goal || controls.campaignType || controls.outputType,
      description: req.body.description || result.description || 'Generated from the AI Generator.',
      platforms,
      targetAccounts: targets.accountIds,
      postingFrequency: req.body.postingFrequency || brand.postingFrequency || '1 post per day',
      status: 'draft',
      aiPlan
    });

    await spendCredits({ user: req.user, amount: credits, reason: `AI ${controls.outputType} campaign generation`, referenceType: 'Campaign', referenceId: campaign._id });
    await UsageLog.create({
      user: req.user._id,
      brand: brand._id,
      action: 'ai_generate_content',
      provider: result.provider,
      credits,
      metadata: { controls, outputType: controls.outputType, campaign: campaign._id }
    });

    return res.redirect('/dashboard/campaigns?campaign_created=1');
  } catch (error) {
    if (error.status === 402) {
      return res.redirect(`/dashboard/billing?error=${encodeURIComponent(error.message)}`);
    }
    if (error.code === 'PUBLISHING_TARGETS_UNAVAILABLE') {
      return res.redirect(`/dashboard/campaigns?error=${encodeURIComponent(error.message)}`);
    }
    return next(error);
  }
}

module.exports = { generator, generateCampaign, generateHashtags, generateImage, generatePost, generateVideoScript };
