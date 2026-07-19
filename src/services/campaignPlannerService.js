const CAMPAIGN_GOALS = [
  'awareness',
  'engagement',
  'leads',
  'sales',
  'product_launch',
  'event_promotion',
  'offer_sale',
  'brand_growth'
];

const GOAL_LABELS = {
  awareness: 'Awareness',
  engagement: 'Engagement',
  leads: 'Leads',
  sales: 'Sales',
  product_launch: 'Product launch',
  event_promotion: 'Event promotion',
  offer_sale: 'Offer/sale',
  brand_growth: 'Brand growth'
};

function titleCase(value = '') {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function normalizeGoal(value = '') {
  const key = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (key === 'offer' || key === 'sale') return 'offer_sale';
  if (key === 'launch') return 'product_launch';
  if (key === 'event') return 'event_promotion';
  return CAMPAIGN_GOALS.includes(key) ? key : 'awareness';
}

function splitPlatforms(value) {
  const items = Array.isArray(value) ? value : String(value || '').split(/[\n,]+/);
  return [...new Set(items.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))];
}

function firstValue(values = [], fallback = '') {
  return (Array.isArray(values) ? values : []).map((item) => {
    if (!item) return '';
    if (typeof item === 'string') return item;
    return item.title || item.name || item.description || item.body || item.quote || '';
  }).find(Boolean) || fallback;
}

