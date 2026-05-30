const Media = require('../models/Media');
const Post = require('../models/Post');
const { generateJsonText, generateImage, generateVideo } = require('./aiProviderService');

const DEFAULT_CONTENT_MIX = ['promo', 'offer', 'testimonial', 'educational', 'faq', 'proof', 'behind_the_scenes'];
const DEFAULT_MEDIA_MIX = ['auto', 'image', 'slides', 'video'];
const DEFAULT_PLATFORMS = ['facebook'];

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function splitHashtags(value) {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean).map((tag) => tag.startsWith('#') ? tag : `#${tag}`);
  return String(value || '').split(/\s|,/).map((tag) => tag.trim()).filter(Boolean).map((tag) => tag.startsWith('#') ? tag : `#${tag}`);
}

function platformLanguage(brand, platform, fallback = '') {
  return brand.autoPosting?.platformLanguages?.[platform] || fallback || brand.language || 'English';
}

function mediaMixFromSettings(body = {}, brand = {}) {
  const mix = asArray(body.mediaMix).length ? asArray(body.mediaMix) : brand.autoPosting?.mediaMix?.length ? brand.autoPosting.mediaMix : DEFAULT_MEDIA_MIX;
  return mix.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
}

function countFromFrequency({ body = {}, brand = {} }) {
  const unit = body.frequencyUnit || brand.autoPosting?.frequencyUnit || 'week';
  if (unit === 'day') return clamp(body.postsPerDay || brand.autoPosting?.postsPerDay, 1, 12, 1);
  if (unit === 'month') return clamp(body.postsPerMonth || brand.autoPosting?.postsPerMonth, 1, 90, 30);
  return clamp(body.postsPerWeek || brand.autoPosting?.postsPerWeek, 1, 60, 7);
}

function daysFromFrequency(unit) {
  if (unit === 'day') return 1;
  if (unit === 'month') return 30;
  return 7;
}

function slotHour(slot) {
  const text = String(slot || '').toLowerCase();
  if (text.includes('early')) return 7;
  if (text.includes('morning')) return 9;
  if (text.includes('lunch')) return 12;
  if (text.includes('afternoon')) return 15;
  if (text.includes('night')) return 20;
  if (text.includes('evening')) return 18;
  const number = Number(text.replace(/[^0-9]/g, ''));
  return Number.isFinite(number) && number >= 0 && number <= 23 ? number : 18;
}

function buildAutoSlots({ startDate, count, frequencyUnit, preferredSlots = [] }) {
  const start = startDate ? new Date(startDate) : new Date();
  if (Number.isNaN(start.getTime())) start.setTime(Date.now());
  const totalDays = daysFromFrequency(frequencyUnit);
  const spacing = Math.max(1, Math.floor(totalDays / Math.max(1, count)));
  const slots = preferredSlots.length ? preferredSlots : ['morning', 'evening'];
  const result = [];
  for (let index = 0; index < count; index += 1) {
    const when = new Date(start);
    when.setDate(start.getDate() + Math.min(totalDays - 1, index * spacing));
    when.setHours(slotHour(slots[index % slots.length]), 0, 0, 0);
    if (when < new Date()) when.setDate(when.getDate() + 1);
    result.push(when);
  }
  return result;
}

function platformRules(platform) {
  const rules = {
    facebook: 'Strong hook, value, short paragraphs, local trust/proof, CTA. Images, carousel/slides, and videos work well.',
    instagram: 'Short punchy caption, visual-first, 1-5 images or reel idea, fewer stronger hashtags, emotional hook.',
    tiktok: 'Video-first. Give a 3-5 scene script with a first-second hook and spoken narration.',
    youtube: 'Shorts-first. Give title, description, tags, 15-45 second script, and thumbnail prompt.',
    linkedin: 'Professional proof, founder insight, case study, less hype, clear business CTA.',
    whatsapp: 'Conversational, direct, short, with offer and contact CTA. Avoid too many hashtags.',
    x: 'Very concise, punchy, one clear thought, optional thread angle.',
    pinterest: 'Evergreen visual idea, keyword-rich title, clean image/slide prompt.'
  };
  return rules[platform] || rules.facebook;
}

