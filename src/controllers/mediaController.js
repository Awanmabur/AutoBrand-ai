const Brand = require('../models/Brand');
const Media = require('../models/Media');
const Post = require('../models/Post');
const { cloudinary, isCloudinaryConfigured } = require('../config/cloudinary');
const { createUploadSignature } = require('../services/cloudinaryService');
const { buildMediaInsights } = require('../services/mediaInsightService');
const { createBackgroundRemovedVariant, createBrandedVariant, createCompressedVariant, createResizeVariants } = require('../services/mediaTransformService');
const { assertCanUseStorage, assertPlanFeature } = require('../services/usageLimitService');
const { downloadRemoteBuffer } = require('../services/remoteFetch.service');
const env = require('../config/env');
const path = require('path');
const { deleteGridFsFile, gridFsIdFromUrl } = require('../services/gridFsMediaStorage.service');
const { assertBrandAccess } = require('../services/authorization/brandAccess.service');
const googleDrive = require('../services/storage/googleDrive.service');
const { readMediaBuffer } = require('../services/storage/mediaBuffer.service');
const { persistGeneratedBuffer } = require('../services/generatedMediaPersistence.service');

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

function isTrustedCloudinaryAsset(fileUrl, publicId, expectedFolder) {
  if (!isCloudinaryConfigured() || !publicId || !publicId.startsWith(`${expectedFolder}/`)) return false;
  try {
    const url = new URL(String(fileUrl || ''));
    const cloudName = String(cloudinary.config?.().cloud_name || '').trim();
    return url.protocol === 'https:'
      && url.hostname.toLowerCase() === 'res.cloudinary.com'
      && (!cloudName || url.pathname.split('/').filter(Boolean)[0] === cloudName);
  } catch (_error) {
    return false;
  }
}

async function index(req, res) {
  return res.redirect(303, '/dashboard/media');
}

