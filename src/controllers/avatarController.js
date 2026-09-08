const AvatarProfile = require('../models/AvatarProfile');
const AvatarConsent = require('../models/AvatarConsent');
const AiVideoJob = require('../models/AiVideoJob');
const Media = require('../models/Media');
const { spendCredits } = require('../services/creditService');
const { assertCanCreateAvatarVideo, assertCanUseStorage } = require('../services/usageLimitService');
const { notifyVideoRendered } = require('../services/notification.service');
const {
  buildAvatarScenePlan,
  buildAvatarScript,
  enrichAvatarVideoJob
} = require('../services/avatarVideoWorkflow.service');
const { generateVideo: generateAiVideo, activeProvider } = require('../services/ai.service');
const { assertBrandAccess } = require('../services/authorization/brandAccess.service');


async function accessibleAvatar(req, id, permission = 'content.edit', { populate = false } = {}) {
  let query = AvatarProfile.findOne({ _id: id, status: { $ne: 'deleted' } });
  if (populate) query = query.populate('brand').populate('sourceMedia');
  const avatar = await query;
  if (!avatar) return null;
  await assertBrandAccess(req.user, avatar.brand?._id || avatar.brand, permission, { status: 'active' });
  return avatar;
}
async function index(req, res) {
  return res.redirect(303, '/dashboard/avatar-video');
}

