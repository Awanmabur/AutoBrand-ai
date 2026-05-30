let cloudinary;
try {
  cloudinary = require('cloudinary').v2;
} catch (error) {
  cloudinary = {
    config() {},
    uploader: {
      async upload() {
        throw new Error('Cloudinary package is not installed. Install cloudinary or disable Cloudinary uploads.');
      }
    }
  };
}
const env = require('./env');

cloudinary.config({
  cloud_name: env.cloudinaryCloudName,
  api_key: env.cloudinaryApiKey,
  api_secret: env.cloudinaryApiSecret
});

function isCloudinaryConfigured() {
  return Boolean(env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret);
}

module.exports = { cloudinary, isCloudinaryConfigured };