function buildBatchPrompt({ brand, platforms, count, contentMix, mediaMix, customerGoal, strengthTarget }) {
  const products = (brand.products || []).map((item) => `${item.name || ''} ${item.price || ''} ${item.description || ''}`.trim()).filter(Boolean).join('; ') || 'not set';
  const offers = (brand.offers || []).map((item) => `${item.title || ''}: ${item.description || ''}`.trim()).filter(Boolean).join('; ') || 'not set';
  return [
    'You are the senior growth marketer and creative director for this social media automation app.',
    'Create a ready-to-schedule campaign batch as strict JSON only. No markdown.',
    `Generate exactly ${count} posts. Every post must include strong customer-acquisition intent and target a quality score of at least ${strengthTarget || 90}/100.`,
    'Each post must decide the best media format: text_image, carousel_slides, short_video, or mixed. Use video for platforms where video is strongest, slides when education/proof is best, and image when offer/visual clarity is best.',
    'For images/carousels, provide 1 to 5 distinct imagePrompts. For short_video, provide videoScript plus 3 to 5 scenes with visualPrompt and narration. Include platform-specific caption language.',
    `Brand: ${brand.name}`,
    `Business type: ${brand.businessType || 'not set'}`,
    `Description: ${brand.description || 'not set'}`,
    `Location: ${brand.location || 'not set'}`,
    `Audience: ${brand.targetAudience || 'not set'}`,
    `Tone: ${brand.tone || 'clean, persuasive, trustworthy'}`,
    `Preferred CTA: ${brand.preferredCta || 'Contact us today'}`,
    `Products/services: ${products}`,
    `Offers: ${offers}`,
    `Pain points: ${(brand.customerPainPoints || []).join('; ') || 'not set'}`,
    `Objections: ${(brand.commonObjections || []).join('; ') || 'not set'}`,
    `Testimonials/proof: ${(brand.testimonials || []).map((item) => `${item.author || 'customer'}: ${item.quote || ''}`).join('; ') || 'not set'}`,
    `Brand rules: ${(brand.brandRules || []).join('; ') || 'no unsafe claims, no fake guarantees'}`,
    `Blocked words: ${(brand.blockedWords || []).join(', ') || 'none'}`,
    `Preferred hashtags: ${(brand.preferredHashtags || []).join(' ') || 'not set'}`,
    `Customer goal: ${customerGoal || brand.autoPosting?.customerGoal || 'get customers immediately with clear offers and strong calls to action'}`,
    `Platforms: ${platforms.join(', ')}`,
    `Platform languages: ${platforms.map((p) => `${p}=${platformLanguage(brand, p)}`).join(', ')}`,
    `Content angles to rotate: ${contentMix.join(', ')}`,
    `Allowed media mix: ${mediaMix.join(', ')}`,
    `Platform rules: ${platforms.map((p) => `${p}: ${platformRules(p)}`).join(' | ')}`,
    'Return this exact JSON shape: {"campaignTitle":"...","strategySummary":"...","posts":[{"platform":"facebook","contentType":"promo","mediaFormat":"text_image","qualityScore":93,"language":"English","title":"...","caption":"...","description":"...","hashtags":["#tag"],"callToAction":"...","linkSuggestion":"","imagePrompts":["..."],"slidePrompts":["..."],"videoScript":"...","videoScenes":[{"title":"...","visualPrompt":"...","narration":"...","durationSeconds":5}],"bestTimeHint":"evening","customerReason":"why this can get customers","safetyNotes":"..."}]}',
    'Do not use placeholders. Make every post complete and publish-ready.'
  ].join('\n');
}

function localPost({ brand, platform, index, contentType, mediaFormat }) {
  const cta = brand.preferredCta || 'Contact us today';
  const caption = `${brand.name} helps ${brand.targetAudience || 'customers'} solve real problems with ${brand.products?.[0]?.name || brand.businessType || 'reliable service'}.\n\n${brand.offers?.[0]?.title ? `${brand.offers[0].title}: ${brand.offers[0].description || ''}\n\n` : ''}${cta}`;
  return {
    platform,
    contentType,
    mediaFormat,
    qualityScore: 88,
    language: platformLanguage(brand, platform),
    title: `${brand.name} ${contentType} ${index + 1}`,
    caption,
    description: caption,
    hashtags: brand.preferredHashtags || ['#AutoBrand'],
    callToAction: cta,
    imagePrompts: [`Clean professional ${platform} creative for ${brand.name}, ${contentType}, brand colors ${(brand.brandColors || []).join(', ')}, high-converting mobile layout, clear offer and CTA.`],
    slidePrompts: [1, 2, 3].map((n) => `Carousel card ${n} for ${brand.name}: show a realistic customer/product/service scene about ${contentType}, with little or no text.`),
    videoScript: `Hook: Need ${brand.businessType || 'a better solution'}? Scene 1 show problem. Scene 2 show ${brand.name}. Scene 3 show proof/offer. CTA: ${cta}.`,
    videoScenes: [
      { title: 'Hook', visualPrompt: `Show customer problem for ${brand.name}`, narration: 'Here is the problem your customer wants solved.', durationSeconds: 4 },
      { title: 'Solution', visualPrompt: `Show ${brand.name} solution and offer`, narration: `${brand.name} makes it easier.`, durationSeconds: 5 },
      { title: 'CTA', visualPrompt: `Show call to action for ${brand.name}`, narration: cta, durationSeconds: 4 }
    ],
    customerReason: 'Clear problem, solution, proof, and call to action.',
    safetyNotes: 'Review before publishing.'
  };
}

