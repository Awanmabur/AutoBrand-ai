const CHECKLIST_SECTIONS = [
  {
    title: 'Business identity',
    items: [
      { key: 'name', label: 'Business name', fields: ['name'] },
      { key: 'industry', label: 'Industry', fields: ['industry', 'businessType'] },
      { key: 'description', label: 'Description', fields: ['description', 'brandStory'] },
      { key: 'website', label: 'Website', fields: ['website'] },
      { key: 'location', label: 'Location', fields: ['location'] },
      { key: 'logo', label: 'Logo', fields: ['logo'] },
      { key: 'brandColors', label: 'Brand colors', fields: ['brandColors'] }
    ]
  },
  {
    title: 'Audience and voice',
    items: [
      { key: 'targetAudience', label: 'Target audience', fields: ['targetAudience'] },
      { key: 'tone', label: 'Brand tone', fields: ['tone', 'toneOfVoice'] },
      { key: 'keywords', label: 'Keywords', fields: ['keywords', 'preferredWords'] },
      { key: 'blockedWords', label: 'Blocked words', fields: ['blockedWords', 'bannedWords'] },
      { key: 'brandRules', label: 'Brand rules', fields: ['brandRules', 'contentDos', 'contentDonts'] }
    ]
  },
  {
    title: 'Offers and conversion',
    items: [
      { key: 'productsServices', label: 'Products/services', fields: ['products', 'services'] },
      { key: 'offers', label: 'Offers', fields: ['offers'] },
      { key: 'ctas', label: 'CTAs', fields: ['preferredCta', 'ctaStyle'] },
      { key: 'faqs', label: 'FAQs', fields: ['faqs'] },
      { key: 'testimonials', label: 'Testimonials', fields: ['testimonials'] }
    ]
  },
  {
    title: 'Market and channels',
    items: [
      { key: 'competitors', label: 'Competitors', fields: ['competitors', 'competitorLinks'] },
      { key: 'socialLinks', label: 'Social links', fields: ['socialLinks'] },
      { key: 'contentPillars', label: 'Content pillars', fields: ['contentPillars'] },
      { key: 'preferredHashtags', label: 'Preferred hashtags', fields: ['preferredHashtags'] }
    ]
  }
];

const REQUIRED_FIELDS = CHECKLIST_SECTIONS.flatMap((section) => section.items.map((item) => item.key));

function hasValue(value) {
  if (Array.isArray(value)) return value.some(hasValue);
  if (value && typeof value === 'object') return Object.values(value).some(hasValue);
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function itemComplete(brand, item) {
  return item.fields.some((field) => hasValue(brand[field]));
}

function buildBrandChecklist(brand = {}) {
  const sections = CHECKLIST_SECTIONS.map((section) => ({
    title: section.title,
    items: section.items.map((item) => ({
      key: item.key,
      label: item.label,
      complete: itemComplete(brand, item),
      fields: item.fields
    }))
  }));
  const items = sections.flatMap((section) => section.items);
  const complete = items.filter((item) => item.complete).length;
  const total = items.length;
  const missingFields = items.filter((item) => !item.complete).map((item) => item.key);
  const score = total ? Math.round((complete / total) * 100) : 0;

  return {
    score,
    complete,
    total,
    missingFields,
    sections,
    nextItems: items.filter((item) => !item.complete).slice(0, 6),
    suggestions: items
      .filter((item) => !item.complete)
      .slice(0, 12)
      .map((item) => `Add ${item.label.toLowerCase()} to improve AI output quality.`)
  };
}

function calculateBrandScore(brand = {}) {
  const checklist = buildBrandChecklist(brand);
  return {
    score: checklist.score,
    complete: checklist.complete,
    total: checklist.total,
    missingFields: checklist.missingFields,
    suggestions: checklist.suggestions
  };
}

function buildBrandVoiceSummary(brand = {}) {
  const tone = brand.toneOfVoice || brand.tone || 'clear and helpful';
  const audience = brand.targetAudience || 'the saved target audience';
  const cta = brand.ctaStyle || brand.preferredCta || 'a clear next step';
  const blocked = [...(brand.blockedWords || []), ...(brand.bannedWords || [])].filter(Boolean);
  return [
    `${brand.name || 'This brand'} should speak in a ${tone} tone for ${audience}.`,
    `Use ${cta} as the conversion style.`,
    blocked.length ? `Avoid: ${blocked.slice(0, 8).join(', ')}.` : ''
  ].filter(Boolean).join(' ');
}

async function updateBrandScore(brand) {
  const result = calculateBrandScore(brand);
  brand.brandCompletenessScore = result.score;
  brand.brandVoiceSummary = buildBrandVoiceSummary(brand);
  brand.lastScoredAt = new Date();
  if (typeof brand.save === 'function') await brand.save();
  return result;
}

module.exports = {
  CHECKLIST_SECTIONS,
  REQUIRED_FIELDS,
  buildBrandChecklist,
  buildBrandVoiceSummary,
  calculateBrandScore,
  updateBrandScore
};
