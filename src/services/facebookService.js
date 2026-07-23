const { fetchWithTimeout } = require('../utils/fetchWithTimeout');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
let sharp = null;
try { sharp = require('sharp'); } catch (error) { sharp = null; }
const env = require('../config/env');
const { cloudinary, isCloudinaryConfigured } = require('../config/cloudinary');
const { decryptToken, encryptToken } = require('./tokenCryptoService');
const { gridFsIdFromUrl, readGridFsBuffer } = require('./gridFsMediaStorage.service');

const graphVersion = env.facebookGraphVersion.startsWith('v') ? env.facebookGraphVersion : `v${env.facebookGraphVersion}`;
const graphBaseUrl = `https://graph.facebook.com/${graphVersion}`;

function isFacebookConfigured() {
  return Boolean(env.facebookAppId && env.facebookAppSecret && env.facebookCallbackUrl);
}

function hasFacebookBusinessLoginConfig() {
  return Boolean(env.facebookLoginConfigId);
}

function configuredFacebookScopes() {
  const required = [
    'pages_show_list',
    'pages_manage_posts',
    'pages_read_engagement',
    'instagram_basic',
    'instagram_content_publish'
  ];
  const configured = String(env.facebookScopes || '')
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  return [...new Set([...required, ...configured])];
}

function normalizeDomain(value) {
  if (!value) return '';
  const trimmed = String(value).trim().toLowerCase();
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname.replace(/^www\./, '');
  } catch (error) {
    return trimmed
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .split(':')[0]
      .replace(/^www\./, '');
  }
}

function callbackDetails() {
  try {
    const url = new URL(env.facebookCallbackUrl);
    return {
      valid: true,
      url: env.facebookCallbackUrl,
      origin: url.origin,
      domain: normalizeDomain(url.hostname)
    };
  } catch (error) {
    return {
      valid: false,
      url: env.facebookCallbackUrl,
      origin: '',
      domain: ''
    };
  }
}

function domainMatches(callbackDomain, appDomains) {
  return appDomains.some((domain) => callbackDomain === domain || callbackDomain.endsWith(`.${domain}`));
}

function isLocalCallbackDomain(domain) {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(domain) || domain.endsWith('.localhost');
}

function facebookConnectionChecklist() {
  const callback = callbackDetails();
  const appDomains = env.facebookAppDomains.map(normalizeDomain).filter(Boolean);
  const localCallback = Boolean(callback.valid && isLocalCallbackDomain(callback.domain));
  const appDomainReady = Boolean(callback.valid && appDomains.length && domainMatches(callback.domain, appDomains));
  const oauthDomainReady = localCallback || appDomainReady;
  const issues = [];
  const canUseClassicOAuth = Boolean(env.facebookAllowClassicOAuth);

  if (!isFacebookConfigured()) {
    issues.push('Add FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, and FACEBOOK_CALLBACK_URL.');
  }

  if (!callback.valid) {
    issues.push('FACEBOOK_CALLBACK_URL must be a full http or https URL.');
  }

  if (!appDomains.length && !localCallback) {
    issues.push('Set FACEBOOK_APP_DOMAINS to the same domain you added in Meta App Domains.');
  } else if (appDomains.length && !appDomainReady && !localCallback) {
    issues.push(`FACEBOOK_CALLBACK_URL uses ${callback.domain || 'an unknown domain'}, but FACEBOOK_APP_DOMAINS is ${appDomains.join(', ')}.`);
  }

  if (!hasFacebookBusinessLoginConfig() && !canUseClassicOAuth) {
    issues.push('Add FACEBOOK_LOGIN_CONFIG_ID for Facebook Login for Business. Page permissions such as pages_manage_posts and pages_read_engagement can be rejected as invalid when requested through classic Facebook Login.');
  }

  return {
    configured: isFacebookConfigured(),
    canStartOAuth: isFacebookConfigured() && callback.valid && oauthDomainReady && (hasFacebookBusinessLoginConfig() || canUseClassicOAuth),
    mode: hasFacebookBusinessLoginConfig() ? 'business_login' : 'classic_oauth',
    businessLoginConfigured: hasFacebookBusinessLoginConfig(),
    classicOAuthAllowed: canUseClassicOAuth,
    callbackUrl: callback.url,
    callbackOrigin: callback.origin,
    callbackDomain: callback.domain,
    localCallback,
    appDomains,
    appDomainReady,
    validOAuthRedirectUri: callback.url,
    issues
  };
}

