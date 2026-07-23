const { fetchWithTimeout } = require('../utils/fetchWithTimeout');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { downloadRemoteBuffer } = require('./remoteFetch.service');
const env = require('../config/env');
const { decryptToken, encryptToken } = require('./tokenCryptoService');

class LinkedInProviderError extends Error {
  constructor(message, response) {
    super(message);
    this.name = 'LinkedInProviderError';
    this.response = response;
  }
}

const AUTH_BASE = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const API_BASE = 'https://api.linkedin.com';
const REST_BASE = `${API_BASE}/rest`;
const USERINFO_URL = `${API_BASE}/v2/userinfo`;
const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'w_member_social'];
const DEFAULT_VERSION = '202607';

function configuredScopes() {
  return String(env.linkedinScopes || DEFAULT_SCOPES.join(' '))
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function linkedinVersion() {
  const version = String(env.linkedinVersion || DEFAULT_VERSION).trim();
  return /^\d{6}$/.test(version) ? version : DEFAULT_VERSION;
}

function isPlaceholder(value) {
  return !value || /^(your_|paste_|changeme|todo|xxx)/i.test(String(value).trim());
}

function getLinkedInSetupIssue() {
  if (isPlaceholder(env.linkedinClientId)) return 'LinkedIn Client ID is missing or still a placeholder. Add LINKEDIN_CLIENT_ID from LinkedIn Developer Portal.';
  if (isPlaceholder(env.linkedinClientSecret)) return 'LinkedIn Client Secret is missing or still a placeholder. Add LINKEDIN_CLIENT_SECRET from LinkedIn Developer Portal.';
  if (!env.linkedinCallbackUrl) return 'LinkedIn callback URL is missing. Set LINKEDIN_CALLBACK_URL.';
  if (!/^https?:\/\//i.test(env.linkedinCallbackUrl)) return 'LinkedIn callback URL must start with http:// or https://.';
  return '';
}

function isLinkedInConfigured() {
  return !getLinkedInSetupIssue();
}

function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', env.cookieSecret || env.jwtRefreshSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyState(state) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) throw new LinkedInProviderError('LinkedIn OAuth state is missing or invalid. Start the connection again.');
  const expected = crypto.createHmac('sha256', env.cookieSecret || env.jwtRefreshSecret).update(body).digest('base64url');
  if (Buffer.byteLength(sig) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new LinkedInProviderError('LinkedIn OAuth state is invalid. Start the connection again.');
  }
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

function buildLinkedInAuthUrl({ brandId, userId }) {
  const setupIssue = getLinkedInSetupIssue();
  if (setupIssue) throw new LinkedInProviderError(setupIssue);
  const state = signState({ brandId, userId, nonce: crypto.randomBytes(12).toString('hex'), ts: Date.now() });
  const url = new URL(AUTH_BASE);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', env.linkedinClientId);
  url.searchParams.set('redirect_uri', env.linkedinCallbackUrl);
  url.searchParams.set('scope', configuredScopes().join(' '));
  url.searchParams.set('state', state);
  return url.toString();
}

async function parseLinkedInResponse(response, fallback) {
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (error) {}
  if (!response.ok || data.error) {
    const message = data.message || data.error_description || data.error || fallback || `LinkedIn API error: ${response.status}`;
    throw new LinkedInProviderError(message, data);
  }
  return data;
}

async function exchangeToken(body) {
  const response = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  return parseLinkedInResponse(response, `LinkedIn token request failed: ${response.status}`);
}

async function refreshAccessToken(account) {
  const refreshToken = account.refreshTokenEncrypted ? decryptToken(account.refreshTokenEncrypted) : '';
  if (!refreshToken) throw new LinkedInProviderError('LinkedIn refresh token is missing. Reconnect LinkedIn.');
  const tokenData = await exchangeToken(new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: env.linkedinClientId,
    client_secret: env.linkedinClientSecret
  }));
  account.accessTokenEncrypted = encryptToken(tokenData.access_token);
  if (tokenData.refresh_token) account.refreshTokenEncrypted = encryptToken(tokenData.refresh_token);
  account.tokenExpiresAt = tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000) : account.tokenExpiresAt;
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

