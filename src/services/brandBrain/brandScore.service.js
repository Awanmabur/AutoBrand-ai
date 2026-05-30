const REQUIRED_FIELDS = [
  'logo', 'favicon', 'coverImage', 'brandColors', 'fonts', 'website', 'industry', 'businessType', 'location', 'timezone',
  'language', 'targetCountries', 'slogan', 'tagline', 'mission', 'vision', 'values', 'uniqueSellingPoint', 'brandStory',
  'targetAudience', 'audienceAgeRange', 'audienceInterests', 'customerPainPoints', 'customerDesires', 'customerObjections',
  'customerPersonas', 'products', 'services', 'offers', 'pricingNotes', 'guarantees', 'faqs', 'competitors', 'competitorLinks',
  'differentiationNotes', 'toneOfVoice', 'writingStyle', 'bannedWords', 'preferredWords', 'emojiUsage', 'hashtagStyle',
  'formalityLevel', 'humorLevel', 'ctaStyle', 'contentPillars', 'contentDos', 'contentDonts', 'complianceNotes',
  'defaultPostingTimes', 'savedPrompts', 'previousBestPosts', 'highPerformingTopics', 'brandKnowledgeBase'
];

const LABELS = REQUIRED_FIELDS.reduce((map, field) => {
  map[field] = field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
  return map;
}, {});

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function calculateBrandScore(brand = {}) {
  const missingFields = REQUIRED_FIELDS.filter((field) => !hasValue(brand[field]));
  const complete = REQUIRED_FIELDS.length - missingFields.length;
  const score = Math.round((complete / REQUIRED_FIELDS.length) * 100);
  return {
    score,
    complete,
    total: REQUIRED_FIELDS.length,
    missingFields,
    suggestions: missingFields.slice(0, 12).map((field) => `Add ${LABELS[field].toLowerCase()} to improve AI output quality.`)
  };
}

async function updateBrandScore(brand) {
  const result = calculateBrandScore(brand);
  brand.brandCompletenessScore = result.score;
  brand.lastScoredAt = new Date();
  if (typeof brand.save === 'function') await brand.save();
  return result;
}

module.exports = { REQUIRED_FIELDS, calculateBrandScore, updateBrandScore };