function signStatePayload(payload) {
  return crypto.createHmac('sha256', env.csrfSecret || env.cookieSecret || env.jwtRefreshSecret).update(payload).digest('base64url');
}

function safeEqual(value, expected) {
  const valueBuffer = Buffer.from(String(value || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));
  return valueBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(valueBuffer, expectedBuffer);
}

function buildFacebookState({ brandId, userId }) {
  const payload = Buffer.from(JSON.stringify({ brandId, userId, nonce: crypto.randomBytes(16).toString('hex') })).toString('base64url');
  return `${payload}.${signStatePayload(payload)}`;
}

function buildFacebookAuthUrl({ brandId, userId }) {
  if (!isFacebookConfigured()) return null;

  const state = buildFacebookState({ brandId, userId });
  const params = new URLSearchParams({
    client_id: env.facebookAppId,
    redirect_uri: env.facebookCallbackUrl,
    state,
    response_type: 'code'
  });

  if (hasFacebookBusinessLoginConfig()) {
    params.set('config_id', env.facebookLoginConfigId);
    params.set('override_default_response_type', 'true');
  } else if (!env.facebookAllowClassicOAuth) {
    return null;
  } else {
    params.set('scope', configuredFacebookScopes().join(','));
    params.set('auth_type', 'rerequest');
  }

  return `https://www.facebook.com/${graphVersion}/dialog/oauth?${params.toString()}`;
}

function parseFacebookState(state) {
  const [payload, signature] = String(state || '').split('.');
  if (!payload || !signature || !safeEqual(signature, signStatePayload(payload))) {
    throw new FacebookProviderError('Facebook OAuth state is missing or invalid. Start the connection again.');
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.brandId || !parsed.userId) {
      throw new Error('Missing Facebook OAuth state fields.');
    }
    return parsed;
  } catch (error) {
    throw new FacebookProviderError('Facebook OAuth state could not be read. Start the connection again.');
  }
}

class FacebookProviderError extends Error {
  constructor(message, { statusCode, response } = {}) {
    super(message);
    this.name = 'FacebookProviderError';
    this.statusCode = statusCode;
    this.response = response;
  }
}


const facebookOptimizedDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'ai', '_facebook');
const facebookMaxImageDimension = Number(process.env.FACEBOOK_IMAGE_MAX_DIMENSION || 1440);
const facebookImageQuality = Number(process.env.FACEBOOK_IMAGE_QUALITY || 82);

