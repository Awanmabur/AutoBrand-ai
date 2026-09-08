const fs = require('fs/promises');
const path = require('path');
const env = require('../config/env');
const { isCloudinaryConfigured } = require('../config/cloudinary');
const { uploadBuffer } = require('./cloudinaryService');
const { saveBufferToGridFs } = require('./gridFsMediaStorage.service');

function normalizedStorageMode() {
  return String(env.generatedMediaStorage || 'gridfs').trim().toLowerCase();
}

function isProduction() {
  return String(env.nodeEnv || process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function localPublicUrlFor(absolutePath) {
  const publicRoot = path.resolve(__dirname, '..', '..', 'public');
  const resolved = path.resolve(absolutePath);
  const relative = path.relative(publicRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Local generated media must be inside the public directory.');
  }
  return `/${relative.split(path.sep).map(encodeURIComponent).join('/')}`;
}

async function uploadCloudinary({ buffer, folder, resourceType, publicId }) {
  if (!isCloudinaryConfigured()) return null;
  const uploaded = await uploadBuffer({ buffer, folder, resourceType, publicId });
  return {
    fileUrl: uploaded.secure_url,
    publicId: uploaded.public_id,
    storage: 'cloudinary',
    size: buffer.length
  };
}

async function uploadGridFs({ buffer, filename, mimeType, metadata }) {
  const stored = await saveBufferToGridFs({ buffer, filename, mimeType, metadata });
  return {
    fileUrl: stored.fileUrl,
    publicId: stored.publicId,
    storage: 'gridfs',
    size: stored.size,
    bucket: stored.bucket
  };
}

/**
 * Persist generated/deterministic media to durable storage.
 *
 * Cloudinary and MongoDB/GridFS are durable deployment-safe destinations.
 * Local disk is allowed only when GENERATED_MEDIA_STORAGE=local outside
 * production. Production never silently degrades to ephemeral disk.
 */
async function persistGeneratedBuffer({
  buffer,
  filename,
  mimeType,
  folder = 'generated-media',
  resourceType = 'image',
  publicId,
  metadata = {}
}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Generated media buffer is empty.');
  const mode = normalizedStorageMode();
  if (!['gridfs', 'cloudinary', 'local'].includes(mode)) {
    throw new Error(`Unsupported GENERATED_MEDIA_STORAGE value: ${mode}.`);
  }
  if (isProduction() && mode === 'local') {
    throw new Error('GENERATED_MEDIA_STORAGE=local is not allowed in production because local files are ephemeral.');
  }

  const errors = [];
  const tryCloudinary = mode === 'cloudinary' || isCloudinaryConfigured();
  if (tryCloudinary) {
    try {
      const stored = await uploadCloudinary({ buffer, folder, resourceType, publicId });
      if (stored) return stored;
      if (mode === 'cloudinary') errors.push('Cloudinary is not configured.');
    } catch (error) {
      errors.push(`Cloudinary: ${error.message}`);
      if (mode === 'cloudinary') {
        throw new Error(`Generated media could not be persisted to Cloudinary: ${error.message}`);
      }
    }
  }

  if (mode !== 'local') {
    try {
      return await uploadGridFs({ buffer, filename, mimeType, metadata });
    } catch (error) {
      errors.push(`GridFS: ${error.message}`);
      throw new Error(`Generated media could not be persisted to durable storage. ${errors.join(' | ')}`);
    }
  }

  return { fileUrl: '', publicId: '', storage: 'local', size: buffer.length };
}

async function persistGeneratedFile({ absolutePath, ...options }) {
  const buffer = await fs.readFile(absolutePath);
  try {
    const persisted = await persistGeneratedBuffer({
      buffer,
      filename: options.filename || path.basename(absolutePath),
      ...options
    });
    if (persisted.storage !== 'local') await fs.unlink(absolutePath).catch(() => {});
    if (persisted.storage === 'local') {
      return {
        ...persisted,
        fileUrl: localPublicUrlFor(absolutePath),
        publicId: persisted.publicId || `local:${path.basename(absolutePath)}`
      };
    }
    return persisted;
  } catch (error) {
    if (isProduction()) await fs.unlink(absolutePath).catch(() => {});
    throw error;
  }
}

module.exports = {
  persistGeneratedBuffer,
  persistGeneratedFile,
  normalizedStorageMode
};
