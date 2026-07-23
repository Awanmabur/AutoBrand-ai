const Brand = require('../models/Brand');
const Media = require('../models/Media');
const Post = require('../models/Post');
const { isCloudinaryConfigured } = require('../config/cloudinary');
const { createUploadSignature } = require('../services/cloudinaryService');
const { buildMediaInsights } = require('../services/mediaInsightService');
const { createBrandedVariant, createCompressedVariant, createResizeVariants } = require('../services/mediaTransformService');
const { assertCanUseStorage } = require('../services/usageLimitService');
const { inspectRemoteResource } = require('../services/remoteFetch.service');
const env = require('../config/env');
const path = require('path');
const { deleteGridFsFile, gridFsIdFromUrl } = require('../services/gridFsMediaStorage.service');

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function mediaKind(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'document';
  return 'other';
}

async function index(req, res) {
  return res.redirect(303, '/dashboard/media');
}

async function destroy(req, res, next) {
  try {
    const media = await Media.findOne({ _id: req.params.id, uploadedBy: req.user._id });
    if (!media) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    const gridFsId = gridFsIdFromUrl(media.fileUrl);
    if (gridFsId) await deleteGridFsFile(gridFsId).catch((error) => console.warn('GridFS media cleanup failed:', error.message));
    await media.deleteOne();
    return res.redirect('/dashboard/media');
  } catch (error) {
    return next(error);
  }
}

async function archive(req, res, next) {
  try {
    const media = await Media.findOne({ _id: req.params.id, uploadedBy: req.user._id });
    if (!media) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    media.status = 'archived';
    await media.save();
    return res.redirect('/dashboard/media');
  } catch (error) {
    return next(error);
  }
}

async function store(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    if (!req.body.fileUrl || !isHttpUrl(req.body.fileUrl)) {
      return res.redirect('/dashboard/media?error=Add%20a%20valid%20HTTP%20or%20HTTPS%20media%20URL');
    }
    if (env.nodeEnv === 'production' && !String(req.body.fileUrl).startsWith('https://')) {
      return res.redirect('/dashboard/media?error=Production%20media%20URLs%20must%20use%20HTTPS');
    }

    const verified = await inspectRemoteResource(req.body.fileUrl, {
      allowedMimePrefixes: ['image/', 'video/', 'audio/', 'application/pdf'],
      maxBytes: env.maxUploadBytes
    });
    const mimeType = verified.mimeType;
    const size = verified.size;
    await assertCanUseStorage(req.user, size);

    const expectedFolder = `autobrand/${req.user._id}/${brand._id}`;
    const publicId = String(req.body.publicId || '').trim();
    const isSignedCloudinaryUpload = Boolean(publicId && publicId.startsWith(`${expectedFolder}/`));
    const safeName = path.basename(String(req.body.fileName || new URL(verified.finalUrl).pathname || 'media')).slice(0, 220);

    const media = await Media.create({
      brand: brand._id,
      uploadedBy: req.user._id,
      fileName: safeName || 'media',
      fileUrl: verified.finalUrl,
      publicId: isSignedCloudinaryUpload ? publicId : verified.finalUrl,
      fileType: mediaKind(mimeType),
      mimeType,
      size,
      folder: isSignedCloudinaryUpload ? expectedFolder : 'verified-external',
      tags: String(req.body.tags || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      consentRequired: req.body.consentRequired === 'on',
      consentStatus: req.body.consentRequired === 'on' ? 'pending' : 'not_required'
    });

    media.aiInsights = buildMediaInsights(media, brand);
    media.aiPrompt = media.aiInsights.visualPrompt;
    await media.save();

    return res.redirect('/dashboard/media');
  } catch (error) {
    return next(error);
  }
}

