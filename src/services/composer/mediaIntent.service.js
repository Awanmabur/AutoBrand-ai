const IMAGE_PRESETS = new Set(['image-1', 'image-2', 'image-3', 'image-4', 'image-5']);
const CAROUSEL_PRESETS = new Set(['carousel-2', 'carousel-3', 'carousel-4', 'carousel-5']);

const VIDEO_TYPES = new Set(['video', 'reel', 'short', 'short_video']);
const IMAGE_TYPES = new Set(['image', 'story']);
const TEXT_TYPES = new Set(['text', 'article']);

function clampCount(value, { min = 1, max = 5, fallback = 1 } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizePostType(value = '') {
  const type = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (VIDEO_TYPES.has(type)) return type === 'short' || type === 'short_video' ? 'reel' : type;
  if (IMAGE_TYPES.has(type)) return type;
  if (TEXT_TYPES.has(type)) return type;
  if (type === 'carousel' || type === 'campaign') return type;
  return 'image';
}

function parseMediaPreset(value = '') {
  const preset = String(value || '').trim().toLowerCase();
  if (preset === 'video') return { preset: 'video', kind: 'video', count: 1 };
  if (preset === 'text') return { preset: 'text', kind: 'text', count: 0 };
  const match = preset.match(/^(image|carousel)-(\d)$/);
  if (!match) return { preset: '', kind: '', count: 0 };
  const kind = match[1];
  const count = clampCount(match[2], { min: kind === 'carousel' ? 2 : 1, max: 5, fallback: kind === 'carousel' ? 3 : 1 });
  return { preset: `${kind}-${count}`, kind, count };
}

function formatFromPreset(kind, count) {
  if (kind === 'carousel') return `carousel-${clampCount(count, { min: 2, max: 5, fallback: 3 })}`;
  if (kind === 'image') return `image-${clampCount(count, { min: 1, max: 5, fallback: 1 })}`;
  if (kind === 'video') return 'video';
  return 'text';
}

function resolveComposerMediaIntent(body = {}) {
  const next = { ...body };
  const requestedType = normalizePostType(next.type || next.postFormat || next.contentFormat || 'image');
  const parsed = parseMediaPreset(next.mediaPreset);
  const bodyCount = Number(next.imageCount || next.imagesPerPostMax || 0);
  let count = parsed.count || bodyCount || 1;
  let type = requestedType;
  let mediaPreset = parsed.preset;
  let mediaFormat = next.mediaFormat || '';
  let allowedMediaTypes = [];
  let shouldGenerateImage = false;
  let shouldGenerateVideo = false;

  if (VIDEO_TYPES.has(type)) {
    type = type === 'reel' ? 'reel' : 'video';
    mediaPreset = 'video';
    mediaFormat = 'short_video';
    count = 1;
    allowedMediaTypes = ['video'];
    shouldGenerateVideo = true;
    next.generateImage = undefined;
    next.imageCount = 1;
    next.externalMediaType = 'video';
  } else if (type === 'carousel') {
    count = clampCount(bodyCount > 0 ? bodyCount : parsed.count || 3, { min: 2, max: 5, fallback: 3 });
    mediaPreset = formatFromPreset('carousel', count);
    mediaFormat = 'carousel_slides';
    allowedMediaTypes = ['image'];
    shouldGenerateImage = true;
    next.generateImage = 'on';
    next.imageCount = count;
    next.externalMediaType = next.externalMediaType === 'video' ? 'image' : (next.externalMediaType || 'image');
  } else if (IMAGE_TYPES.has(type) || type === 'campaign') {
    type = type === 'campaign' ? 'campaign' : 'image';
    if (parsed.kind === 'carousel') {
      type = 'carousel';
      count = clampCount(bodyCount > 0 ? bodyCount : parsed.count || 3, { min: 2, max: 5, fallback: 3 });
      mediaPreset = formatFromPreset('carousel', count);
      mediaFormat = 'carousel_slides';
    } else {
      count = clampCount(bodyCount > 0 ? bodyCount : parsed.kind === 'image' ? parsed.count : 1, { min: 1, max: 5, fallback: 1 });
      mediaPreset = formatFromPreset('image', count);
      mediaFormat = 'text_image';
    }
    allowedMediaTypes = ['image'];
    shouldGenerateImage = true;
    next.generateImage = 'on';
    next.imageCount = count;
    next.externalMediaType = next.externalMediaType === 'video' ? 'image' : (next.externalMediaType || 'image');
  } else if (TEXT_TYPES.has(type)) {
    type = type === 'article' ? 'article' : 'text';
    mediaPreset = 'text';
    mediaFormat = 'text_only';
    count = 0;
    allowedMediaTypes = [];
    next.generateImage = undefined;
    next.imageCount = 0;
    next.externalMediaType = '';
  }

  next.type = type;
  next.mediaPreset = mediaPreset || formatFromPreset('image', count);
  next.mediaFormat = mediaFormat;
  next.imageCount = count;
  next.__mediaIntent = {
    type,
    mediaPreset: next.mediaPreset,
    mediaFormat: next.mediaFormat,
    imageCount: count,
    allowedMediaTypes,
    shouldGenerateImage,
    shouldGenerateVideo
  };
  return next;
}

function mediaIntentAllowsType(intent = {}, fileType = '') {
  const allowed = Array.isArray(intent.allowedMediaTypes) ? intent.allowedMediaTypes : [];
  if (!allowed.length) return false;
  return allowed.includes(String(fileType || '').toLowerCase());
}

module.exports = {
  IMAGE_PRESETS,
  CAROUSEL_PRESETS,
  normalizePostType,
  parseMediaPreset,
  resolveComposerMediaIntent,
  mediaIntentAllowsType
};