async function generateCampaignBatch(input) {
  const brand = input.brand;
  const platforms = asArray(input.platforms).length ? asArray(input.platforms) : DEFAULT_PLATFORMS;
  const frequencyUnit = input.frequencyUnit || brand.autoPosting?.frequencyUnit || 'week';
  const count = clamp(input.count || countFromFrequency({ body: input, brand }), 1, 90, 7);
  const contentMix = asArray(input.contentMix).length ? asArray(input.contentMix) : DEFAULT_CONTENT_MIX;
  const mediaMix = mediaMixFromSettings(input, brand);
  const strengthTarget = clamp(input.strengthTarget || brand.autoPosting?.strengthTarget, 80, 100, 90);
  const fallbackPosts = Array.from({ length: count }, (_, index) => {
    const platform = platforms[index % platforms.length];
    const contentType = contentMix[index % contentMix.length];
    const mediaFormat = mediaMix[index % mediaMix.length] === 'video' ? 'short_video' : mediaMix[index % mediaMix.length] === 'slides' ? 'carousel_slides' : 'text_image';
    return localPost({ brand, platform, index, contentType, mediaFormat });
  });
  const result = await generateJsonText({
    preferredProvider: 'openai',
    prompt: buildBatchPrompt({ brand, platforms, count, contentMix, mediaMix, customerGoal: input.customerGoal, strengthTarget }),
    fallback: { campaignTitle: `${brand.name} auto campaign`, strategySummary: 'Local fallback campaign.', posts: fallbackPosts }
  });
  const rawPosts = Array.isArray(result.data?.posts) ? result.data.posts : fallbackPosts;
  const posts = rawPosts.slice(0, count).map((post, index) => ({
    ...fallbackPosts[index % fallbackPosts.length],
    ...post,
    platform: post.platform || platforms[index % platforms.length],
    hashtags: splitHashtags(post.hashtags || fallbackPosts[index % fallbackPosts.length].hashtags),
    qualityScore: clamp(post.qualityScore, 1, 100, 90),
    imagePrompts: asArray(post.imagePrompts).slice(0, 5),
    slidePrompts: asArray(post.slidePrompts).slice(0, 5),
    videoScenes: asArray(post.videoScenes).slice(0, 5)
  }));
  return {
    ok: result.ok,
    provider: result.provider || 'openai',
    message: result.message,
    campaignTitle: result.data?.campaignTitle || `${brand.name} auto campaign`,
    strategySummary: result.data?.strategySummary || 'OpenAI generated a conversion-focused content batch.',
    posts,
    frequencyUnit
  };
}

function desiredImageCount(post, input, brand) {
  const maxFromBrand = clamp(input.imagesPerPostMax || brand.autoPosting?.imagesPerPostMax, 1, 5, 3);
  const minFromBrand = clamp(input.imagesPerPostMin || brand.autoPosting?.imagesPerPostMin, 1, 5, 1);
  if (post.mediaFormat === 'carousel_slides') return clamp(post.slidePrompts?.length || maxFromBrand, minFromBrand, 5, maxFromBrand);
  if (post.mediaFormat === 'short_video') return clamp(input.videoStoryboardImages || post.videoScenes?.length || 3, 1, 5, 3);
  return clamp(post.imagePrompts?.length || minFromBrand, minFromBrand, maxFromBrand, minFromBrand);
}

