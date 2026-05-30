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

async function ensureDefaultTemplates() {
  const count = await VideoTemplate.countDocuments();
  if (count) return;
  await VideoTemplate.insertMany(defaultTemplates);
}

function buildRenderInput({ brand, template, body }) {
  const headline = body.headline || `${brand.name} ${body.goal || 'promo'}`;
  const offer = body.offer || brand.offers?.[0]?.title || brand.description || 'A clear offer for your audience';
  const cta = body.cta || brand.preferredCta || 'Contact us today';

  return {
    headline,
    offer,
    price: body.price || brand.products?.[0]?.price || '',
    cta,
    phone: body.phone || '',
    website: body.website || brand.website || '',
    brandName: brand.name,
    logo: brand.logo || '',
    colors: brand.brandColors || [],
    style: body.style || brand.localStyle || brand.tone || 'clean, friendly, local',
    aspectRatio: body.aspectRatio || template.aspectRatio,
    scenes: template.scenes.map((scene, index) => ({
      order: index + 1,
      name: scene.name,
      layout: scene.layout,
      durationSeconds: scene.durationSeconds,
      text: scene.requiredFields.map((field) => ({ field, value: { headline, offer, price: body.price || '', cta, phone: body.phone || '', website: body.website || '' }[field] || '' }))
    }))
  };
}

module.exports = { buildRenderInput, ensureDefaultTemplates };
