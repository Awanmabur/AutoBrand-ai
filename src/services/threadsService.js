const { fetchWithTimeout } = require('../utils/fetchWithTimeout');
const crypto = require('crypto');
const env = require('../config/env');
const { decryptToken, encryptToken } = require('./tokenCryptoService');
const { publicMediaUrl } = require('./publicMediaUrlService');

class ThreadsProviderError extends Error {
  constructor(message, response) {
    super(message);
    this.name = 'ThreadsProviderError';
    this.response = response;
  }
}

const AUTH_BASE = 'https://www.threads.net/oauth/authorize';
const GRAPH_BASE = 'https://graph.threads.net';
const DEFAULT_SCOPES = ['threads_basic', 'threads_content_publish'];

function graphVersion() {
  return String(env.threadsGraphVersion || 'v1.0').replace(/^\/+/, '');
}

function graphUrl(pathname) {
  const path = String(pathname || '').replace(/^\/+/, '');
  return `${GRAPH_BASE}/${graphVersion()}/${path}`;
}

function configuredScopes() {
  return String(env.threadsScopes || DEFAULT_SCOPES.join(','))
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function isPlaceholder(value) {
  return !value || /^(your_|paste_|changeme|todo|xxx)/i.test(String(value).trim());
}

function getThreadsSetupIssue() {
  if (isPlaceholder(env.threadsAppId)) return 'Threads App ID is missing or still a placeholder. Add THREADS_APP_ID from the Threads API app in Meta for Developers.';
  if (isPlaceholder(env.threadsAppSecret)) return 'Threads App Secret is missing or still a placeholder. Add THREADS_APP_SECRET from the Threads API app in Meta for Developers.';
  if (!env.threadsCallbackUrl) return 'Threads callback URL is missing. Set THREADS_CALLBACK_URL.';
  if (!/^https?:\/\//i.test(env.threadsCallbackUrl)) return 'Threads callback URL must start with http:// or https://.';
  return '';
}

function isThreadsConfigured() {
  return !getThreadsSetupIssue();
}

function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', env.cookieSecret || env.jwtRefreshSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyState(state) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) throw new ThreadsProviderError('Threads OAuth state is missing or invalid. Start the connection again.');
  const expected = crypto.createHmac('sha256', env.cookieSecret || env.jwtRefreshSecret).update(body).digest('base64url');
  if (Buffer.byteLength(sig) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new ThreadsProviderError('Threads OAuth state is invalid. Start the connection again.');
  }
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

function buildThreadsAuthUrl({ brandId, userId }) {
  const setupIssue = getThreadsSetupIssue();
  if (setupIssue) throw new ThreadsProviderError(setupIssue);

  const state = signState({ brandId, userId, nonce: crypto.randomBytes(12).toString('hex'), ts: Date.now() });
  const url = new URL(AUTH_BASE);
  url.searchParams.set('client_id', env.threadsAppId);
  url.searchParams.set('redirect_uri', env.threadsCallbackUrl);
  url.searchParams.set('scope', configuredScopes().join(','));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  return url.toString();
}

async function parseThreadsResponse(response, fallback) {
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (error) {}
  if (!response.ok || data.error) {
    const message = data.error?.message || data.error_description || data.error || fallback || `Threads API error: ${response.status}`;
    throw new ThreadsProviderError(message, data);
  }
  return data;
}

async function exchangeShortLivedToken(code) {
  const response = await fetchWithTimeout(`${GRAPH_BASE}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.threadsAppId,
      client_secret: env.threadsAppSecret,
      grant_type: 'authorization_code',
      redirect_uri: env.threadsCallbackUrl,
      code: String(code || '')
    })
  });
  return parseThreadsResponse(response, `Threads token request failed: ${response.status}`);
}

async function exchangeLongLivedToken(shortAccessToken) {
  const url = new URL(`${GRAPH_BASE}/access_token`);
  url.searchParams.set('grant_type', 'th_exchange_token');
  url.searchParams.set('client_secret', env.threadsAppSecret);
  url.searchParams.set('access_token', shortAccessToken);
  const response = await fetchWithTimeout(url.toString());
  return parseThreadsResponse(response, `Threads long-lived token request failed: ${response.status}`);
}

async function refreshLongLivedToken(currentAccessToken) {
  const url = new URL(`${GRAPH_BASE}/refresh_access_token`);
  url.searchParams.set('grant_type', 'th_refresh_token');
  url.searchParams.set('access_token', currentAccessToken);
  const response = await fetchWithTimeout(url.toString());
  return parseThreadsResponse(response, `Threads token refresh failed: ${response.status}`);
}

function tokenExpiry(tokenData) {
  return tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000) : undefined;
}

async function accessTokenFor(account) {
  const token = account.accessTokenEncrypted ? decryptToken(account.accessTokenEncrypted) : '';
  if (!token) throw new ThreadsProviderError('Threads access token is missing. Reconnect the account.');
  if (account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() < Date.now() + 86_400_000) {
    const tokenData = await refreshLongLivedToken(token);
    if (tokenData.access_token) {
      account.accessTokenEncrypted = encryptToken(tokenData.access_token);
      account.tokenExpiresAt = tokenExpiry(tokenData) || account.tokenExpiresAt;
      account.status = 'connected';
      account.lastSyncAt = new Date();
      if (typeof account.save === 'function') await account.save();
      return tokenData.access_token;
    }
  }
  return token;
}

async function threadsGraph(pathname, { accessToken, method = 'GET', body } = {}) {
  const url = /^https?:\/\//i.test(pathname) ? pathname : graphUrl(pathname);
  const payload = body ? new URLSearchParams({ ...body, access_token: accessToken }) : undefined;
  const finalUrl = !body && accessToken ? `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}` : url;
  const response = await fetchWithTimeout(finalUrl, {
    method,
    headers: body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
    body: payload
  });
  return parseThreadsResponse(response, `Threads API error: ${response.status}`);
}

async function getThreadsProfile(accessToken) {
  return threadsGraph('/me?fields=id,username,name,threads_profile_picture_url', { accessToken });
}

async function exchangeCodeForThreadsAccount({ code, state }) {
  const parsedState = verifyState(state);
  const setupIssue = getThreadsSetupIssue();
  if (setupIssue) throw new ThreadsProviderError(setupIssue);

  const shortToken = await exchangeShortLivedToken(code);
  if (!shortToken.access_token) throw new ThreadsProviderError('Threads did not return an access token. Start the connection again.');

  let tokenData = shortToken;
  try {
    tokenData = await exchangeLongLivedToken(shortToken.access_token);
  } catch (error) {
    tokenData = shortToken;
  }

  const accessToken = tokenData.access_token || shortToken.access_token;
  const profile = await getThreadsProfile(accessToken);
  const threadsUserId = profile.id || shortToken.user_id || tokenData.user_id;
  if (!threadsUserId) throw new ThreadsProviderError('Threads did not return a user ID. Start the connection again.');

  return {
    brandId: parsedState.brandId,
    userId: parsedState.userId,
    platform: 'threads',
    accountId: String(threadsUserId),
    accountName: profile.username ? `@${profile.username}` : (profile.name || `Threads ${threadsUserId}`),
    accessTokenEncrypted: encryptToken(accessToken),
    refreshTokenEncrypted: undefined,
    tokenExpiresAt: tokenExpiry(tokenData),
    providerMeta: {
      username: profile.username,
      name: profile.name,
      profilePictureUrl: profile.threads_profile_picture_url
    },
    permissions: configuredScopes(),
    status: 'connected'
  };
}

function firstPublicImage(post) {
  const media = Array.isArray(post.media) ? post.media : [];
  const image = media.find((item) => item.fileType === 'image' && item.fileUrl);
  if (!image) return null;
  const url = publicMediaUrl(image.fileUrl);
  return url ? { ...image, publicFileUrl: url } : null;
}

function postText(post) {
  const base = String(post.caption || post.description || post.title || 'AutoBrand update').trim();
  const hashtags = Array.isArray(post.hashtags) ? post.hashtags.join(' ') : String(post.hashtags || '');
  const combined = [base, hashtags.trim()].filter(Boolean).join(' ');
  return combined.slice(0, 500) || 'AutoBrand update';
}

async function createThreadsContainer({ accountId, accessToken, post }) {
  const image = firstPublicImage(post);
  const body = image
    ? { media_type: 'IMAGE', image_url: image.publicFileUrl, text: postText(post) }
    : { media_type: 'TEXT', text: postText(post) };
  return threadsGraph(`/${encodeURIComponent(accountId)}/threads`, { accessToken, method: 'POST', body });
}

async function publishThreadsPost({ post, account }) {
  const accessToken = await accessTokenFor(account);
  const accountId = String(account.accountId || '').trim();
  if (!accountId) throw new ThreadsProviderError('Threads user ID is missing. Reconnect the account.');

  const container = await createThreadsContainer({ accountId, accessToken, post });
  const creationId = container.id || container.creation_id;
  if (!creationId) throw new ThreadsProviderError('Threads did not return a creation ID.');

  const data = await threadsGraph(`/${encodeURIComponent(accountId)}/threads_publish`, {
    accessToken,
    method: 'POST',
    body: { creation_id: creationId }
  });
  return { id: data.id || `threads_${post._id}` };
}

async function syncThreadsAccount({ account }) {
  const accessToken = await accessTokenFor(account);
  const profile = await getThreadsProfile(accessToken);
  return {
    accountId: profile.id || account.accountId,
    accountName: profile.username ? `@${profile.username}` : (profile.name || account.accountName),
    providerMeta: {
      ...(account.providerMeta || {}),
      username: profile.username,
      name: profile.name,
      profilePictureUrl: profile.threads_profile_picture_url
    }
  };
}

module.exports = {
  buildThreadsAuthUrl,
  exchangeCodeForThreadsAccount,
  getThreadsSetupIssue,
  isThreadsConfigured,
  publishThreadsPost,
  syncThreadsAccount,
  ThreadsProviderError,
  __private: { signState, verifyState, postText, graphUrl }
};
