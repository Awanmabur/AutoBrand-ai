function list(values = [], fallback = 'not set') {
  if (!Array.isArray(values) || !values.length) return fallback;
  return values.map((item) => {
    if (typeof item === 'string') return item;
    if (item.name || item.title) return [item.name || item.title, item.description || item.price || item.url].filter(Boolean).join(' - ');
    if (item.question) return `${item.question}: ${item.answer || ''}`;
    return JSON.stringify(item);
  }).filter(Boolean).join('; ') || fallback;
}

function buildBrandContext(brand = {}) {
  return [
    `Brand: ${brand.name || 'Unnamed brand'}`,
    `Website: ${brand.website || 'not set'}`,
    `Industry: ${brand.industry || brand.businessType || 'not set'}`,
    `Business type: ${brand.businessType || 'not set'}`,
    `Location: ${brand.location || 'not set'}`,
    `Timezone: ${brand.timezone || 'not set'}`,
    `Language: ${brand.language || 'not set'}`,
    `Target countries: ${list(brand.targetCountries)}`,
    `Slogan/tagline: ${[brand.slogan, brand.tagline].filter(Boolean).join(' / ') || 'not set'}`,
    `Mission: ${brand.mission || 'not set'}`,
    `Vision: ${brand.vision || 'not set'}`,
    `Values: ${list(brand.values)}`,
    `USP: ${brand.uniqueSellingPoint || 'not set'}`,
    `Brand story: ${brand.brandStory || brand.description || 'not set'}`,
    `Audience: ${brand.targetAudience || 'not set'}`,
    `Audience age range: ${brand.audienceAgeRange || 'not set'}`,
    `Audience interests: ${list(brand.audienceInterests)}`,
    `Pain points: ${list(brand.customerPainPoints)}`,
    `Desires: ${list(brand.customerDesires)}`,
    `Objections: ${list(brand.customerObjections || brand.commonObjections)}`,
    `Personas: ${list(brand.customerPersonas)}`,
    `Products: ${list(brand.products)}`,
    `Services: ${list(brand.services)}`,
    `Offers: ${list(brand.offers)}`,
    `Pricing notes: ${brand.pricingNotes || 'not set'}`,
    `Guarantees: ${list(brand.guarantees)}`,
    `FAQs: ${list(brand.faqs)}`,
    `Competitors: ${list(brand.competitors)}`,
    `Competitor links: ${list(brand.competitorLinks)}`,
    `Differentiation: ${brand.differentiationNotes || 'not set'}`,
    `Tone of voice: ${brand.toneOfVoice || brand.tone || 'not set'}`,
    `Writing style: ${brand.writingStyle || 'not set'}`,
    `Banned/blocked words: ${list([...(brand.bannedWords || []), ...(brand.blockedWords || [])], 'none')}`,
    `Preferred words: ${list(brand.preferredWords)}`,
    `Emoji usage: ${brand.emojiUsage || 'not set'}`,
    `Hashtag style: ${brand.hashtagStyle || list(brand.preferredHashtags)}`,
    `Formality: ${brand.formalityLevel || 'not set'}`,
    `Humor: ${brand.humorLevel || 'not set'}`,
    `CTA style: ${brand.ctaStyle || brand.preferredCta || 'not set'}`,
    `Content pillars: ${list(brand.contentPillars)}`,
    `Content do: ${list(brand.contentDos)}`,
    `Content don't: ${list(brand.contentDonts)}`,
    `Compliance notes: ${list(brand.complianceNotes)}`,
    `Default posting times: ${list(brand.defaultPostingTimes || brand.autoPosting?.preferredSlots)}`,
    `Approval required by default: ${brand.approvalRequiredByDefault ? 'yes' : 'no'}`,
    `Saved prompts: ${list(brand.savedPrompts)}`,
    `Rejected styles: ${list(brand.rejectedStyles)}`,
    `Previous best posts: ${list(brand.previousBestPosts)}`,
    `High-performing topics: ${list(brand.highPerformingTopics)}`,
    `Knowledge base: ${list(brand.brandKnowledgeBase)}`
  ].join('\n');
}

function buildComposerDefaults(brand = {}) {
  return {
    tone: brand.toneOfVoice || brand.tone || 'friendly',
    ctaStyle: brand.ctaStyle || brand.preferredCta || 'direct',
    language: brand.language || 'English',
    timezone: brand.timezone || 'Africa/Kampala',
    approvalRequired: Boolean(brand.approvalRequiredByDefault),
    postingTimes: brand.defaultPostingTimes || brand.autoPosting?.preferredSlots || [],
    contentPillars: brand.contentPillars || [],
    blockedWords: [...(brand.bannedWords || []), ...(brand.blockedWords || [])]
  };
}

module.exports = { buildBrandContext, buildComposerDefaults, list };
