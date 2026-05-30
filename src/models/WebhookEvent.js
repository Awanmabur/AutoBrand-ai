const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, index: true },
    eventId: { type: String, required: true, index: true },
    type: { type: String, required: true },
    status: { type: String, enum: ['received', 'processed', 'failed', 'ignored'], default: 'received' },
    payload: { type: mongoose.Schema.Types.Mixed },
    errorMessage: { type: String },
    processedAt: { type: Date }
  },
  { timestamps: true }
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
