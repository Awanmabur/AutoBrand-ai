const Brand = require('../models/Brand');
const AiVideoJob = require('../models/AiVideoJob');
const Media = require('../models/Media');
const Post = require('../models/Post');
const { planAutomaticVideoScenes } = require('../services/videoPlannerService');
const { generateVideoScenePlan } = require('../services/aiContentService');
const { generateVideo, activeProvider } = require('../services/ai.service');
const { assertCanCreateAvatarVideo, assertCanCreateVideo, assertCanUseStorage } = require('../services/usageLimitService');
const { spendCredits } = require('../services/creditService');
const { applyMediaToScenes } = require('../services/mediaInsightService');
const { enrichVideoJob, mockVideoResult } = require('../services/videoWorkflow.service');
const { notifyVideoRendered } = require('../services/notification.service');


function buildHighImpactVideoPrompt({ brand, req, mode, sourceMedia }) {
  const platform = req.body.platform || 'Facebook Reels';
  const style = req.body.style || 'premium cinematic commercial, realistic motion, bright clean lighting, smooth camera movement, subtitle-safe framing';
  const offer = req.body.offer || brand.offers?.[0]?.title || brand.preferredCta || 'main offer';
  const goal = req.body.goal || req.body.prompt || req.body.script || 'turn viewers into customers immediately';
  const mediaNote = sourceMedia ? `Use the uploaded media ${sourceMedia.fileName || sourceMedia.fileUrl} as the hero reference. Keep the product/person consistent and avoid morphing.` : 'No uploaded reference is required. Create realistic branded scenes from the Brand Brain.';
  return [
    `Create a polished short-form ad video for ${brand.name}.`,
    `Mode: ${mode}. Platform: ${platform}. Aspect ratio: ${req.body.aspectRatio || '9:16'}. Duration target: ${req.body.durationSeconds || 15}s.`,
    `Business: ${brand.businessType || 'business'}. Audience: ${brand.targetAudience || 'local customers'}. Location/style: ${brand.location || ''} ${brand.localStyle || ''}.`,
    `Offer/CTA: ${offer}. Goal: ${goal}.`,
    `Visual style: ${style}.`,
    mediaNote,
    'Quality rules: strong hook in first 1.5 seconds, real-looking commercial footage, no fake UI, no distorted hands/faces/text, no unreadable overlays, clean product/service focus, clear final CTA, high contrast, premium lighting, smooth motion, no low-quality slideshow unless no video renderer is configured.',
    req.body.prompt || req.body.script || ''
  ].filter(Boolean).join('\n');
}

async function selectedMedia(req, brandId) {
  const ids = Array.isArray(req.body.sourceMedia) ? req.body.sourceMedia.filter(Boolean) : req.body.sourceMedia ? [req.body.sourceMedia] : [];
  if (!ids.length) return [];
  return Media.find({ _id: { $in: ids }, uploadedBy: req.user._id, brand: brandId, fileType: { $in: ['image', 'video'] } }).sort({ createdAt: -1 });
}

async function maybeRenderVideo({ req, brand, job, prompt, sourceMedia }) {
  const renderProviders = ['openai', 'replicate'];
  const requestedProvider = String(req.body.provider || '').toLowerCase();
  const shouldRender = req.body.renderVideo === 'on' || requestedProvider === 'mock' || renderProviders.includes(requestedProvider) || renderProviders.includes(activeProvider('video'));
  enrichVideoJob(job, { brand });
  if (!shouldRender) {
    await job.save();
    return job;
  }

  job.status = 'processing';
  await job.save();

  let result = requestedProvider === 'mock'
    ? { ok: false, provider: 'mock', message: 'Mock video render requested.' }
    : await generateVideo({
        prompt,
        brand,
        userId: req.user._id,
        sourceMedia,
        aspectRatio: req.body.aspectRatio || job.aspectRatio,
        durationSeconds: req.body.durationSeconds || job.durationSeconds,
        preferredProvider: renderProviders.includes(requestedProvider) ? requestedProvider : undefined,
        model: req.body.videoModel || undefined
      });

  if (!result.ok || !result.outputUrl) {
    const providerMessage = result.message || 'Video API did not return output.';
    result = mockVideoResult({ job, brand });
    job.errorMessage = providerMessage;
    job.metadata = {
      ...(job.metadata || {}),
      providerFallback: {
        message: providerMessage,
        fallbackProvider: result.provider,
        createdAt: new Date()
      }
    };
  }

  job.provider = result.provider || job.provider;
  job.providerJobId = result.providerJobId || job.providerJobId;
  if (result.ok && result.outputUrl) {
    job.status = 'rendered';
    job.outputUrl = result.outputUrl;
    enrichVideoJob(job, { brand, providerResult: result });
    const media = await saveRenderedVideoToMedia({ req, brand, job, result, prompt });
    job.outputMedia = media._id;
  } else {
    job.status = 'planning';
    job.errorMessage = result.message || 'Video API did not return output. Scene plan was saved.';
  }
  await job.save();
  if (job.status === 'rendered') {
    await notifyVideoRendered({ user: req.user, job, brand, avatar: job.mode === 'avatar_video' });
  }
  return job;
}

