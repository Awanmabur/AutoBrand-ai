const fs = require('fs/promises');
const path = require('path');
const env = require('../../config/env');
const { gridFsIdFromUrl, readGridFsBuffer } = require('../gridFsMediaStorage.service');
const { downloadRemoteBuffer } = require('../remoteFetch.service');

function localPublicFilePath(fileUrl) {
  const value = String(fileUrl || '').split(/[?#]/)[0];
  if (!value.startsWith('/uploads/') || value.startsWith('/uploads/db/') || value.startsWith('/uploads/drive/')) return '';
  const publicRoot = path.resolve(process.cwd(), 'public');
  const absolute = path.resolve(publicRoot, `.${value}`);
  return absolute.startsWith(`${publicRoot}${path.sep}`) ? absolute : '';
}

async function readMediaBuffer(media, { maxBytes = Number(env.maxUploadBytes || 1024 * 1024 * 1024) } = {}) {
  if (!media) throw new Error('Media is required.');
  const gridFsId = gridFsIdFromUrl(media.fileUrl);
  if (gridFsId) {
    const stored = await readGridFsBuffer(gridFsId, { maxBytes });
    return {
      buffer: stored.buffer,
      mimeType: media.mimeType || stored.contentType || 'application/octet-stream',
      fileName: media.fileName || stored.fileName || 'asset',
      size: stored.size || stored.buffer.length
    };
  }

  const localPath = localPublicFilePath(media.fileUrl);
  if (localPath) {
    const stat = await fs.stat(localPath);
    if (stat.size > maxBytes) throw new Error(`Media is larger than the configured limit (${maxBytes} bytes).`);
    return {
      buffer: await fs.readFile(localPath),
      mimeType: media.mimeType || 'application/octet-stream',
      fileName: media.fileName || path.basename(localPath),
      size: stat.size
    };
  }

  if (/^https?:\/\//i.test(String(media.fileUrl || ''))) {
    const downloaded = await downloadRemoteBuffer(media.fileUrl, {
      allowedMimePrefixes: ['image/', 'video/', 'audio/', 'application/pdf', 'application/octet-stream'],
      maxBytes
    });
    return {
      buffer: downloaded.buffer,
      mimeType: media.mimeType || downloaded.mimeType || 'application/octet-stream',
      fileName: media.fileName || 'asset',
      size: downloaded.size || downloaded.buffer.length
    };
  }

  throw new Error('This media item does not have a readable platform copy.');
}

module.exports = { readMediaBuffer };