function restHeaders(accessToken, extra = {}) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Linkedin-Version': linkedinVersion(),
    'X-Restli-Protocol-Version': '2.0.0',
    ...extra
  };
}

async function linkedinRest(pathname, { accessToken, method = 'GET', body, headers = {} } = {}) {
  const url = /^https?:\/\//i.test(pathname) ? pathname : `${REST_BASE}${pathname}`;
  const response = await fetchWithTimeout(url, {
    method,
    headers: restHeaders(accessToken, {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    }),
    body: body ? JSON.stringify(body) : undefined
  });
  return parseLinkedInResponse(response, `LinkedIn API error: ${response.status}`);
}

function decodeJwtPayload(token) {
  const payload = String(token || '').split('.')[1];
  if (!payload) return {};
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (error) {
    return {};
  }
}

async function getLinkedInProfile(accessToken, tokenData = {}) {
  const response = await fetchWithTimeout(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (response.ok) return response.json().catch(() => ({}));
  return decodeJwtPayload(tokenData.id_token);
}

function tokenExpiry(tokenData) {
  return tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000) : undefined;
}

function cleanText(value, maxLength, fallback = '') {
  const cleaned = String(value || fallback)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, maxLength);
}

function postCommentary(post) {
  const base = cleanText(post.caption || post.description || post.title, 2800, 'AutoBrand update');
  const hashtags = Array.isArray(post.hashtags) ? post.hashtags.join(' ') : String(post.hashtags || '');
  const combined = [base, hashtags.trim()].filter(Boolean).join(' ');
  return cleanText(combined, 3000, 'AutoBrand update');
}

function hasOrganizationScope() {
  const scopes = configuredScopes();
  return scopes.some((scope) => ['w_organization_social', 'r_organization_social', 'rw_organization_admin'].includes(scope));
}

function idFromUrn(urn) {
  return String(urn || '').split(':').pop();
}

function memberAccountFromProfile({ profile, tokenData, parsedState }) {
  const sub = profile.sub || profile.id || tokenData.member_id || tokenData.user_id;
  if (!sub) return null;
  return {
    brandId: parsedState.brandId,
    userId: parsedState.userId,
    accountId: `urn:li:person:${sub}`,
    accountName: profile.name || [profile.given_name, profile.family_name].filter(Boolean).join(' ') || `LinkedIn ${sub}`,
    accessTokenEncrypted: encryptToken(tokenData.access_token),
    refreshTokenEncrypted: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : undefined,
    tokenExpiresAt: tokenExpiry(tokenData),
    permissions: configuredScopes(),
    status: 'connected'
  };
}

async function organizationAccountsFromToken({ accessToken, tokenData, parsedState }) {
  if (!hasOrganizationScope()) return [];
  const data = await linkedinRest('/organizationAcls?q=roleAssignee&state=APPROVED&count=100', { accessToken })
    .catch(() => ({ elements: [] }));
  const seen = new Set();
  return (data.elements || [])
    .map((item) => item.organization || item.organizationTarget)
    .filter(Boolean)
    .filter((urn) => {
      if (seen.has(urn)) return false;
      seen.add(urn);
      return true;
    })
    .map((urn) => ({
      brandId: parsedState.brandId,
      userId: parsedState.userId,
      accountId: urn,
      accountName: `LinkedIn Organization ${idFromUrn(urn)}`,
      accessTokenEncrypted: encryptToken(tokenData.access_token),
      refreshTokenEncrypted: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : undefined,
      tokenExpiresAt: tokenExpiry(tokenData),
      permissions: configuredScopes(),
      status: 'connected'
    }));
}

