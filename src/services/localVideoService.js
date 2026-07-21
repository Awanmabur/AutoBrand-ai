const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { isCloudinaryConfigured } = require('../config/cloudinary');
const { uploadBuffer } = require('./cloudinaryService');
let sharp = null;
let ffmpegPath;

const GENERATED_UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'ai');
try { sharp = require('sharp'); } catch (error) { sharp = null; }

// ffmpeg only knows how to render to a real file, so a local path is
// unavoidable as the immediate render target. But hosting platforms like
// Render/Heroku wipe local disk on every restart, so that file is never a
// valid long-term home. Upload it to Cloudinary and delete the local copy -
// keeping both would just leave a duplicate that silently rots on the next
// restart anyway. Local disk is only actually kept as storage when
// Cloudinary isn't configured or the upload fails.
async function persistRenderedFile(absolutePath, { folder, resourceType }) {
  if (!isCloudinaryConfigured()) return { fileUrl: '', publicId: '' };
  try {
    const buffer = await fs.readFile(absolutePath);
    const uploaded = await uploadBuffer({ buffer, folder, resourceType });
    await fs.unlink(absolutePath).catch(() => {});
    return { fileUrl: uploaded.secure_url, publicId: uploaded.public_id };
  } catch (error) {
    console.error(`Cloudinary upload failed, falling back to local disk (will not survive a restart): ${error.message}`);
    return { fileUrl: '', publicId: '' };
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
  return String(value || 'video')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'video';
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dimensionsForAspectRatio(aspectRatio = '9:16') {
  const ratio = String(aspectRatio || '9:16');
  if (ratio.includes('16:9')) return { width: 1920, height: 1080 };
  if (ratio.includes('1:1')) return { width: 1080, height: 1080 };
  return { width: 1080, height: 1920 };
}

function wrapText(value, maxChars, maxLines) {
  const words = String(value || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.length ? lines : [''];
}

function renderTextLines(lines, { x, y, size, weight = 800, fill = '#ffffff', lineHeight = 1.18, anchor = 'start' }) {
  return lines.map((line, index) => (
    `<text x="${x}" y="${y + index * size * lineHeight}" text-anchor="${anchor}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`
  )).join('\n');
}

function colorOrFallback(colors, index, fallback) {
  const value = Array.isArray(colors) ? colors[index] : '';
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || '').trim()) ? value : fallback;
}

function resolveFfmpegPath() {
  if (ffmpegPath !== undefined) return ffmpegPath;
  try {
    ffmpegPath = require('ffmpeg-static');
  } catch (error) {
    ffmpegPath = '';
  }
  return ffmpegPath;
}

function runFfmpeg(args) {
  const binary = resolveFfmpegPath();
  if (!binary) throw new Error('ffmpeg-static is not installed. Run npm install, then try video publishing again.');

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.split('\n').slice(-8).join('\n') || `ffmpeg exited with code ${code}`));
    });
  });
}

