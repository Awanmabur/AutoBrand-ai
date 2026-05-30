const mongoose = require('mongoose');

const aiJobSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },
    taskType: { type: String, required: true, index: true },
    provider: { type: String, required: true, index: true },
    model: { type: String, default: '' },
    promptHash: { type: String, index: true },
    status: { type: String, enum: ['queued', 'running', 'completed', 'failed', 'cancelled'], default: 'queued', index: true },
    priority: { type: Number, default: 5, index: true },
    result: { type: mongoose.Schema.Types.Mixed },
    error: { type: String, default: '' },
    retries: { type: Number, default: 0 },
    startedAt: { type: Date },
    completedAt: { type: Date },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

aiJobSchema.index({ status: 1, priority: 1, createdAt: 1 });

module.exports = mongoose.model('AiJob', aiJobSchema);
