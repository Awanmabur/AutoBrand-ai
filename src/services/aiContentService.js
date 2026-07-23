const { mediaContext } = require('./mediaInsightService');
const { activeProvider, generateJsonText, generateImage, checkProviders } = require('./aiProviderService');
const { generateContentBundle } = require('./aiContentGeneration.service');

const { zonedDateForDayOffset } = require('../utils/timeZone');
function normalizeGeneratedPost(raw, fallbackInput) {
  const fallback = fallbackPost(fallbackInput);
  const hashtags = Array.isArray(raw.hashtags)
    ? raw.hashtags
    : String(raw.hashtags || '')
        .split(/\s|,/)
        .map((tag) => tag.trim())
        .filter(Boolean);

  return {
    title: raw.title || fallback.title,
    caption: raw.caption || fallback.caption,
    hashtags: hashtags.length ? hashtags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)) : fallback.hashtags,
    callToAction: raw.callToAction || fallback.callToAction,
    imageIdea: raw.imageIdea || fallback.imageIdea,
    imagePrompt: raw.imagePrompt || fallback.imagePrompt,
    videoScript: raw.videoScript || fallback.videoScript,
    description: raw.description || fallback.description,
    youtubeTags: Array.isArray(raw.youtubeTags) ? raw.youtubeTags : fallback.youtubeTags,
    platformVersion: raw.platformVersion || fallback.platformVersion,
    bestPostingTime: raw.bestPostingTime || fallback.bestPostingTime,
    contentScore: Number(raw.contentScore || fallback.contentScore),
    improvementSuggestion: raw.improvementSuggestion || fallback.improvementSuggestion,
    safetyNotes: raw.safetyNotes || 'No safety notes returned.',
    provider: raw.provider || 'openai'
  };
}

function fallbackPost({ brand, platform, goal, contentType }) {
  const offer = brand.offers?.[0]?.title || goal || brand.preferredCta || 'discover what we offer';
  const product = brand.products?.[0]?.name ? ` Featured: ${brand.products[0].name}.` : '';
  const painPoint = brand.customerPainPoints?.[0] ? ` Solves: ${brand.customerPainPoints[0]}.` : '';
  const hashtags = brand.preferredHashtags?.length
    ? brand.preferredHashtags
    : [`#${brand.name.replace(/\s+/g, '')}`, '#LocalBusiness', '#SmartChoice'];

  return {
    title: `${brand.name} ${contentType || 'promo'}`,
    caption: `${brand.name} is here for ${brand.targetAudience || 'local customers'}. ${offer}.${product}${painPoint} ${brand.preferredCta || 'Contact us today.'}`,
    hashtags,
    callToAction: brand.preferredCta || 'Contact us today',
    imageIdea: `Clean branded ${platform} visual for ${brand.name}`,
    imagePrompt: `Create a clean, professional ${platform} social media image for ${brand.name}, a ${brand.businessType || 'business'} in ${brand.location || 'the local area'}, using a ${brand.tone || 'friendly'} tone.`,
    videoScript: `Scene 1: Show the problem. Scene 2: Present ${brand.name}. Scene 3: Highlight ${offer}. Scene 4: End with ${brand.preferredCta || 'Contact us today'}.`,
    description: `${brand.name} helps ${brand.targetAudience || 'local customers'} with ${offer}. ${brand.description || ''}`.trim(),
    youtubeTags: hashtags.map((tag) => tag.replace('#', '')).concat([brand.businessType || 'business']).filter(Boolean).slice(0, 12),
    platformVersion: `${platform || 'social'} optimized`,
    bestPostingTime: 'Evening, 6 PM to 9 PM',
    contentScore: 78,
    improvementSuggestion: 'Add a stronger offer or price to make the post more specific.',
    provider: 'local_fallback'
  };
}