async function createSlideshowVideo({ brand, sourceMedia, userId, durationSeconds = 8, aspectRatio = '9:16' }) {
  const imagePath = localPublicFilePath(sourceMedia?.fileUrl);
  if (!imagePath) {
    throw new Error('Local video fallback needs a generated or uploaded local image first.');
  }

  await fs.mkdir(GENERATED_UPLOAD_DIR, { recursive: true });
  const filename = `${Date.now()}-${safeFilePart(brand?.name)}-brand-video.mp4`;
  const absoluteOutput = path.join(GENERATED_UPLOAD_DIR, filename);
  const width = String(aspectRatio).includes('1:1') ? 1080 : 1080;
  const height = String(aspectRatio).includes('1:1') ? 1080 : 1920;
  const filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`;

  await runFfmpeg([
    '-y',
    '-loop', '1',
    '-i', imagePath,
    '-t', String(Math.max(4, Math.min(30, Number(durationSeconds || 8)))),
    '-vf', filter,
    '-r', '30',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    absoluteOutput
  ]);

  const stat = await fs.stat(absoluteOutput);
  const persisted = await persistRenderedFile(absoluteOutput, { folder: 'local-generated-video', resourceType: 'video' });
  return {
    fileName: filename,
    fileUrl: persisted.fileUrl || `/uploads/ai/${filename}`,
    publicId: persisted.publicId || `local-video:${filename}`,
    fileType: 'video',
    mimeType: 'video/mp4',
    size: stat.size,
    folder: 'local-generated-video',
    metadata: { userId, aspectRatio, durationSeconds }
  };
}

async function createTemplateVideo({ brand, inputData = {}, userId, renderId, durationSeconds = 15, aspectRatio = '9:16' }) {
  if (!sharp) throw new Error('sharp is required for local template video rendering. Run npm install, then try again.');

  await fs.mkdir(GENERATED_UPLOAD_DIR, { recursive: true });
  const { width, height } = dimensionsForAspectRatio(aspectRatio || inputData.aspectRatio);
  const colors = brand?.brandColors || inputData.colors || [];
  const primary = colorOrFallback(colors, 0, '#082c52');
  const accent = colorOrFallback(colors, 1, '#25d366');
  const filenameBase = `${Date.now()}-${safeFilePart(brand?.name || inputData.brandName)}-${safeFilePart(inputData.headline)}-${renderId || 'template'}`;
  const framePath = path.join(GENERATED_UPLOAD_DIR, `${filenameBase}.png`);
  const absoluteOutput = path.join(GENERATED_UPLOAD_DIR, `${filenameBase}.mp4`);
  const safeDuration = Math.max(6, Math.min(30, Number(durationSeconds || inputData.durationSeconds || 15)));
  const isWide = width > height;
  const margin = Math.round(Math.min(width, height) * 0.075);
  const headlineLines = wrapText(inputData.headline || `${brand?.name || inputData.brandName || 'AutoBrand'} offer`, isWide ? 24 : 18, 3);
  const offerLines = wrapText(inputData.offer || brand?.description || 'A clear offer for your audience', isWide ? 44 : 28, 4);
  const ctaLines = wrapText(inputData.cta || brand?.preferredCta || 'Contact us today', isWide ? 32 : 24, 2);
  const price = inputData.price ? wrapText(inputData.price, 18, 1)[0] : '';
  const phone = inputData.phone ? wrapText(inputData.phone, 24, 1)[0] : '';
  const website = inputData.website ? wrapText(inputData.website, isWide ? 42 : 28, 1)[0] : '';
  const titleSize = Math.round(Math.min(width, height) * (isWide ? 0.075 : 0.085));
  const bodySize = Math.round(Math.min(width, height) * (isWide ? 0.034 : 0.043));
  const ctaSize = Math.round(Math.min(width, height) * (isWide ? 0.042 : 0.05));
  const brandSize = Math.round(Math.min(width, height) * 0.032);

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="${escapeXml(primary)}"/>
        <stop offset="1" stop-color="#071019"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <rect x="${margin}" y="${margin}" width="${width - margin * 2}" height="${height - margin * 2}" rx="${Math.round(margin * 0.45)}" fill="rgba(255,255,255,0.075)" stroke="rgba(255,255,255,0.22)" stroke-width="3"/>
    <rect x="${margin}" y="${margin}" width="${Math.round((width - margin * 2) * 0.36)}" height="${Math.round(margin * 0.18)}" rx="6" fill="${escapeXml(accent)}"/>
    <text x="${margin * 1.35}" y="${margin * 1.8}" font-family="Inter, Arial, sans-serif" font-size="${brandSize}" font-weight="900" fill="#ffffff" opacity="0.9">${escapeXml(inputData.brandName || brand?.name || 'AutoBrand AI')}</text>
    ${renderTextLines(headlineLines, { x: margin * 1.35, y: isWide ? height * 0.29 : height * 0.24, size: titleSize, weight: 950 })}
    ${price ? `<text x="${margin * 1.35}" y="${isWide ? height * 0.58 : height * 0.49}" font-family="Inter, Arial, sans-serif" font-size="${ctaSize}" font-weight="950" fill="${escapeXml(accent)}">${escapeXml(price)}</text>` : ''}
    ${renderTextLines(offerLines, { x: margin * 1.35, y: isWide ? height * 0.66 : height * 0.58, size: bodySize, weight: 650, fill: 'rgba(255,255,255,0.86)' })}
    <rect x="${margin * 1.35}" y="${height - margin * 3.45}" width="${Math.round(width - margin * 2.7)}" height="${Math.round(margin * 1.55)}" rx="${Math.round(margin * 0.34)}" fill="${escapeXml(accent)}"/>
    ${renderTextLines(ctaLines, { x: width / 2, y: height - margin * 2.45, size: ctaSize, weight: 950, fill: '#061018', anchor: 'middle' })}
    ${phone || website ? `<text x="${width / 2}" y="${height - margin * 1.05}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${brandSize}" font-weight="800" fill="rgba(255,255,255,0.82)">${escapeXml([phone, website].filter(Boolean).join('  |  '))}</text>` : ''}
  </svg>`;

  await sharp(Buffer.from(svg)).png().toFile(framePath);
  await runFfmpeg([
    '-y',
    '-loop', '1',
    '-i', framePath,
    '-t', String(safeDuration),
    '-vf', 'format=yuv420p',
    '-r', '30',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    absoluteOutput
  ]);
  await fs.unlink(framePath).catch(() => {});

  const stat = await fs.stat(absoluteOutput);
  const fileName = path.basename(absoluteOutput);
  const persisted = await persistRenderedFile(absoluteOutput, { folder: 'local-template-video', resourceType: 'video' });
  return {
    fileName,
    fileUrl: persisted.fileUrl || `/uploads/ai/${fileName}`,
    publicId: persisted.publicId || `local-template-video:${fileName}`,
    fileType: 'video',
    mimeType: 'video/mp4',
    size: stat.size,
    folder: 'local-template-video',
    metadata: { userId, renderId, aspectRatio, durationSeconds: safeDuration }
  };
}

module.exports = { createSlideshowVideo, createTemplateVideo };