async function saveRenderedVideoToMedia({ req, brand, job, result = {}, prompt = '' }) {
  if (!job.outputUrl && !result.outputUrl) throw new Error('This video job has no rendered output URL yet.');
  const fileUrl = job.outputUrl || result.outputUrl;
  const existing = await Media.findOne({
    uploadedBy: req.user._id,
    brand: brand._id,
    fileType: 'video',
    fileUrl
  }).sort({ createdAt: -1 });
  if (existing) return existing;

  await assertCanUseStorage(req.user, result.size || 0);

  return Media.create({
    brand: brand._id,
    uploadedBy: req.user._id,
    fileName: result.fileName || `${brand.name} AI video ${Date.now()}.mp4`,
    fileUrl,
    publicId: result.providerJobId || job.providerJobId || fileUrl,
    fileType: 'video',
    mimeType: 'video/mp4',
    size: result.size || 0,
    folder: `${result.provider || job.provider || 'ai'}-generated-video`,
    tags: [result.provider || job.provider || 'ai', 'generated', 'video', result.provider === 'mock_video_provider' ? 'mock' : 'rendered'].filter(Boolean),
    aiPrompt: prompt || job.prompt,
    aiInsights: {
      summary: `${result.provider || job.provider || 'AI'} generated video for ${brand.name}.`,
      visualPrompt: prompt || job.prompt,
      contentAngles: [req.body.goal, req.body.offer].filter(Boolean),
      recommendedPlatforms: [req.body.platform || 'facebook'],
      safetyNotes: [
        result.provider === 'mock_video_provider' ? 'Mock demo output. Replace with a real rendered MP4 before publishing externally.' : 'Review generated video before publishing.'
      ],
      reuseInstructions: ['Use this generated video in posts for this brand.'],
      generatedFrom: `${result.provider || job.provider || 'ai'}_video_workflow`,
      generatedAt: new Date(),
      subtitles: job.subtitles || [],
      thumbnailPrompt: job.thumbnailPrompt || ''
    }
  });
}

async function videoIndexData(req, error = null) {
  const [brands, media, jobs] = await Promise.all([
    Brand.find({ owner: req.user._id, status: 'active' }).sort({ name: 1 }),
    Media.find({ uploadedBy: req.user._id, fileType: { $in: ['image', 'video'] } }).populate('brand').sort({ createdAt: -1 }).limit(40),
    AiVideoJob.find({ createdBy: req.user._id }).populate('brand').sort({ createdAt: -1 }).limit(20)
  ]);
  return { title: 'AI Videos', layout: 'layouts/dashboard', brands, media, jobs, error };
}

async function index(req, res) {
  return res.redirect(303, '/dashboard/video-system');
}

async function storeAutoVideo(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    await assertCanCreateVideo(req.user);

    const mediaItems = await selectedMedia(req, brand._id);
    const aiScenes = await generateVideoScenePlan({
      brand,
      goal: req.body.goal,
      offer: req.body.offer,
      platform: req.body.platform,
      style: req.body.style,
      sourceMedia: mediaItems[0]
    });
    const scenePlan = applyMediaToScenes(aiScenes, mediaItems);

    const job = await AiVideoJob.create({
      brand: brand._id,
      createdBy: req.user._id,
      mode: 'brand_to_video',
      prompt: req.body.prompt || `${brand.name} ${req.body.goal || 'promo video'}`,
      aspectRatio: req.body.aspectRatio || '9:16',
      durationSeconds: Number(req.body.durationSeconds || 20),
      status: 'planning',
      scenePlan,
      sourceMedia: mediaItems.map((item) => item._id)
    });

    await maybeRenderVideo({ req, brand, job, prompt: buildHighImpactVideoPrompt({ brand, req, mode: 'brand_to_video', sourceMedia: mediaItems[0] }), sourceMedia: mediaItems[0] });
    res.redirect('/dashboard/video-system');
  } catch (error) {
    next(error);
  }
}