async function createMediaForGeneratedPost({ userId, brand, postPlan, input }) {
  const shouldGenerate = input.generateImages !== false && input.generateMedia !== false;
  if (!shouldGenerate) return { mediaIds: [], errors: [] };
  const prompts = postPlan.mediaFormat === 'carousel_slides'
    ? (postPlan.slidePrompts?.length ? postPlan.slidePrompts : postPlan.imagePrompts)
    : postPlan.imagePrompts;
  const count = desiredImageCount(postPlan, input, brand);
  const postType = postPlan.mediaFormat === 'carousel_slides' ? 'carousel' : postPlan.mediaFormat === 'short_video' ? 'video' : 'image';
  const mediaIds = [];
  const errors = [];
  for (let index = 0; index < Math.min(count, prompts.length || 1); index += 1) {
    const prompt = prompts[index] || `Create a clean branded social image for ${brand.name}: ${postPlan.caption}`;
    const stylePrefix = postType === 'carousel'
      ? `Facebook carousel card ${index + 1} of ${count}. Create a realistic commercial/lifestyle/product/service visual, not a text slide, not a static poster, and not an infographic. Keep it visually distinct but brand-consistent.
`
      : count > 1
        ? `Image variation ${index + 1} of ${count}. Make it a distinct real-looking branded image, not a text card.
`
        : '';
    const result = await generateImage({
      preferredProvider: 'openai',
      brand,
      userId,
      prompt: `${stylePrefix}${prompt}
Platform: ${postPlan.platform}. Language: ${postPlan.language || brand.language}. Make it clean, premium, mobile-first, high-converting, no fake claims.`,
      size: input.imageSize || '1024x1024',
      aspectRatio: postPlan.platform === 'tiktok' || postPlan.mediaFormat === 'short_video' ? '9:16' : '1:1',
      postType,
      slideIndex: index,
      slideCount: count
    });
    if (!result.ok) {
      errors.push(result.message || 'Image generation failed.');
      continue;
    }
    const media = await Media.create({
      brand: brand._id,
      uploadedBy: userId,
      fileName: result.fileName || `${brand.name} generated creative ${index + 1}`,
      fileUrl: result.fileUrl,
      publicId: result.publicId || result.fileUrl,
      fileType: 'image',
      mimeType: result.mimeType || 'image/png',
      size: result.size || 0,
      folder: result.folder || 'openai-auto-campaign',
      tags: ['openai', 'auto-campaign', postPlan.platform, postPlan.mediaFormat].filter(Boolean),
      aiPrompt: result.aiPrompt,
      aiInsights: {
        summary: `OpenAI generated creative for ${postPlan.title}.`,
        visualPrompt: result.aiPrompt,
        contentAngles: [postPlan.contentType, postPlan.mediaFormat].filter(Boolean),
        recommendedPlatforms: [postPlan.platform],
        safetyNotes: ['Review final visual before publishing.'],
        reuseInstructions: ['Use with the scheduled auto campaign post.'],
        generatedFrom: 'openai_auto_campaign',
        generatedAt: new Date()
      },
      variants: [{ kind: 'openai_generated_image', label: 'OpenAI generated image', url: result.fileUrl, prompt: result.aiPrompt, status: 'ready', metadata: result.metadata || {}, createdAt: new Date() }]
    });
    mediaIds.push(media._id);
  }
  return { mediaIds, errors };
}


function videoPromptForPost({ brand, postPlan }) {
  const scenes = asArray(postPlan.videoScenes)
    .map((scene, index) => `Scene ${index + 1}: ${scene.visualPrompt || scene.title || ''}. Narration: ${scene.narration || ''}`)
    .join('\n');
  return [
    postPlan.videoScript || postPlan.caption,
    scenes,
    `Create a short vertical marketing video for ${brand.name}.`,
    `Tone: ${brand.tone || 'clean, persuasive, trustworthy'}.`,
    `Audience: ${brand.targetAudience || 'customers'}.`,
    `CTA: ${postPlan.callToAction || brand.preferredCta || 'Contact us today'}.`,
    'Make it high-converting, mobile-first, safe for social ads, no fake claims.'
  ].filter(Boolean).join('\n');
}

