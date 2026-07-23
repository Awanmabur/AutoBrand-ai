const fs = require('fs/promises');
const path = require('path');
const { gridFsFileExists, gridFsIdFromUrl } = require('./gridFsMediaStorage.service');

const PUBLIC_ROOT = path.join(__dirname, '..', '..', 'public');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function isLocalHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return LOCAL_HOSTS.has(url.hostname.toLowerCase()) || url.hostname.toLowerCase().endsWith('.localhost');
  } catch (_error) {
    return false;
  }
}

function localPublicFilePath(fileUrl) {
  const value = String(fileUrl || '').trim();
  if (!value) return '';

  let pathname = value;
  if (isHttpUrl(value)) {
    if (!isLocalHttpUrl(value)) return '';
    try {
      pathname = new URL(value).pathname;
    } catch (_error) {
      return '';
    }
  }

  const cleaned = pathname.split('?')[0].replace(/^\/+/, '').replace(/^public[\\/]/, '');
  if (!cleaned) return '';
  const absolute = path.normalize(path.join(PUBLIC_ROOT, cleaned));
  const relative = path.relative(PUBLIC_ROOT, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return '';
  return absolute;
}

async function localFileExists(fileUrl) {
  const absolutePath = localPublicFilePath(fileUrl);
  if (!absolutePath) return false;
  try {
    const stat = await fs.stat(absolutePath);
    return stat.isFile() && stat.size > 0;
  } catch (_error) {
    return false;
  }
}

async function inspectMediaAvailability(media) {
  const fileUrl = String(media?.fileUrl || '').trim();
  if (!fileUrl) {
    return { available: false, reason: 'missing_url', fileUrl, localPath: '' };
  }

  const gridFsId = gridFsIdFromUrl(fileUrl);
  if (gridFsId) {
    const available = await gridFsFileExists(gridFsId);
    return {
      available,
      reason: available ? 'gridfs_file' : 'gridfs_file_missing',
      fileUrl,
      localPath: '',
      gridFsId
    };
  }

  if (isHttpUrl(fileUrl) && !isLocalHttpUrl(fileUrl)) {
    return { available: true, reason: 'remote_url', fileUrl, localPath: '' };
  }

  const localPath = localPublicFilePath(fileUrl);
  if (!localPath) {
    return { available: false, reason: 'invalid_local_path', fileUrl, localPath: '' };
  }

  const available = await localFileExists(fileUrl);
  return {
    available,
    reason: available ? 'local_file' : 'local_file_missing',
    fileUrl,
    localPath
  };
}

async function partitionAvailableMedia(rows = []) {
  const available = [];
  const missing = [];
  for (const row of rows || []) {
    const inspection = await inspectMediaAvailability(row);
    if (inspection.available) available.push(row);
    else missing.push({ row, ...inspection });
  }
  return { available, missing };
}

async function archiveMissingGeneratedMedia(missing = [], { reason = 'Generated file is no longer present on storage.' } = {}) {
  for (const item of missing || []) {
    const media = item?.row;
    if (!media || typeof media.save !== 'function') continue;
    const tags = Array.isArray(media.tags) ? media.tags : [];
    const generated = tags.includes('generated') || tags.some((tag) => String(tag).startsWith('generation-job-'));
    if (!generated) continue;
    media.status = 'archived';
    media.aiInsights = {
      ...(media.aiInsights || {}),
      storageStatus: 'missing',
      storageError: reason,
      storageCheckedAt: new Date()
    };
    media.markModified?.('aiInsights');
    await media.save().catch(() => {});
  }
}

module.exports = {
  PUBLIC_ROOT,
  archiveMissingGeneratedMedia,
  inspectMediaAvailability,
  isHttpUrl,
  isLocalHttpUrl,
  localFileExists,
  localPublicFilePath,
  partitionAvailableMedia
};
