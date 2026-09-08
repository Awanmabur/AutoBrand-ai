const VideoTemplate = require('../models/VideoTemplate');

const defaultTemplates = [
  {
    name: 'Business Promo',
    category: 'business_promo',
    aspectRatio: '9:16',
    durationSeconds: 15,
    scenes: [
      { name: 'Hook', durationSeconds: 4, requiredFields: ['headline'], layout: 'bold_text_logo' },
      { name: 'Offer', durationSeconds: 7, requiredFields: ['offer', 'price'], layout: 'text_image_logo' },
      { name: 'CTA', durationSeconds: 4, requiredFields: ['cta', 'phone'], layout: 'cta_outro' }
    ]
  },
  {
    name: 'Flash Sale',
    category: 'flash_sale',
    aspectRatio: '9:16',
    durationSeconds: 12,
    scenes: [
      { name: 'Urgency', durationSeconds: 3, requiredFields: ['headline'], layout: 'large_offer' },
      { name: 'Product', durationSeconds: 5, requiredFields: ['offer', 'price'], layout: 'product_focus' },
      { name: 'Action', durationSeconds: 4, requiredFields: ['cta'], layout: 'cta_outro' }
    ]
  },
  {
    name: 'Event Announcement',
    category: 'event_announcement',
    aspectRatio: '1:1',
    durationSeconds: 18,
    scenes: [
      { name: 'Event intro', durationSeconds: 5, requiredFields: ['headline'], layout: 'event_title' },
      { name: 'Details', durationSeconds: 8, requiredFields: ['offer'], layout: 'detail_cards' },
      { name: 'Invite', durationSeconds: 5, requiredFields: ['cta', 'website'], layout: 'cta_outro' }
    ]
  },
  {
    name: 'Real Estate Promo',
    category: 'real_estate_property_promo',
    aspectRatio: '16:9',
    durationSeconds: 20,
    scenes: [
      { name: 'Property hook', durationSeconds: 5, requiredFields: ['headline'], layout: 'wide_title' },
      { name: 'Key features', durationSeconds: 10, requiredFields: ['offer', 'price'], layout: 'feature_list' },
      { name: 'Contact', durationSeconds: 5, requiredFields: ['cta', 'phone'], layout: 'cta_outro' }
    ]
  }
];


function cleanText(value, maxLength) {
  return String(value || '').replace(/\0/g, '').replace(/\r\n?/g, '\n').trim().slice(0, maxLength);
}

function validateRenderInput(body = {}) {
  const value = {
    headline: cleanText(body.headline, 140),
    offer: cleanText(body.offer, 600),
    price: cleanText(body.price, 80),
    cta: cleanText(body.cta, 100),
    phone: cleanText(body.phone, 50),
    website: cleanText(body.website, 300),
    style: cleanText(body.style, 160),
    aspectRatio: ['9:16', '1:1', '16:9'].includes(String(body.aspectRatio || '')) ? String(body.aspectRatio) : ''
  };
  if (!value.headline) throw Object.assign(new Error('Headline is required for template rendering.'), { status: 400 });
  if (!value.offer) throw Object.assign(new Error('Offer/details are required for template rendering.'), { status: 400 });
  if (value.website) {
    let parsed;
    try { parsed = new URL(value.website); } catch (_error) { parsed = null; }
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
      throw Object.assign(new Error('Website must be a valid HTTP or HTTPS URL.'), { status: 400 });
    }
  }
  return value;
}

async function ensureDefaultTemplates() {
  const count = await VideoTemplate.countDocuments();
  if (count) return;
  await VideoTemplate.insertMany(defaultTemplates);
}

function buildRenderInput({ brand, template, body }) {
  const validated = validateRenderInput(body);
  const headline = validated.headline || `${brand.name} ${body.goal || 'promo'}`;
  const offer = validated.offer || brand.offers?.[0]?.title || brand.description || 'A clear offer for your audience';
  const cta = validated.cta || brand.preferredCta || 'Contact us today';

  return {
    headline,
    offer,
    price: validated.price || brand.products?.[0]?.price || '',
    cta,
    phone: validated.phone || '',
    website: validated.website || brand.website || '',
    brandName: brand.name,
    logo: brand.logo || '',
    colors: brand.brandColors || [],
    style: validated.style || brand.localStyle || brand.tone || 'clean, friendly, local',
    aspectRatio: validated.aspectRatio || template.aspectRatio,
    scenes: template.scenes.map((scene, index) => ({
      order: index + 1,
      name: scene.name,
      layout: scene.layout,
      durationSeconds: scene.durationSeconds,
      text: scene.requiredFields.map((field) => ({ field, value: { headline, offer, price: validated.price || '', cta, phone: validated.phone || '', website: validated.website || '' }[field] || '' }))
    }))
  };
}

module.exports = { buildRenderInput, ensureDefaultTemplates, validateRenderInput };
