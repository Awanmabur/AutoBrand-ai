const { fetchWithTimeout } = require('../utils/fetchWithTimeout');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const env = require('../config/env');
const { decryptToken, encryptToken } = require('./tokenCryptoService');
const { downloadRemoteBuffer } = require('./remoteFetch.service');

class TikTokProviderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TikTokProviderError';
  }
}

const AUTH_BASE = 'https://www.tiktok.com/v2/auth/authorize/';
const API_BASE = 'https://open.tiktokapis.com/v2';
const DEFAULT_SCOPES = ['user.info.basic', 'video.upload', 'video.publish'];

function configuredScopes() {
  return String(env.tiktokScopes || DEFAULT_SCOPES.join(','))
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function normalizedTikTokClientKey() {
  return String(env.tiktokClientKey || '').trim();
}

function normalizedTikTokClientSecret() {
  return String(env.tiktokClientSecret || '').trim();
}

function isPlaceholder(value) {
  return !value || /^(your_|paste_|changeme|todo|xxx)/i.test(String(value).trim());
}

function getTikTokSetupIssue() {
  const clientKey = normalizedTikTokClientKey();
  const clientSecret = normalizedTikTokClientSecret();
  const callbackUrl = String(env.tiktokCallbackUrl || '').trim();
  if (isPlaceholder(clientKey)) return 'TikTok Client Key is missing or still a placeholder. Use the exact Client key from TikTok Developer Portal, not the App ID or Client secret.';
  if (isPlaceholder(clientSecret)) return 'TikTok Client Secret is missing or still a placeholder. Use the Client secret from TikTok Developer Portal.';
  if (!callbackUrl) return 'TikTok callback URL is missing. Set TIKTOK_CALLBACK_URL and add the same URL in TikTok Developer Portal.';
  if (!/^https?:\/\//i.test(callbackUrl)) return 'TikTok callback URL must start with http:// or https://.';
  return '';
}

function isTikTokConfigured() {
  return !getTikTokSetupIssue();
}

function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', env.cookieSecret || env.jwtRefreshSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyState(state) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) throw new TikTokProviderError('TikTok OAuth state is missing or invalid. Start the connection again.');
  const expected = crypto.createHmac('sha256', env.cookieSecret || env.jwtRefreshSecret).update(body).digest('base64url');
  if (Buffer.byteLength(sig) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new TikTokProviderError('TikTok OAuth state is invalid. Start the connection again.');
  }
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

function createCodeVerifier() {
  return crypto.randomBytes(48).toString('base64url');
}

function createCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function buildTikTokAuthUrl({ brandId, userId }) {
  const setupIssue = getTikTokSetupIssue();
  if (setupIssue) throw new TikTokProviderError(setupIssue);
  const codeVerifier = createCodeVerifier();
  const codeChallenge = createCodeChallenge(codeVerifier);
  const state = signState({ brandId, userId, codeVerifier, nonce: crypto.randomBytes(12).toString('hex'), ts: Date.now() });
  const url = new URL(AUTH_BASE);
  url.searchParams.set('client_key', normalizedTikTokClientKey());
  url.searchParams.set('scope', configuredScopes().join(','));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', env.tiktokCallbackUrl);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

async function tikTokJson(pathname, { method = 'GET', accessToken, body } = {}) {
  const response = await fetchWithTimeout(`${API_BASE}${pathname}`, {
    method,
    headers: {
      Authorization: accessToken ? `Bearer ${accessToken}` : undefined,
      'Content-Type': 'application/json; charset=UTF-8'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error?.code && data.error.code !== 'ok') {
    throw new TikTokProviderError(data.error?.message || data.message || `TikTok API error: ${response.status}`);
  }
  return data;
}

async function exchangeCodeForTikTokAccount({ code, state }) {
  const parsedState = verifyState(state);
  const setupIssue = getTikTokSetupIssue();
  if (setupIssue) throw new TikTokProviderError(setupIssue);

  if (!parsedState.codeVerifier) {
    throw new TikTokProviderError('TikTok OAuth code verifier is missing. Start the connection again.');
  }

  const body = new URLSearchParams({
    client_key: normalizedTikTokClientKey(),
    client_secret: normalizedTikTokClientSecret(),
    code: String(code || ''),
    grant_type: 'authorization_code',
    redirect_uri: env.tiktokCallbackUrl,
    code_verifier: parsedState.codeVerifier
  });

  const response = await fetchWithTimeout(`${API_BASE}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const tokenData = await response.json().catch(() => ({}));
  if (!response.ok || tokenData.error) {
    throw new TikTokProviderError(tokenData.error_description || tokenData.message || tokenData.error || `TikTok token exchange failed: ${response.status}`);
  }

  const accessToken = tokenData.access_token;
  if (!accessToken) throw new TikTokProviderError('TikTok did not return an access token. Start the connection again.');

  let profile = {};
  try {
    const userInfo = await tikTokJson('/user/info/?fields=open_id,union_id,avatar_url,display_name', { accessToken });
    profile = userInfo.data?.user || {};
  } catch (error) {
    profile = {};
  }

  const openId = profile.open_id || tokenData.open_id || tokenData.open_id_str || `tiktok_${parsedState.brandId}`;
  return {
    brandId: parsedState.brandId,
    userId: parsedState.userId,
    accountId: openId,
    accountName: profile.display_name || `TikTok ${openId}`,
    accessTokenEncrypted: encryptToken(accessToken),
    refreshTokenEncrypted: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : undefined,
    tokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000) : undefined,
    permissions: configuredScopes(),
    status: 'connected'
  };
}

function videoMedia(post) {
  const media = Array.isArray(post.media) ? post.media : [];
  return media.find((item) => item.fileType === 'video' && item.fileUrl) || null;
}

function localVideoPathFromMedia(media) {
  if (!media?.fileUrl || /^https?:\/\//i.test(media.fileUrl)) return '';
  const publicRoot = path.resolve(__dirname, '..', '..', 'public');
  const absolute = path.resolve(publicRoot, String(media.fileUrl).replace(/^\/+/, ''));
  if (absolute !== publicRoot && !absolute.startsWith(`${publicRoot}${path.sep}`)) return '';
  return absolute;
}

async function videoUploadSource(post) {
  const media = videoMedia(post);
  if (!media) throw new TikTokProviderError('TikTok needs a video file. Generate or upload a video before publishing.');

  const localPath = localVideoPathFromMedia(media);
  if (localPath) {
    const stat = await fs.stat(localPath).catch(() => null);
    if (!stat) throw new TikTokProviderError('TikTok local video file was not found. Regenerate the video.');
    return {
      buffer: await fs.readFile(localPath),
      size: stat.size,
      mimeType: media.mimeType || 'video/mp4'
    };
  }

  if (/^https?:\/\//i.test(media.fileUrl)) {
    const downloaded = await downloadRemoteBuffer(media.fileUrl, {
      allowedMimePrefixes: ['video/'],
      maxBytes: 500 * 1024 * 1024
    });
    return {
      buffer: downloaded.buffer,
      size: downloaded.size,
      mimeType: downloaded.mimeType || media.mimeType || 'video/mp4'
    };
  }

  throw new TikTokProviderError('TikTok video path is invalid. Regenerate or upload the video again.');
}

async function queryCreatorInfo({ account }) {
  const accessToken = account.accessTokenEncrypted ? decryptToken(account.accessTokenEncrypted) : '';
  if (!accessToken) throw new TikTokProviderError('TikTok access token is missing. Reconnect TikTok.');
  const data = await tikTokJson('/post/publish/creator_info/query/', { method: 'POST', accessToken });
  return data.data || {};
}

async function publishTikTokVideo({ post, account }) {
  const accessToken = account.accessTokenEncrypted ? decryptToken(account.accessTokenEncrypted) : '';
  if (!accessToken) throw new TikTokProviderError('TikTok access token is missing. Reconnect TikTok.');

  const creator = await queryCreatorInfo({ account });
  const privacyOptions = Array.isArray(creator.privacy_level_options) ? creator.privacy_level_options : [];
  if (!privacyOptions.length) throw new TikTokProviderError('TikTok did not return allowed privacy options. Reconnect the account and confirm Content Posting API access.');
  const requestedPrivacy = String(post.platformMetadata?.tiktok?.privacyLevel || '').trim();
  const privacy = privacyOptions.includes(requestedPrivacy)
    ? requestedPrivacy
    : privacyOptions.includes('PUBLIC_TO_EVERYONE')
      ? 'PUBLIC_TO_EVERYONE'
      : privacyOptions[0];
  const title = String(post.caption || post.description || post.title || 'AutoBrand video').slice(0, 2100);
  const postInfo = {
    title,
    privacy_level: privacy,
    disable_duet: false,
    disable_comment: false,
    disable_stitch: false,
    video_cover_timestamp_ms: 1000,
    brand_content_toggle: Boolean(post.platformMetadata?.tiktok?.paidPartnership),
    brand_organic_toggle: post.platformMetadata?.tiktok?.promotesOwnBrand !== false,
    is_aigc: Boolean(post.aiProvider || post.platformMetadata?.generation?.provider || post.platformMetadata?.generation?.jobId)
  };

  // FILE_UPLOAD is the reliable default. PULL_FROM_URL requires TikTok domain
  // ownership verification and otherwise fails even when the URL is public.
  const source = await videoUploadSource(post);
  const chunkSize = source.size;
  const init = await tikTokJson('/post/publish/video/init/', {
    method: 'POST',
    accessToken,
    body: {
      post_info: postInfo,
      source_info: { source: 'FILE_UPLOAD', video_size: source.size, chunk_size: chunkSize, total_chunk_count: 1 }
    }
  });
  const uploadUrl = init.data?.upload_url;
  if (!uploadUrl) throw new TikTokProviderError('TikTok did not return a video upload URL.');
  const uploadResponse = await fetchWithTimeout(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': source.mimeType,
      'Content-Length': String(source.size),
      'Content-Range': `bytes 0-${source.size - 1}/${source.size}`
    },
    body: source.buffer
  });
  if (!uploadResponse.ok) {
    const text = await uploadResponse.text().catch(() => '');
    throw new TikTokProviderError(`TikTok video upload failed: ${uploadResponse.status} ${text}`);
  }
  return { id: init.data?.publish_id || `tiktok_${post._id}`, raw: init };
}

module.exports = { getTikTokSetupIssue,
  TikTokProviderError,
  buildTikTokAuthUrl,
  exchangeCodeForTikTokAccount,
  isTikTokConfigured,
  createCodeChallenge,
  createCodeVerifier,
  publishTikTokVideo,
  queryCreatorInfo
};
