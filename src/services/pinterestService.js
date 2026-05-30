const crypto = require('crypto');
const env = require('../config/env');
const { decryptToken, encryptToken } = require('./tokenCryptoService');

class PinterestProviderError extends Error {
  constructor(message, response) {
    super(message);
    this.name = 'PinterestProviderError';
    this.response = response;
  }
}

const AUTH_BASE = 'https://www.pinterest.com/oauth/';
const API_BASE = 'https://api.pinterest.com/v5';
const TOKEN_URL = `${API_BASE}/oauth/token`;
const DEFAULT_SCOPES = ['boards:read', 'pins:read', 'pins:write', 'user_accounts:read'];

function configuredScopes() {
  return String(env.pinterestScopes || DEFAULT_SCOPES.join(','))
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function isPlaceholder(value) {
  return !value || /^(your_|paste_|changeme|todo|xxx)/i.test(String(value).trim());
}

function getPinterestSetupIssue() {
  if (isPlaceholder(env.pinterestClientId)) return 'Pinterest Client ID is missing or still a placeholder. Add PINTEREST_CLIENT_ID from Pinterest Developers.';
  if (isPlaceholder(env.pinterestClientSecret)) return 'Pinterest Client Secret is missing or still a placeholder. Add PINTEREST_CLIENT_SECRET from Pinterest Developers.';
  if (!env.pinterestCallbackUrl) return 'Pinterest callback URL is missing. Set PINTEREST_CALLBACK_URL.';
  if (!/^https?:\/\//i.test(env.pinterestCallbackUrl)) return 'Pinterest callback URL must start with http:// or https://.';
  return '';
}

function isPinterestConfigured() {
  return !getPinterestSetupIssue();
}

function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', env.cookieSecret || env.jwtRefreshSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyState(state) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) throw new PinterestProviderError('Pinterest OAuth state is missing or invalid. Start the connection again.');
  const expected = crypto.createHmac('sha256', env.cookieSecret || env.jwtRefreshSecret).update(body).digest('base64url');
  if (Buffer.byteLength(sig) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new PinterestProviderError('Pinterest OAuth state is invalid. Start the connection again.');
  }
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

function basicAuthHeader() {
  return `Basic ${Buffer.from(`${env.pinterestClientId}:${env.pinterestClientSecret}`).toString('base64')}`;
}

function buildPinterestAuthUrl({ brandId, userId }) {
  const setupIssue = getPinterestSetupIssue();
  if (setupIssue) throw new PinterestProviderError(setupIssue);

  const state = signState({ brandId, userId, nonce: crypto.randomBytes(12).toString('hex'), ts: Date.now() });
  const url = new URL(AUTH_BASE);
  url.searchParams.set('client_id', env.pinterestClientId);
  url.searchParams.set('redirect_uri', env.pinterestCallbackUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', configuredScopes().join(','));
  url.searchParams.set('state', state);
  return url.toString();
}

async function parsePinterestResponse(response, fallback) {
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (error) {}
  if (!response.ok || data.error) {
    const message = data.message || data.error_description || data.error?.message || data.error || fallback || `Pinterest API error: ${response.status}`;
    throw new PinterestProviderError(message, data);
  }
  return data;
}

async function exchangeToken(body) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  return parsePinterestResponse(response, `Pinterest token request failed: ${response.status}`);
}

function tokenExpiry(tokenData) {
  return tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000) : undefined;
}

async function refreshAccessToken(account) {
  const refreshToken = account.refreshTokenEncrypted ? decryptToken(account.refreshTokenEncrypted) : '';
  if (!refreshToken) throw new PinterestProviderError('Pinterest refresh token is missing. Reconnect the board.');

  const tokenData = await exchangeToken(new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  }));
  if (!tokenData.access_token) throw new PinterestProviderError('Pinterest did not return a refreshed access token. Reconnect the board.');

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

async function pinterestJson(pathname, { accessToken, method = 'GET', body } = {}) {
  const url = /^https?:\/\//i.test(pathname) ? pathname : `${API_BASE}${pathname}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return parsePinterestResponse(response, `Pinterest API error: ${response.status}`);
}

async function getPinterestUser(accessToken) {
  return pinterestJson('/user_account', { accessToken }).catch(() => ({}));
}

