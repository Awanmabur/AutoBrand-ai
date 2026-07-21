const fs = require('fs/promises');
const path = require('path');
const { isCloudinaryConfigured } = require('../config/cloudinary');
const { uploadBuffer } = require('./cloudinaryService');
let sharp = null;

try { sharp = require('sharp'); } catch (error) { sharp = null; }

const GENERATED_UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'ai');

// sharp only knows how to render to a real file, so a local path is
// unavoidable as the immediate render target. But hosting platforms like
// Render/Heroku wipe local disk on every restart, so that file is never a
// valid long-term home. Upload it to Cloudinary and delete the local copy -
// keeping both would just leave a duplicate that silently rots on the next
// restart anyway. Local disk is only actually kept as storage when
// Cloudinary isn't configured or the upload fails.
async function persistedUrl(absolutePath, folder) {
  if (!isCloudinaryConfigured()) return '';
  try {
    const buffer = await fs.readFile(absolutePath);
    const uploaded = await uploadBuffer({ buffer, folder, resourceType: 'image' });
    await fs.unlink(absolutePath).catch(() => {});
    return uploaded.secure_url;
  } catch (error) {
    console.error(`Cloudinary upload failed, falling back to local disk (will not survive a restart): ${error.message}`);
    return '';
  }
}

function localPublicFilePath(fileUrl) {
  if (!fileUrl || /^https?:\/\//i.test(fileUrl)) return '';
  const cleaned = String(fileUrl).split('?')[0].replace(/^\/+/, '');
  const publicRoot = path.join(__dirname, '..', '..', 'public');
  const absolute = path.normalize(path.join(publicRoot, cleaned.replace(/^public[\\/]/, '')));
  if (!absolute.startsWith(publicRoot)) return '';
  return absolute;
}

function safeFilePart(value) {
  return String(value || 'asset')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'asset';
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dimensionsForRatio(ratio) {
  if (String(ratio).includes('16:9')) return { width: 1600, height: 900 };
  if (String(ratio).includes('9:16')) return { width: 1080, height: 1920 };
  if (String(ratio).includes('4:5')) return { width: 1080, height: 1350 };
  return { width: 1200, height: 1200 };
}

function colorOrFallback(colors, index, fallback) {
  const value = Array.isArray(colors) ? colors[index] : '';
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || '').trim()) ? value : fallback;
}

