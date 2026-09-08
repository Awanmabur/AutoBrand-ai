const mongoose = require('mongoose');

const analyticsSyncJobSchema = new mongoose.Schema(
  {
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount', required: true, index: true },
    platform: { type: String, required: true, index: true },
    providerPostId: { type: String, required: true, trim: true },
    originalProviderPostId: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['queued', 'running', 'retry', 'succeeded', 'unsupported'],
      default: 'queued',
      index: true
    },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    leaseOwner: { type: String, default: '', index: true },
    leaseUntil: { type: Date, index: true },
    attemptCount: { type: Number, default: 0 },
    consecutiveFailures: { type: Number, default: 0 },
    lastAttemptAt: { type: Date },
    lastSuccessAt: { type: Date },
    lastError: { type: String, default: '' },
    unsupportedReason: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

analyticsSyncJobSchema.index({ post: 1, account: 1, platform: 1 }, { unique: true });
analyticsSyncJobSchema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 });

module.exports = mongoose.model('AnalyticsSyncJob', analyticsSyncJobSchema);
