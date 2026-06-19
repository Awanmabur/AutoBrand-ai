const WORKFLOWS = new Set(['prompt', 'brand_brain', 'product_promo', 'story_cover', 'reel_cover', 'carousel_image']);

function normalizeImageWorkflow(value) {
  const workflow = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return WORKFLOWS.has(workflow) ? workflow : 'prompt';
}

function workflowLabel(workflow) {
  return {
    prompt: 'Prompt image',
    brand_brain: 'Brand Brain image',
    product_promo: 'Product promo image',
    story_cover: 'Story cover',
    reel_cover: 'Reel cover',
    carousel_image: 'Carousel image'
  }[normalizeImageWorkflow(workflow)];
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function imageCountForWorkflow(body = {}) {
  const workflow = normalizeImageWorkflow(body.imageWorkflow || body.workflow || body.imageType);
  const requested = body.imageCount || body.slideCount || body.count;
  if (workflow === 'carousel_image') return clamp(requested, 2, 5, 3);
  return clamp(requested, 1, 5, 1);
}

function aspectRatioForWorkflow(body = {}) {
  if (body.aspectRatio || body.imageAspectRatio) return body.aspectRatio || body.imageAspectRatio;
  const workflow = normalizeImageWorkflow(body.imageWorkflow || body.workflow || body.imageType);
  if (workflow === 'story_cover' || workflow === 'reel_cover') return '9:16';
  if (body.imageSize === '1536x1024') return '16:9';
  if (body.imageSize === '1024x1536') return '9:16';
  return '1:1';
}

function imageSizeForWorkflow(body = {}) {
  if (body.imageSize || body.size) return body.imageSize || body.size;
  const workflow = normalizeImageWorkflow(body.imageWorkflow || body.workflow || body.imageType);
  if (workflow === 'story_cover' || workflow === 'reel_cover') return '1024x1536';
  if (workflow === 'carousel_image') return '1024x1024';
  return '1024x1024';
}

function providerFromBody(body = {}) {
  const provider = String(body.imageProvider || body.provider || '').trim().toLowerCase();
  return ['openai', 'replicate', 'gemini', 'local'].includes(provider) ? provider : undefined;
}

function postTypeForImageWorkflow(workflow) {
  const normalized = normalizeImageWorkflow(workflow);
  if (normalized === 'carousel_image') return 'carousel';
  if (normalized === 'story_cover') return 'story';
  if (normalized === 'reel_cover') return 'reel';
  return 'image';
}

function providerPostTypeForWorkflow(workflow) {
  const normalized = normalizeImageWorkflow(workflow);
  if (normalized === 'carousel_image') return 'carousel';
  if (normalized === 'story_cover' || normalized === 'reel_cover') return 'video';
  return 'image';
}

function textList(values = [], mapper = (item) => item) {
  if (!Array.isArray(values)) return '';
  return values.map(mapper).map((item) => String(item || '').trim()).filter(Boolean).join('; ');
}

function productSummary(brand = {}, body = {}) {
  const typed = [body.productName, body.productDescription, body.productPrice].filter(Boolean).join(' ');
  if (typed) return typed;
  const productsAndServices = [...(brand.products || []), ...(brand.services || [])];
  return textList(productsAndServices, (item) => [item.name, item.price, item.description].filter(Boolean).join(' '));
}

function offerSummary(brand = {}, body = {}) {
  if (body.offer) return body.offer;
  return textList(brand.offers || [], (item) => [item.title, item.description].filter(Boolean).join(' '));
}

function workflowDirection({ workflow, index = 0, count = 1 }) {
  const normalized = normalizeImageWorkflow(workflow);
  if (normalized === 'brand_brain') {
    return 'Create a brand-consistent hero social image from the saved Brand Brain. It should communicate the brand personality, audience, offer, CTA, and visual style without looking like a plain text poster.';
  }
  if (normalized === 'product_promo') {
    return 'Create a high-converting product or service promo image with the product/service as the hero, clear commercial context, trust cues, and tasteful space for a short CTA.';
  }
  if (normalized === 'story_cover') {
    return 'Create a vertical story cover with safe space for platform UI, strong first-glance hook, minimal readable text, and mobile-first framing.';
  }
  if (normalized === 'reel_cover') {
    return 'Create a vertical Reel/TikTok/Shorts cover that feels like the opening frame of a short video, with motion implied, strong subject focus, and minimal text.';
  }
  if (normalized === 'carousel_image') {
    return `Create carousel image ${Number(index) + 1} of ${Number(count) || 1}. Each card must be visually distinct, brand-consistent, and useful as a swipeable social carousel image. Avoid plain quote cards or text-heavy slides.`;
  }
  return 'Create a polished social media image from the user prompt while using Brand Brain context for audience, tone, color, offer, and CTA.';
}

function buildImageWorkflowPrompt({ brand = {}, body = {}, workflow, index = 0, count = 1 }) {
  const normalized = normalizeImageWorkflow(workflow || body.imageWorkflow || body.workflow || body.imageType);
  const products = productSummary(brand, body) || 'not set';
  const offers = offerSummary(brand, body) || 'not set';
  const rules = textList(brand.brandRules || []) || 'none';
  const blockedWords = textList(brand.blockedWords || []) || 'none';
  const keywords = textList(brand.keywords || []) || 'not set';
  const userPrompt = String(body.prompt || body.imagePrompt || '').trim();
  return [
    workflowDirection({ workflow: normalized, index, count }),
    userPrompt ? `User prompt: ${userPrompt}` : '',
    `Brand: ${brand.name || 'Untitled brand'}. Industry: ${brand.businessType || brand.industry || 'business'}.`,
    `Description: ${brand.description || 'not set'}. Location: ${brand.location || 'not set'}.`,
    `Audience: ${body.audience || brand.targetAudience || 'target customers'}. Tone: ${body.tone || brand.tone || 'clean, professional, friendly'}.`,
    `Brand colors: ${(brand.brandColors || []).join(', ') || 'not set'}. CTA: ${body.cta || brand.preferredCta || 'not set'}.`,
    `Products/services: ${products}. Offers: ${offers}.`,
    `Keywords: ${keywords}. Brand rules: ${rules}. Blocked words to avoid: ${blockedWords}.`,
    `Platform: ${body.platform || 'facebook'}. Goal: ${body.goal || 'promote the brand clearly and safely'}.`,
    'Make the image brand-safe, commercially useful, realistic or premium illustrated, and ready to save in the media library.',
    'Avoid copyrighted third-party logos, misleading claims, restricted content, distorted people, unreadable text, and cluttered poster layouts.'
  ].filter(Boolean).join('\n');
}

function imageTagsForWorkflow(workflow, body = {}) {
  const normalized = normalizeImageWorkflow(workflow || body.imageWorkflow || body.workflow || body.imageType);
  return ['ai', 'generated', normalized.replace(/_/g, '-'), body.platform || 'social'].filter(Boolean);
}

function imageCreditsForResults(results = []) {
  return Math.max(1, results.reduce((total, result) => total + (result.provider === 'local_fallback' ? 1 : 3), 0));
}

module.exports = {
  aspectRatioForWorkflow,
  buildImageWorkflowPrompt,
  imageCountForWorkflow,
  imageCreditsForResults,
  imageSizeForWorkflow,
  imageTagsForWorkflow,
  normalizeImageWorkflow,
  postTypeForImageWorkflow,
  providerFromBody,
  providerPostTypeForWorkflow,
  workflowLabel
};
