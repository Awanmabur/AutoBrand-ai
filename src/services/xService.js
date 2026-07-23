const { fetchWithTimeout } = require('../utils/fetchWithTimeout');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const env = require('../config/env');
const { decryptToken, encryptToken } = require('./tokenCryptoService');
const { downloadRemoteBuffer } = require('./remoteFetch.service');

class XProviderError extends Error {
  constructor(message, response) {
    super(message);
    this.name = 'XProviderError';
    this.response = response;
  }
}

const AUTH_BASE = 'https://x.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const API_BASE = 'https://api.x.com/2';
const DEFAULT_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access', 'media.write'];

function configuredScopes() {
  const scopes = String(env.xScopes || DEFAULT_SCOPES.join(' '))
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  // Keep older deployments functional after media publishing was added.
  for (const required of DEFAULT_SCOPES) {
    if (!scopes.includes(required)) scopes.push(required);
  }
  return scopes;
}

function isPlaceholder(value) {
  return !value || /^(your_|paste_|changeme|todo|xxx)/i.test(String(value).trim());
}

function getXSetupIssue() {
  if (isPlaceholder(env.xClientId)) return 'X / Twitter Client ID is missing or still a placeholder. Add X_CLIENT_ID from the X Developer Portal.';
  if (!env.xCallbackUrl) return 'X / Twitter callback URL is missing. Set X_CALLBACK_URL.';
  if (!/^https?:\/\//i.test(env.xCallbackUrl)) return 'X / Twitter callback URL must start with http:// or https://.';
  return '';
}

function isXConfigured() {
  return !getXSetupIssue();
}

function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', env.cookieSecret || env.jwtRefreshSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyState(state) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) throw new XProviderError('X / Twitter OAuth state is missing or invalid. Start the connection again.');
  const expected = crypto.createHmac('sha256', env.cookieSecret || env.jwtRefreshSecret).update(body).digest('base64url');
  if (Buffer.byteLength(sig) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new XProviderError('X / Twitter OAuth state is invalid. Start the connection again.');
  }
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

function createCodeVerifier() {
  return crypto.randomBytes(48).toString('base64url');
}

function createCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function buildXAuthUrl({ brandId, userId }) {
  const setupIssue = getXSetupIssue();
  if (setupIssue) throw new XProviderError(setupIssue);

  const codeVerifier = createCodeVerifier();
  const state = signState({ brandId, userId, codeVerifier, nonce: crypto.randomBytes(12).toString('hex'), ts: Date.now() });
  const url = new URL(AUTH_BASE);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', env.xClientId);
  url.searchParams.set('redirect_uri', env.xCallbackUrl);
  url.searchParams.set('scope', configuredScopes().join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', createCodeChallenge(codeVerifier));
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

function tokenHeaders() {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (env.xClientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${env.xClientId}:${env.xClientSecret}`).toString('base64')}`;
  }
  return headers;
}

async function parseXResponse(response, fallback) {
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (error) {}
  if (!response.ok || data.error) {
    const detail = Array.isArray(data.errors) ? data.errors.map((item) => item.detail || item.message || item.title).filter(Boolean).join('; ') : '';
    const message = detail || data.detail || data.title || data.error_description || data.error?.message || data.error || fallback || `X / Twitter API error: ${response.status}`;
    throw new XProviderError(message, data);
  }
  return data;
}

async function exchangeToken(body) {
  if (!env.xClientSecret && env.xClientId && !body.has('client_id')) body.set('client_id', env.xClientId);
  const response = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: tokenHeaders(),
    body
  });
  return parseXResponse(response, `X / Twitter token request failed: ${response.status}`);
}

function tokenExpiry(tokenData) {
  return tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000) : undefined;
}

async function refreshAccessToken(account) {
  const refreshToken = account.refreshTokenEncrypted ? decryptToken(account.refreshTokenEncrypted) : '';
  if (!refreshToken) throw new XProviderError('X / Twitter refresh token is missing. Reconnect the account.');

  const tokenData = await exchangeToken(new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  }));
  if (!tokenData.access_token) throw new XProviderError('X / Twitter did not return a refreshed access token. Reconnect the account.');

  account.accessTokenEncrypted = encryptToken(tokenData.access_token);
  if (tokenData.refresh_token) account.refreshTokenEncrypted = encryptToken(tokenData.refresh_token);
  account.tokenExpiresAt = tokenExpiry(tokenData) || account.tokenExpiresAt;
  account.status = 'connected';
  account.lastSyncAt = new Date();
  if (typeof account.save === 'function') await account.save();
  return tokenData.access_token;
}

async function accessTokenFor(account) {
  const token = account.accessTokenEncrypted ? decryptToken(account.accessTokenEncrypted) : '';
  if (!token) return refreshAccessToken(account);
  if (account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() < Date.now() + 60_000) {
    return refreshAccessToken(account);
  }
  return token;
}

