const AvatarProfile = require('../models/AvatarProfile');
const AvatarConsent = require('../models/AvatarConsent');
const AiVideoJob = require('../models/AiVideoJob');
const Brand = require('../models/Brand');
const Media = require('../models/Media');
const { spendCredits } = require('../services/creditService');

async function index(req, res, next) {
  try {
    const [brands, media, avatars] = await Promise.all([
      Brand.find({ owner: req.user._id, status: 'active' }).sort({ name: 1 }),
      Media.find({ uploadedBy: req.user._id, fileType: { $in: ['image', 'video'] } }).sort({ createdAt: -1 }),
      AvatarProfile.find({ owner: req.user._id, status: { $ne: 'deleted' } }).populate('brand').populate('sourceMedia').sort({ createdAt: -1 })
    ]);

    res.render('avatars/index', { title: 'Avatars', layout: 'layouts/dashboard', brands, media, avatars });
  } catch (error) {
    next(error);
  }
}

async function store(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });
    const sourceMedia = req.body.sourceMedia
      ? await Media.findOne({ _id: req.body.sourceMedia, uploadedBy: req.user._id, brand: brand._id })
      : null;
    if (sourceMedia?.consentRequired && sourceMedia.consentStatus !== 'accepted') {
      return res.status(403).render('errors/403', { layout: 'layouts/dashboard', message: 'Accept media consent before using it for avatar/clone workflows.' });
    }

    const avatar = await AvatarProfile.create({
      owner: req.user._id,
      brand: brand._id,
      name: req.body.name,
      sourceMedia: sourceMedia?._id || undefined,
      status: req.body.ownershipConfirmed === 'on' ? 'consented' : 'draft',
      ownershipConfirmed: req.body.ownershipConfirmed === 'on',
      consentedAt: req.body.ownershipConfirmed === 'on' ? new Date() : undefined,
      allowedUse: req.body.allowedUse || 'brand_content'
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
    const avatar = await AvatarProfile.findOne({ _id: req.params.id, owner: req.user._id, status: { $ne: 'deleted' } }).populate('brand');
    if (!avatar) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });
    if (!avatar.ownershipConfirmed) return res.status(403).render('errors/403', { layout: 'layouts/dashboard', message: 'Avatar consent is required.' });

    const job = await AiVideoJob.create({
      brand: avatar.brand._id,
      createdBy: req.user._id,
      mode: 'avatar_video',
      provider: 'pending_avatar_provider',
      prompt: req.body.script,
      aspectRatio: req.body.aspectRatio || '9:16',
      durationSeconds: Number(req.body.durationSeconds || 30),
      status: 'planning',
      costCredits: 200,
      sourceMedia: avatar.sourceMedia ? [avatar.sourceMedia] : [],
      scenePlan: [
        {
          order: 1,
          title: `${avatar.name} presenter`,
          visualPrompt: `Talking avatar video for ${avatar.brand.name}. Visible AI-generated disclosure and brand outro required.`,
          narration: req.body.script,
          durationSeconds: Number(req.body.durationSeconds || 30),
          status: 'planned'
        }
      ]
    });

    await spendCredits({
      user: req.user,
      amount: 200,
      reason: 'Avatar video generation',
      referenceType: 'AiVideoJob',
      referenceId: job._id
    });

    avatar.status = avatar.status === 'consented' ? 'training' : avatar.status;
    await avatar.save();

    res.redirect('/dashboard/video-system');
  } catch (error) {
    next(error);
  }
}

async function revoke(req, res, next) {
  try {
    const avatar = await AvatarProfile.findOne({ _id: req.params.id, owner: req.user._id });
    if (!avatar) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });

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
