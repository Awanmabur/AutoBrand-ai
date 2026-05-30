const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
let ffmpegPath;

const GENERATED_UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'ai');

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
  return {
    fileName: filename,
    fileUrl: `/uploads/ai/${filename}`,
    publicId: `local-video:${filename}`,
    fileType: 'video',
    mimeType: 'video/mp4',
    size: stat.size,
    folder: 'local-generated-video',
    metadata: { userId, aspectRatio, durationSeconds }
  };
}

module.exports = { createSlideshowVideo };