async function xJson(pathname, { accessToken, method = 'GET', body } = {}) {
  const url = /^https?:\/\//i.test(pathname) ? pathname : `${API_BASE}${pathname}`;
  const response = await fetchWithTimeout(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return parseXResponse(response, `X / Twitter API error: ${response.status}`);
}


function mediaForPost(post = {}) {
  return (post.media || []).filter((media) => media && ['image', 'video'].includes(String(media.fileType || '').toLowerCase()));
}

function localMediaPath(media = {}) {
  const value = String(media.fileUrl || '').split('?')[0];
  if (!value || /^https?:\/\//i.test(value)) return '';
  const relative = value.replace(/^public[\\/]/, '').replace(/^[/\\]+/, '');
  const publicRoot = path.resolve(__dirname, '..', '..', 'public');
  const absolute = path.resolve(publicRoot, relative);
  if (!absolute.startsWith(`${publicRoot}${path.sep}`)) return '';
  return absolute;
}

async function mediaBinary(media, downloadRemote = downloadRemoteBuffer) {
  if (/^https?:\/\//i.test(String(media.fileUrl || ''))) {
    return downloadRemote(media.fileUrl, {
      allowedMimePrefixes: ['image/', 'video/'],
      maxBytes: 512 * 1024 * 1024
    });
  }
  const filePath = localMediaPath(media);
  if (!filePath) throw new XProviderError('X media file path is invalid. Upload the asset again.');
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat) throw new XProviderError('X media file was not found. Upload or regenerate the asset.');
  return {
    buffer: await fs.readFile(filePath),
    size: stat.size,
    mimeType: media.mimeType || (String(media.fileType) === 'video' ? 'video/mp4' : 'image/jpeg')
  };
}

async function xForm(pathname, { accessToken, method = 'POST', form } = {}) {
  const url = /^https?:\/\//i.test(pathname) ? pathname : `${API_BASE}${pathname}`;
  const response = await fetchWithTimeout(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form
  });
  return parseXResponse(response, `X / Twitter media API error: ${response.status}`);
}

async function uploadSimpleMedia({ accessToken, media, downloadRemote = downloadRemoteBuffer }) {
  const binary = await mediaBinary(media, downloadRemote);
  const mimeType = String(binary.mimeType || media.mimeType || 'image/jpeg').toLowerCase();
  const mediaCategory = mimeType === 'image/gif' ? 'tweet_gif' : 'tweet_image';
  const data = await xJson('/media/upload', {
    accessToken,
    method: 'POST',
    body: {
      media: binary.buffer.toString('base64'),
      media_category: mediaCategory,
      media_type: mimeType,
      shared: false
    }
  });
  const mediaId = data.data?.id || data.data?.media_id_string || data.media_id_string;
  if (!mediaId) throw new XProviderError('X did not return a media ID after image upload.', data);
  return String(mediaId);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(milliseconds || 0))));
}

async function waitForMediaProcessing({ accessToken, mediaId, processingInfo }) {
  let info = processingInfo || {};
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = String(info.state || '').toLowerCase();
    if (!state || state === 'succeeded') return;
    if (state === 'failed') {
      const message = info.error?.message || info.error?.name || 'X video processing failed.';
      throw new XProviderError(message, info);
    }
    await sleep(Math.min(15, Math.max(1, Number(info.check_after_secs || 2))) * 1000);
    const status = await xJson(`/media/upload?command=STATUS&media_id=${encodeURIComponent(mediaId)}`, { accessToken });
    info = status.data?.processing_info || {};
  }
  throw new XProviderError('X video processing did not finish before the publishing timeout.');
}

async function uploadChunkedVideo({ accessToken, media, downloadRemote = downloadRemoteBuffer }) {
  const binary = await mediaBinary(media, downloadRemote);
  const mimeType = String(binary.mimeType || media.mimeType || 'video/mp4').toLowerCase();
  if (!mimeType.startsWith('video/')) throw new XProviderError('X video upload received a non-video asset.');

  const initialized = await xJson('/media/upload/initialize', {
    accessToken,
    method: 'POST',
    body: {
      media_type: mimeType,
      total_bytes: Number(binary.size || binary.buffer.length),
      media_category: 'tweet_video',
      shared: false
    }
  });
  const mediaId = initialized.data?.id || initialized.data?.media_id_string || initialized.media_id_string;
  if (!mediaId) throw new XProviderError('X did not return a media ID for the video upload.', initialized);

  const chunkBytes = 4 * 1024 * 1024;
  for (let offset = 0, segmentIndex = 0; offset < binary.buffer.length; offset += chunkBytes, segmentIndex += 1) {
    const chunk = binary.buffer.subarray(offset, Math.min(offset + chunkBytes, binary.buffer.length));
    const appendForm = new FormData();
    appendForm.set('segment_index', String(segmentIndex));
    appendForm.set('media', new Blob([chunk], { type: mimeType }), media.fileName || `video-${segmentIndex}.mp4`);
    await xForm(`/media/upload/${encodeURIComponent(mediaId)}/append`, { accessToken, form: appendForm });
  }

  const finalized = await xJson(`/media/upload/${encodeURIComponent(mediaId)}/finalize`, {
    accessToken,
    method: 'POST'
  });
  await waitForMediaProcessing({
    accessToken,
    mediaId: String(mediaId),
    processingInfo: finalized.data?.processing_info
  });
  return String(mediaId);
}

