const crypto = require('crypto');
const { Readable } = require('stream');
const env = require('../../config/env');
const CloudStorageConnection = require('../../models/CloudStorageConnection');
const Media = require('../../models/Media');
const { encryptToken, decryptToken } = require('../tokenCryptoService');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

function isConfigured() {
  return Boolean(env.googleDriveClientId && env.googleDriveClientSecret && env.googleDriveCallbackUrl);
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function createPkcePair() {
  const verifier = randomToken(48);
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function createState() {
  return randomToken(24);
}

function buildAuthUrl({ state, codeChallenge }) {
  if (!isConfigured()) throw new Error('Google Drive OAuth is not configured.');
  const params = new URLSearchParams({
    client_id: env.googleDriveClientId,
    redirect_uri: env.googleDriveCallbackUrl,
    response_type: 'code',
    scope: env.googleDriveScopes,
    state,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  if (!response.ok) {
    const error = new Error(data.error_description || data.error?.message || data.error || `Google Drive request failed (${response.status}).`);
    error.status = response.status >= 500 ? 503 : 422;
    error.providerStatus = response.status;
    error.providerBody = data;
    throw error;
  }
  return data;
}

async function exchangeCode({ code, codeVerifier }) {
  return fetchJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.googleDriveClientId,
      client_secret: env.googleDriveClientSecret,
      redirect_uri: env.googleDriveCallbackUrl,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier
    })
  });
}

async function refreshAccessToken(refreshToken) {
  return fetchJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.googleDriveClientId,
      client_secret: env.googleDriveClientSecret,
      grant_type: 'refresh_token'
    })
  });
}

