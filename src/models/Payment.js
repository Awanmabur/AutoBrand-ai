const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    status: { type: String, enum: ['pending', 'paid', 'failed', 'cancelled', 'refunded'], default: 'pending', index: true },
    reference: { type: String, index: true },
    providerReference: { type: String, index: true, default: '' },
    checkoutUrl: { type: String, default: '' },
    paidAt: { type: Date },
    failedAt: { type: Date },
    metadata: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

paymentSchema.index({ provider: 1, reference: 1 });
paymentSchema.index({ provider: 1, providerReference: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