function brandKeywords(brand = {}) {
  return [...new Set([
    ...(brand.keywords || []),
    ...(brand.preferredHashtags || []).map((tag) => String(tag).replace(/^#/, '')),
    brand.businessType,
    brand.industry,
    brand.location
  ].map((item) => String(item || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')).filter(Boolean))].slice(0, 12);
}

function hashtagsFor(brand = {}, platform = 'facebook', goal = 'awareness') {
  const preferred = (brand.preferredHashtags || []).map((tag) => String(tag).startsWith('#') ? String(tag) : `#${tag}`);
  const generated = [
    brand.name,
    brand.businessType || brand.industry,
    brand.location,
    GOAL_LABELS[goal] || goal,
    platform === 'tiktok' ? 'Shorts' : platform
  ].map((tag) => String(tag || '').replace(/[^a-z0-9]+/gi, '')).filter(Boolean).map((tag) => `#${tag}`);
  return [...new Set([...preferred, ...generated])].slice(0, platform === 'x' ? 4 : 12);
}

function ctaFor(brand = {}, goal = 'awareness') {
  if (brand.preferredCta) return brand.preferredCta;
  const offer = firstValue(brand.offers, '');
  if (goal === 'sales' || goal === 'offer_sale') return offer ? `Claim ${offer} today.` : 'Book or buy today.';
  if (goal === 'leads') return 'Message us to get started.';
  if (goal === 'engagement') return 'Reply with your biggest question.';
  if (goal === 'event_promotion') return 'Reserve your spot today.';
  if (goal === 'product_launch') return 'Be first to try it.';
  return 'Follow for the next update.';
}

function campaignThemes(goal = 'awareness') {
  const shared = ['Hook', 'Education', 'Proof', 'Offer', 'Reminder', 'FAQ', 'Behind the scenes'];
  const themes = {
    awareness: ['Brand story', 'Problem', 'Solution', 'Social proof', 'Local relevance', 'Founder note', 'Reminder'],
    engagement: ['Question', 'Tip', 'Poll prompt', 'Customer story', 'Myth busting', 'Behind the scenes', 'Conversation starter'],
    leads: ['Pain point', 'Lead magnet', 'FAQ', 'Proof', 'Objection answer', 'CTA', 'Reminder'],
    sales: ['Offer hook', 'Benefit', 'Proof', 'Product spotlight', 'Scarcity', 'CTA', 'Last call'],
    product_launch: ['Teaser', 'Problem', 'Reveal', 'Feature', 'Proof', 'Use case', 'Launch CTA'],
    event_promotion: ['Announcement', 'Why attend', 'Speaker/story', 'FAQ', 'Countdown', 'Social proof', 'Last call'],
    offer_sale: ['Offer hook', 'Value stack', 'Customer benefit', 'Proof', 'Urgency', 'FAQ', 'Last call'],
    brand_growth: ['Brand story', 'Values', 'Education', 'Proof', 'Community prompt', 'Behind the scenes', 'CTA']
  };
  return themes[goal] || shared;
}

function platformPostType(platform = 'facebook', index = 0) {
  if (platform === 'tiktok' || platform === 'youtube') return 'reel';
  if (platform === 'instagram') return index % 3 === 0 ? 'carousel' : 'image';
  if (platform === 'pinterest') return 'image';
  if (platform === 'linkedin') return 'article';
  return 'text';
}

function captionFor({ brand = {}, goal = 'awareness', platform = 'facebook', theme = 'Hook', day = 1 }) {
  const audience = brand.targetAudience || 'your customers';
  const offer = firstValue(brand.offers, firstValue(brand.products, firstValue(brand.services, 'the next step')));
  const proof = firstValue(brand.testimonials, brand.uniqueSellingPoint || brand.description || 'real value');
  const cta = ctaFor(brand, goal);
  const lead = platform === 'linkedin'
    ? `${theme}: ${audience} need a clear reason to trust ${brand.name || 'this brand'}.`
    : `${theme}: ${offer} for ${audience}.`;
  const middle = goal === 'sales' || goal === 'offer_sale'
    ? `Day ${day} focus: show the benefit, reduce friction, and make the offer easy to act on.`
    : `Day ${day} focus: connect the brand promise to a useful next step.`;
  return `${lead} ${middle} ${proof}. ${cta}`;
}

function buildPlanItems({ brand = {}, goal = 'awareness', platforms = [], durationDays = 7 }) {
  const days = Math.max(1, Math.min(30, Number(durationDays || 7)));
  const platformList = platforms.length ? platforms : ['facebook', 'instagram', 'linkedin'];
  const themes = campaignThemes(goal);
  return Array.from({ length: days }, (_, index) => {
    const platform = platformList[index % platformList.length];
    const theme = themes[index % themes.length];
    const day = index + 1;
    return {
      day,
      platform,
      type: platformPostType(platform, index),
      contentType: theme.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      title: `${theme} - ${brand.name || 'Brand'}`,
      caption: captionFor({ brand, goal, platform, theme, day }),
      hashtags: hashtagsFor(brand, platform, goal),
      creativeDirection: `Use ${brand.name || 'brand'} colors, a clear ${theme.toLowerCase()} visual, and one visible CTA.`,
      bestTimeHint: index % 3 === 0 ? '8:00 AM' : index % 3 === 1 ? '1:00 PM' : '7:00 PM'
    };
  });
}

function buildCreativeIdeas({ brand = {}, goal = 'awareness', platforms = [] }) {
  const offer = firstValue(brand.offers, firstValue(brand.products, 'the main offer'));
  const platformList = platforms.length ? platforms : ['facebook', 'instagram', 'linkedin'];
  return [
    ['Before and after', `Show the customer situation before and after ${offer}.`, 'carousel'],
    ['Proof snapshot', `Turn a testimonial or result into a trust-building visual.`, 'image'],
    ['Quick tip', `Teach one useful idea that points back to ${brand.name || 'the brand'}.`, 'short_video'],
    ['Offer reminder', `Make the CTA visible and simple for ${GOAL_LABELS[goal] || titleCase(goal)}.`, 'image'],
    ['FAQ answer', `Answer a common buyer question in a calm, direct tone.`, 'text']
  ].map(([title, description, format], index) => ({
    title,
    description,
    format,
    platform: platformList[index % platformList.length]
  }));
}

function buildVideoScripts({ brand = {}, goal = 'awareness', platforms = [] }) {
  const videoPlatforms = (platforms.length ? platforms : ['instagram', 'tiktok', 'youtube'])
    .filter((platform) => ['instagram', 'tiktok', 'youtube', 'facebook'].includes(platform));
  const list = videoPlatforms.length ? videoPlatforms : ['instagram'];
  const offer = firstValue(brand.offers, firstValue(brand.products, 'the offer'));
  return list.slice(0, 4).map((platform) => ({
    platform,
    title: `${titleCase(platform)} short video for ${GOAL_LABELS[goal] || titleCase(goal)}`,
    hook: `Need ${offer}?`,
    scenes: [
      { order: 1, title: 'Hook', narration: `Need ${offer}?`, durationSeconds: 3 },
      { order: 2, title: 'Problem', narration: brand.customerPainPoints?.[0] || 'The usual way takes too much time.', durationSeconds: 4 },
      { order: 3, title: 'Solution', narration: `${brand.name || 'This brand'} makes the next step easier.`, durationSeconds: 5 },
      { order: 4, title: 'CTA', narration: ctaFor(brand, goal), durationSeconds: 3 }
    ],
    cta: ctaFor(brand, goal)
  }));
}

function buildWhatsAppMessages({ brand = {}, goal = 'awareness' }) {
  const offer = firstValue(brand.offers, firstValue(brand.products, firstValue(brand.services, 'today\'s offer')));
  return [
    {
      title: 'Warm promo',
      message: `Hi, ${brand.name || 'we'} have ${offer} ready for you. ${ctaFor(brand, goal)}`
    },
    {
      title: 'Reminder',
      message: `Quick reminder from ${brand.name || 'us'}: ${offer} is available now. Reply here if you want details.`
    }
  ];
}

function buildCampaignPlan({ brand = {}, goal, campaignType, platforms = [], durationDays = 7 } = {}) {
  const normalizedGoal = normalizeGoal(campaignType || goal);
  const platformList = splitPlatforms(platforms);
  const weeklyPlan = buildPlanItems({ brand, goal: normalizedGoal, platforms: platformList, durationDays: 7 });
  const monthlyPlan = buildPlanItems({ brand, goal: normalizedGoal, platforms: platformList, durationDays: 30 });
  const postIdeas = buildPlanItems({ brand, goal: normalizedGoal, platforms: platformList, durationDays });
  const captions = postIdeas.map((idea) => ({
    day: idea.day,
    platform: idea.platform,
    title: idea.title,
    caption: idea.caption,
    hashtags: idea.hashtags
  }));
  const hashtagPack = [...new Set(postIdeas.flatMap((idea) => idea.hashtags || []))].slice(0, 30);

  return {
    campaignType: normalizedGoal,
    goalLabel: GOAL_LABELS[normalizedGoal] || titleCase(normalizedGoal),
    strategy: {
      objective: goal || GOAL_LABELS[normalizedGoal] || titleCase(normalizedGoal),
      audience: brand.targetAudience || 'Saved Brand Brain audience',
      positioning: brand.uniqueSellingPoint || brand.description || `${brand.name || 'The brand'} should be clear, useful, and easy to act on.`,
      primaryCta: ctaFor(brand, normalizedGoal),
      keywords: brandKeywords(brand)
    },
    contentPillars: campaignThemes(normalizedGoal).slice(0, 6),
    suggestedTimes: ['8:00 AM', '1:00 PM', '7:00 PM'],
    postIdeas,
    captions,
    hashtags: hashtagPack,
    creativeIdeas: buildCreativeIdeas({ brand, goal: normalizedGoal, platforms: platformList }),
    videoScripts: buildVideoScripts({ brand, goal: normalizedGoal, platforms: platformList }),
    whatsappMessages: buildWhatsAppMessages({ brand, goal: normalizedGoal }),
    weeklyPlan,
    monthlyPlan
  };
}

module.exports = {
  CAMPAIGN_GOALS,
  buildCampaignPlan,
  normalizeGoal,
  splitPlatforms
};
