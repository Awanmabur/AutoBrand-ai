const { buildCampaignPlan } = require('./campaignPlannerService');
const { planAutomaticVideoScenes } = require('./videoPlannerService');

function compactList(values, fallback) {
  const list = Array.isArray(values) ? values.map((item) => String(item || '').trim()).filter(Boolean) : [];
  return list.length ? list : fallback;
}

function platformList(value) {
  return String(value || 'facebook, instagram, tiktok')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function makeHashtags(brand, campaignGoal) {
  const base = [
    brand.name,
    brand.businessType,
    brand.location,
    campaignGoal,
    ...(brand.preferredHashtags || [])
  ]
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2);

  const unique = Array.from(new Set(base)).slice(0, 18);
  return unique.map((word) => `#${word}`);
}

function brandAudit(brand) {
  const wins = [];
  const gaps = [];
  const nextMoves = [];

  if (brand.description) wins.push('Clear business description is saved in the Brand Brain.');
  else gaps.push('Add a short business description so generated content has sharper context.');

  if ((brand.products || []).length) wins.push('Products or services are listed.');
  else gaps.push('Add products, prices, or packages for better offer posts.');

  if ((brand.offers || []).length) wins.push('Offers are ready for campaign use.');
  else gaps.push('Create at least one offer for launch and retargeting content.');

  if ((brand.preferredHashtags || []).length) wins.push('Preferred hashtags are available.');
  else gaps.push('Save a preferred hashtag set to keep posts consistent.');

  if (brand.preferredCta) wins.push('Preferred call to action is set.');
  else gaps.push('Add a default CTA such as Call now, Book today, or Order on WhatsApp.');

  nextMoves.push('Generate a seven-day content batch and schedule the strongest posts.');
  nextMoves.push('Create one short vertical video storyboard for the current offer.');
  nextMoves.push('Connect a social account when provider credentials are ready.');

  return {
    title: `${brand.name} brand readiness audit`,
    summary: `${wins.length} strengths found and ${gaps.length} improvements recommended.`,
    sections: [
      { heading: 'Strengths', items: wins.length ? wins : ['The brand exists and can already generate basic content.'] },
      { heading: 'Gaps', items: gaps.length ? gaps : ['No major Brand Brain gaps found for the current MVP workflow.'] },
      { heading: 'Next moves', items: nextMoves }
    ]
  };
}

function competitorSnapshot(brand, campaignGoal) {
  const competitors = compactList(brand.competitors, ['Direct local competitors', 'Larger established brands', 'Informal social sellers']);
  return {
    title: `${brand.name} competitor snapshot`,
    summary: `Position ${brand.name} around speed, trust, proof, and a clear offer${campaignGoal ? ` for ${campaignGoal}` : ''}.`,
    sections: [
      {
        heading: 'Watch list',
        items: competitors.map((competitor) => `${competitor}: track pricing, posting rhythm, proof, and customer complaints.`)
      },
      {
        heading: 'Differentiation angles',
        items: [
          `Lead with the clearest customer pain point: ${brand.customerPainPoints?.[0] || 'save time and reduce uncertainty'}.`,
          `Use local proof: ${brand.testimonials?.[0]?.quote || 'customer quotes, delivery screenshots, and before/after results'}.`,
          `Make the CTA obvious: ${brand.preferredCta || 'message, call, book, or buy today'}.`
        ]
      }
    ]
  };
}

function offerAngles(brand, campaignGoal) {
  const products = compactList((brand.products || []).map((product) => product.name), [brand.businessType || 'main service']);
  return {
    title: `${brand.name} offer angles`,
    summary: `Reusable hooks and angles for ${campaignGoal || brand.preferredCta || 'the next campaign'}.`,
    sections: [
      {
        heading: 'Hooks',
        items: [
          `Stop losing time to ${brand.customerPainPoints?.[0] || 'the same old problem'}.`,
          `${products[0]} made simpler for ${brand.targetAudience || 'busy customers'}.`,
          `The local, no-confusion way to get ${products[0]}.`
        ]
      },
      {
        heading: 'Trust builders',
        items: [
          brand.testimonials?.[0]?.quote || 'Show a customer result or short testimonial.',
          'Add one proof point in the first two lines.',
          'Use simple pricing, timing, or availability details.'
        ]
      }
    ]
  };
}

