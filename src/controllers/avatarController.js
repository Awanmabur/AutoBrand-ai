const AvatarProfile = require('../models/AvatarProfile');
const AvatarConsent = require('../models/AvatarConsent');
const AiVideoJob = require('../models/AiVideoJob');
const Brand = require('../models/Brand');
const Media = require('../models/Media');
const { spendCredits } = require('../services/creditService');
const { assertCanCreateAvatarVideo, assertCanUseStorage } = require('../services/usageLimitService');
const { notifyVideoRendered } = require('../services/notification.service');
const {
  buildAvatarScenePlan,
  buildAvatarScript,
  enrichAvatarVideoJob,
  mockAvatarVideoResult
} = require('../services/avatarVideoWorkflow.service');

async function index(req, res) {
  return res.redirect(303, '/dashboard/avatar-video');
}

async function store(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    const sourceMedia = req.body.sourceMedia
      ? await Media.findOne({ _id: req.body.sourceMedia, uploadedBy: req.user._id, brand: brand._id })
      : null;
    if (sourceMedia?.consentRequired && sourceMedia.consentStatus !== 'accepted') {
      return res.status(403).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main', message: 'Accept media consent before using it for avatar/clone workflows.' });
    }

    const avatar = await AvatarProfile.create({
      owner: req.user._id,
      brand: brand._id,
      name: req.body.name,
      sourceMedia: sourceMedia?._id || undefined,
      trainingMedia: sourceMedia ? [sourceMedia._id] : [],
      provider: req.body.provider || 'mock_avatar_provider',
      providerAvatarId: sourceMedia ? `mock_avatar_profile_${sourceMedia._id}` : undefined,
      status: req.body.ownershipConfirmed === 'on' ? 'consented' : 'draft',
      ownershipConfirmed: req.body.ownershipConfirmed === 'on',
      consentedAt: req.body.ownershipConfirmed === 'on' ? new Date() : undefined,
      allowedUse: req.body.allowedUse || 'brand_content',
      defaultScript: req.body.defaultScript || '',
      providerNotes: req.body.ownershipConfirmed === 'on' ? 'Mock avatar profile ready for demo rendering.' : 'Consent is required before rendering.'
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
    const avatar = await AvatarProfile.findOne({ _id: req.params.id, owner: req.user._id, status: { $ne: 'deleted' } }).populate('brand').populate('sourceMedia');
    if (!avatar) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    if (!avatar.ownershipConfirmed) return res.status(403).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main', message: 'Avatar consent is required.' });
    await assertCanCreateAvatarVideo(req.user);

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
      provider: req.body.provider || 'mock_avatar_provider',
      prompt: script,
      script,
      aspectRatio: req.body.aspectRatio || '9:16',
      durationSeconds: Number(req.body.durationSeconds || 30),
      status: 'processing',
      costCredits: 200,
      sourceMedia: avatar.sourceMedia ? [avatar.sourceMedia._id || avatar.sourceMedia] : [],
      scenePlan
    });
    const result = mockAvatarVideoResult({ job, avatar, brand: avatar.brand });
    job.provider = result.provider;
    job.providerJobId = result.providerJobId;
    job.status = 'rendered';
    job.outputUrl = result.outputUrl;
    enrichAvatarVideoJob(job, { avatar, brand: avatar.brand });
    await assertCanUseStorage(req.user, result.size || 0);

    await spendCredits({
      user: req.user,
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
      publicId: result.providerJobId,
      fileType: 'video',
      mimeType: 'video/mp4',
      size: result.size || 0,
      folder: 'mock-avatar-video',
      tags: ['avatar', 'mock', 'generated', 'video'],
      aiPrompt: script,
      aiInsights: {
        summary: `Mock avatar video for ${avatar.name}.`,
        safetyNotes: ['Demo avatar output. Use a real approved avatar provider before production publishing.'],
        reuseInstructions: ['Attach this video to an avatar post draft for review.'],
        generatedFrom: 'mock_avatar_provider',
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
    avatar.providerAvatarId = avatar.providerAvatarId || `mock_avatar_profile_${avatar._id}`;
    avatar.providerNotes = result.message;
    await avatar.save();

    res.redirect('/dashboard/video-system');
  } catch (error) {
    next(error);
  }
}

async function revoke(req, res, next) {
  try {
    const avatar = await AvatarProfile.findOne({ _id: req.params.id, owner: req.user._id });
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