async function exchangeCodeForLinkedInAccounts({ code, state }) {
  const parsedState = verifyState(state);
  const setupIssue = getLinkedInSetupIssue();
  if (setupIssue) throw new LinkedInProviderError(setupIssue);

  const tokenData = await exchangeToken(new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(code || ''),
    redirect_uri: env.linkedinCallbackUrl,
    client_id: env.linkedinClientId,
    client_secret: env.linkedinClientSecret
  }));
  if (!tokenData.access_token) throw new LinkedInProviderError('LinkedIn did not return an access token. Start the connection again.');

  const profile = await getLinkedInProfile(tokenData.access_token, tokenData);
  const memberAccount = memberAccountFromProfile({ profile, tokenData, parsedState });
  const organizationAccounts = await organizationAccountsFromToken({ accessToken: tokenData.access_token, tokenData, parsedState });
  const accounts = [...organizationAccounts, memberAccount].filter(Boolean);
  if (!accounts.length) throw new LinkedInProviderError('LinkedIn did not return a profile or organization account.');
  return accounts;
}

function linkedinAuthorUrn(account) {
  const value = String(account.accountId || '').trim();
  if (!value) throw new LinkedInProviderError('LinkedIn account ID is missing.');
  if (/^urn:li:(person|organization):/i.test(value)) return value;
  const permissions = account.permissions || [];
  const memberOnly = permissions.includes('w_member_social') && !permissions.some((permission) => String(permission).includes('organization'));
  return memberOnly ? `urn:li:person:${value}` : `urn:li:organization:${value.replace(/^urn:li:organization:/, '')}`;
}

function mediaForType(post, type) {
  const media = Array.isArray(post.media) ? post.media : [];
  return media.filter((item) => item.fileType === type && item.fileUrl);
}

function localMediaPath(media) {
  if (!media?.fileUrl || /^https?:\/\//i.test(media.fileUrl)) return '';
  const publicRoot = path.resolve(__dirname, '..', '..', 'public');
  const absolute = path.resolve(publicRoot, String(media.fileUrl).replace(/^\/+/, ''));
  if (absolute !== publicRoot && !absolute.startsWith(`${publicRoot}${path.sep}`)) return '';
  return absolute;
}

async function mediaBinary(media, expectedType, downloadRemote = downloadRemoteBuffer) {
  if (!media?.fileUrl) throw new LinkedInProviderError(`LinkedIn needs a ${expectedType} media file before publishing.`);
  if (/^https?:\/\//i.test(media.fileUrl)) {
    const downloaded = await downloadRemote(media.fileUrl, {
      allowedMimePrefixes: [`${expectedType}/`],
      maxBytes: expectedType === 'image' ? 30 * 1024 * 1024 : 200 * 1024 * 1024
    });
    return { buffer: downloaded.buffer, size: downloaded.size, mimeType: downloaded.mimeType };
  }

  const filePath = localMediaPath(media);
  if (!filePath) throw new LinkedInProviderError(`LinkedIn local ${expectedType} file path is invalid.`);
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat) throw new LinkedInProviderError(`LinkedIn local ${expectedType} file was not found.`);
  return {
    buffer: await fs.readFile(filePath),
    size: stat.size,
    mimeType: media.mimeType || (expectedType === 'image' ? 'image/png' : 'video/mp4')
  };
}

async function putLinkedInUpload({ uploadUrl, accessToken, buffer, mimeType }) {
  const response = await fetchWithTimeout(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': mimeType,
      'Content-Length': String(buffer.length)
    },
    body: buffer
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new LinkedInProviderError(`LinkedIn media upload failed: ${response.status} ${text}`);
  }
  return response;
}

async function uploadLinkedInImage({ accessToken, owner, media, downloadRemote = downloadRemoteBuffer }) {
  const source = await mediaBinary(media, 'image', downloadRemote);
  const init = await linkedinRest('/images?action=initializeUpload', {
    method: 'POST',
    accessToken,
    body: { initializeUploadRequest: { owner } }
  });
  const uploadUrl = init.value?.uploadUrl;
  const image = init.value?.image;
  if (!uploadUrl || !image) throw new LinkedInProviderError('LinkedIn did not return an image upload URL.');
  await putLinkedInUpload({ uploadUrl, accessToken, buffer: source.buffer, mimeType: source.mimeType });
  return image;
}