function localPublicFilePath(fileUrl) {
  if (!fileUrl || /^https?:\/\//i.test(fileUrl)) return '';
  const cleaned = String(fileUrl).split('?')[0].replace(/^\/+/, '');
  const publicRoot = path.join(__dirname, '..', '..', 'public');
  const absolute = path.normalize(path.join(publicRoot, cleaned.replace(/^public[\/]/, '')));
  if (!absolute.startsWith(publicRoot)) return '';
  return absolute;
}

function publicHttpUrl(value) {
  if (!/^https?:\/\//i.test(String(value || ''))) return '';
  try {
    const url = new URL(value);
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return '';
    return url.toString();
  } catch (error) {
    return '';
  }
}

function publicAppMediaUrl(fileUrl) {
  if (!fileUrl || !env.publicAppUrl || !/^https?:\/\//i.test(env.publicAppUrl)) return '';
  try {
    const base = new URL(env.publicAppUrl);
    if (['localhost', '127.0.0.1', '::1'].includes(base.hostname)) return '';
    return new URL(fileUrl, `${base.origin}/`).toString();
  } catch (error) {
    return '';
  }
}

function localPathFromMediaUrl(fileUrl) {
  if (!fileUrl) return '';
  if (/^https?:\/\//i.test(fileUrl)) {
    try {
      const url = new URL(fileUrl);
      if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return '';
      return localPublicFilePath(url.pathname);
    } catch (error) {
      return '';
    }
  }
  return localPublicFilePath(fileUrl);
}

async function uploadLocalImageToCloudinary(media, localPath) {
  if (!isCloudinaryConfigured() || !localPath) return '';
  const result = await cloudinary.uploader.upload(localPath, {
    folder: 'autobrand/facebook-carousel',
    resource_type: 'image',
    overwrite: false
  });
  if (media && typeof media.set === 'function') {
    media.set({
      fileUrl: result.secure_url,
      publicId: result.public_id,
      folder: 'cloudinary/facebook-carousel'
    });
    await media.save().catch(() => {});
  }
  return result.secure_url || '';
}

async function uploadLocalVideoToCloudinary(media, localPath) {
  if (!isCloudinaryConfigured() || !localPath) return '';
  const result = await cloudinary.uploader.upload(localPath, {
    folder: 'autobrand/facebook-video',
    resource_type: 'video',
    overwrite: false
  });
  if (media && typeof media.set === 'function') {
    media.set({
      fileUrl: result.secure_url,
      publicId: result.public_id,
      folder: 'cloudinary/facebook-video',
      size: result.bytes || media.size || 0
    });
    await media.save().catch(() => {});
  }
  return result.secure_url || '';
}

async function facebookCrawlerImageUrl(media) {
  const direct = publicHttpUrl(media?.fileUrl);
  if (direct) return direct;

  const appUrl = publicAppMediaUrl(media?.fileUrl);
  if (appUrl) return appUrl;

  try {
    return await uploadLocalImageToCloudinary(media, localPathFromMediaUrl(media?.fileUrl));
  } catch (error) {
    return '';
  }
}

async function facebookVideoFileUrl(media) {
  const direct = publicHttpUrl(media?.fileUrl);
  if (direct) return direct;

  const appUrl = publicAppMediaUrl(media?.fileUrl);
  if (appUrl) return appUrl;

  try {
    return await uploadLocalVideoToCloudinary(media, localPathFromMediaUrl(media?.fileUrl));
  } catch (error) {
    return '';
  }
}

function safeFileName(value, fallback = 'upload') {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback;
}

async function fetchBuffer(url) {
  const response = await fetchWithTimeout(url, {});
  if (!response.ok) throw new FacebookProviderError(`Could not fetch media URL before Facebook upload: ${response.status} ${response.statusText}`);
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || 'application/octet-stream'
  };
}

async function readMediaBuffer(media) {
  const gridFsId = gridFsIdFromUrl(media?.fileUrl);
  if (gridFsId) {
    const stored = await readGridFsBuffer(gridFsId);
    return {
      buffer: stored.buffer,
      contentType: media.mimeType || stored.contentType || 'application/octet-stream',
      fileName: media.fileName || stored.fileName,
      diskFileName: stored.fileName
    };
  }

  const localPath = localPublicFilePath(media?.fileUrl);
  if (localPath) {
    const diskFileName = path.basename(localPath);
    return {
      buffer: await fs.readFile(localPath),
      contentType: media.mimeType || 'application/octet-stream',
      fileName: media.fileName || diskFileName,
      diskFileName
    };
  }
  if (/^https?:\/\//i.test(media?.fileUrl || '')) {
    return { url: media.fileUrl };
  }
  return { url: media?.fileUrl };
}

function extensionForMimeType(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('video/mp4')) return '.mp4';
  if (normalized.includes('video/quicktime')) return '.mov';
  if (normalized.includes('image/jpeg')) return '.jpg';
  if (normalized.includes('image/png')) return '.png';
  if (normalized.includes('image/webp')) return '.webp';
  return '';
}

function uploadFileName({ media, source, fallback = 'upload.bin' }) {
  const mimeType = source.contentType || media?.mimeType || '';
  const sourceName = source.fileName || media?.fileName || fallback;
  const diskName = source.diskFileName || '';
  const preferred = path.extname(sourceName) ? sourceName : path.extname(diskName) ? diskName : sourceName;
  const safeName = safeFileName(preferred, fallback);
  return path.extname(safeName) ? safeName : `${safeName}${extensionForMimeType(mimeType) || ''}`;
}

async function optimizedFacebookImagePayload(media, fallbackField = 'source') {
  const source = await readMediaBuffer(media);
  if (!source.buffer) return { url: source.url };

  let outputBuffer = source.buffer;
  let mimeType = source.contentType || media.mimeType || 'image/jpeg';
  let fileName = safeFileName(source.fileName || media.fileName || 'facebook-image.jpg');

  if (sharp) {
    try {
      outputBuffer = await sharp(source.buffer, { failOn: 'none' })
        .rotate()
        .resize({
          width: facebookMaxImageDimension,
          height: facebookMaxImageDimension,
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: facebookImageQuality, progressive: true, mozjpeg: true })
        .toBuffer();
      mimeType = 'image/jpeg';
      fileName = fileName.replace(/\.[a-z0-9]+$/i, '') + '.jpg';
      await fs.mkdir(facebookOptimizedDir, { recursive: true });
      await fs.writeFile(path.join(facebookOptimizedDir, `${Date.now()}-${fileName}`), outputBuffer);
    } catch (error) {
      outputBuffer = source.buffer;
    }
  }

  const blob = new Blob([outputBuffer], { type: mimeType });
  return { [fallbackField]: blob, fileName, optimizedSize: outputBuffer.length };
}

async function mediaUploadPayload(media, fallbackField = 'source') {
  const source = await readMediaBuffer(media);
  if (!source.buffer) return { url: source.url };
  const blob = new Blob([source.buffer], { type: source.contentType || media.mimeType || 'application/octet-stream' });
  return { [fallbackField]: blob, fileName: uploadFileName({ media, source }) };
}

async function graphFormRequest(pathname, { params, fields } = {}) {
  const url = new URL(`${graphBaseUrl}${pathname}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });
  }
  const form = new FormData();
  Object.entries(fields || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (value instanceof Blob) form.set(key, value, fields.fileName || 'upload.bin');
    else form.set(key, String(value));
  });
  form.delete('fileName');
  const response = await fetchWithTimeout(url, { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const message = payload.error?.message || `Facebook Graph API upload failed with ${response.status}.`;
    throw new FacebookProviderError(message, { statusCode: response.status, response: payload });
  }
  return payload;
}

async function graphRequest(path, { method = 'GET', params, body } = {}) {
  const url = new URL(`${graphBaseUrl}${path}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });
  }

  let requestBody;
  if (body) {
    requestBody = new URLSearchParams();
    Object.entries(body).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (Array.isArray(value)) value.forEach((item) => requestBody.append(key, item));
      else requestBody.set(key, value);
    });
  }

  const response = await fetchWithTimeout(url, {
    method,
    headers: requestBody ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
    body: requestBody
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.error) {
    const message = payload.error?.message || `Facebook Graph API request failed with ${response.status}.`;
    throw new FacebookProviderError(message, { statusCode: response.status, response: payload });
  }

  return payload;
}