async function createVideoForGeneratedPost({ userId, brand, postPlan, input, sourceMedia }) {
  const shouldGenerate = input.generateVideos !== false && input.generateMedia !== false;
  if (!shouldGenerate || postPlan.mediaFormat !== 'short_video') return null;
  const result = await generateVideo({
    preferredProvider: input.videoProvider || undefined,
    brand,
    userId,
    sourceMedia,
    prompt: videoPromptForPost({ brand, postPlan }),
    aspectRatio: postPlan.platform === 'youtube' || postPlan.platform === 'tiktok' || postPlan.platform === 'instagram' ? '9:16' : '1:1',
    durationSeconds: input.videoDurationSeconds || 8
  });
  if (!result.ok || !result.outputUrl) return { warning: result.message || 'Video generation provider did not return a video file.' };
  const media = await Media.create({
    brand: brand._id,
    uploadedBy: userId,
    fileName: result.fileName || `${brand.name} ${postPlan.title || 'auto'} video.mp4`,
    fileUrl: result.outputUrl,
    publicId: result.providerJobId || result.outputUrl,
    fileType: 'video',
    mimeType: 'video/mp4',
    size: result.size || 0,
    folder: `${result.provider || 'ai'}-auto-video`,
    tags: [result.provider || 'ai', 'auto-campaign', 'video', postPlan.platform].filter(Boolean),
    aiPrompt: videoPromptForPost({ brand, postPlan }),
    aiInsights: {
      summary: `${result.provider || 'AI'} generated video for ${postPlan.title}.`,
      visualPrompt: videoPromptForPost({ brand, postPlan }),
      contentAngles: [postPlan.contentType, 'video'].filter(Boolean),
      recommendedPlatforms: [postPlan.platform],
      safetyNotes: ['Review final video before publishing.'],
      reuseInstructions: ['Use with the scheduled auto campaign post.'],
      generatedFrom: `${result.provider || 'ai'}_auto_video`,
      generatedAt: new Date()
    },
    variants: [{ kind: `${result.provider || 'ai'}_generated_video`, label: result.providerModel || `${result.provider || 'AI'} generated video`, url: result.outputUrl, prompt: videoPromptForPost({ brand, postPlan }), status: 'ready', metadata: { providerJobId: result.providerJobId }, createdAt: new Date() }]
  });
  return { mediaId: media._id };
}

async function createScheduledPostsFromBatch({ userId, brand, targetAccounts, input, enqueue }) {
  const batch = await generateCampaignBatch({ ...input, brand });
  const preferredSlots = asArray(input.preferredSlots).length ? asArray(input.preferredSlots) : brand.autoPosting?.preferredSlots || ['morning', 'evening'];
  const slots = buildAutoSlots({
    startDate: input.startDate,
    count: batch.posts.length,
    frequencyUnit: batch.frequencyUnit,
    preferredSlots
  });
  const createdPosts = [];
  for (let index = 0; index < batch.posts.length; index += 1) {
    const plan = batch.posts[index];
    const imageResult = await createMediaForGeneratedPost({ userId, brand, postPlan: plan, input });
    const mediaIds = imageResult.mediaIds;
    const sourceMedia = mediaIds.length ? await Media.findById(mediaIds[0]) : null;
    const videoResult = await createVideoForGeneratedPost({ userId, brand, postPlan: plan, input, sourceMedia });
    if (plan.mediaFormat === 'short_video') {
      mediaIds.splice(0, mediaIds.length);
      if (videoResult?.mediaId) mediaIds.push(videoResult.mediaId);
    } else if (videoResult?.mediaId) {
      mediaIds.unshift(videoResult.mediaId);
    }
    const missingRequestedMedia = (imageResult.errors.length || videoResult?.warning) && !mediaIds.length && plan.mediaFormat !== 'text';
    const postStatus = missingRequestedMedia ? 'draft' : input.status || 'scheduled';
    const type = videoResult?.mediaId
      ? 'video'
      : mediaIds.length > 1 || plan.mediaFormat === 'carousel_slides'
        ? 'carousel'
        : mediaIds.length
          ? 'image'
          : 'text';
    const post = await Post.create({
      brand: brand._id,
      platform: plan.platform || 'facebook',
      type,
      title: plan.title || `${brand.name} auto post ${index + 1}`,
      description: plan.description || '',
      caption: plan.caption,
      hashtags: splitHashtags(plan.hashtags),
      media: mediaIds,
      targetAccounts,
      status: postStatus,
      scheduledAt: postStatus === 'draft' ? undefined : slots[index],
      platformMetadata: {
        creationMode: 'openai_auto_campaign',
        provider: batch.provider,
        campaignTitle: batch.campaignTitle,
        strategySummary: batch.strategySummary,
        mediaFormat: plan.mediaFormat,
        language: plan.language,
        qualityScore: plan.qualityScore,
        customerReason: plan.customerReason,
        callToAction: plan.callToAction,
        imagePrompts: plan.imagePrompts,
        slidePrompts: plan.slidePrompts,
        videoScript: plan.videoScript,
        videoScenes: plan.videoScenes,
        bestTimeHint: plan.bestTimeHint,
        safetyNotes: plan.safetyNotes,
        imageWarning: imageResult.errors.join(' | '),
        videoWarning: videoResult?.warning || '',
        generatedAt: new Date()
      },
      createdBy: userId
    });
    if (post.status === 'scheduled' && enqueue) await enqueue(post);
    createdPosts.push(post);
  }
  return { ...batch, createdPosts };
}

module.exports = {
  generateCampaignBatch,
  createScheduledPostsFromBatch,
  buildAutoSlots,
  countFromFrequency,
  platformLanguage
};
