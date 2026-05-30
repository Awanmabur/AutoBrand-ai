const Brand = require('../models/Brand');
const Media = require('../models/Media');
const Post = require('../models/Post');
const { isCloudinaryConfigured } = require('../config/cloudinary');
const { createUploadSignature } = require('../services/cloudinaryService');
const { buildMediaInsights } = require('../services/mediaInsightService');

function mediaKind(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'document';
  return 'other';
}

async function index(req, res, next) {
  try {
    const filter = { uploadedBy: req.user._id };
    if (req.query.brand) filter.brand = req.query.brand;
    if (req.query.type) filter.fileType = req.query.type;
    if (req.query.q) filter.fileName = new RegExp(req.query.q, 'i');

    const [brands, media] = await Promise.all([
      Brand.find({ owner: req.user._id, status: 'active' }).sort({ name: 1 }),
      Media.find(filter).populate('brand').sort({ createdAt: -1 }).limit(80)
    ]);

    res.render('media/index', {
      title: 'Media Library',
      layout: 'layouts/dashboard',
      brands,
      media,
      filters: req.query,
      error: null,
      cloudinaryReady: isCloudinaryConfigured()
    });
  } catch (error) {
    next(error);
  }
}

async function destroy(req, res, next) {
  try {
    await Media.deleteOne({ _id: req.params.id, uploadedBy: req.user._id });
    return res.redirect('/dashboard/media');
  } catch (error) {
    return next(error);
  }
}

async function store(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.body.brand, owner: req.user._id });
    if (!brand) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });

    if (!req.body.fileUrl) {
      const [brands, media] = await Promise.all([
        Brand.find({ owner: req.user._id, status: 'active' }).sort({ name: 1 }),
        Media.find({ uploadedBy: req.user._id }).populate('brand').sort({ createdAt: -1 }).limit(60)
      ]);

      return res.status(422).render('media/index', {
        title: 'Media Library',
        layout: 'layouts/dashboard',
        brands,
        media,
        filters: {},
        cloudinaryReady: isCloudinaryConfigured(),
        error: 'Add a media URL to save.'
      });
    }

    const mimeType = req.body.mimeType || 'application/octet-stream';

    const media = await Media.create({
      brand: brand._id,
      uploadedBy: req.user._id,
      fileName: req.body.fileName || req.body.fileUrl,
      fileUrl: req.body.fileUrl,
      publicId: req.body.publicId || req.body.fileUrl,
      fileType: req.body.fileType || mediaKind(mimeType),
      mimeType,
      size: Number(req.body.size || 0),
      folder: req.body.folder || 'external',
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
    if (!media) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });

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
      ['9:16', '1:1', '16:9'].forEach((ratio) => {
        media.variants.push({
          kind: 'resize',
          label: `${ratio} platform resize`,
          prompt: `Resize/crop ${media.fileName} for ${ratio} while preserving the key subject and brand space.`,
          status: 'planned',
          metadata: { aspectRatio: ratio }
        });
      });
    }

    if (req.body.actionType === 'variant') {
      media.variants.push({
        kind: 'image_variant',
        label: req.body.label || 'Brand style variant',
        prompt: req.body.prompt || `Create a branded variation for ${media.brand.name}.`,
        status: 'planned'
      });
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
    if (!media) return res.status(404).render('errors/404', { layout: 'layouts/dashboard' });

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

module.exports = { createDraft, creativeAction, destroy, index, signature, store };