async function listPinterestBoards(accessToken) {
  const data = await pinterestJson('/boards?page_size=100', { accessToken });
  return Array.isArray(data.items) ? data.items : [];
}

function boardPayload({ parsedState, board, tokenData, profile }) {
  const username = profile.username || profile.account_name || profile.id || 'Pinterest';
  const boardName = board.name || board.id || 'Pinterest Board';
  return {
    brandId: parsedState.brandId,
    userId: parsedState.userId,
    platform: 'pinterest',
    accountId: String(board.id || ''),
    accountName: `${boardName} (${username})`,
    accessTokenEncrypted: encryptToken(tokenData.access_token),
    refreshTokenEncrypted: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : undefined,
    tokenExpiresAt: tokenExpiry(tokenData),
    providerMeta: {
      boardId: board.id,
      boardName,
      boardDescription: board.description,
      privacy: board.privacy,
      username,
      userId: profile.id
    },
    permissions: configuredScopes(),
    status: 'connected'
  };
}

async function exchangeCodeForPinterestBoards({ code, state }) {
  const parsedState = verifyState(state);
  const setupIssue = getPinterestSetupIssue();
  if (setupIssue) throw new PinterestProviderError(setupIssue);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(code || ''),
    redirect_uri: env.pinterestCallbackUrl
  });
  if (env.pinterestContinuousRefresh) body.set('continuous_refresh', 'true');

  const tokenData = await exchangeToken(body);
  if (!tokenData.access_token) throw new PinterestProviderError('Pinterest did not return an access token. Start the connection again.');

  const [profile, boards] = await Promise.all([
    getPinterestUser(tokenData.access_token),
    listPinterestBoards(tokenData.access_token)
  ]);
  if (!boards.length) throw new PinterestProviderError('No Pinterest boards were returned for this account. Create a board in Pinterest, then reconnect.');

  return boards.map((board) => boardPayload({ parsedState, board, tokenData, profile })).filter((board) => board.accountId);
}

function firstImage(post) {
  const media = Array.isArray(post.media) ? post.media : [];
  return media.find((item) => item.fileType === 'image' && /^https?:\/\//i.test(item.fileUrl || ''));
}

async function syncPinterestBoard({ account }) {
  const accessToken = await accessTokenFor(account);
  const boardId = account.providerMeta?.boardId || account.accountId;
  if (!boardId) throw new PinterestProviderError('Pinterest board ID is missing.');
  const data = await pinterestJson(`/boards/${encodeURIComponent(boardId)}`, { accessToken });
  return {
    accountId: String(data.id || boardId),
    accountName: data.name || account.accountName,
    providerMeta: {
      ...(account.providerMeta || {}),
      boardId: data.id || boardId,
      boardName: data.name || account.providerMeta?.boardName,
      boardDescription: data.description,
      privacy: data.privacy
    }
  };
}

async function publishPinterestPin({ post, account }) {
  const accessToken = await accessTokenFor(account);
  if (!accessToken) throw new PinterestProviderError('Pinterest access token is missing. Reconnect the board.');
  const boardId = account.providerMeta?.boardId || String(account.accountId || '');
  if (!boardId) throw new PinterestProviderError('Pinterest board ID is missing.');
  const image = firstImage(post);
  if (!image) throw new PinterestProviderError('Pinterest needs a public image URL. Upload to Cloudinary or use generated remote image before publishing.');

  const body = {
    board_id: boardId,
    title: String(post.title || post.brand?.name || 'AutoBrand post').slice(0, 100),
    description: String(post.caption || post.description || '').slice(0, 500),
    link: post.link || post.brand?.website || undefined,
    media_source: { source_type: 'image_url', url: image.fileUrl }
  };
  if (!body.link) delete body.link;

  const data = await pinterestJson('/pins', { accessToken, method: 'POST', body });
  return { id: data.id || `pinterest_${post._id}` };
}

module.exports = {
  buildPinterestAuthUrl,
  exchangeCodeForPinterestBoards,
  getPinterestSetupIssue,
  isPinterestConfigured,
  publishPinterestPin,
  syncPinterestBoard,
  PinterestProviderError,
  __private: { signState, verifyState }
};
