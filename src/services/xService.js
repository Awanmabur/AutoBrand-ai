const crypto = require('crypto');
const env = require('../config/env');
const { decryptToken, encryptToken } = require('./tokenCryptoService');

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
const DEFAULT_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

function configuredScopes() {
  return String(env.xScopes || DEFAULT_SCOPES.join(' '))
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
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
  const response = await fetch(TOKEN_URL, {
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
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return parseXResponse(response, `X / Twitter API error: ${response.status}`);
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

async function publishXPost({ post, account }) {
  const accessToken = await accessTokenFor(account);
  if (!accessToken) throw new XProviderError('X / Twitter access token is missing. Reconnect the account.');

  const data = await xJson('/tweets', {
    accessToken,
    method: 'POST',
    body: { text: postText(post) }
  });
  return { id: data.data?.id || `x_${post._id}` };
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
  __private: { signState, verifyState, postText }
};
