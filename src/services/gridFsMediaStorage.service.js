const { Readable } = require('stream');

const DEFAULT_BUCKET = 'autobrand_generated_media';
const GRIDFS_URL_PATTERN = /^\/uploads\/db\/([a-f\d]{24})(?:\/[^?#]*)?(?:[?#].*)?$/i;

function mongooseRuntime() {
  // Keep this lazy so dependency-free syntax/unit gates can import media helpers.
  return require('mongoose');
}

function bucketName() {
  return String(process.env.GENERATED_MEDIA_GRIDFS_BUCKET || DEFAULT_BUCKET)
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, '_') || DEFAULT_BUCKET;
}

function gridFsBucket() {
  const mongoose = mongooseRuntime();
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new Error('MongoDB is not ready for generated-media storage.');
  }
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: bucketName() });
}

function gridFsIdFromUrl(fileUrl) {
  const raw = String(fileUrl || '').trim();
  if (!raw) return '';
  let pathname = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      pathname = new URL(raw).pathname;
    } catch (_error) {
      return '';
    }
  }
  return pathname.match(GRIDFS_URL_PATTERN)?.[1] || '';
}

function objectId(value) {
  const mongoose = mongooseRuntime();
  if (!mongoose.Types.ObjectId.isValid(String(value || ''))) return null;
  return new mongoose.Types.ObjectId(String(value));
}

function gridFsPublicUrl(id, filename = 'media') {
  const safeName = encodeURIComponent(String(filename || 'media').replace(/[\\/]+/g, '-'));
  return `/uploads/db/${String(id)}/${safeName}`;
}

async function saveBufferToGridFs({ buffer, filename, mimeType, metadata = {} }) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error('Generated media buffer is empty.');
  }
  const bucket = gridFsBucket();
  const upload = bucket.openUploadStream(String(filename || 'generated-media'), {
    contentType: mimeType || 'application/octet-stream',
    metadata: {
      ...metadata,
      mimeType: mimeType || 'application/octet-stream',
      storedAt: new Date()
    }
  });

  await new Promise((resolve, reject) => {
    upload.once('error', reject);
    upload.once('finish', resolve);
    Readable.from(buffer).pipe(upload);
  });

  return {
    id: String(upload.id),
    fileUrl: gridFsPublicUrl(upload.id, filename),
    publicId: `gridfs:${String(upload.id)}`,
    size: buffer.length,
    bucket: bucketName()
  };
}

async function gridFsFileRecord(value) {
  const id = objectId(gridFsIdFromUrl(value) || value);
  if (!id) return null;
  return gridFsBucket().find({ _id: id }).limit(1).next();
}

async function deleteGridFsFile(value) {
  const id = objectId(gridFsIdFromUrl(value) || value);
  if (!id) return false;
  try {
    await gridFsBucket().delete(id);
    return true;
  } catch (error) {
    // GridFS throws when a file is already absent; deletion remains idempotent.
    if (/FileNotFound|not found/i.test(String(error?.message || ''))) return false;
    throw error;
  }
}

async function gridFsFileExists(value) {
  try {
    const record = await gridFsFileRecord(value);
    return Boolean(record && Number(record.length || 0) > 0);
  } catch (_error) {
    return false;
  }
}

async function readGridFsBuffer(value, { maxBytes = Number(process.env.GRIDFS_PROVIDER_UPLOAD_MAX_BYTES || 1024 * 1024 * 1024) } = {}) {
  const id = objectId(gridFsIdFromUrl(value) || value);
  if (!id) throw new Error('Generated-media storage ID is invalid.');
  const record = await gridFsFileRecord(id);
  if (!record) throw new Error('Generated media no longer exists in MongoDB storage.');
  if (Number(record.length || 0) > maxBytes) {
    throw new Error(`Generated media is larger than the configured provider upload limit (${maxBytes} bytes).`);
  }

  const chunks = [];
  let size = 0;
  await new Promise((resolve, reject) => {
    const stream = gridFsBucket().openDownloadStream(id);
    stream.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        stream.destroy(new Error(`Generated media exceeded the configured provider upload limit (${maxBytes} bytes).`));
        return;
      }
      chunks.push(chunk);
    });
    stream.once('error', reject);
    stream.once('end', resolve);
  });

  return {
    buffer: Buffer.concat(chunks),
    contentType: record.contentType || record.metadata?.mimeType || 'application/octet-stream',
    fileName: record.filename || 'generated-media',
    size: Number(record.length || size),
    record
  };
}

function parseRange(rangeHeader, length) {
  const match = String(rangeHeader || '').match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : null;
  let end = match[2] ? Number(match[2]) : null;

  if (start === null && end !== null) {
    const suffixLength = Math.min(end, length);
    start = Math.max(0, length - suffixLength);
    end = length - 1;
  } else {
    start = start === null ? 0 : start;
    end = end === null ? length - 1 : Math.min(end, length - 1);
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= length) return null;
  return { start, end };
}

async function streamGridFsMedia(req, res, next) {
  try {
    const id = objectId(req.params.id);
    if (!id) return res.status(404).end();
    const record = await gridFsFileRecord(id);
    if (!record) return res.status(404).end();

    const length = Number(record.length || 0);
    const contentType = record.contentType || record.metadata?.mimeType || 'application/octet-stream';
    const safeFilename = String(record.filename || req.params.filename || 'media').replace(/[\r\n"]/g, '_');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const range = req.headers.range ? parseRange(req.headers.range, length) : null;
    if (req.headers.range && !range) {
      res.status(416).setHeader('Content-Range', `bytes */${length}`);
      return res.end();
    }

    if (range) {
      const chunkLength = range.end - range.start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${length}`);
      res.setHeader('Content-Length', String(chunkLength));
      if (req.method === 'HEAD') return res.end();
      return gridFsBucket()
        .openDownloadStream(id, { start: range.start, end: range.end + 1 })
        .once('error', next)
        .pipe(res);
    }

    res.setHeader('Content-Length', String(length));
    if (req.method === 'HEAD') return res.end();
    return gridFsBucket().openDownloadStream(id).once('error', next).pipe(res);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  GRIDFS_URL_PATTERN,
  deleteGridFsFile,
  gridFsFileExists,
  gridFsIdFromUrl,
  gridFsPublicUrl,
  readGridFsBuffer,
  saveBufferToGridFs,
  streamGridFsMedia
};
