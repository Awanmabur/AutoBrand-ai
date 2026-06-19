const mongoose = require('mongoose');

const limitsSchema = new mongoose.Schema(
  {
    maxBrands: { type: Number, default: 1 },
    maxSocialAccounts: { type: Number, default: 1 },
    maxTeamMembers: { type: Number, default: 0 },
    maxScheduledPosts: { type: Number, default: 10 },
    maxAutoPosts: { type: Number, default: 0 },
    maxHandoffPosts: { type: Number, default: 5 },
    maxAiTextGenerations: { type: Number, default: 25 },
    maxAiImageGenerations: { type: Number, default: 5 },
    maxAiVideoGenerations: { type: Number, default: 0 },
    maxAvatarVideos: { type: Number, default: 0 },
    maxStorageMb: { type: Number, default: 250 },
    maxClientApprovalLinks: { type: Number, default: 0 }
  },
  { _id: false }
);

const featureSchema = new mongoose.Schema(
  {
    brandBrainLevel: { type: String, default: 'basic' },
    smartComposerLevel: { type: String, default: 'basic' },
    analyticsLevel: { type: String, default: 'basic' },
    calendarAccess: { type: Boolean, default: true },
    campaignAccess: { type: Boolean, default: false },
    growthStudioAccess: { type: Boolean, default: false },
    autoModeAccess: { type: Boolean, default: false },
    handoffModeAccess: { type: Boolean, default: true },
    approvalWorkflowAccess: { type: Boolean, default: false },
    clientApprovalPortalAccess: { type: Boolean, default: false },
    contentRepurposingAccess: { type: Boolean, default: false },
    bulkCreateAccess: { type: Boolean, default: false },
    contentScoreAccess: { type: Boolean, default: false },
    brandFitCheckerAccess: { type: Boolean, default: false },
    riskCheckerAccess: { type: Boolean, default: false },
    bestTimeSuggestionAccess: { type: Boolean, default: false },
    competitorWatchAccess: { type: Boolean, default: false },
    whiteLabelAccess: { type: Boolean, default: false },
    prioritySupportAccess: { type: Boolean, default: false },
    templateAccess: { type: Boolean, default: true },
    failedPostRecoveryAccess: { type: Boolean, default: false },
    agencyWorkspaceAccess: { type: Boolean, default: false }
  },
  { _id: false, strict: false }
);

const aiConfigSchema = new mongoose.Schema(
  {
    allowedProviders: [{ type: String }],
    allowedModels: [{ type: String }],
    defaultTextProvider: { type: String, default: 'local' },
    defaultTextModel: { type: String, default: 'local-fast' },
    defaultImageProvider: { type: String, default: '' },
    defaultImageModel: { type: String, default: '' },
    defaultVideoProvider: { type: String, default: '' },
    defaultVideoModel: { type: String, default: '' },
    fallbackProvider: { type: String, default: 'local' },
    fallbackModel: { type: String, default: 'local-fallback' },
    allowUserProviderSelection: { type: Boolean, default: false },
    monthlyTokenLimit: { type: Number, default: 0 },
    monthlyImageLimit: { type: Number, default: 0 },
    monthlyVideoLimit: { type: Number, default: 0 }
  },
  { _id: false, strict: false }
);

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, trim: true, default: '' },
    price: { type: Number, required: true, min: 0, default: 0 },
    currency: { type: String, uppercase: true, default: 'USD' },
    billingInterval: { type: String, enum: ['trial', 'month', 'year', 'one_time'], default: 'month' },
    trialDays: { type: Number, default: 0, min: 0 },
    features: { type: featureSchema, default: () => ({}) },
    featureList: [{ type: String }],
    limits: { type: limitsSchema, default: () => ({}) },
    aiConfig: { type: aiConfigSchema, default: () => ({}) },
    queuePriority: { type: Number, default: 5 },
    isActive: { type: Boolean, default: true, index: true },
    isPublic: { type: Boolean, default: true, index: true },
    isPopular: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 100, index: true },
    deletedAt: { type: Date },
    paymentProviderPlanId: { type: String, trim: true, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    taxBehavior: { type: String, default: '' }
  },
  { timestamps: true }
);

subscriptionPlanSchema.index({ isActive: 1, isPublic: 1, sortOrder: 1 });

subscriptionPlanSchema.virtual('isTrial').get(function isTrial() {
  return this.billingInterval === 'trial' || Number(this.price || 0) === 0;
});

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