async function getUserInfo(accessToken) {
  return fetchJson(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
}

function expiresAtFromToken(tokenData) {
  const seconds = Number(tokenData?.expires_in || 3600);
  return new Date(Date.now() + Math.max(60, seconds - 30) * 1000);
}

async function connectUser({ user, code, codeVerifier }) {
  const tokenData = await exchangeCode({ code, codeVerifier });
  const profile = await getUserInfo(tokenData.access_token);
  const existing = await CloudStorageConnection.findOne({ owner: user._id, provider: 'google_drive' });
  const refreshToken = tokenData.refresh_token || (existing?.refreshTokenEncrypted ? decryptToken(existing.refreshTokenEncrypted) : '');
  if (!refreshToken) {
    const error = new Error('Google did not return an offline refresh token. Reconnect Drive and approve offline access.');
    error.status = 422;
    throw error;
  }
  const connection = await CloudStorageConnection.findOneAndUpdate(
    { owner: user._id, provider: 'google_drive' },
    {
      $set: {
        status: 'connected',
        accountEmail: String(profile.email || '').toLowerCase(),
        accountName: profile.name || profile.email || 'Google Drive',
        accessTokenEncrypted: encryptToken(tokenData.access_token),
        refreshTokenEncrypted: encryptToken(refreshToken),
        tokenExpiresAt: expiresAtFromToken(tokenData),
        scopes: String(tokenData.scope || env.googleDriveScopes).split(/\s+/).filter(Boolean),
        lastSyncAt: new Date(),
        lastError: ''
      },
      $setOnInsert: { rootFolderName: env.googleDriveRootFolderName || 'AutoBrand AI' }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  await ensureRootFolder(connection);
  return connection;
}

async function getConnection(userId, { required = false } = {}) {
  const connection = await CloudStorageConnection.findOne({ owner: userId, provider: 'google_drive' });
  if (required && (!connection || connection.status !== 'connected')) {
    const error = new Error('Google Drive is not connected. Connect it in Settings first.');
    error.status = 409;
    throw error;
  }
  return connection;
}

async function accessToken(connection) {
  if (!connection) throw new Error('Google Drive connection is missing.');
  if (connection.status !== 'connected') {
    const error = new Error('Google Drive needs to be reconnected.');
    error.status = 409;
    throw error;
  }
  const current = connection.accessTokenEncrypted ? decryptToken(connection.accessTokenEncrypted) : '';
  if (current && connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() > Date.now() + 60_000) return current;
  const refresh = connection.refreshTokenEncrypted ? decryptToken(connection.refreshTokenEncrypted) : '';
  if (!refresh) {
    connection.status = 'needs_reconnect';
    connection.lastError = 'Missing refresh token.';
    await connection.save();
    const error = new Error('Google Drive needs to be reconnected.');
    error.status = 409;
    throw error;
  }
  try {
    const refreshed = await refreshAccessToken(refresh);
    connection.accessTokenEncrypted = encryptToken(refreshed.access_token);
    if (refreshed.refresh_token) connection.refreshTokenEncrypted = encryptToken(refreshed.refresh_token);
    connection.tokenExpiresAt = expiresAtFromToken(refreshed);
    connection.status = 'connected';
    connection.lastSyncAt = new Date();
    connection.lastError = '';
    await connection.save();
    return refreshed.access_token;
  } catch (error) {
    connection.status = 'needs_reconnect';
    connection.lastError = String(error.message || error).slice(0, 1000);
    await connection.save().catch(() => {});
    throw error;
  }
}

async function driveJson(connection, path, options = {}) {
  const token = await accessToken(connection);
  return fetchJson(`https://www.googleapis.com${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
}

function escapeDriveQuery(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findFolder(connection, name, parentId = '') {
  const parts = [
    `name='${escapeDriveQuery(name)}'`,
    `mimeType='application/vnd.google-apps.folder'`,
    'trashed=false'
  ];
  if (parentId) parts.push(`'${escapeDriveQuery(parentId)}' in parents`);
  const params = new URLSearchParams({ q: parts.join(' and '), fields: 'files(id,name,webViewLink)', spaces: 'drive', pageSize: '10' });
  const data = await driveJson(connection, `/drive/v3/files?${params.toString()}`);
  return data.files?.[0] || null;
}

async function createFolder(connection, name, parentId = '') {
  const body = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) body.parents = [parentId];
  return driveJson(connection, '/drive/v3/files?fields=id,name,webViewLink', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function ensureRootFolder(connection) {
  if (connection.rootFolderId) return connection.rootFolderId;
  const name = connection.rootFolderName || env.googleDriveRootFolderName || 'AutoBrand AI';
  const existing = await findFolder(connection, name);
  const folder = existing || await createFolder(connection, name);
  connection.rootFolderId = folder.id;
  connection.rootFolderName = folder.name || name;
  connection.metadata = { ...(connection.metadata || {}), rootWebViewLink: folder.webViewLink || '' };
  connection.lastSyncAt = new Date();
  await connection.save();
  return folder.id;
}

async function ensureBrandFolder(connection, brand) {
  const rootId = await ensureRootFolder(connection);
  const name = `${String(brand.name || 'Brand').slice(0, 90)} — ${String(brand._id).slice(-6)}`;
  const existing = await findFolder(connection, name, rootId);
  const folder = existing || await createFolder(connection, name, rootId);
  return folder;
}

async function uploadBuffer(connection, { buffer, fileName, mimeType, parentId }) {
  const token = await accessToken(connection);
  const boundary = `autobrand-${crypto.randomBytes(12).toString('hex')}`;
  const metadata = { name: fileName, ...(parentId ? { parents: [parentId] } : {}) };
  const header = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`);
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const response = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,parents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: Buffer.concat([header, Buffer.from(buffer), footer])
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  if (!response.ok) {
    const error = new Error(data.error?.message || `Google Drive upload failed (${response.status}).`);
    error.status = response.status >= 500 ? 503 : 422;
    throw error;
  }
  connection.lastSyncAt = new Date();
  connection.lastError = '';
  await connection.save();
  return data;
}

async function uploadBrandAsset({ user, brand, buffer, fileName, mimeType }) {
  const connection = await getConnection(user._id || user, { required: true });
  const folder = await ensureBrandFolder(connection, brand);
  const file = await uploadBuffer(connection, { buffer, fileName, mimeType, parentId: folder.id });
  return { connection, folder, file };
}

async function mirrorMediaToDrive({ user, brand, media, buffer }) {
  const { folder, file } = await uploadBrandAsset({ user, brand, buffer, fileName: media.fileName, mimeType: media.mimeType });
  media.storageProvider = media.storageProvider === 'platform' ? 'both' : 'google_drive';
  media.externalProvider = 'google_drive';
  media.externalFileId = file.id;
  media.externalFolderId = folder.id;
  media.externalWebViewLink = file.webViewLink || '';
  await media.save();
  return media;
}

function driveProxyPath(media) {
  return `/uploads/drive/${media._id}/${media.publicAccessToken}/${encodeURIComponent(media.fileName || 'asset')}`;
}

async function createDriveOnlyMedia({ user, brand, buffer, fileName, mimeType, fileType, size, tags = [] }) {
  const { folder, file } = await uploadBrandAsset({ user, brand, buffer, fileName, mimeType });
  const media = await Media.create({
    brand: brand._id,
    uploadedBy: user._id || user,
    fileName,
    fileUrl: 'pending-drive-url',
    publicId: `google-drive:${file.id}`,
    fileType,
    mimeType,
    size,
    folder: 'google-drive',
    storageProvider: 'google_drive',
    externalProvider: 'google_drive',
    externalFileId: file.id,
    externalFolderId: folder.id,
    externalWebViewLink: file.webViewLink || '',
    publicAccessToken: randomToken(24),
    tags: [...new Set(['google-drive', ...tags])],
    consentRequired: false,
    consentStatus: 'not_required'
  });
  media.fileUrl = driveProxyPath(media);
  await media.save();
  return media;
}

async function streamMedia(req, res, next) {
  try {
    const media = await Media.findOne({ _id: req.params.id, externalProvider: 'google_drive', externalFileId: { $ne: '' } }).select('+publicAccessToken').lean();
    if (!media || !media.publicAccessToken || !safeEqual(media.publicAccessToken, req.params.token)) return res.status(404).end();
    const connection = await getConnection(media.uploadedBy, { required: true });
    const token = await accessToken(connection);
    const headers = { Authorization: `Bearer ${token}` };
    if (req.headers.range) headers.Range = req.headers.range;
    const response = await fetch(`${DRIVE_FILES_URL}/${encodeURIComponent(media.externalFileId)}?alt=media`, { headers });
    if (!response.ok && response.status !== 206) return res.status(response.status === 404 ? 404 : 502).end();
    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || media.mimeType || 'application/octet-stream');
    const length = response.headers.get('content-length'); if (length) res.setHeader('Content-Length', length);
    const range = response.headers.get('content-range'); if (range) res.setHeader('Content-Range', range);
    const acceptRanges = response.headers.get('accept-ranges'); if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
    res.setHeader('Cache-Control', 'private, max-age=300');
    if (req.method === 'HEAD') return res.end();
    if (!response.body) return res.end();
    return Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    return next(error);
  }
}

async function disconnect(userId) {
  const connection = await getConnection(userId);
  if (!connection) return false;
  const token = connection.refreshTokenEncrypted ? decryptToken(connection.refreshTokenEncrypted) : connection.accessTokenEncrypted ? decryptToken(connection.accessTokenEncrypted) : '';
  if (token) {
    fetch(`${DRIVE_REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).catch(() => {});
  }
  connection.status = 'disconnected';
  connection.accessTokenEncrypted = '';
  connection.refreshTokenEncrypted = '';
  connection.tokenExpiresAt = undefined;
  connection.lastError = '';
  await connection.save();
  return true;
}

function summary(connection) {
  if (!connection) return { connected: false, provider: 'google_drive', status: 'disconnected' };
  return {
    connected: connection.status === 'connected',
    provider: connection.provider,
    status: connection.status,
    email: connection.accountEmail || '',
    name: connection.accountName || '',
    rootFolderId: connection.rootFolderId || '',
    rootFolderName: connection.rootFolderName || 'AutoBrand AI',
    rootWebViewLink: connection.metadata?.rootWebViewLink || '',
    lastSyncAt: connection.lastSyncAt || null,
    lastError: connection.lastError || ''
  };
}

module.exports = {
  accessToken,
  buildAuthUrl,
  connectUser,
  createDriveOnlyMedia,
  createPkcePair,
  createState,
  disconnect,
  ensureBrandFolder,
  ensureRootFolder,
  getConnection,
  isConfigured,
  mirrorMediaToDrive,
  streamMedia,
  summary,
  uploadBrandAsset,
  uploadBuffer
};
