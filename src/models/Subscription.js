const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plan: { type: String, default: 'free-trial', index: true },
    planRef: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', index: true },
    status: {
      type: String,
      enum: ['active', 'trialing', 'pending', 'incomplete', 'past_due', 'cancelled', 'expired'],
      default: 'active',
      index: true
    },
    startsAt: { type: Date },
    endsAt: { type: Date },
    trialEndsAt: { type: Date },
    renewsAt: { type: Date },
    cancelledAt: { type: Date },
    paymentProvider: { type: String, default: 'pesapal' },
    provider: { type: String, default: 'pesapal' },
    paymentProviderCustomerId: { type: String },
    paymentProviderSubscriptionId: { type: String },
    providerCustomerId: { type: String },
    providerSubscriptionId: { type: String },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    creditsUsed: { type: Number, default: 0, min: 0 },
    aiTokensUsed: { type: Number, default: 0, min: 0 },
    aiTokensReserved: { type: Number, default: 0, min: 0 },
    aiTokenReservations: [{
      reservationId: { type: String, required: true },
      tokens: { type: Number, required: true, min: 0 },
      createdAt: { type: Date, default: Date.now },
      expiresAt: { type: Date, required: true }
    }],
    planSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    scheduledPlanChange: {
      targetPlan: { type: String, trim: true, default: '' },
      targetPlanRef: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
      targetPlanSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
      requestedAt: { type: Date },
      effectiveAt: { type: Date },
      status: { type: String, enum: ['pending', 'applied', 'cancelled'], default: undefined },
      reason: { type: String, trim: true, default: '' }
    },
    activationKey: { type: String, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ planRef: 1, status: 1 });
subscriptionSchema.index({ activationKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