async function uploadPostMedia({ post, accessToken, downloadRemote = downloadRemoteBuffer }) {
  const media = mediaForPost(post);
  const videos = media.filter((item) => String(item.fileType).toLowerCase() === 'video');
  if (videos.length) return [await uploadChunkedVideo({ accessToken, media: videos[0], downloadRemote })];
  const images = media.filter((item) => String(item.fileType).toLowerCase() === 'image').slice(0, 4);
  const mediaIds = [];
  for (const image of images) mediaIds.push(await uploadSimpleMedia({ accessToken, media: image, downloadRemote }));
  return mediaIds;
}

async function exchangeCodeForXAccount({ code, state }) {
  const parsedState = verifyState(state);
  const setupIssue = getXSetupIssue();
  if (setupIssue) throw new XProviderError(setupIssue);
  if (!parsedState.codeVerifier) throw new XProviderError('X / Twitter OAuth code verifier is missing. Start the connection again.');

  const tokenData = await exchangeToken(new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(code || ''),
    redirect_uri: env.xCallbackUrl,
    code_verifier: parsedState.codeVerifier
  }));
  if (!tokenData.access_token) throw new XProviderError('X / Twitter did not return an access token. Start the connection again.');

  const profile = await xJson('/users/me?user.fields=profile_image_url,username,name', { accessToken: tokenData.access_token });
  const user = profile.data || {};
  const userId = user.id || tokenData.user_id;
  if (!userId) throw new XProviderError('X / Twitter did not return a user ID. Start the connection again.');

  return {
    brandId: parsedState.brandId,
    userId: parsedState.userId,
    platform: 'x',
    accountId: userId,
    accountName: user.username ? `@${user.username}` : (user.name || `X ${userId}`),
    accessTokenEncrypted: encryptToken(tokenData.access_token),
    refreshTokenEncrypted: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : undefined,
    tokenExpiresAt: tokenExpiry(tokenData),
    providerMeta: { username: user.username, name: user.name, profileImageUrl: user.profile_image_url },
    permissions: configuredScopes(),
    status: 'connected'
  };
}

function postText(post) {
  const base = String(post.caption || post.description || post.title || 'AutoBrand update').trim();
  const hashtags = Array.isArray(post.hashtags) ? post.hashtags.join(' ') : String(post.hashtags || '');
  const link = String(post.link || post.brand?.website || '').trim();
  const combined = [base, hashtags.trim(), link].filter(Boolean).join(' ');
  return combined.slice(0, 280) || 'AutoBrand update';
}

async function publishXPost({ post, account, downloadRemote = downloadRemoteBuffer }) {
  const accessToken = await accessTokenFor(account);
  if (!accessToken) throw new XProviderError('X / Twitter access token is missing. Reconnect the account.');

  const attachedMedia = mediaForPost(post);
  if (attachedMedia.length && Array.isArray(account.permissions) && account.permissions.length && !account.permissions.includes('media.write')) {
    throw new XProviderError('Reconnect the X account to grant the media.write permission required for image and video posts.');
  }
  const mediaIds = await uploadPostMedia({ post, accessToken, downloadRemote });
  const body = { text: postText(post) };
  if (mediaIds.length) body.media = { media_ids: mediaIds };

  const data = await xJson('/tweets', {
    accessToken,
    method: 'POST',
    body
  });
  const id = data.data?.id || `x_${post._id}`;
  return { id, platformPostUrl: data.data?.id ? `https://x.com/i/web/status/${data.data.id}` : '' };
}

async function syncXAccount({ account }) {
  const accessToken = await accessTokenFor(account);
  const profile = await xJson('/users/me?user.fields=profile_image_url,username,name', { accessToken });
  const user = profile.data || {};
  return {
    accountId: user.id || account.accountId,
    accountName: user.username ? `@${user.username}` : (user.name || account.accountName),
    providerMeta: {
      ...(account.providerMeta || {}),
      username: user.username,
      name: user.name,
      profileImageUrl: user.profile_image_url
    }
  };
}

module.exports = {
  buildXAuthUrl,
  createCodeChallenge,
  exchangeCodeForXAccount,
  getXSetupIssue,
  isXConfigured,
  publishXPost,
  syncXAccount,
  XProviderError,
  __private: { signState, verifyState, postText, localMediaPath, mediaBinary, uploadPostMedia }
};