function mediaDrivenFallback(input) {
  const base = fallbackPost(input);
  const media = input.sourceMedia;
  if (!media) return base;
  const asset = media.fileName || 'uploaded asset';
  const angles = media.aiInsights?.contentAngles || [];
  return {
    ...base,
    title: `${base.title} with ${asset}`.slice(0, 120),
    caption: `${base.caption}\n\nFeaturing ${asset}. ${angles[0] || 'See the product, proof, or moment behind the offer.'}`,
    imageIdea: media.aiInsights?.summary || `Use ${asset} as the key social creative.`,
    imagePrompt: media.aiInsights?.visualPrompt || `${base.imagePrompt} Use uploaded media ${asset} as the visual reference.`,
    videoScript: `${base.videoScript} Use ${asset} as the main visual reference in the offer scene.`,
    description: `${base.description}\n\nSource asset: ${asset}.`,
    safetyNotes: media.aiInsights?.safetyNotes?.join(' ') || base.safetyNotes
  };
}

function brandBrainLines(brand) {
  const productsAndServices = [...(brand.products || []), ...(brand.services || [])]
    .map((item) => `${item.name || ''} ${item.price || ''} ${item.description || ''}`.trim())
    .filter(Boolean)
    .join('; ') || 'not set';
  const objections = brand.customerObjections || brand.commonObjections || [];
  return [
    `Website: ${brand.website || 'not set'}`,
    `Language: ${brand.language || 'English'}`,
    `Local style: ${brand.localStyle || 'not set'}`,
    `Font style: ${brand.fontStyle || 'not set'}`,
    `Brand colors: ${(brand.brandColors || []).join(', ') || 'not set'}`,
    `Social links: ${(brand.socialLinks || []).map((item) => `${item.platform || ''} ${item.url || ''}`.trim()).filter(Boolean).join('; ') || 'not set'}`,
    `Posting frequency: ${brand.postingFrequency || 'not set'}`,
    `Auto posting customer goal: ${brand.autoPosting?.customerGoal || 'not set'}`,
    `Auto posting media mix: ${(brand.autoPosting?.mediaMix || []).join(', ') || 'not set'}`,
    `Auto posting image range: ${brand.autoPosting?.imagesPerPostMin || 1}-${brand.autoPosting?.imagesPerPostMax || 3}`,
    `Goals: ${(brand.goals || []).join('; ') || 'not set'}`,
    `Pain points: ${(brand.customerPainPoints || []).join('; ') || 'not set'}`,
    `Objections: ${objections.join('; ') || 'not set'}`,
    `Keywords: ${(brand.keywords || []).join(', ') || 'not set'}`,
    `Preferred words: ${(brand.preferredWords || []).join(', ') || 'not set'}`,
    `Products/services: ${productsAndServices}`,
    `Testimonials/proof: ${(brand.testimonials || []).map((item) => `${item.author || 'customer'}: ${item.quote || ''}`).join('; ') || 'not set'}`,
    `Competitors: ${(brand.competitors || []).join('; ') || 'not set'}`,
    `Preferred hashtags: ${(brand.preferredHashtags || []).join(' ') || 'not set'}`
  ];
}

function providerFallback(input, provider, message) {
  const fallback = input.sourceMedia ? mediaDrivenFallback(input) : fallbackPost(input);
  return {
    ...fallback,
    provider,
    safetyNotes: [fallback.safetyNotes, message].filter(Boolean).join(' ')
  };
}