function contentIdeas(brand, campaignGoal) {
  const products = compactList((brand.products || []).map((product) => product.name), [brand.businessType || 'main offer']);
  return {
    title: `${brand.name} content ideas`,
    summary: `Reusable content ideas for ${campaignGoal || brand.targetAudience || 'the next campaign'}.`,
    sections: [
      {
        heading: 'Post ideas',
        items: [
          `Teach: explain one mistake ${brand.targetAudience || 'customers'} make before choosing ${products[0]}.`,
          `Proof: show a testimonial, result, or behind-the-scenes moment.`,
          `Offer: turn ${brand.offers?.[0]?.title || products[0]} into a clear benefit-led post.`,
          `FAQ: answer the most common buyer question in plain language.`,
          `Local relevance: connect ${brand.name} to ${brand.location || 'the customer location'}.`
        ]
      }
    ]
  };
}

function hookGenerator(brand, campaignGoal) {
  const offer = brand.offers?.[0]?.title || brand.products?.[0]?.name || brand.businessType || 'this offer';
  return {
    title: `${brand.name} hook pack`,
    summary: `Scroll-stopping hooks for ${campaignGoal || offer}.`,
    sections: [
      {
        heading: 'Hooks',
        items: [
          `If ${brand.targetAudience || 'you'} need ${offer}, start here.`,
          `Most people miss this before choosing ${offer}.`,
          `The faster way to get ${offer} without the usual stress.`,
          `${brand.location || 'Local'} customers: this is for you.`,
          `Before you book, check this one detail.`
        ]
      }
    ]
  };
}

function reelScriptGenerator(brand, campaignGoal) {
  const storyboard = videoStoryboard({ brand, campaignGoal, platform: 'instagram', style: 'fast social promo' });
  return {
    title: `${brand.name} reel script`,
    summary: `Short-form script for ${campaignGoal || brand.preferredCta || 'brand growth'}.`,
    sections: [
      { heading: 'Hook', items: [storyboard.scenePlan[0]?.narration || `Need ${brand.name}?`] },
      { heading: 'Scenes', items: storyboard.scenePlan.map((scene) => `${scene.title}: ${scene.narration}`) },
      { heading: 'CTA', items: [brand.preferredCta || 'Message us today.'] }
    ],
    metadata: { storyboard }
  };
}

function carouselIdeaGenerator(brand, campaignGoal) {
  return {
    title: `${brand.name} carousel ideas`,
    summary: `Carousel structures for ${campaignGoal || 'education, trust, and offers'}.`,
    sections: [
      {
        heading: 'Carousel concepts',
        items: [
          `5 reasons ${brand.targetAudience || 'customers'} choose ${brand.name}.`,
          `Problem -> solution -> proof -> offer -> CTA.`,
          `Checklist before buying ${brand.products?.[0]?.name || brand.businessType || 'this service'}.`,
          `Customer story: need, decision, result, next step.`
        ]
      }
    ]
  };
}

function contentPlanAsset(brand, campaignGoal, platforms, days = 7) {
  const plan = buildCampaignPlan({ brand, goal: campaignGoal, platforms: platformList(platforms), durationDays: days });
  return {
    title: `${brand.name} ${days}-day content plan`,
    summary: `${days} planned posts for ${campaignGoal || 'growth'} across ${plan.postIdeas.length ? [...new Set(plan.postIdeas.map((item) => item.platform))].join(', ') : 'saved platforms'}.`,
    sections: [
      {
        heading: `${days}-day plan`,
        items: plan.postIdeas.map((idea) => `Day ${idea.day} - ${idea.platform}: ${idea.title} - ${idea.caption}`)
      }
    ],
    metadata: { aiPlan: plan }
  };
}

