const mongoose = require('mongoose');

const platformVariationSchema = new mongoose.Schema(
  {
    platform: { type: String, required: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount' },
    caption: { type: String, default: '' },
    hashtags: [{ type: String }],
    firstComment: { type: String, default: '' },
    altText: { type: String, default: '' },
    thumbnail: { type: String, default: '' },
    videoTitle: { type: String, default: '' },
    videoDescription: { type: String, default: '' },
    shortVideoHook: { type: String, default: '' },
    ctaStyle: { type: String, default: '' },
    toneOverride: { type: String, default: '' },
    validationWarnings: [{ type: String }],
    contentScore: { type: Number, default: 0 },
    brandFitScore: { type: Number, default: 0 },
    riskScore: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    platform: { type: String, required: true, default: 'facebook', index: true },
    platforms: [{ type: String, index: true }],
    type: { type: String, enum: ['text', 'image', 'carousel', 'video', 'avatar_video', 'reel', 'story', 'article', 'campaign', 'link', 'whatsapp_message'], default: 'text' },
    contentGoal: {
      type: String,
      enum: ['awareness', 'engagement', 'sales', 'traffic', 'lead_generation', 'community', 'customer_support', 'launch', 'event', 'other'],
      default: 'awareness'
    },
    workflowMode: { type: String, enum: ['manual', 'handoff', 'auto'], default: 'manual', index: true },
    autoPublishEnabled: { type: Boolean, default: false },
    publishAfterApproval: { type: Boolean, default: false },
    approvalRequired: { type: Boolean, default: false },
    handoffStatus: { type: String, enum: ['none', 'drafting', 'ready', 'sent', 'approved', 'rejected', 'changes_requested', 'completed'], default: 'none', index: true },
    handoffAssignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    handoffReviewerEmail: { type: String, trim: true, lowercase: true, default: '' },
    handoffNotes: { type: String, default: '' },
    handoffChecklist: [{ label: String, done: { type: Boolean, default: false } }],
    handoffDueDate: { type: Date },

    title: { type: String, trim: true },
    description: { type: String, trim: true },
    caption: { type: String, required: true, trim: true },
    hashtags: [{ type: String }],
    firstComment: { type: String, default: '' },
    altText: { type: String, default: '' },
    thumbnail: { type: String, default: '' },
    videoTitle: { type: String, default: '' },
    videoDescription: { type: String, default: '' },
    shortVideoHook: { type: String, default: '' },
    ctaStyle: { type: String, default: '' },
    toneOverride: { type: String, default: '' },
    aiProvider: { type: String, default: '' },
    aiModel: { type: String, default: '' },
    platformVariations: [platformVariationSchema],
    validationWarnings: [{ type: String }],
    contentScore: { type: Number, default: 0 },
    brandFitScore: { type: Number, default: 0 },
    riskScore: { type: Number, default: 0 },

    media: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Media' }],
    targetAccounts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount' }],
    link: { type: String },
    status: {
      type: String,
      enum: ['draft', 'pending_approval', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'cancelled', 'rejected'],
      default: 'draft',
      index: true
    },
    scheduledAt: { type: Date, index: true },
    publishedAt: { type: Date },
    platformPostId: { type: String },
    platformPostUrl: { type: String },
    publishResults: [
      {
        account: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount' },
        accountName: String,
        platform: String,
        status: { type: String, enum: ['published', 'failed'], default: 'published' },
        platformPostId: String,
        platformPostUrl: String,
        errorMessage: String,
        publishedAt: Date
      }
    ],
    errorMessage: { type: String },
    retryCount: { type: Number, default: 0 },
    idempotencyKey: { type: String, index: true },
    platformMetadata: { type: mongoose.Schema.Types.Mixed },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

postSchema.index({ brand: 1, status: 1, scheduledAt: 1 });
postSchema.index({ createdBy: 1, createdAt: -1 });
postSchema.index({ workflowMode: 1, status: 1 });

module.exports = mongoose.model('Post', postSchema);