async function storeCleanVideo(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    await assertCanCreateVideo(req.user);

    const mediaItems = await selectedMedia(req, brand._id);
    const aiScenes = await generateVideoScenePlan({
      brand,
      goal: req.body.prompt,
      offer: req.body.offer,
      platform: req.body.platform,
      style: req.body.style,
      sourceMedia: mediaItems[0]
    });
    const scenePlan = applyMediaToScenes(aiScenes.map((scene) => ({
      ...scene,
      visualPrompt: `${scene.visualPrompt} Provider prompt: ${req.body.prompt}. Add clean transitions, subtitle-safe framing, logo watermark, and CTA outro.`
    })), mediaItems);

    const job = await AiVideoJob.create({
      brand: brand._id,
      createdBy: req.user._id,
      mode: 'text_to_video',
      provider: req.body.provider || 'pending_video_provider',
      prompt: req.body.prompt,
      aspectRatio: req.body.aspectRatio || '9:16',
      durationSeconds: Number(req.body.durationSeconds || 20),
      status: 'queued',
      costCredits: 100,
      scenePlan,
      sourceMedia: mediaItems.map((item) => item._id)
    });

    await spendCredits({
      user: req.user,
      amount: 100,
      reason: 'Clean AI video generation',
      referenceType: 'AiVideoJob',
      referenceId: job._id
    });

    await maybeRenderVideo({ req, brand, job, prompt: buildHighImpactVideoPrompt({ brand, req, mode: 'clean_text_to_video', sourceMedia: mediaItems[0] }), sourceMedia: mediaItems[0] });
    res.redirect('/dashboard/video-system');
  } catch (error) {
    next(error);
  }
}

async function storeImageToVideo(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    await assertCanCreateVideo(req.user);

    const mediaItems = await selectedMedia(req, brand._id);
    if (!mediaItems.length) {
      return res.redirect('/dashboard/video-system?error=Select%20at%20least%20one%20uploaded%20image%20or%20video%20for%20image-to-video');
    }

    const aiScenes = await generateVideoScenePlan({
      brand,
      goal: req.body.prompt || 'turn uploaded images into a promotional video',
      offer: req.body.offer,
      platform: req.body.platform,
      style: req.body.style || 'smooth image-to-video movement, clean captions, brand safe',
      sourceMedia: mediaItems[0]
    });
    const scenePlan = applyMediaToScenes(aiScenes.map((scene, index) => ({
      ...scene,
      visualPrompt: `${scene.visualPrompt} Animate source image ${mediaItems[index % mediaItems.length].fileName} with subtle camera movement, realistic motion, clean transitions, and no identity distortion.`
    })), mediaItems);

    const job = await AiVideoJob.create({
      brand: brand._id,
      createdBy: req.user._id,
      mode: 'image_to_video',
      provider: req.body.provider || 'prompt_or_default',
      prompt: req.body.prompt || `Image-to-video for ${brand.name}`,
      aspectRatio: req.body.aspectRatio || '9:16',
      durationSeconds: Number(req.body.durationSeconds || 20),
      status: 'planning',
      scenePlan,
      sourceMedia: mediaItems.map((item) => item._id),
      costCredits: 100
    });

    await maybeRenderVideo({ req, brand, job, prompt: req.body.prompt || `Image-to-video for ${brand.name}`, sourceMedia: mediaItems[0] });
    res.redirect('/dashboard/video-system');
  } catch (error) {
    next(error);
  }
}