function adCopyPack(brand, campaignGoal) {
  const offer = brand.offers?.[0]?.title || brand.products?.[0]?.name || brand.businessType || 'your next step';
  return {
    title: `${brand.name} ad copy pack`,
    summary: `Paid social copy angles for ${campaignGoal || offer}.`,
    sections: [
      {
        heading: 'Ad copy',
        items: [
          `Primary text: ${offer} for ${brand.targetAudience || 'customers'} who want a simpler option. ${brand.preferredCta || 'Book today.'}`,
          `Headline: ${offer} made easier`,
          `Description: Clear, local, and ready when you are.`,
          `CTA: ${brand.preferredCta || 'Learn more'}`
        ]
      }
    ]
  };
}

function draftsFromGrowthAsset({ asset, brand, platforms }) {
  const cleanPlatforms = platformList(platforms);
  const items = (asset.sections || []).flatMap((section) => section.items || []).slice(0, 10);
  const type = asset.type === 'reel_script' ? 'reel'
    : asset.type === 'carousel_ideas' ? 'carousel'
      : 'text';
  return items.map((item, index) => ({
    brand: brand._id,
    platform: cleanPlatforms[index % cleanPlatforms.length],
    platforms: [cleanPlatforms[index % cleanPlatforms.length]],
    type,
    title: `${asset.title} ${index + 1}`,
    caption: item,
    hashtags: makeHashtags(brand, asset.summary).slice(0, 6),
    status: 'draft',
    platformMetadata: {
      growthAsset: asset._id,
      growthAssetType: asset.type
    }
  }));
}

function draftBatch({ brand, campaignGoal, platforms }) {
  const cleanPlatforms = platformList(platforms);
  const pillars = ['Offer', 'Education', 'Trust', 'Reminder', 'Objection', 'Proof', 'CTA'];
  return pillars.map((pillar, index) => ({
    brand: brand._id,
    platform: cleanPlatforms[index % cleanPlatforms.length],
    type: 'text',
    title: `${pillar}: ${campaignGoal || brand.name}`,
    caption: `${brand.name} ${pillar.toLowerCase()} post for ${brand.targetAudience || 'local customers'}. ${campaignGoal || brand.preferredCta || 'Get started today'}.`,
    hashtags: makeHashtags(brand, campaignGoal).slice(0, 6),
    status: 'draft'
  }));
}

function campaignBrief({ brand, campaignGoal, platforms, durationDays = 14 }) {
  const cleanPlatforms = platformList(platforms);
  return {
    name: `${brand.name} growth campaign`,
    goal: campaignGoal || brand.preferredCta || 'Grow sales and awareness',
    description: `AI-generated campaign brief for ${brand.name}.`,
    platforms: cleanPlatforms,
    postingFrequency: brand.postingFrequency || '1 post per day',
    status: 'draft',
    aiPlan: buildCampaignPlan({ brand, goal: campaignGoal, platforms: cleanPlatforms, durationDays })
  };
}

function videoStoryboard({ brand, campaignGoal, platform, style }) {
  return {
    mode: 'brand_to_video',
    prompt: `${brand.name} ${campaignGoal || 'promo video'}`,
    aspectRatio: '9:16',
    durationSeconds: 20,
    status: 'planning',
    scenePlan: planAutomaticVideoScenes({ brand, goal: campaignGoal, offer: brand.offers?.[0]?.title, platform, style })
  };
}

module.exports = {
  brandAudit,
  campaignBrief,
  competitorSnapshot,
  adCopyPack,
  carouselIdeaGenerator,
  contentIdeas,
  contentPlanAsset,
  draftBatch,
  draftsFromGrowthAsset,
  hookGenerator,
  makeHashtags,
  offerAngles,
  platformList,
  reelScriptGenerator,
  videoStoryboard
};