async function destroy(req, res, next) {
  try {
    const media = await Media.findById(req.params.id);
    if (media) await assertBrandAccess(req.user, media.brand, 'brand.manage', { status: { $in: ['active', 'archived'] } });
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
    const media = await Media.findById(req.params.id);
    if (media) await assertBrandAccess(req.user, media.brand, 'content.edit', { status: { $in: ['active', 'archived'] } });
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
    const brand = await assertBrandAccess(req.user, req.body.brand, 'content.create', { status: 'active' });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    if (!req.body.fileUrl || !isHttpUrl(req.body.fileUrl)) {
      return res.redirect('/dashboard/media?error=Add%20a%20valid%20HTTP%20or%20HTTPS%20media%20URL');
    }
    if (env.nodeEnv === 'production' && !String(req.body.fileUrl).startsWith('https://')) {
      return res.redirect('/dashboard/media?error=Production%20media%20URLs%20must%20use%20HTTPS');
    }

    // Always ingest and validate the bytes once. Metadata-only HEAD checks leave a
    // time-of-check/time-of-use gap and make publishing depend on a third-party URL
    // remaining unchanged. The persisted AutoBrand/Drive copy becomes the source of truth.
    const downloaded = await downloadRemoteBuffer(req.body.fileUrl, {
      allowedMimePrefixes: ['image/', 'video/', 'audio/', 'application/pdf'],
      maxBytes: env.maxUploadBytes
    });
    const mimeType = downloaded.mimeType;
    const size = downloaded.size;
    const storagePreference = ['platform', 'google_drive', 'both'].includes(String(req.user.assetStoragePreference || '').toLowerCase())
      ? String(req.user.assetStoragePreference).toLowerCase()
      : 'platform';
    if (storagePreference !== 'google_drive') await assertCanUseStorage(req.user, size, brand._id);
    if (storagePreference !== 'platform') {
      await assertPlanFeature(req.user, 'googleDriveAccess', 'Google Drive asset storage', brand._id);
      await googleDrive.getConnection(req.user._id, { required: true });
    }

    const expectedFolder = `autobrand/${req.user._id}/${brand._id}`;
    const publicId = String(req.body.publicId || '').trim();
    const isSignedCloudinaryUpload = isTrustedCloudinaryAsset(downloaded.finalUrl, publicId, expectedFolder);
    const safeName = path.basename(String(req.body.fileName || new URL(downloaded.finalUrl).pathname || 'media')).slice(0, 220) || 'media';
    const tags = String(req.body.tags || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 50);
    const fileType = mediaKind(mimeType);

    let media;
    let driveWarning = '';
    if (storagePreference === 'google_drive') {
      media = await googleDrive.createDriveOnlyMedia({
        user: req.user,
        brand,
        buffer: downloaded.buffer,
        fileName: safeName,
        mimeType,
        fileType,
        size,
        tags
      });
      media.consentRequired = req.body.consentRequired === 'on';
      media.consentStatus = req.body.consentRequired === 'on' ? 'pending' : 'not_required';
      if (isSignedCloudinaryUpload && cloudinary?.uploader?.destroy) {
        await cloudinary.uploader.destroy(publicId, { resource_type: fileType === 'video' ? 'video' : fileType === 'image' ? 'image' : 'raw', invalidate: true }).catch(() => {});
      }
    } else {
      let persisted;
      if (isSignedCloudinaryUpload) {
        persisted = { fileUrl: downloaded.finalUrl, publicId, storage: 'cloudinary', size };
      } else {
        persisted = await persistGeneratedBuffer({
          buffer: downloaded.buffer,
          filename: safeName,
          mimeType,
          resourceType: fileType === 'video' ? 'video' : fileType === 'image' ? 'image' : 'raw',
          folder: `${expectedFolder}/uploads`,
          metadata: { source: 'user_ingest', brandId: String(brand._id), userId: String(req.user._id) }
        });
      }

      media = await Media.create({
        brand: brand._id,
        uploadedBy: req.user._id,
        fileName: safeName,
        fileUrl: persisted.fileUrl,
        publicId: persisted.publicId,
        fileType,
        mimeType,
        size,
        folder: isSignedCloudinaryUpload ? expectedFolder : `${expectedFolder}/uploads`,
        storageProvider: 'platform',
        tags,
        consentRequired: req.body.consentRequired === 'on',
        consentStatus: req.body.consentRequired === 'on' ? 'pending' : 'not_required'
      });
      if (storagePreference === 'both') {
        try {
          await googleDrive.mirrorMediaToDrive({ user: req.user, brand, media, buffer: downloaded.buffer });
        } catch (error) {
          driveWarning = `AutoBrand copy saved, but Google Drive backup failed: ${error.message}`;
        }
      }
    }

    media.aiInsights = buildMediaInsights(media, brand);
    media.aiPrompt = media.aiInsights.visualPrompt;
    await media.save();

    const suffix = driveWarning ? `?error=${encodeURIComponent(driveWarning)}` : '';
    return res.redirect(`/dashboard/media${suffix}`);
  } catch (error) {
    return next(error);
  }
}

async function signature(req, res, next) {
  try {
    let brand = null;
    if (req.query.brand) {
      brand = await assertBrandAccess(req.user, req.query.brand, 'content.create', { status: 'active' });
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
    const media = await Media.findById(req.params.id).populate('brand');
    if (media) await assertBrandAccess(req.user, media.brand?._id || media.brand, 'content.edit', { status: 'active' });
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
      media.variants.push(await createBackgroundRemovedVariant(media, media.brand, {
        threshold: req.body.threshold,
        feather: req.body.feather
      }));
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
    const media = await Media.findById(req.params.id).populate('brand');
    if (media) await assertBrandAccess(req.user, media.brand?._id || media.brand, 'content.create', { status: 'active' });
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
      contentSource: 'manual',
      createdBy: req.user._id
    });

    res.redirect('/dashboard/content-library');
  } catch (error) {
    next(error);
  }
}

async function backupToDrive(req, res, next) {
  try {
    const media = await Media.findById(req.params.id).populate('brand');
    if (media) await assertBrandAccess(req.user, media.brand?._id || media.brand, 'content.edit', { status: 'active' });
    if (!media) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });
    if (media.externalProvider === 'google_drive' && media.externalFileId) {
      return res.redirect('/dashboard/media?notice=This%20asset%20is%20already%20backed%20up%20to%20Google%20Drive');
    }
    const source = await readMediaBuffer(media, { maxBytes: env.maxUploadBytes });
    await googleDrive.mirrorMediaToDrive({ user: req.user, brand: media.brand, media, buffer: source.buffer });
    return res.redirect('/dashboard/media?notice=Asset%20backed%20up%20to%20Google%20Drive');
  } catch (error) {
    return next(error);
  }
}

module.exports = { archive, backupToDrive, createDraft, creativeAction, destroy, index, signature, store };
