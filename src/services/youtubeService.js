const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const env = require('../config/env');
const { decryptToken, encryptToken } = require('./tokenCryptoService');

class YouTubeProviderError extends Error {
  constructor(message, response) {
    super(message);
    this.name = 'YouTubeProviderError';
    this.response = response;
  }
}

const AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://www.googleapis.com/youtube/v3';
const UPLOAD_API_BASE = 'https://www.googleapis.com/upload/youtube/v3';
const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly'
];

function configuredScopes() {
  return String(env.youtubeScopes || DEFAULT_SCOPES.join(' '))
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function isPlaceholder(value) {
  return !value || /^(your_|paste_|changeme|todo|xxx)/i.test(String(value).trim());
}

function getYouTubeSetupIssue() {
  if (isPlaceholder(env.youtubeClientId)) return 'YouTube Client ID is missing or still a placeholder. Use the OAuth 2.0 Web Client ID from Google Cloud Console.';
  if (isPlaceholder(env.youtubeClientSecret)) return 'YouTube Client Secret is missing or still a placeholder. Use the OAuth 2.0 Web Client secret from Google Cloud Console.';
  if (!env.youtubeCallbackUrl) return 'YouTube callback URL is missing. Set YOUTUBE_CALLBACK_URL.';
  if (!/^https?:\/\//i.test(env.youtubeCallbackUrl)) return 'YouTube callback URL must start with http:// or https://.';
  return '';
}

function isYouTubeConfigured() {
  return !getYouTubeSetupIssue();
}

function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', env.cookieSecret || env.jwtRefreshSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyState(state) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) throw new YouTubeProviderError('YouTube OAuth state is missing or invalid. Start the connection again.');
  const expected = crypto.createHmac('sha256', env.cookieSecret || env.jwtRefreshSecret).update(body).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new YouTubeProviderError('YouTube OAuth state is invalid. Start the connection again.');
  }
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

function buildYouTubeAuthUrl({ brandId, userId }) {
  const setupIssue = getYouTubeSetupIssue();
  if (setupIssue) throw new YouTubeProviderError(setupIssue);
  const state = signState({ brandId, userId, nonce: crypto.randomBytes(12).toString('hex'), ts: Date.now() });
  const url = new URL(AUTH_BASE);
  url.searchParams.set('client_id', env.youtubeClientId);
  url.searchParams.set('redirect_uri', env.youtubeCallbackUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', configuredScopes().join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  return url.toString();
}

async function exchangeToken(body) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new YouTubeProviderError(data.error_description || data.error || `YouTube token request failed: ${response.status}`);
  }
  return data;
}

async function refreshAccessToken(account) {
  const refreshToken = account.refreshTokenEncrypted ? decryptToken(account.refreshTokenEncrypted) : '';
  if (!refreshToken) throw new YouTubeProviderError('YouTube refresh token is missing. Reconnect YouTube.');
  const tokenData = await exchangeToken(new URLSearchParams({
    client_id: env.youtubeClientId,
    client_secret: env.youtubeClientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  }));
  account.accessTokenEncrypted = encryptToken(tokenData.access_token);
  account.tokenExpiresAt = tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000) : account.tokenExpiresAt;
  account.status = 'connected';
  account.lastSyncAt = new Date();
  await account.save();
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

async function youtubeJson(pathname, { accessToken, method = 'GET', body } = {}) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new YouTubeProviderError(youtubeErrorMessage(data, `YouTube API error: ${response.status}`), data);
  }
  return data;
}

function cleanText(value, maxLength, fallback = '') {
  const cleaned = String(value || fallback)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, maxLength);
}

function youtubePrivacyStatus() {
  const privacy = String(env.youtubeDefaultPrivacy || 'public').toLowerCase().trim();
  return ['private', 'unlisted', 'public'].includes(privacy) ? privacy : 'public';
}

function youtubeErrorMessage(data, fallback) {
  const base = data?.error?.message || data?.message || fallback;
  const details = Array.isArray(data?.error?.errors)
    ? data.error.errors
      .map((item) => [item.reason, item.message].filter(Boolean).join(': '))
      .filter(Boolean)
      .join(' | ')
    : '';
  return details && !String(base || '').includes(details) ? `${base} (${details})` : base;
}

function youtubeUploadMetadata(post) {
  return {
    snippet: {
      title: cleanText(post.title || post.caption, 100, 'AutoBrand Short'),
      description: cleanText(post.caption || post.description, 5000, '')
        || cleanText(post.title, 5000, 'AutoBrand video'),
      categoryId: '22'
    },
    status: {
      privacyStatus: youtubePrivacyStatus()
    }
  };
}

async function getMyChannel(accessToken) {
  const data = await youtubeJson('/channels?part=snippet&mine=true', { accessToken });
  const channel = data.items?.[0];
  if (!channel) throw new YouTubeProviderError('No YouTube channel was found for this Google account.');
  return {
    accountId: channel.id,
    accountName: channel.snippet?.title || `YouTube ${channel.id}`
  };
}