async function store(req, res, next) {
  try {
    const brand = await assertBrandAccess(req.user, req.body.brand, 'content.create', { status: 'active' });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    const sourceMedia = req.body.sourceMedia
      ? await Media.findOne({ _id: req.body.sourceMedia, brand: brand._id, status: { $ne: 'archived' } })
      : null;
    if (sourceMedia?.consentRequired && sourceMedia.consentStatus !== 'accepted') {
      return res.status(403).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main', message: 'Accept media consent before using it for avatar/clone workflows.' });
    }

    const avatar = await AvatarProfile.create({
      owner: brand.owner,
      createdBy: req.user._id,
      brand: brand._id,
      name: req.body.name,
      sourceMedia: sourceMedia?._id || undefined,
      trainingMedia: sourceMedia ? [sourceMedia._id] : [],
      provider: req.body.provider || activeProvider('video') || 'pending_provider',
      status: req.body.ownershipConfirmed === 'on' ? 'consented' : 'draft',
      ownershipConfirmed: req.body.ownershipConfirmed === 'on',
      consentedAt: req.body.ownershipConfirmed === 'on' ? new Date() : undefined,
      allowedUse: req.body.allowedUse || 'brand_content',
      defaultScript: req.body.defaultScript || '',
      providerNotes: req.body.ownershipConfirmed === 'on' ? 'Consent recorded. Real video rendering requires a configured supported video provider.' : 'Consent is required before rendering.'
    });

    if (avatar.ownershipConfirmed) {
      await AvatarConsent.create({
        user: req.user._id,
        avatarProfile: avatar._id,
        consentVersion: avatar.consentVersion,
        ownershipConfirmed: true,
        allowedUse: avatar.allowedUse,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    }

    res.redirect('/dashboard/avatar-video');
  } catch (error) {
    next(error);
  }
}

async function generateVideo(req, res, next) {
  try {
    const avatar = await accessibleAvatar(req, req.params.id, 'content.create', { populate: true });
    if (!avatar) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    if (!avatar.ownershipConfirmed) return res.status(403).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main', message: 'Avatar consent is required.' });
    await assertCanCreateAvatarVideo(req.user, 1, avatar.brand._id);

    const script = buildAvatarScript({ avatar, brand: avatar.brand, prompt: req.body.script });
    const scenePlan = buildAvatarScenePlan({
      avatar,
      brand: avatar.brand,
      script,
      durationSeconds: req.body.durationSeconds || 30
    });
    const job = await AiVideoJob.create({
      brand: avatar.brand._id,
      createdBy: req.user._id,
      mode: 'avatar_video',
      provider: req.body.provider || activeProvider('video') || 'pending_provider',
      prompt: script,
      script,
      aspectRatio: req.body.aspectRatio || '9:16',
      durationSeconds: Number(req.body.durationSeconds || 30),
      status: 'processing',
      costCredits: 200,
      sourceMedia: avatar.sourceMedia ? [avatar.sourceMedia._id || avatar.sourceMedia] : [],
      scenePlan
    });
    const requestedProvider = ['openai', 'replicate'].includes(String(req.body.provider || '').toLowerCase())
      ? String(req.body.provider).toLowerCase()
      : undefined;
    const result = await generateAiVideo({
      prompt: [
        script,
        `Use only the explicitly consented likeness reference for ${avatar.name}.`,
        'Keep identity consistent, realistic, non-deceptive and brand-safe. Do not fabricate endorsements or claims.',
        `Scene plan: ${scenePlan.map((scene) => scene.visualPrompt).filter(Boolean).join(' | ')}`
      ].join('\n'),
      brand: avatar.brand,
      userId: req.user._id,
      sourceMedia: avatar.sourceMedia || undefined,
      aspectRatio: job.aspectRatio,
      durationSeconds: job.durationSeconds,
      preferredProvider: requestedProvider,
      model: req.body.videoModel || undefined
    });

    if (!result.ok || !result.outputUrl) {
      job.provider = result.provider || job.provider;
      job.status = 'failed';
      job.errorMessage = result.message || 'The configured video provider did not return a publishable avatar video.';
      job.metadata = { ...(job.metadata || {}), providerFailure: { message: job.errorMessage, createdAt: new Date() } };
      enrichAvatarVideoJob(job, { avatar, brand: avatar.brand });
      await job.save();
      return res.redirect(`/dashboard/avatar-video?error=${encodeURIComponent(job.errorMessage)}`);
    }

    job.provider = result.provider || job.provider;
    job.providerJobId = result.providerJobId;
    job.status = 'rendered';
    job.outputUrl = result.outputUrl;
    enrichAvatarVideoJob(job, { avatar, brand: avatar.brand });
    await assertCanUseStorage(req.user, result.size || 0, avatar.brand._id);

    await spendCredits({
      user: req.user,
      brandId: avatar.brand._id,
      amount: 200,
      reason: 'Avatar video generation',
      referenceType: 'AiVideoJob',
      referenceId: job._id
    });

    const media = await Media.create({
      brand: avatar.brand._id,
      uploadedBy: req.user._id,
      fileName: result.fileName || `${avatar.name} avatar video.mp4`,
      fileUrl: result.outputUrl,
      publicId: result.providerJobId || result.outputUrl,
      fileType: 'video',
      mimeType: result.mimeType || 'video/mp4',
      size: result.size || 0,
      folder: `${result.provider || 'ai'}-avatar-video`,
      tags: ['avatar', result.provider || 'ai', 'generated', 'video', 'consented'],
      aiPrompt: script,
      aiInsights: {
        summary: `Generated consented avatar video for ${avatar.name}.`,
        safetyNotes: ['Review likeness, claims and context before publishing.'],
        reuseInstructions: ['Attach this rendered video to an avatar post draft for review.'],
        generatedFrom: `${result.provider || 'ai'}_avatar_video`,
        subtitles: job.subtitles,
        thumbnailPrompt: job.thumbnailPrompt,
        generatedAt: new Date()
      }
    });
    job.outputMedia = media._id;
    await job.save();
    await notifyVideoRendered({ user: req.user, job, brand: avatar.brand, avatar: true });

    avatar.status = 'ready';
    avatar.lastVideoJob = job._id;
    avatar.provider = result.provider;
    avatar.providerNotes = result.message;
    await avatar.save();

    res.redirect('/dashboard/video-system');
  } catch (error) {
    next(error);
  }
}

async function revoke(req, res, next) {
  try {
    const avatar = await accessibleAvatar(req, req.params.id, 'content.edit');
    if (!avatar) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    avatar.status = 'deleted';
    avatar.deletedAt = new Date();
    await avatar.save();
    await AvatarConsent.updateMany({ avatarProfile: avatar._id, revokedAt: null }, { revokedAt: new Date() });

    res.redirect('/dashboard/avatar-video');
  } catch (error) {
    next(error);
  }
}

module.exports = { generateVideo, index, revoke, store };