async function uploadLinkedInVideo({ accessToken, owner, media, downloadRemote = downloadRemoteBuffer }) {
  const source = await mediaBinary(media, 'video', downloadRemote);
  const init = await linkedinRest('/videos?action=initializeUpload', {
    method: 'POST',
    accessToken,
    body: { initializeUploadRequest: { owner, fileSizeBytes: source.size } }
  });
  const value = init.value || {};
  const video = value.video;
  const uploadToken = value.uploadToken;
  const instructions = value.uploadInstructions || [];
  if (!video || !instructions.length) throw new LinkedInProviderError('LinkedIn did not return video upload instructions.');

  const uploadedPartIds = [];
  for (const instruction of instructions) {
    const firstByte = Number(instruction.firstByte || 0);
    const lastByte = Number(instruction.lastByte ?? source.buffer.length - 1);
    const chunk = source.buffer.subarray(firstByte, lastByte + 1);
    const response = await putLinkedInUpload({
      uploadUrl: instruction.uploadUrl,
      accessToken,
      buffer: chunk,
      mimeType: 'application/octet-stream'
    });
    const etag = response.headers.get('etag') || response.headers.get('ETag');
    if (etag) uploadedPartIds.push(etag.replace(/^"|"$/g, ''));
  }

  await linkedinRest('/videos?action=finalizeUpload', {
    method: 'POST',
    accessToken,
    body: { finalizeUploadRequest: { video, uploadToken, uploadedPartIds } }
  });
  return video;
}

function mediaTitle(post) {
  return cleanText(post.title || post.caption, 200, 'AutoBrand media');
}

async function linkedInContent({ post, accessToken, owner, downloadRemote = downloadRemoteBuffer }) {
  const videos = mediaForType(post, 'video');
  if (String(post.type || '').toLowerCase() === 'video' && videos.length) {
    const video = await uploadLinkedInVideo({ accessToken, owner, media: videos[0], downloadRemote });
    return { media: { title: mediaTitle(post), id: video } };
  }

  const images = mediaForType(post, 'image').slice(0, 20);
  if (images.length > 1) {
    const uploaded = [];
    for (const image of images) {
      uploaded.push(await uploadLinkedInImage({ accessToken, owner, media: image, downloadRemote }));
    }
    return {
      multiImage: {
        images: uploaded.map((id, index) => ({
          id,
          altText: cleanText(images[index].fileName || `${mediaTitle(post)} ${index + 1}`, 4086)
        }))
      }
    };
  }
  if (images.length === 1) {
    const image = await uploadLinkedInImage({ accessToken, owner, media: images[0], downloadRemote });
    return { media: { title: mediaTitle(post), id: image } };
  }
  return null;
}

async function publishLinkedInPost({ post, account, downloadRemote = downloadRemoteBuffer }) {
  const accessToken = await accessTokenFor(account);
  const author = linkedinAuthorUrn(account);
  const content = await linkedInContent({ post, accessToken, owner: author, downloadRemote });
  const body = {
    author,
    commentary: postCommentary(post),
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: []
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false
  };
  if (content) body.content = content;

  const response = await fetchWithTimeout(`${REST_BASE}/posts`, {
    method: 'POST',
    headers: restHeaders(accessToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body)
  });
  const data = await parseLinkedInResponse(response, `LinkedIn publish failed: ${response.status}`);
  return { id: response.headers.get('x-restli-id') || data.id || `linkedin_${post._id}`, raw: data };
}

async function syncLinkedInAccount({ account }) {
  const accessToken = await accessTokenFor(account);
  const author = linkedinAuthorUrn(account);
  if (author.startsWith('urn:li:person:')) {
    const profile = await getLinkedInProfile(accessToken);
    return {
      accountId: author,
      accountName: profile.name || account.accountName
    };
  }
  return {
    accountId: author,
    accountName: account.accountName || `LinkedIn Organization ${idFromUrn(author)}`
  };
}

module.exports = {
  LinkedInProviderError,
  buildLinkedInAuthUrl,
  exchangeCodeForLinkedInAccounts,
  getLinkedInSetupIssue,
  isLinkedInConfigured,
  publishLinkedInPost,
  syncLinkedInAccount,
  __private: {
    linkedinAuthorUrn,
    signState,
    verifyState
  }
};
