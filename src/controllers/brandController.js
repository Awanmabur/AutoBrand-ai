const slugify = require('slugify');
const Brand = require('../models/Brand');
const BrandAsset = require('../models/BrandAsset');
const { isCloudinaryConfigured } = require('../config/cloudinary');
const { assertCanCreateBrand } = require('../services/usageLimitService');
const { addBrandAsset } = require('../services/brandBrain/brandAsset.service');
const { updateBrandScore } = require('../services/brandBrain/brandScore.service');

async function index(req, res, next) {
  try {
    return res.redirect('/dashboard/brand-brain');
  } catch (error) {
    return next(error);
  }
}

function create(req, res) {
  res.redirect('/dashboard/brand-brain#brand-form');
}

function brandPayload(body) {
  return {
    name: body.name,
    slug: slugify(body.name, { lower: true, strict: true }),
    logo: body.logo,
    logoPublicId: body.logoPublicId,
    favicon: body.favicon,
    faviconPublicId: body.faviconPublicId,
    coverImage: body.coverImage,
    coverImagePublicId: body.coverImagePublicId,
    businessType: body.businessType,
    description: body.description,
    website: body.website,
    industry: body.industry,
    location: body.location,
    timezone: body.timezone || 'Africa/Kampala',
    language: body.language || 'English',
    targetCountries: splitLines(body.targetCountries),
    slogan: body.slogan,
    tagline: body.tagline,
    mission: body.mission,
    vision: body.vision,
    values: splitLines(body.values),
    uniqueSellingPoint: body.uniqueSellingPoint,
    brandStory: body.brandStory,
    targetAudience: body.targetAudience,
    audienceAgeRange: body.audienceAgeRange,
    audienceInterests: splitLines(body.audienceInterests),
    customerDesires: splitLines(body.customerDesires),
    customerObjections: splitLines(body.customerObjections || body.commonObjections),
    customerPersonas: parsePersonas(body.customerPersonas),
    tone: body.tone,
    toneOfVoice: body.toneOfVoice || body.tone,
    writingStyle: body.writingStyle,
    preferredCta: body.preferredCta,
    ctaStyle: body.ctaStyle || body.preferredCta,
    emojiUsage: body.emojiUsage,
    hashtagStyle: body.hashtagStyle,
    formalityLevel: body.formalityLevel,
    humorLevel: body.humorLevel,
    localStyle: body.localStyle,
    fontStyle: body.fontStyle,
    postingFrequency: body.postingFrequency,
    products: parseProducts(body.products),
    services: parseProducts(body.services),
    offers: parseOffers(body.offers),
    pricingNotes: body.pricingNotes,
    guarantees: splitLines(body.guarantees),
    faqs: parseFaqs(body.faqs),
    socialLinks: parseSocialLinks(body.socialLinks),
    customerPainPoints: splitLines(body.customerPainPoints),
    testimonials: parseTestimonials(body.testimonials),
    brandRules: splitLines(body.brandRules),
    goals: splitLines(body.goals),
    contentPillars: splitLines(body.contentPillars),
    contentDos: splitLines(body.contentDos),
    contentDonts: splitLines(body.contentDonts),
    complianceNotes: splitLines(body.complianceNotes),
    preferredHashtags: splitTags(body.preferredHashtags),
    bannedWords: splitLines(body.bannedWords),
    blockedWords: splitLines(body.blockedWords),
    keywords: splitLines(body.keywords),
    preferredWords: splitLines(body.preferredWords),
    competitors: splitLines(body.competitors),
    competitorLinks: parseCompetitorLinks(body.competitorLinks),
    differentiationNotes: body.differentiationNotes,
    brandColors: splitLines(body.brandColors),
    fonts: splitLines(body.fonts),
    defaultPostingTimes: splitLines(body.defaultPostingTimes),
    approvalRequiredByDefault: body.approvalRequiredByDefault === 'on',
    savedPrompts: parseSavedPrompts(body.savedPrompts),
    rejectedStyles: splitLines(body.rejectedStyles),
    highPerformingTopics: splitLines(body.highPerformingTopics),
    brandKnowledgeBase: parseKnowledgeBase(body.brandKnowledgeBase),
    autoPosting: {
      enabled: body.autoPostingEnabled === 'on',
      postsPerDay: Number(body.autoPostsPerDay || 1),
      postsPerWeek: Number(body.autoPostsPerWeek || 7),
      postsPerMonth: Number(body.autoPostsPerMonth || 30),
      frequencyUnit: body.autoFrequencyUnit || 'week',
      preferredSlots: splitLines(body.autoPreferredSlots || 'morning, evening'),
      platformLanguages: parsePlatformLanguages(body.platformLanguages),
      mediaMix: splitLines(body.autoMediaMix || 'auto, image, slides, video'),
      imagesPerPostMin: Number(body.imagesPerPostMin || 1),
      imagesPerPostMax: Number(body.imagesPerPostMax || 3),
      customerGoal: body.autoCustomerGoal || 'get customers immediately with clear offers and strong calls to action',
      requireMedia: body.autoRequireMedia !== 'off',
      strengthTarget: Number(body.strengthTarget || 90)
    }
  };
}

function parseProducts(value) {
  return splitLines(value).map((line) => {
    const [name = '', price = '', description = ''] = line.split('|').map((part) => part.trim());
    return { name, price, description };
  });
}

function parseOffers(value) {
  return splitLines(value).map((line) => {
    const [title = '', description = ''] = line.split('|').map((part) => part.trim());
    return { title, description };
  });
}

function parseSocialLinks(value) {
  return splitLines(value).map((line) => {
    const [platform = '', url = ''] = line.split('|').map((part) => part.trim());
    return { platform, url };
  });
}

