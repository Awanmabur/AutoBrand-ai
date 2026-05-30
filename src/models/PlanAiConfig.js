const mongoose = require('mongoose');

const planAiConfigSchema = new mongoose.Schema(
  {
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true, index: true },
    taskType: { type: String, required: true, index: true },
    primaryProvider: { type: String, default: 'local' },
    primaryModel: { type: String, default: 'local-fast' },
    fallbackProvider: { type: String, default: 'local' },
    fallbackModel: { type: String, default: 'local-fallback' },
    allowedProviders: [{ type: String }],
    allowedModels: [{ type: String }],
    monthlyTokenLimit: { type: Number, default: 0 },
    monthlyImageLimit: { type: Number, default: 0 },
    monthlyVideoLimit: { type: Number, default: 0 },
    queuePriority: { type: Number, default: 5 },
    allowUserSelection: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

planAiConfigSchema.index({ plan: 1, taskType: 1 }, { unique: true });

module.exports = mongoose.model('PlanAiConfig', planAiConfigSchema);
