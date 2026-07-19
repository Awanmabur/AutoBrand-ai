const { cloudinary, isCloudinaryConfigured } = require('../config/cloudinary');
const env = require('../config/env');

const ALLOWED_UPLOAD_FORMATS = 'jpg,jpeg,png,webp,gif,avif,mp4,mov,webm,m4v,pdf';

function createUploadSignature({ userId, brandId }) {
  if (!isCloudinaryConfigured()) {
    return { configured: false };
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = `autobrand/${userId}/${brandId}`;
  const signature = cloudinary.utils.api_sign_request(
    {
      folder,
      timestamp,
      allowed_formats: ALLOWED_UPLOAD_FORMATS
    },
    env.cloudinaryApiSecret
  );

  return {
    configured: true,
    cloudName: env.cloudinaryCloudName,
    apiKey: env.cloudinaryApiKey,
    timestamp,
    folder,
    allowedFormats: ALLOWED_UPLOAD_FORMATS,
    signature
  };
}

async function checkCloudinary() {
  if (!isCloudinaryConfigured()) {
    return { ok: false, configured: false, message: 'Cloudinary keys are missing.' };
  }

  try {
    await cloudinary.api.ping();
    return { ok: true, configured: true, message: 'Cloudinary connected.' };
  } catch (error) {
    return { ok: false, configured: true, message: error.message };
  }
}

module.exports = { createUploadSignature, checkCloudinary };
