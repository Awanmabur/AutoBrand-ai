const { fetchWithTimeout } = require('../utils/fetchWithTimeout');
const crypto = require('crypto');
const env = require('../config/env');
const { decryptToken, encryptToken } = require('./tokenCryptoService');
const { publicMediaUrl } = require('./publicMediaUrlService');

class GoogleBusinessProfileError extends Error {
  constructor(message, response) {
    super(message);
    this.name = 'GoogleBusinessProfileError';
    this.response = response;
  }
}

const AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ACCOUNT_API_BASE = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const BUSINESS_INFO_BASE = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const LOCAL_POSTS_BASE = 'https://mybusiness.googleapis.com/v4';
const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/business.manage'];

function configuredScopes() {
  return String(env.googleBusinessScopes || DEFAULT_SCOPES.join(' '))
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function isPlaceholder(value) {
  return !value || /^(your_|paste_|changeme|todo|xxx)/i.test(String(value).trim());
}

function getGoogleBusinessSetupIssue() {
  if (isPlaceholder(env.googleBusinessClientId)) return 'Google Business Profile Client ID is missing or still a placeholder. Add GOOGLE_BUSINESS_CLIENT_ID or reuse GOOGLE_CLIENT_ID from Google Cloud.';
  if (isPlaceholder(env.googleBusinessClientSecret)) return 'Google Business Profile Client Secret is missing or still a placeholder. Add GOOGLE_BUSINESS_CLIENT_SECRET or reuse GOOGLE_CLIENT_SECRET from Google Cloud.';
  if (!env.googleBusinessCallbackUrl) return 'Google Business Profile callback URL is missing. Set GOOGLE_BUSINESS_CALLBACK_URL.';
  if (!/^https?:\/\//i.test(env.googleBusinessCallbackUrl)) return 'Google Business Profile callback URL must start with http:// or https://.';
  return '';
}

function isGoogleBusinessConfigured() {
  return !getGoogleBusinessSetupIssue();
}

function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', env.cookieSecret || env.jwtRefreshSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyState(state) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) throw new GoogleBusinessProfileError('Google Business Profile OAuth state is missing or invalid. Start the connection again.');
  const expected = crypto.createHmac('sha256', env.cookieSecret || env.jwtRefreshSecret).update(body).digest('base64url');
  if (Buffer.byteLength(sig) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new GoogleBusinessProfileError('Google Business Profile OAuth state is invalid. Start the connection again.');
  }
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

function buildGoogleBusinessAuthUrl({ brandId, userId }) {
  const setupIssue = getGoogleBusinessSetupIssue();
  if (setupIssue) throw new GoogleBusinessProfileError(setupIssue);

  const state = signState({ brandId, userId, nonce: crypto.randomBytes(12).toString('hex'), ts: Date.now() });
  const url = new URL(AUTH_BASE);
  url.searchParams.set('client_id', env.googleBusinessClientId);
  url.searchParams.set('redirect_uri', env.googleBusinessCallbackUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', configuredScopes().join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  return url.toString();
}

async function parseGoogleResponse(response, fallback) {
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (error) {}
  if (!response.ok || data.error) {
    const message = data.error?.message || data.error_description || data.error || fallback || `Google Business Profile API error: ${response.status}`;
    throw new GoogleBusinessProfileError(message, data);
  }
  return data;
}

async function exchangeToken(body) {
  const response = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  return parseGoogleResponse(response, `Google Business Profile token request failed: ${response.status}`);
}

function tokenExpiry(tokenData) {
  return tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000) : undefined;
}

async function refreshAccessToken(account) {
  const refreshToken = account.refreshTokenEncrypted ? decryptToken(account.refreshTokenEncrypted) : '';
  if (!refreshToken) throw new GoogleBusinessProfileError('Google Business Profile refresh token is missing. Reconnect the location.');

  const tokenData = await exchangeToken(new URLSearchParams({
    client_id: env.googleBusinessClientId,
    client_secret: env.googleBusinessClientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  }));
  if (!tokenData.access_token) throw new GoogleBusinessProfileError('Google did not return a refreshed access token. Reconnect the location.');

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

async function googleJson(url, { accessToken, method = 'GET', body } = {}) {
  const response = await fetchWithTimeout(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return parseGoogleResponse(response, `Google Business Profile API error: ${response.status}`);
}

function resourcePart(resourceName, part) {
  const pieces = String(resourceName || '').split('/');
  const index = pieces.indexOf(part);
  if (index >= 0 && pieces[index + 1]) return pieces[index + 1];
  return '';
}

function accountParts(account) {
  const meta = account.providerMeta || {};
  const raw = String(account.accountId || '');
  const [businessAccountId, locationId] = raw.includes('|') ? raw.split('|') : ['', raw];
  return {
    businessAccountId: businessAccountId || meta.businessAccountId || resourcePart(meta.businessAccountResourceName, 'accounts'),
    locationId: locationId || meta.locationId || resourcePart(meta.locationResourceName, 'locations')
  };
}

function googleMedia(post) {
  const media = Array.isArray(post.media) ? post.media : [];
  const image = media.find((item) => item.fileType === 'image' && item.fileUrl);
  const sourceUrl = image ? publicMediaUrl(image.fileUrl) : '';
  return sourceUrl ? [{ mediaFormat: 'PHOTO', sourceUrl }] : undefined;
}

function locationName(location) {
  return location.title || location.locationName || location.storeCode || resourcePart(location.name, 'locations') || location.name || 'Google Business location';
}

async function listBusinessAccounts(accessToken) {
  const data = await googleJson(`${ACCOUNT_API_BASE}/accounts`, { accessToken });
  return Array.isArray(data.accounts) ? data.accounts : [];
}

async function listLocationsForAccount({ accessToken, accountResourceName }) {
  const readMask = 'name,title,storefrontAddress,metadata,storeCode';
  const businessInfoUrl = `${BUSINESS_INFO_BASE}/${accountResourceName}/locations?readMask=${encodeURIComponent(readMask)}&pageSize=100`;
  const info = await googleJson(businessInfoUrl, { accessToken }).catch(() => ({ locations: [] }));
  if (Array.isArray(info.locations) && info.locations.length) return info.locations;

  const legacy = await googleJson(`${LOCAL_POSTS_BASE}/${accountResourceName}/locations`, { accessToken }).catch(() => ({ locations: [] }));
  return Array.isArray(legacy.locations) ? legacy.locations : [];
}

function accountPayload({ parsedState, account, location, tokenData }) {
  const businessAccountId = resourcePart(account.name, 'accounts') || String(account.name || '').replace(/^accounts\//, '');
  const locationId = resourcePart(location.name, 'locations') || String(location.name || '').replace(/^locations\//, '');
  const accountLabel = account.accountName || account.name || 'Google Business Account';
  const locationLabel = locationName(location);
  return {
    brandId: parsedState.brandId,
    userId: parsedState.userId,
    platform: 'google_business',
    accountId: `${businessAccountId}|${locationId}`,
    accountName: `${locationLabel} (${accountLabel})`,
    accessTokenEncrypted: encryptToken(tokenData.access_token),
    refreshTokenEncrypted: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : undefined,
    tokenExpiresAt: tokenExpiry(tokenData),
    providerMeta: {
      businessAccountId,
      locationId,
      businessAccountResourceName: account.name,
      locationResourceName: location.name,
      accountName: accountLabel,
      locationName: locationLabel,
      storefrontAddress: location.storefrontAddress,
      metadata: location.metadata
    },
    permissions: configuredScopes(),
    status: 'connected'
  };
}

async function exchangeCodeForGoogleBusinessLocations({ code, state }) {
  const parsedState = verifyState(state);
  const setupIssue = getGoogleBusinessSetupIssue();
  if (setupIssue) throw new GoogleBusinessProfileError(setupIssue);

  const tokenData = await exchangeToken(new URLSearchParams({
    code: String(code || ''),
    client_id: env.googleBusinessClientId,
    client_secret: env.googleBusinessClientSecret,
    redirect_uri: env.googleBusinessCallbackUrl,
    grant_type: 'authorization_code'
  }));
  if (!tokenData.access_token) throw new GoogleBusinessProfileError('Google Business Profile did not return an access token. Start the connection again.');

  const accounts = await listBusinessAccounts(tokenData.access_token);
  if (!accounts.length) throw new GoogleBusinessProfileError('No Google Business Profile accounts were returned for this Google user.');

  const locations = [];
  for (const account of accounts) {
    const accountLocations = await listLocationsForAccount({ accessToken: tokenData.access_token, accountResourceName: account.name });
    for (const location of accountLocations) {
      locations.push(accountPayload({ parsedState, account, location, tokenData }));
    }
  }
  if (!locations.length) throw new GoogleBusinessProfileError('No Google Business Profile locations were returned for this Google user.');
  return locations;
}

async function syncGoogleBusinessLocation({ account }) {
  const accessToken = await accessTokenFor(account);
  const parts = accountParts(account);
  if (!parts.businessAccountId || !parts.locationId) {
    throw new GoogleBusinessProfileError('Google Business Profile account needs accountId formatted as businessAccountId|locationId.');
  }

  const resourceName = account.providerMeta?.locationResourceName || `locations/${parts.locationId}`;
  const url = `${BUSINESS_INFO_BASE}/locations/${encodeURIComponent(parts.locationId)}?readMask=${encodeURIComponent('name,title,storefrontAddress,metadata,storeCode')}`;
  const data = await googleJson(url, { accessToken }).catch(() => ({ name: resourceName, title: account.accountName }));
  const locationLabel = locationName(data);
  return {
    accountId: `${parts.businessAccountId}|${parts.locationId}`,
    accountName: locationLabel || account.accountName,
    providerMeta: {
      ...(account.providerMeta || {}),
      businessAccountId: parts.businessAccountId,
      locationId: parts.locationId,
      locationResourceName: data.name || resourceName,
      locationName: locationLabel,
      storefrontAddress: data.storefrontAddress,
      metadata: data.metadata
    }
  };
}

async function publishGoogleBusinessPost({ post, account }) {
  const accessToken = await accessTokenFor(account);
  if (!accessToken) throw new GoogleBusinessProfileError('Google Business Profile token is missing. Reconnect the location.');
  const { businessAccountId, locationId } = accountParts(account);
  if (!businessAccountId || !locationId) {
    throw new GoogleBusinessProfileError('Google Business Profile account needs accountId formatted as businessAccountId|locationId.');
  }

  const body = {
    languageCode: 'en-US',
    summary: String(post.caption || post.description || post.title || '').slice(0, 1500),
    topicType: 'STANDARD',
    callToAction: {
      actionType: 'LEARN_MORE',
      url: post.link || post.brand?.website || undefined
    },
    media: googleMedia(post)
  };
  if (!body.callToAction.url) delete body.callToAction;
  if (!body.media) delete body.media;

  const url = `${LOCAL_POSTS_BASE}/accounts/${encodeURIComponent(businessAccountId)}/locations/${encodeURIComponent(locationId)}/localPosts`;
  const data = await googleJson(url, { accessToken, method: 'POST', body });
  return { id: data.name || data.searchUrl || `google_business_${post._id}` };
}

module.exports = {
  buildGoogleBusinessAuthUrl,
  exchangeCodeForGoogleBusinessLocations,
  getGoogleBusinessSetupIssue,
  isGoogleBusinessConfigured,
  publishGoogleBusinessPost,
  syncGoogleBusinessLocation,
  GoogleBusinessProfileError,
  __private: { signState, verifyState, accountParts, resourcePart }
};