function tokenExpiresAt(userTokenResponse) {
  return userTokenResponse.expires_in ? new Date(Date.now() + userTokenResponse.expires_in * 1000) : undefined;
}

function normalizePage(page, parsed, userTokenResponse, grantedPermissions = []) {
  const permissions = [...new Set([...(Array.isArray(page.tasks) ? page.tasks : []), ...grantedPermissions])];
  return {
    ...parsed,
    platform: 'facebook',
    accountName: page.name,
    accountId: page.id,
    accessTokenEncrypted: encryptToken(page.access_token || userTokenResponse.access_token),
    refreshTokenEncrypted: encryptToken(userTokenResponse.access_token),
    tokenExpiresAt: tokenExpiresAt(userTokenResponse),
    permissions,
    status: 'connected'
  };
}

function normalizeInstagramAccount({ instagram, page, parsed, userTokenResponse, grantedPermissions = [] }) {
  if (!instagram?.id) return null;
  const username = instagram.username || instagram.name || '';
  const requiredPermissions = ['instagram_basic', 'instagram_content_publish'];
  const missingPermissions = requiredPermissions.filter((permission) => !grantedPermissions.includes(permission));
  return {
    ...parsed,
    platform: 'instagram',
    accountName: username ? (String(username).startsWith('@') ? username : `@${username}`) : `${page.name || 'Instagram'} profile`,
    accountId: instagram.id,
    accessTokenEncrypted: encryptToken(page.access_token || userTokenResponse.access_token),
    refreshTokenEncrypted: encryptToken(userTokenResponse.access_token),
    tokenExpiresAt: tokenExpiresAt(userTokenResponse),
    permissions: grantedPermissions,
    providerMeta: {
      linkedFacebookPageId: page.id || '',
      missingPermissions,
      permissionGrantVerifiedAt: new Date()
    },
    status: missingPermissions.length ? 'needs_reconnect' : 'connected',
    healthStatus: missingPermissions.length ? 'failed' : 'healthy'
  };
}