async function signature(req, res, next) {
  try {
    let brand = null;
    if (req.query.brand) {
      brand = await Brand.findOne({ _id: req.query.brand, owner: req.user._id });
      if (!brand) return res.status(404).json({ error: 'Brand not found.' });
    }

    const payload = createUploadSignature({ userId: req.user._id, brandId: brand?._id || req.query.brandName || 'new-brand' });
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

async function creativeAction(req, res, next) {
  try {
    const media = await Media.findOne({ _id: req.params.id, uploadedBy: req.user._id }).populate('brand');
    if (!media) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    if (req.body.actionType === 'accept_consent') {
      media.consentStatus = 'accepted';
    }

    if (req.body.actionType === 'revoke_consent') {
      media.consentStatus = 'revoked';
    }

    if (req.body.actionType === 'prompt') {
      media.aiInsights = buildMediaInsights(media, media.brand);
      media.aiPrompt = media.aiInsights.visualPrompt;
    }

    if (req.body.actionType === 'analyze') {
      media.aiInsights = buildMediaInsights(media, media.brand);
      media.aiPrompt = media.aiInsights.visualPrompt;
    }

    if (req.body.actionType === 'background') {
      media.variants.push({
        kind: 'background_removal',
        label: 'Background removal request',
        prompt: `Remove the background from ${media.fileName} and keep the subject clean for branded posts.`,
        status: 'planned'
      });
    }

    if (req.body.actionType === 'resize') {
      const variants = await createResizeVariants(media, media.brand);
      media.variants.push(...variants);
    }

    if (req.body.actionType === 'crop_square') {
      media.variants.push(...await createResizeVariants(media, media.brand, ['1:1']));
    }

    if (req.body.actionType === 'crop_vertical') {
      media.variants.push(...await createResizeVariants(media, media.brand, ['9:16']));
    }

    if (req.body.actionType === 'crop_portrait') {
      media.variants.push(...await createResizeVariants(media, media.brand, ['4:5']));
    }

    if (req.body.actionType === 'crop_landscape') {
      media.variants.push(...await createResizeVariants(media, media.brand, ['16:9']));
    }

    if (req.body.actionType === 'compress') {
      media.variants.push(await createCompressedVariant(media, media.brand, {
        width: req.body.width || 1400,
        quality: req.body.quality || 78
      }));
    }

    if (req.body.actionType === 'variant') {
      const variant = await createBrandedVariant(media, media.brand, {
        label: req.body.label || 'Brand style variant',
        prompt: req.body.prompt || `Create a branded variation for ${media.brand.name}.`
      });
      media.variants.push(variant);
    }

    await media.save();
    res.redirect('/dashboard/media');
  } catch (error) {
    next(error);
  }
}

async function createDraft(req, res, next) {
  try {
    const media = await Media.findOne({ _id: req.params.id, uploadedBy: req.user._id }).populate('brand');
    if (!media) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    if (!media.aiInsights?.summary) {
      media.aiInsights = buildMediaInsights(media, media.brand);
      media.aiPrompt = media.aiInsights.visualPrompt;
      await media.save();
    }

    const post = await Post.create({
      brand: media.brand._id,
      platform: req.body.platform || media.aiInsights.recommendedPlatforms?.[0] || 'instagram',
      type: media.fileType === 'video' ? 'video' : media.fileType === 'image' ? 'image' : 'text',
      title: req.body.title || `${media.brand.name} ${media.fileName}`,
      description: media.aiInsights.summary,
      caption: req.body.caption || `${media.brand.name}: ${media.aiInsights.contentAngles?.[0] || 'Here is something worth seeing.'} ${media.brand.preferredCta || 'Contact us today.'}`,
      hashtags: media.brand.preferredHashtags || [],
      media: [media._id],
      platformMetadata: {
        sourceMedia: media._id,
        imagePrompt: media.aiPrompt,
        contentAngles: media.aiInsights.contentAngles,
        recommendedPlatforms: media.aiInsights.recommendedPlatforms,
        safetyNotes: media.aiInsights.safetyNotes
      },
      status: 'draft',
      createdBy: req.user._id
    });

    res.redirect('/dashboard/content-library');
  } catch (error) {
    next(error);
  }
}

module.exports = { archive, createDraft, creativeAction, destroy, index, signature, store };
