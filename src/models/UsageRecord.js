const mongoose = require('mongoose');

const usageRecordSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', index: true },
    planSlug: { type: String, index: true },
    metric: { type: String, required: true, index: true },
    taskType: { type: String, index: true },
    provider: { type: String, index: true },
    model: { type: String, default: '' },
    tokensUsed: { type: Number, default: 0 },
    mediaCount: { type: Number, default: 0 },
    quantity: { type: Number, default: 1 },
    costEstimate: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now, index: true }
  },
  { updatedAt: false }
);

usageRecordSchema.index({ user: 1, metric: 1, createdAt: 1 });

module.exports = mongoose.model('UsageRecord', usageRecordSchema);