async function linkedInstagramAccounts({ pages, parsed, userTokenResponse, grantedPermissions = [] }) {
  const accounts = [];
  const seen = new Set();

  for (const page of pages) {
    if (!page?.id) continue;
    const pageAccessToken = page.access_token || userTokenResponse.access_token;
    const details = await graphRequest(`/${encodeURIComponent(page.id)}`, {
      params: {
        access_token: pageAccessToken,
        fields: 'instagram_business_account{id,username,name}'
      }
    }).catch(() => ({}));

    const instagram = details.instagram_business_account || page.instagram_business_account;
    const account = normalizeInstagramAccount({ instagram, page, parsed, userTokenResponse, grantedPermissions });
    if (account && !seen.has(account.accountId)) {
      seen.add(account.accountId);
      accounts.push(account);
    }
  }

  return accounts;
}

async function grantedFacebookPermissions(accessToken) {
  const response = await graphRequest('/me/permissions', {
    params: { access_token: accessToken }
  }).catch(() => ({ data: [] }));
  return (response.data || [])
    .filter((item) => item?.status === 'granted' && item.permission)
    .map((item) => item.permission);
}

async function exchangeCodeForPageAccounts({ code, state }) {
  const parsed = parseFacebookState(state);

  if (!code) {
    throw new FacebookProviderError('Facebook did not return an authorization code. Start the connection again.');
  }

  if (!isFacebookConfigured()) {
    return [{
      ...parsed,
      platform: 'facebook',
      accountName: 'Facebook Page (development)',
      accountId: 'facebook_dev_page',
      accessTokenEncrypted: encryptToken(`dev:${code}`),
      permissions: ['pages_manage_posts', 'pages_read_engagement'],
      status: 'mock'
    }];
  }

  const userTokenResponse = await graphRequest('/oauth/access_token', {
    params: {
      client_id: env.facebookAppId,
      redirect_uri: env.facebookCallbackUrl,
      client_secret: env.facebookAppSecret,
      code
    }
  });

  const grantedPermissions = await grantedFacebookPermissions(userTokenResponse.access_token);

  const pagesResponse = await graphRequest('/me/accounts', {
    params: {
      access_token: userTokenResponse.access_token,
      fields: 'id,name,access_token,tasks'
    }
  });

  const pages = pagesResponse.data || [];
  if (!pages.length) {
    throw new FacebookProviderError('No Facebook Pages were returned. Make sure the logged-in Facebook user manages a Page and granted Page permissions.');
  }

  const accounts = pages.map((page) => normalizePage(page, parsed, userTokenResponse, grantedPermissions));
  accounts.push(...await linkedInstagramAccounts({ pages, parsed, userTokenResponse, grantedPermissions }));

  return accounts;
}

async function exchangeCodeForPageAccount(input) {
  const accounts = await exchangeCodeForPageAccounts(input);
  return accounts[0];
}

async function connectFacebookPageToken({ brandId, userId, pageAccessToken, pageId, pageName }) {
  if (!pageAccessToken) {
    throw new FacebookProviderError('Facebook Page access token is required.');
  }

  const page = await graphRequest(pageId ? `/${encodeURIComponent(pageId)}` : '/me', {
    params: {
      access_token: pageAccessToken,
      fields: 'id,name,tasks'
    }
  });

  const accountId = page.id || pageId;
  if (!accountId) {
    throw new FacebookProviderError('Facebook could not identify a Page from this token.');
  }

  return {
    brandId,
    userId,
    platform: 'facebook',
    accountName: pageName || page.name || `Facebook Page ${accountId}`,
    accountId,
    accessTokenEncrypted: encryptToken(pageAccessToken),
    permissions: Array.isArray(page.tasks) && page.tasks.length ? page.tasks : ['manual_page_token'],
    status: 'connected'
  };
}