async function exchangeCodeForYouTubeAccount({ code, state }) {
  const parsedState = verifyState(state);
  const setupIssue = getYouTubeSetupIssue();
  if (setupIssue) throw new YouTubeProviderError(setupIssue);
  const tokenData = await exchangeToken(new URLSearchParams({
    client_id: env.youtubeClientId,
    client_secret: env.youtubeClientSecret,
    code: String(code || ''),
    grant_type: 'authorization_code',
    redirect_uri: env.youtubeCallbackUrl
  }));
  const accessToken = tokenData.access_token;
  if (!accessToken) throw new YouTubeProviderError('YouTube did not return an access token. Start the connection again.');
  const channel = await getMyChannel(accessToken);
  return {
    brandId: parsedState.brandId,
    userId: parsedState.userId,
    accountId: channel.accountId,
    accountName: channel.accountName,
    accessTokenEncrypted: encryptToken(accessToken),
    refreshTokenEncrypted: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : undefined,
    tokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000) : undefined,
    permissions: configuredScopes(),
    status: 'connected'
  };
}

function videoMedia(post) {
  const media = Array.isArray(post.media) ? post.media : [];
  return media.find((item) => item.fileType === 'video' && item.fileUrl);
}

function localVideoPath(media) {
  if (!media?.fileUrl || /^https?:\/\//i.test(media.fileUrl)) return '';
  const publicRoot = path.join(__dirname, '..', '..', 'public');
  const absolute = path.normalize(path.join(publicRoot, String(media.fileUrl).replace(/^\/+/, '')));
  if (!absolute.startsWith(publicRoot)) return '';
  return absolute;
}

async function fetchRemoteVideo(media) {
  const response = await fetch(media.fileUrl);
  if (!response.ok) {
    throw new YouTubeProviderError(`Could not download video URL for YouTube upload: ${response.status} ${response.statusText}`);
  }
  const contentType = response.headers.get('content-type') || media.mimeType || 'video/mp4';
  if (!String(contentType).toLowerCase().startsWith('video/')) {
    throw new YouTubeProviderError(`YouTube expected a video URL, but received ${contentType}.`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    buffer,
    size: buffer.length,
    mimeType: contentType.split(';')[0] || 'video/mp4'
  };
}

async function videoUploadSource(post) {
  const video = videoMedia(post);
  if (!video) return '';
  if (/^https?:\/\//i.test(video.fileUrl)) return fetchRemoteVideo(video);

  const filePath = localVideoPath(video);
  if (!filePath) return '';
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat) throw new YouTubeProviderError('YouTube local video file was not found. Regenerate the video.');
  return {
    buffer: await fs.readFile(filePath),
    size: stat.size,
    mimeType: video.mimeType || 'video/mp4'
  };
}

async function publishYouTubeVideo({ post, account }) {
  if (String(post.type || '').toLowerCase() !== 'video') {
    throw new YouTubeProviderError('YouTube only supports video posts. Generate or upload a video first.');
  }
  const uploadSource = await videoUploadSource(post);
  if (!uploadSource) throw new YouTubeProviderError('YouTube needs an MP4 video file. Generate/upload a video before publishing.');
  const accessToken = await accessTokenFor(account);

  const metadata = youtubeUploadMetadata(post);

  const init = await fetch(`${UPLOAD_API_BASE}/videos?part=snippet,status&uploadType=resumable`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': uploadSource.mimeType,
      'X-Upload-Content-Length': String(uploadSource.size)
    },
    body: JSON.stringify(metadata)
  });
  if (!init.ok) {
    const data = await init.json().catch(() => ({}));
    throw new YouTubeProviderError(youtubeErrorMessage(data, `YouTube upload session failed: ${init.status}`), data);
  }
  const uploadUrl = init.headers.get('location');
  if (!uploadUrl) throw new YouTubeProviderError('YouTube did not return an upload URL.');

  const upload = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': uploadSource.mimeType,
      'Content-Length': String(uploadSource.size)
    },
    body: uploadSource.buffer
  });
  const result = await upload.json().catch(() => ({}));
  if (!upload.ok || result.error) {
    throw new YouTubeProviderError(youtubeErrorMessage(result, `YouTube video upload failed: ${upload.status}`), result);
  }
  return { id: result.id || `youtube_${post._id}`, raw: result };
}

async function syncYouTubeChannel({ account }) {
  const accessToken = await accessTokenFor(account);
  return getMyChannel(accessToken);
}

module.exports = {
  YouTubeProviderError,
  buildYouTubeAuthUrl,
  exchangeCodeForYouTubeAccount,
  getYouTubeSetupIssue,
  isYouTubeConfigured,
  publishYouTubeVideo,
  syncYouTubeChannel
};