async function storeAvatarVideo(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    await assertCanCreateAvatarVideo(req.user);

    const mediaItems = await selectedMedia(req, brand._id);
    const consented = mediaItems.every((item) => !item.consentRequired || item.consentStatus === 'accepted');
    if (!mediaItems.length || !consented || req.body.ownerConsent !== 'on') {
      return res.redirect('/dashboard/video-system?error=Avatar%20or%20self%20videos%20require%20selected%20personal%20media%20and%20explicit%20accepted%20consent');
    }

    const aiScenes = await generateVideoScenePlan({
      brand,
      goal: req.body.script || req.body.prompt || 'owner avatar promotional video',
      offer: req.body.offer,
      platform: req.body.platform,
      style: req.body.style || 'natural owner spokesperson, respectful likeness, subtitle-safe',
      sourceMedia: mediaItems[0]
    });
    const scenePlan = applyMediaToScenes(aiScenes.map((scene) => ({
      ...scene,
      visualPrompt: `${scene.visualPrompt} Use the approved owner/creator reference media only as a consented likeness reference. Keep identity respectful, realistic, non-deceptive, and brand-safe.`,
      narration: req.body.script || scene.narration
    })), mediaItems);

    const job = await AiVideoJob.create({
      brand: brand._id,
      createdBy: req.user._id,
      mode: 'avatar_video',
      provider: req.body.provider || 'prompt_or_default',
      prompt: req.body.script || req.body.prompt || `Owner avatar video for ${brand.name}`,
      aspectRatio: req.body.aspectRatio || '9:16',
      durationSeconds: Number(req.body.durationSeconds || 20),
      status: 'planning',
      scenePlan,
      sourceMedia: mediaItems.map((item) => item._id),
      costCredits: 150
    });

    await maybeRenderVideo({ req, brand, job, prompt: req.body.script || req.body.prompt || `Owner avatar video for ${brand.name}`, sourceMedia: mediaItems[0] });
    res.redirect('/dashboard/video-system');
  } catch (error) {
    next(error);
  }
}

async function updateStatus(req, res, next) {
  try {
    const job = await AiVideoJob.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!job) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    job.status = req.body.status;
    if (req.body.outputUrl) job.outputUrl = req.body.outputUrl;
    if (req.body.errorMessage) job.errorMessage = req.body.errorMessage;
    await job.save();

    res.redirect('/dashboard/video-system');
  } catch (error) {
    next(error);
  }
}

async function regenerateScene(req, res, next) {
  try {
    const job = await AiVideoJob.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!job) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    const sceneIndex = Number(req.body.sceneIndex || 0);
    if (job.scenePlan[sceneIndex]) {
      job.scenePlan[sceneIndex].status = 'planned';
      job.scenePlan[sceneIndex].visualPrompt = `${job.scenePlan[sceneIndex].visualPrompt} Regeneration note: ${req.body.note || 'make it cleaner and more brand accurate'}.`;
      job.status = 'planning';
      await job.save();
    }

    res.redirect('/dashboard/video-system');
  } catch (error) {
    next(error);
  }
}

async function createPostFromVideo(req, res, next) {
  try {
    const job = await AiVideoJob.findOne({ _id: req.params.id, createdBy: req.user._id }).populate('brand');
    if (!job) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    if (!job.outputUrl) {
      return res.redirect('/dashboard/video-system?error=This%20video%20job%20has%20no%20rendered%20MP4%20yet');
    }

    enrichVideoJob(job, { brand: job.brand });
    const outputMedia = await saveRenderedVideoToMedia({ req, brand: job.brand, job, prompt: job.prompt });
    job.outputMedia = outputMedia._id;
    await job.save();

    const post = await Post.create({
      brand: job.brand._id,
      platform: req.body.platform || 'instagram',
      type: job.mode === 'avatar_video' ? 'avatar_video' : 'video',
      title: req.body.title || job.prompt.slice(0, 100),
      caption: req.body.caption || job.scenePlan.map((scene) => scene.narration).join('\n\n'),
      link: job.outputUrl || '',
      media: [outputMedia._id],
      platformMetadata: {
        sourceVideoJob: job._id,
        scenePrompts: job.scenePlan.map((scene) => scene.visualPrompt)
      },
      status: 'draft',
      createdBy: req.user._id
    });

    res.redirect('/dashboard/content-library');
  } catch (error) {
    next(error);
  }
}

async function saveMedia(req, res, next) {
  try {
    const job = await AiVideoJob.findOne({ _id: req.params.id, createdBy: req.user._id }).populate('brand');
    if (!job) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    if (!job.outputUrl) return res.redirect('/dashboard/video-system?error=This%20video%20job%20has%20no%20output%20URL%20yet');

    enrichVideoJob(job, { brand: job.brand });
    const media = await saveRenderedVideoToMedia({ req, brand: job.brand, job, prompt: job.prompt });
    job.outputMedia = media._id;
    await job.save();
    res.redirect('/dashboard/media?notice=Video%20saved%20to%20media%20library');
  } catch (error) {
    next(error);
  }
}

async function cancel(req, res, next) {
  try {
    const job = await AiVideoJob.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!job) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    job.status = 'cancelled';
    await job.save();
    res.redirect('/dashboard/video-system');
  } catch (error) {
    next(error);
  }
}

module.exports = { cancel, createPostFromVideo, index, regenerateScene, saveMedia, storeAutoVideo, storeCleanVideo, storeImageToVideo, storeAvatarVideo, updateStatus };