async function verifyMetaPublishingAccount({ account }) {
  if (!account) throw new FacebookProviderError('Meta account is missing.');
  const accessToken = account.accessTokenEncrypted ? decryptToken(account.accessTokenEncrypted) : '';
  if (!accessToken) throw new FacebookProviderError('Meta access token is missing. Reconnect this account.');
  const accountId = String(account.accountId || '').trim();
  if (!accountId) throw new FacebookProviderError('Meta provider account ID is missing. Reconnect this account.');

  if (account.platform === 'instagram') {
    const profile = await graphRequest(`/${encodeURIComponent(accountId)}`, {
      params: {
        fields: 'id,username,name',
        access_token: accessToken
      }
    });
    return {
      platform: 'instagram',
      accountId: profile.id || accountId,
      accountName: profile.username ? `@${String(profile.username).replace(/^@/, '')}` : (profile.name || account.accountName),
      raw: profile
    };
  }

  const page = await graphRequest(`/${encodeURIComponent(accountId)}`, {
    params: {
      fields: 'id,name,tasks',
      access_token: accessToken
    }
  });
  return {
    platform: 'facebook',
    accountId: page.id || accountId,
    accountName: page.name || account.accountName,
    tasks: page.tasks || [],
    raw: page
  };
}

function facebookMessage(post) {
  return [post.caption, post.hashtags?.length ? post.hashtags.join(' ') : ''].filter(Boolean).join('\n\n');
}

async function publishFeedPost({ post, account, pageToken }) {
  return graphRequest(`/${account.accountId}/feed`, {
    method: 'POST',
    body: {
      message: facebookMessage(post),
      link: post.link || undefined,
      access_token: pageToken
    }
  });
}

async function publishPhotoPost({ post, account, pageToken, image, published = true }) {
  const upload = await optimizedFacebookImagePayload(image, 'source');
  const fields = {
    caption: published ? facebookMessage(post) : undefined,
    published: published ? undefined : 'false',
    temporary: published ? undefined : 'true',
    access_token: pageToken
  };
  if (upload.source) {
    fields.source = upload.source;
    fields.fileName = upload.fileName;
    return graphFormRequest(`/${account.accountId}/photos`, { fields });
  }
  return graphRequest(`/${account.accountId}/photos`, {
    method: 'POST',
    body: {
      url: upload.url,
      caption: published ? facebookMessage(post) : undefined,
      published: published ? undefined : 'false',
      temporary: published ? undefined : 'true',
      access_token: pageToken
    }
  });
}

function carouselLink(post, account) {
  return post.link
    || post.brand?.website
    || post.brand?.socialLinks?.find((item) => item.url)?.url
    || `https://www.facebook.com/${account.accountId}`;
}

function carouselTitle(post, index) {
  const prompts = post.platformMetadata?.slidePrompts || post.platformMetadata?.imagePrompts || [];
  const source = prompts[index] || post.title || post.brand?.name || `Slide ${index + 1}`;
  return String(source).replace(/\s+/g, ' ').trim().slice(0, 80) || `Slide ${index + 1}`;
}

async function facebookPhotoPictureUrl({ photoId, pageToken }) {
  const details = await graphRequest(`/${photoId}`, {
    params: {
      fields: 'images,picture',
      access_token: pageToken
    }
  });
  const images = Array.isArray(details.images) ? details.images : [];
  const largest = images
    .filter((item) => item.source)
    .sort((a, b) => Number(b.width || 0) - Number(a.width || 0))[0];
  return largest?.source || details.picture || '';
}

async function publishCarouselPost({ post, account, pageToken, images }) {
  // Use Facebook's link-carousel feed technique, not the multi-photo attached_media
  // technique. attached_media creates a normal multi-image/grid post on Facebook,
  // which looks static. child_attachments creates swipeable carousel cards.
  const link = carouselLink(post, account);
  const cards = [];

  for (const [index, image] of images.slice(0, 5).entries()) {
    let picture = await facebookCrawlerImageUrl(image);
    if (!picture) {
      const upload = await publishPhotoPost({ post, account, pageToken, image, published: false });
      if (!upload.id) continue;
      picture = await facebookPhotoPictureUrl({ photoId: upload.id, pageToken });
    }
    if (!picture) continue;
    cards.push({
      link,
      picture,
      name: carouselTitle(post, index),
      description: post.description || post.brand?.description || ''
    });
  }

  if (cards.length < 2) {
    throw new FacebookProviderError('Facebook carousel publishing needs at least two uploaded images with public preview URLs.');
  }

  return graphRequest(`/${account.accountId}/feed`, {
    method: 'POST',
    body: {
      message: facebookMessage(post),
      link,
      child_attachments: JSON.stringify(cards),
      multi_share_optimized: 'false',
      access_token: pageToken
    }
  });
}

