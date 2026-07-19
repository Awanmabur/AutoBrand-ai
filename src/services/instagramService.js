const path = require('path');
const env = require('../config/env');
const { cloudinary, isCloudinaryConfigured } = require('../config/cloudinary');
const { decryptToken } = require('./tokenCryptoService');

class InstagramProviderError extends Error {
  constructor(message, response) {
    super(message);
    this.name = 'InstagramProviderError';
    this.response = response;
  }
}

const graphVersion = env.facebookGraphVersion.startsWith('v') ? env.facebookGraphVersion : `v${env.facebookGraphVersion}`;
const graphBaseUrl = `https://graph.facebook.com/${graphVersion}`;

function isLocalHostUrl(value) {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch (error) {
    return false;
  }
}

function localPublicFilePath(fileUrl) {
  if (!fileUrl || /^https?:\/\//i.test(fileUrl)) return '';
  const cleaned = String(fileUrl).split('?')[0].replace(/^\/+/, '');
  const publicRoot = path.join(__dirname, '..', '..', 'public');
  const absolute = path.normalize(path.join(publicRoot, cleaned.replace(/^public[\/]/, '')));
  if (!absolute.startsWith(publicRoot)) return '';
  return absolute;
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

async function uploadLocalMediaToCloudinary(media, localPath) {
  if (!isCloudinaryConfigured() || !localPath) return '';
  const resourceType = media.fileType === 'video' ? 'video' : 'image';
  const result = await cloudinary.uploader.upload(localPath, {
    folder: `autobrand/instagram-${resourceType}`,
    resource_type: resourceType,
    overwrite: false
  });
  if (media && typeof media.set === 'function') {
    media.set({
      fileUrl: result.secure_url,
      publicId: result.public_id,
      folder: `cloudinary/instagram-${resourceType}`,
      size: result.bytes || media.size || 0
    });
    await media.save().catch(() => {});
  }
  return result.secure_url || '';
}

async function publicMediaUrl(media) {
  if (!media?.fileUrl) return '';
  if (/^https?:\/\//i.test(media.fileUrl) && !isLocalHostUrl(media.fileUrl)) return media.fileUrl;
  const appUrl = publicAppMediaUrl(media.fileUrl);
  if (appUrl) return appUrl;
  return uploadLocalMediaToCloudinary(media, localPublicFilePath(media.fileUrl));
}

async function instagramRequest(pathname, { method = 'GET', body, params } = {}) {
  const url = new URL(`${graphBaseUrl}${pathname}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });
  }
  const requestBody = body ? new URLSearchParams() : undefined;
  if (body) {
    Object.entries(body).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') requestBody.set(key, value);
    });
  }
  const response = await fetch(url, {
    method,
    headers: requestBody ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
    body: requestBody
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new InstagramProviderError(data.error?.message || `Instagram Graph API request failed with ${response.status}.`, data);
  }
  return data;
}

function instagramCaption(post) {
  return [post.caption, post.hashtags?.length ? post.hashtags.join(' ') : ''].filter(Boolean).join('\n\n').slice(0, 2200);
}

async function createMediaContainer({ accountId, accessToken, body }) {
  const result = await instagramRequest(`/${accountId}/media`, {
    method: 'POST',
    body: { ...body, access_token: accessToken }
  });
  if (!result.id) throw new InstagramProviderError('Instagram did not return a media container ID.');
  return result.id;
}

async function waitForContainer(containerId, accessToken) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const status = await instagramRequest(`/${containerId}`, {
      params: { fields: 'status_code,status', access_token: accessToken }
    });
    if (!status.status_code || status.status_code === 'FINISHED') return status;
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new InstagramProviderError(status.status || 'Instagram media container failed processing.', status);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new InstagramProviderError('Instagram is still processing this video after 2 minutes. Try publishing again shortly.');
}

async function publishContainer({ accountId, accessToken, creationId }) {
  const result = await instagramRequest(`/${accountId}/media_publish`, {
    method: 'POST',
    body: {
      creation_id: creationId,
      access_token: accessToken
    }
  });
  if (!result.id) throw new InstagramProviderError('Instagram did not return a published media ID.');
  return result;
}

async function publishImage({ post, accountId, accessToken, image }) {
  const imageUrl = await publicMediaUrl(image);
  if (!imageUrl) throw new InstagramProviderError('Instagram needs a public image URL. Configure Cloudinary or PUBLIC_APP_URL for local files.');
  const creationId = await createMediaContainer({
    accountId,
    accessToken,
    body: {
      image_url: imageUrl,
      caption: instagramCaption(post)
    }
  });
  const published = await publishContainer({ accountId, accessToken, creationId });
  return { id: published.id, raw: published };
}

async function publishVideo({ post, accountId, accessToken, video }) {
  const videoUrl = await publicMediaUrl(video);
  if (!videoUrl) throw new InstagramProviderError('Instagram needs a public video URL. Configure Cloudinary or PUBLIC_APP_URL for local files.');
  const creationId = await createMediaContainer({
    accountId,
    accessToken,
    body: {
      media_type: 'REELS',
      video_url: videoUrl,
      caption: instagramCaption(post)
    }
  });
  await waitForContainer(creationId, accessToken);
  const published = await publishContainer({ accountId, accessToken, creationId });
  return { id: published.id, raw: published };
}

async function publishCarousel({ post, accountId, accessToken, images }) {
  const childIds = [];
  for (const image of images.slice(0, 10)) {
    const imageUrl = await publicMediaUrl(image);
    if (!imageUrl) continue;
    childIds.push(await createMediaContainer({
      accountId,
      accessToken,
      body: {
        image_url: imageUrl,
        is_carousel_item: 'true'
      }
    }));
  }
  if (childIds.length < 2) throw new InstagramProviderError('Instagram carousel publishing needs at least two public image URLs.');
  const creationId = await createMediaContainer({
    accountId,
    accessToken,
    body: {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption: instagramCaption(post)
    }
  });
  const published = await publishContainer({ accountId, accessToken, creationId });
  return { id: published.id, raw: published };
}

async function publishInstagramPost({ post, account }) {
  const accessToken = account.accessTokenEncrypted ? decryptToken(account.accessTokenEncrypted) : '';
  if (!accessToken) throw new InstagramProviderError('Instagram access token is missing. Reconnect through Meta.');
  const accountId = String(account.accountId || '').trim();
  if (!accountId) throw new InstagramProviderError('Instagram Business account ID is missing.');

  const media = Array.isArray(post.media) ? post.media.filter((item) => item?.fileUrl) : [];
  const video = media.find((item) => item.fileType === 'video');
  const images = media.filter((item) => item.fileType === 'image');
  const requestedType = String(post.type || '').toLowerCase();

  if (requestedType === 'video') {
    if (!video) throw new InstagramProviderError('Instagram video posts require a video media file.');
    return publishVideo({ post, accountId, accessToken, video });
  }
  if (requestedType === 'carousel' || images.length > 1) return publishCarousel({ post, accountId, accessToken, images });
  if (images.length === 1) return publishImage({ post, accountId, accessToken, image: images[0] });
  if (video) return publishVideo({ post, accountId, accessToken, video });
  throw new InstagramProviderError('Instagram publishing requires image, carousel, or video media.');
}

module.exports = { InstagramProviderError, publishInstagramPost };