function buildImagePrompt({ brand, prompt, platform = 'facebook', aspectRatio = '1:1', sourceMedia, postType = 'image', slideIndex = 0, slideCount = 1 }) {
  const requestedType = String(postType || 'image').toLowerCase();
  const mediaDirection = requestedType === 'carousel'
    ? `Create carousel card image ${Number(slideIndex) + 1} of ${Number(slideCount) || 1} for Facebook. It must be a real-looking commercial/lifestyle/product/service visual, not a text slide, not a poster, not a mock UI, and not a plain graphic card. Keep each carousel card visually distinct but brand-consistent. Use little or no text; if text is necessary, keep it to a tiny brand mark or 2-4 word overlay only.`
    : requestedType === 'video'
      ? 'Create a strong real-looking video cover/hero frame that can also work as a short-video thumbnail. Use realistic visual context and little or no text.'
      : 'Create a real-looking polished social media image. Prefer realistic lifestyle/product/service photography or high-quality commercial scene rendering. Do not make a plain text card, poster, infographic, UI mockup, or quote graphic unless the user explicitly asks for that.';
  const productsAndServices = [...(brand.products || []), ...(brand.services || [])]
    .map((item) => `${item.name || ''} ${item.price || ''} ${item.description || ''}`.trim())
    .filter(Boolean)
    .join('; ') || 'not set';
  return [
    prompt,
    mediaDirection,
    `Brand: ${brand.name}. Business type: ${brand.businessType || 'business'}.`,
    `Audience: ${brand.targetAudience || 'local customers'}. Tone: ${brand.tone || 'professional, clean, friendly'}.`,
    `Use brand colors subtly when possible: ${(brand.brandColors || []).join(', ') || 'clean commercial palette'}.`,
    `Products/services: ${productsAndServices}.`,
    `Offers: ${(brand.offers || []).map((item) => `${item.title || ''} ${item.description || ''}`.trim()).filter(Boolean).join('; ') || 'not set'}.`,
    `Proof/testimonials: ${(brand.testimonials || []).map((item) => `${item.author || 'customer'}: ${item.quote || ''}`).join('; ') || 'not set'}.`,
    `Local style: ${brand.localStyle || 'not set'}. Font style: ${brand.fontStyle || 'not set'}.`,
    `Platform: ${platform}. Composition: ${aspectRatio}, mobile-friendly, high quality, natural lighting, realistic depth, ad-safe.`,
    'Avoid copyrighted logos unless they belong to the brand. Avoid misleading before/after or medical/financial claims.',
    sourceMedia ? `Reference uploaded media idea: ${sourceMedia.fileName || sourceMedia.fileUrl}. Keep people and products respectful and non-deceptive.` : ''
  ].filter(Boolean).join('\n');
}

async function generateImageAsset(input) {
  const prompt = buildImagePrompt(input);
  return generateImage({
    prompt,
    brand: input.brand,
    userId: input.userId,
    sourceMedia: input.sourceMedia,
    aspectRatio: input.aspectRatio,
    size: input.size,
    preferredProvider: input.provider || input.preferredProvider,
    model: input.model,
    postType: input.postType,
    slideIndex: input.slideIndex,
    slideCount: input.slideCount
  });
}

function buildPrompt({ brand, platform, goal, contentType, sourceMedia }) {
  const productsAndServices = [...(brand.products || []), ...(brand.services || [])]
    .map((item) => `${item.name} ${item.price || ''} ${item.description || ''}`.trim())
    .filter(Boolean)
    .join('; ') || 'not set';
  return [
    'Generate one social media post as strict JSON.',
    `Brand: ${brand.name}`,
    `Business type: ${brand.businessType || 'not set'}`,
    `Description: ${brand.description || 'not set'}`,
    `Location: ${brand.location || 'not set'}`,
    `Audience: ${brand.targetAudience || 'not set'}`,
    `Tone: ${brand.tone || 'clean, friendly, local'}`,
    `CTA: ${brand.preferredCta || 'not set'}`,
    `Products/services: ${productsAndServices}`,
    `Offers: ${(brand.offers || []).map((item) => `${item.title} ${item.description || ''}`).join('; ') || 'not set'}`,
    `Blocked words: ${(brand.blockedWords || []).join(', ') || 'none'}`,
    `Brand rules: ${(brand.brandRules || []).join(', ') || 'none'}`,
    ...brandBrainLines(brand),
    mediaContext(sourceMedia),
    `Platform: ${platform}`,
    `Goal: ${goal || 'promote the business'}`,
    `Content type: ${contentType || 'promo'}`,
    'Return keys: title, caption, hashtags, callToAction, imageIdea, imagePrompt, videoScript, description, youtubeTags, platformVersion, bestPostingTime, contentScore, improvementSuggestion, safetyNotes.'
  ].join('\n');
}