async function publishMultiImagePost({ post, account, pageToken, images }) {
  const uploaded = [];
  for (const image of images.slice(0, 10)) {
    const result = await publishPhotoPost({ post, account, pageToken, image, published: false });
    if (result.id) uploaded.push({ media_fbid: result.id });
  }
  if (!uploaded.length) return publishFeedPost({ post, account, pageToken });
  const body = {
    message: facebookMessage(post),
    access_token: pageToken
  };
  uploaded.forEach((item, index) => {
    body[`attached_media[${index}]`] = JSON.stringify(item);
  });
  return graphRequest(`/${account.accountId}/feed`, {
    method: 'POST',
    body
  });
}

async function publishVideoPost({ post, account, pageToken, video }) {
  const fileUrl = await facebookVideoFileUrl(video);
  if (fileUrl) {
    return graphRequest(`/${account.accountId}/videos`, {
      method: 'POST',
      body: {
        file_url: fileUrl,
        description: facebookMessage(post),
        access_token: pageToken
      }
    });
  }

  const upload = await mediaUploadPayload(video, 'source');
  if (upload.source) {
    return graphFormRequest(`/${account.accountId}/videos`, {
      fields: {
        source: upload.source,
        fileName: upload.fileName,
        description: facebookMessage(post),
        access_token: pageToken
      }
    });
  }
  return graphRequest(`/${account.accountId}/videos`, {
    method: 'POST',
    body: {
      file_url: upload.url,
      description: facebookMessage(post),
      access_token: pageToken
    }
  });
}

async function publishFacebookPost({ post, account }) {
  if (account.status === 'mock') {
    return { id: `mock_facebook_${post._id}` };
  }

  const pageToken = decryptToken(account.accessTokenEncrypted);
  if (!pageToken) {
    throw new FacebookProviderError('Facebook Page token is missing. Reconnect this Facebook account.');
  }

  const media = Array.isArray(post.media) ? post.media.filter((item) => item && item.fileUrl) : [];
  const video = media.find((item) => item.fileType === 'video');
  const images = media.filter((item) => item.fileType === 'image');
  const requestedType = String(post.type || '').toLowerCase();

  let result;
  if (requestedType === 'video' && video) {
    result = await publishVideoPost({ post, account, pageToken, video });
  } else if (requestedType === 'video') {
    throw new FacebookProviderError('Video posts require a video media file. Generate or attach an MP4 before publishing.');
  } else if (requestedType === 'carousel' && images.length) {
    result = await publishCarouselPost({ post, account, pageToken, images });
  } else if (requestedType === 'image' && images.length > 1) {
    result = await publishMultiImagePost({ post, account, pageToken, images });
  } else if (requestedType === 'image' && images.length === 1) {
    result = await publishPhotoPost({ post, account, pageToken, image: images[0] });
  } else if (video) {
    result = await publishVideoPost({ post, account, pageToken, video });
  } else if (images.length > 1) {
    result = await publishCarouselPost({ post, account, pageToken, images });
  } else if (images.length === 1) {
    result = await publishPhotoPost({ post, account, pageToken, image: images[0] });
  } else {
    result = await publishFeedPost({ post, account, pageToken });
  }

  return { id: result.id || result.post_id };
}

module.exports = {
  FacebookProviderError,
  facebookConnectionChecklist,
  hasFacebookBusinessLoginConfig,
  isFacebookConfigured,
  buildFacebookAuthUrl,
  exchangeCodeForPageAccounts,
  exchangeCodeForPageAccount,
  connectFacebookPageToken,
  publishFacebookPost,
  verifyMetaPublishingAccount
};
