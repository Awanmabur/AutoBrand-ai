const mongoose = require('mongoose');

const stringArray = [{ type: String, trim: true }];

const brandSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 140 },
    slug: { type: String, required: true, lowercase: true, trim: true, index: true },

    logo: { type: String },
    logoPublicId: { type: String },
    favicon: { type: String, default: '' },
    faviconPublicId: { type: String, default: '' },
    coverImage: { type: String, default: '' },
    coverImagePublicId: { type: String, default: '' },
    assetUploads: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BrandAsset' }],

    businessType: { type: String, trim: true },
    description: { type: String, trim: true },
    website: { type: String, trim: true },
    industry: { type: String, trim: true, default: '' },
    location: { type: String, trim: true },
    timezone: { type: String, default: 'Africa/Kampala' },
    language: { type: String, default: 'English' },
    targetCountries: stringArray,

    slogan: { type: String, trim: true, default: '' },
    tagline: { type: String, trim: true, default: '' },
    mission: { type: String, trim: true, default: '' },
    vision: { type: String, trim: true, default: '' },
    values: stringArray,
    uniqueSellingPoint: { type: String, trim: true, default: '' },
    brandStory: { type: String, trim: true, default: '' },

    targetAudience: { type: String, trim: true },
    audienceAgeRange: { type: String, trim: true, default: '' },
    audienceInterests: stringArray,
    customerPainPoints: stringArray,
    customerDesires: stringArray,
    customerObjections: stringArray,
    customerPersonas: [{ name: String, description: String, goals: String, objections: String }],

    tone: { type: String, default: 'clean, friendly, local' },
    toneOfVoice: { type: String, trim: true, default: '' },
    writingStyle: { type: String, trim: true, default: '' },
    bannedWords: stringArray,
    blockedWords: stringArray,
    preferredWords: stringArray,
    emojiUsage: { type: String, trim: true, default: '' },
    hashtagStyle: { type: String, trim: true, default: '' },
    formalityLevel: { type: String, trim: true, default: '' },
    humorLevel: { type: String, trim: true, default: '' },
    ctaStyle: { type: String, trim: true, default: '' },
    contentPillars: stringArray,
    contentDos: stringArray,
    contentDonts: stringArray,
    complianceNotes: stringArray,

    products: [{ name: String, description: String, price: String, url: String }],
    services: [{ name: String, description: String, price: String, url: String }],
    offers: [{ title: String, description: String, startsAt: Date, endsAt: Date, price: String, guarantee: String }],
    pricingNotes: { type: String, trim: true, default: '' },
    guarantees: stringArray,
    faqs: [{ question: String, answer: String }],

    competitors: stringArray,
    competitorLinks: [{ name: String, url: String, notes: String }],
    differentiationNotes: { type: String, trim: true, default: '' },

    socialLinks: [{ platform: String, url: String }],
    postingFrequency: { type: String },
    defaultPostingTimes: stringArray,
    approvalRequiredByDefault: { type: Boolean, default: false },
    autoPostingPreferences: { type: mongoose.Schema.Types.Mixed, default: {} },
    autoPosting: {
      enabled: { type: Boolean, default: false },
      postsPerDay: { type: Number, default: 1 },
      postsPerWeek: { type: Number, default: 7 },
      postsPerMonth: { type: Number, default: 30 },
      frequencyUnit: { type: String, enum: ['day', 'week', 'month'], default: 'week' },
      preferredSlots: [{ type: String }],
      platformLanguages: { type: mongoose.Schema.Types.Mixed },
      mediaMix: [{ type: String }],
      imagesPerPostMin: { type: Number, default: 1 },
      imagesPerPostMax: { type: Number, default: 3 },
      customerGoal: { type: String, default: 'get customers immediately with clear offers and strong calls to action' },
      requireMedia: { type: Boolean, default: true },
      strengthTarget: { type: Number, default: 90 }
    },

    testimonials: [{ author: String, quote: String }],
    brandRules: [{ type: String }],
    preferredHashtags: stringArray,
    goals: stringArray,
    brandColors: stringArray,
    fonts: stringArray,
    fontStyle: { type: String },
    preferredCta: { type: String },
    localStyle: { type: String },

    savedPrompts: [{ title: String, prompt: String, taskType: String }],
    rejectedStyles: stringArray,
    previousBestPosts: [{ title: String, caption: String, platform: String, metrics: mongoose.Schema.Types.Mixed }],
    highPerformingTopics: stringArray,
    brandKnowledgeBase: [{ title: String, content: String, source: String }],

    brandCompletenessScore: { type: Number, default: 0 },
    brandVoiceSummary: { type: String, default: '' },
    lastScoredAt: { type: Date },

    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true }
  },
  { timestamps: true }
);

brandSchema.index({ owner: 1, slug: 1 }, { unique: true });
brandSchema.index({ owner: 1, status: 1 });

module.exports = mongoose.model('Brand', brandSchema);