function parsePlatformLanguages(value) {
  const output = {};
  splitLines(value).forEach((line) => {
    const [platform = '', language = ''] = line.split('|').map((part) => part.trim());
    if (platform && language) output[platform.toLowerCase()] = language;
  });
  return output;
}

function parsePersonas(value) {
  return splitLines(value).map((line) => {
    const [name = '', description = '', goals = '', objections = ''] = line.split('|').map((part) => part.trim());
    return { name, description, goals, objections };
  });
}

function parseFaqs(value) {
  return splitLines(value).map((line) => {
    const [question = '', answer = ''] = line.split('|').map((part) => part.trim());
    return { question, answer };
  });
}

function parseCompetitorLinks(value) {
  return splitLines(value).map((line) => {
    const [name = '', url = '', notes = ''] = line.split('|').map((part) => part.trim());
    return { name, url, notes };
  });
}

function parseSavedPrompts(value) {
  return splitLines(value).map((line) => {
    const [title = '', taskType = '', prompt = ''] = line.split('|').map((part) => part.trim());
    return { title, taskType, prompt };
  });
}

function parseKnowledgeBase(value) {
  return splitLines(value).map((line) => {
    const [title = '', source = '', content = ''] = line.split('|').map((part) => part.trim());
    return { title, source, content };
  });
}

function parseTestimonials(value) {
  return splitLines(value).map((line) => {
    const [author = '', quote = ''] = line.split('|').map((part) => part.trim());
    return { author, quote };
  });
}

function splitLines(value) {
  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitTags(value) {
  return splitLines(value).map((item) => (item.startsWith('#') ? item : `#${item}`));
}


function parseAssetUploadsJson(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function brandAssetTypeForMime(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'document';
  return 'other';
}

async function upsertBrandAsset({ brand, user, asset }) {
  if (!asset.url) return null;
  const query = asset.publicId
    ? { brand: brand._id, publicId: asset.publicId }
    : { brand: brand._id, url: asset.url, type: asset.type || 'other' };
  const existing = await BrandAsset.findOne(query);
  if (existing) {
    existing.type = asset.type || existing.type;
    existing.title = asset.title || existing.title;
    existing.mimeType = asset.mimeType || existing.mimeType;
    existing.sizeBytes = Number(asset.sizeBytes || existing.sizeBytes || 0);
    existing.isDefault = Boolean(asset.isDefault || existing.isDefault);
    existing.status = 'active';
    await existing.save();
    return existing;
  }
  return addBrandAsset({
    brand,
    uploadedBy: user._id,
    type: asset.type || 'other',
    title: asset.title || '',
    url: asset.url,
    publicId: asset.publicId || '',
    mimeType: asset.mimeType || '',
    sizeBytes: Number(asset.sizeBytes || 0),
    metadata: asset.metadata || {},
    isDefault: Boolean(asset.isDefault)
  });
}

async function saveBrandUploadAssets({ brand, user, body }) {
  const assets = [];
  if (body.logo) assets.push({ type: 'logo', title: `${brand.name} logo`, url: body.logo, publicId: body.logoPublicId, isDefault: true });
  if (body.favicon) assets.push({ type: 'favicon', title: `${brand.name} favicon`, url: body.favicon, publicId: body.faviconPublicId, isDefault: true });
  if (body.coverImage) assets.push({ type: 'cover', title: `${brand.name} cover image`, url: body.coverImage, publicId: body.coverImagePublicId, isDefault: true });

  parseAssetUploadsJson(body.assetUploadsJson).forEach((asset) => {
    if (!asset || !asset.url) return;
    assets.push({
      type: asset.type || brandAssetTypeForMime(asset.mimeType || ''),
      title: asset.title || asset.fileName || 'Brand asset',
      url: asset.url,
      publicId: asset.publicId || '',
      mimeType: asset.mimeType || '',
      sizeBytes: asset.sizeBytes || 0,
      metadata: asset.metadata || {},
      isDefault: false
    });
  });

  for (const asset of assets) {
    await upsertBrandAsset({ brand, user, asset });
  }
}

async function store(req, res, next) {
  try {
    await assertCanCreateBrand(req.user);
    const brand = await Brand.create({
      owner: req.user._id,
      ...brandPayload(req.body)
    });
    await saveBrandUploadAssets({ brand, user: req.user, body: req.body });
    await updateBrandScore(brand);

    res.redirect(`/dashboard/brand-brain?brand_created=1&brand=${encodeURIComponent(brand.name)}`);
  } catch (error) {
    if (error.status === 402) {
      return res.redirect(`/dashboard/brand-brain?error=${encodeURIComponent(error.message)}`);
    }

    if (error.code === 11000) {
      return res.redirect('/dashboard/brand-brain?error=You%20already%20have%20a%20brand%20with%20this%20name.');
    }

    return next(error);
  }
}

async function show(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.params.id, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    return res.redirect('/dashboard/brand-brain');
  } catch (error) {
    return next(error);
  }
}

async function edit(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.params.id, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    return res.redirect('/dashboard/brand-brain');
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const brand = await Brand.findOne({ _id: req.params.id, owner: req.user._id });
    if (!brand) return res.status(404).render('dashboard/pages/error', { layout: req.user ? 'layouts/dashboard' : 'layouts/main' });

    Object.assign(brand, brandPayload(req.body));
    await brand.save();
    await saveBrandUploadAssets({ brand, user: req.user, body: req.body });
    await updateBrandScore(brand);

    return res.redirect('/dashboard/brand-brain');
  } catch (error) {
    if (error.code === 11000) {
      return res.redirect('/dashboard/brand-brain?error=You%20already%20have%20another%20brand%20with%20this%20name.');
    }

    return next(error);
  }
}

module.exports = { index, create, store, show, edit, update };
