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
    activationKey: { type: String, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ planRef: 1, status: 1 });
subscriptionSchema.index({ activationKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