async function imageInput(media) {
  const local = localPublicFilePath(media?.fileUrl);
  if (local) return local;
  if (/^https?:\/\//i.test(media?.fileUrl || '')) {
    const response = await fetch(media.fileUrl);
    if (!response.ok) throw new Error(`Could not fetch source image: ${response.status} ${response.statusText}`);
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error('A local or public image URL is required for media transforms.');
}

function assertSharp() {
  if (!sharp) throw new Error('sharp is required for media transforms. Run npm install, then try again.');
}

function ratioLabel(ratio) {
  if (ratio === '1:1') return 'Square crop';
  if (ratio === '9:16') return 'Vertical 9:16 crop';
  if (ratio === '4:5') return 'Portrait 4:5 crop';
  if (ratio === '16:9') return 'Landscape 16:9 crop';
  return `${ratio} resize`;
}

async function createResizeVariants(media, brand, ratios = ['1:1', '9:16', '4:5', '16:9']) {
  assertSharp();
  if (media.fileType !== 'image') throw new Error('Resize transforms only support image media.');
  await fs.mkdir(GENERATED_UPLOAD_DIR, { recursive: true });
  const input = await imageInput(media);
  const created = [];

  for (const ratio of ratios) {
    const { width, height } = dimensionsForRatio(ratio);
    const filename = `${Date.now()}-${safeFilePart(media.fileName)}-${ratio.replace(':', 'x')}.png`;
    const absoluteOutput = path.join(GENERATED_UPLOAD_DIR, filename);
    await sharp(input)
      .rotate()
      .resize(width, height, { fit: 'cover', position: 'attention' })
      .png({ quality: 92 })
      .toFile(absoluteOutput);
    const stat = await fs.stat(absoluteOutput);
    const persistedFileUrl = await persistedUrl(absoluteOutput, 'resize-variants');
    created.push({
      kind: 'resize',
      label: ratioLabel(ratio),
      url: persistedFileUrl || `/uploads/ai/${filename}`,
      prompt: `Resized ${media.fileName} for ${ratio} while preserving the key subject and brand space.`,
      status: 'ready',
      metadata: { aspectRatio: ratio, width, height, bytes: stat.size, brand: brand?.name || '' },
      createdAt: new Date()
    });
  }

  return created;
}

async function createCompressedVariant(media, brand, { width = 1400, quality = 78 } = {}) {
  assertSharp();
  if (media.fileType !== 'image') throw new Error('Compress transforms only support image media.');
  await fs.mkdir(GENERATED_UPLOAD_DIR, { recursive: true });
  const input = await imageInput(media);
  const filename = `${Date.now()}-${safeFilePart(media.fileName)}-compressed.jpg`;
  const absoluteOutput = path.join(GENERATED_UPLOAD_DIR, filename);
  await sharp(input)
    .rotate()
    .resize({ width: Number(width || 1400), withoutEnlargement: true })
    .jpeg({ quality: Number(quality || 78), mozjpeg: true })
    .toFile(absoluteOutput);
  const stat = await fs.stat(absoluteOutput);
  const persistedFileUrl = await persistedUrl(absoluteOutput, 'compressed-variants');
  return {
    kind: 'compress',
    label: 'Compressed image',
    url: persistedFileUrl || `/uploads/ai/${filename}`,
    prompt: `Compressed ${media.fileName} for faster uploads and smaller social assets.`,
    status: 'ready',
    metadata: { width: Number(width || 1400), quality: Number(quality || 78), bytes: stat.size, brand: brand?.name || '' },
    createdAt: new Date()
  };
}

async function createBrandedVariant(media, brand, { label = 'Brand style variant', prompt = '' } = {}) {
  assertSharp();
  if (media.fileType !== 'image') throw new Error('Image variants only support image media.');
  await fs.mkdir(GENERATED_UPLOAD_DIR, { recursive: true });
  const input = await imageInput(media);
  const width = 1200;
  const height = 1200;
  const primary = colorOrFallback(brand?.brandColors, 0, '#082c52');
  const accent = colorOrFallback(brand?.brandColors, 1, '#25d366');
  const cta = brand?.preferredCta || 'Contact us today';
  const overlay = Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="shade" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="rgba(0,0,0,0.05)"/>
        <stop offset="1" stop-color="rgba(0,0,0,0.62)"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#shade)"/>
    <rect x="54" y="54" width="250" height="14" rx="7" fill="${escapeXml(accent)}"/>
    <text x="54" y="110" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="900" fill="#fff">${escapeXml(brand?.name || 'AutoBrand')}</text>
    <rect x="54" y="1020" width="1088" height="112" rx="34" fill="${escapeXml(primary)}" opacity="0.94"/>
    <text x="600" y="1090" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="44" font-weight="950" fill="#fff">${escapeXml(cta)}</text>
  </svg>`);
  const filename = `${Date.now()}-${safeFilePart(media.fileName)}-brand-variant.png`;
  const absoluteOutput = path.join(GENERATED_UPLOAD_DIR, filename);

  await sharp(input)
    .rotate()
    .resize(width, height, { fit: 'cover', position: 'attention' })
    .composite([{ input: overlay, blend: 'over' }])
    .png({ quality: 92 })
    .toFile(absoluteOutput);

  const stat = await fs.stat(absoluteOutput);
  const persistedFileUrl = await persistedUrl(absoluteOutput, 'branded-variants');
  return {
    kind: 'image_variant',
    label,
    url: persistedFileUrl || `/uploads/ai/${filename}`,
    prompt: prompt || `Created a branded variation for ${brand?.name || 'this brand'}.`,
    status: 'ready',
    metadata: { width, height, bytes: stat.size, brand: brand?.name || '' },
    createdAt: new Date()
  };
}

module.exports = { createBrandedVariant, createCompressedVariant, createResizeVariants };
