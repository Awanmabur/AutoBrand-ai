const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    status: { type: String, enum: ['pending', 'paid', 'failed', 'cancelled', 'refunded', 'reversed'], default: 'pending', index: true },
    reference: { type: String, index: true },
    providerReference: { type: String, index: true, default: '' },
    checkoutUrl: { type: String, default: '' },
    paidAt: { type: Date },
    failedAt: { type: Date },
    refundedAt: { type: Date },
    reversedAt: { type: Date },
    reconciliationStatus: { type: String, enum: ['idle', 'scheduled', 'processing', 'settled', 'exhausted'], default: 'idle', index: true },
    nextReconcileAt: { type: Date, index: true },
    lastReconciledAt: { type: Date },
    reconciliationLeaseUntil: { type: Date, index: true },
    reconciliationLeaseOwner: { type: String, default: '', maxlength: 120 },
    reconciliationAttempts: { type: Number, default: 0, min: 0 },
    reconciliationError: { type: String, default: '', maxlength: 1000 },
    planSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    billingChange: { type: mongoose.Schema.Types.Mixed, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true, optimisticConcurrency: true }
);

paymentSchema.index({ provider: 1, reference: 1 }, { unique: true, name: 'uniq_payment_provider_reference' });
paymentSchema.index({ provider: 1, providerReference: 1 });
paymentSchema.index({ provider: 1, status: 1, reconciliationStatus: 1, nextReconcileAt: 1, reconciliationLeaseUntil: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