function hourForSlot(slot) {
  const normalized = String(slot || '').toLowerCase();
  if (normalized.includes('morning')) return 9;
  if (normalized.includes('lunch')) return 12;
  if (normalized.includes('afternoon')) return 15;
  if (normalized.includes('night')) return 20;
  return 18;
}

function buildCreativePackage(input) {
  const base = input.sourceMedia ? mediaDrivenFallback(input) : fallbackPost(input);
  const imagePrompt = [
    base.imagePrompt,
    `Use brand colors: ${(input.brand.brandColors || []).join(', ') || 'clean brand-safe palette'}.`,
    `Format for ${input.platform || 'Facebook'} with readable text space, logo-safe corners, and mobile-first composition.`,
    input.sourceMedia ? `Reference uploaded asset: ${input.sourceMedia.fileName}. Keep the subject recognizable and ethical.` : ''
  ].filter(Boolean).join(' ');

  const videoScript = [
    `Hook: ${input.goal || base.callToAction || 'Get attention fast'}.`,
    `Scene 1: Open with the customer problem or desire for ${input.brand.targetAudience || 'the target audience'}.`,
    `Scene 2: Show ${input.brand.name} and the main offer/value.`,
    `Scene 3: Add proof, product, testimonial, or location detail.`,
    `Scene 4: End with ${input.brand.preferredCta || base.callToAction || 'Contact us today'}.`,
    input.sourceMedia ? `Use uploaded media ${input.sourceMedia.fileName} as a hero visual or image-to-video source.` : ''
  ].filter(Boolean).join('\n');

  return {
    ...base,
    imagePrompt,
    videoScript,
    imageGenerationChecklist: [
      'Use brand colors and clear product/offer focus',
      'Keep text short and readable on mobile',
      'Leave safe space for logo and CTA',
      'Avoid misleading claims or restricted content'
    ],
    videoGenerationChecklist: [
      'Strong hook in first 2 seconds',
      '3 to 5 scenes only',
      'Subtitle-safe framing',
      'CTA in the last scene',
      'Use uploaded owner/product images only when consent is accepted'
    ],
    handoffSteps: [
      'Review caption and hashtags',
      'Generate or upload the image/video creative',
      'Select Pages/channels',
      'Schedule or publish',
      'Check status in Calendar'
    ]
  };
}

function buildScheduleSlots({ startDate, days = 7, postsPerDay = 1, preferredSlot = 'evening' }) {
  const start = startDate ? new Date(startDate) : new Date();
  if (Number.isNaN(start.getTime())) start.setTime(Date.now());
  const slots = [];
  const hour = hourForSlot(preferredSlot);
  for (let day = 0; day < Number(days || 7); day += 1) {
    for (let count = 0; count < Number(postsPerDay || 1); count += 1) {
      let when = zonedDateForDayOffset({ date: start, dayOffset: day, hour: hour + count * 2, minute: 0 });
      if (when < new Date()) when = zonedDateForDayOffset({ date: start, dayOffset: day + 1, hour: hour + count * 2, minute: 0 });
      slots.push(when);
    }
  }
  return slots;
}

async function generatePostIdea(input) {
  const bundle = await generateContentBundle({
    ...input,
    outputType: input.outputType || 'single_post',
    platforms: input.platforms || input.platform || 'facebook'
  });
  const warningText = [
    bundle.safetyNotes,
    ...(bundle.warnings?.brandRuleWarnings || []),
    ...(bundle.warnings?.blockedWordWarnings || []),
    ...(bundle.warnings?.riskWarnings || [])
  ].filter(Boolean).join(' ');
  const normalized = normalizeGeneratedPost({
    title: bundle.title,
    caption: bundle.caption,
    hashtags: bundle.hashtags,
    callToAction: bundle.callToAction,
    imageIdea: bundle.imageIdea,
    imagePrompt: bundle.imagePrompt,
    videoScript: bundle.videoScript,
    description: bundle.description,
    youtubeTags: bundle.youtubeTags,
    platformVersion: `${bundle.controls?.platform || input.platform || 'social'} ${bundle.outputType || 'post'}`,
    bestPostingTime: bundle.bestPostingTime,
    contentScore: bundle.scores?.contentScore,
    improvementSuggestion: bundle.improvementSuggestion,
    safetyNotes: warningText || bundle.safetyNotes,
    provider: bundle.provider || activeProvider('text')
  }, input);
  return {
    ...normalized,
    generatedBundle: bundle,
    platformOutputs: bundle.platformOutputs || [],
    campaignPlan: bundle.campaignPlan || [],
    carouselSlides: bundle.carouselSlides || [],
    videoScenes: bundle.videoScenes || [],
    brandRuleWarnings: bundle.warnings?.brandRuleWarnings || [],
    blockedWordWarnings: bundle.warnings?.blockedWordWarnings || [],
    riskWarnings: bundle.warnings?.riskWarnings || [],
    scores: bundle.scores || {}
  };
}


async function generateVideoScenePlan(input) {
  const local = buildCreativePackage(input).videoScript.split('\n').map((line, index) => ({
    order: index + 1,
    title: line.split(':')[0].replace(/^Scene\s*\d+/i, '').trim() || `Scene ${index + 1}`,
    visualPrompt: `${line} Create clean branded video visuals for ${input.brand.name}.`,
    narration: line.replace(/^Scene\s*\d+\s*:\s*/i, ''),
    durationSeconds: index === 0 ? 4 : 5,
    status: 'planned'
  })).slice(0, 6);

  const prompt = [
    'Create a short social video scene plan as strict JSON.',
    'Return only an array named scenes. Each scene needs order, title, visualPrompt, narration, durationSeconds.',
    `Brand: ${input.brand.name}`,
    `Business type: ${input.brand.businessType || 'not set'}`,
    `Description: ${input.brand.description || 'not set'}`,
    `Audience: ${input.brand.targetAudience || 'not set'}`,
    `Tone: ${input.brand.tone || 'clean, professional'}`,
    `CTA: ${input.brand.preferredCta || 'not set'}`,
    `Platform: ${input.platform || 'facebook'}`,
    `Goal: ${input.goal || 'promote the business'}`,
    `Offer: ${input.offer || 'not set'}`,
    `Style: ${input.style || 'clean, mobile-first, subtitle-safe'}`,
    mediaContext(input.sourceMedia),
    'Premium video rules: make every scene look like a real commercial video shot, not a static slideshow. Include camera movement, lighting, subject action, transition, subtitle-safe composition, and CTA. Avoid fake text, distorted faces/hands, unreadable overlays, and random unrelated scenes.',
    'Keep it 4 to 6 scenes. Make prompts usable in video APIs. Do not claim the video is already rendered.'
  ].join('\n');

  const result = await generateJsonText({ prompt, fallback: { scenes: local }, preferredProvider: input.provider || input.preferredProvider });
  const scenes = Array.isArray(result.data?.scenes) ? result.data.scenes : local;
  return scenes.map((scene, index) => ({
    order: Number(scene.order || index + 1),
    title: scene.title || `Scene ${index + 1}`,
    visualPrompt: scene.visualPrompt || scene.prompt || local[index % local.length]?.visualPrompt || '',
    narration: scene.narration || scene.script || local[index % local.length]?.narration || '',
    durationSeconds: Number(scene.durationSeconds || (index === 0 ? 4 : 5)),
    status: 'planned'
  })).slice(0, 6);
}


async function checkAIProviders() {
  const checks = await checkProviders();
  return {
    ok: checks.some((item) => item.kind === 'text' && item.configured),
    configured: checks.some((item) => item.configured),
    message: checks.map((item) => `${item.kind}: ${item.provider}${item.configured ? ' ready' : ' missing key'}`).join(' | '),
    checks
  };
}

async function checkOpenAI() {
  return checkAIProviders();
}


module.exports = { generatePostIdea, generateImageAsset, generateVideoScenePlan, buildCreativePackage, buildScheduleSlots, checkOpenAI, checkAIProviders };
