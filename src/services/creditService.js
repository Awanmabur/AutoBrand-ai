const mongoose = require('mongoose');
const CreditLedger = require('../models/CreditLedger');
const Subscription = require('../models/Subscription');
const { notifyLowCredits } = require('./notification.service');
const { getCurrentSubscription, getPlanBySlug } = require('./subscription.service');
const { resolveBillingUser } = require('./usageLimitService');

function normalizedAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.ceil(amount);
}

async function subscriptionCreditContext(user) {
  if (!user?._id) return { subscription: null, plan: null, included: 0, used: 0, balance: 0 };
  if (user.role === 'super_admin') {
    return { subscription: null, plan: null, included: -1, used: 0, balance: Number.MAX_SAFE_INTEGER };
  }

  const subscription = await getCurrentSubscription(user);
  if (!subscription) return { subscription: null, plan: null, included: 0, used: 0, balance: 0 };
  const plan = subscription.planRef || await getPlanBySlug(subscription.plan, { includeInactive: true });
  const included = Number(plan?.includedCredits || 0);
  const used = Number(subscription.creditsUsed || 0);
  return {
    subscription,
    plan,
    included,
    used,
    balance: included < 0 ? Number.MAX_SAFE_INTEGER : Math.max(included - used, 0)
  };
}

async function getBalance(user, { brandId } = {}) {
  const billingUser = brandId ? await resolveBillingUser(user, brandId) : user;
  const context = await subscriptionCreditContext(billingUser);
  return context.balance;
}

async function spendCredits({ user, brandId, amount, reason, referenceType, referenceId }) {
  const charge = normalizedAmount(amount);
  if (!charge) return getBalance(user, { brandId });

  const billingUser = brandId ? await resolveBillingUser(user, brandId) : user;
  if (!billingUser?._id) throw new Error('Billing workspace is unavailable.');
  if (billingUser.role === 'super_admin') return Number.MAX_SAFE_INTEGER;

  const context = await subscriptionCreditContext(billingUser);
  if (!context.subscription || !context.plan) {
    const error = new Error('An active subscription is required for AI generation.');
    error.status = 402;
    throw error;
  }

  if (context.included < 0) return Number.MAX_SAFE_INTEGER;
  if (charge > context.included) {
    const error = new Error(`This generation needs ${charge} AI credits, but the current plan includes ${context.included} credits per subscription period.`);
    error.status = 402;
    throw error;
  }

  // Legacy subscriptions may predate creditsUsed. Initialize once, then reserve the
  // charge atomically so concurrent AI requests cannot overspend the workspace period.
  await Subscription.updateOne(
    { _id: context.subscription._id, creditsUsed: mongoose.trusted({ $exists: false }) },
    { $set: { creditsUsed: 0 } }
  ).catch(() => {});

  const updated = await Subscription.findOneAndUpdate(
    {
      _id: context.subscription._id,
      status: mongoose.trusted({ $in: ['active', 'trialing'] }),
      creditsUsed: mongoose.trusted({ $lte: context.included - charge })
    },
    { $inc: { creditsUsed: charge } },
    { new: true }
  );

  if (!updated) {
    const fresh = await Subscription.findById(context.subscription._id).select('creditsUsed').lean();
    const used = Number(fresh?.creditsUsed || 0);
    const error = new Error(`AI credit allowance reached for this subscription period (${used}/${context.included}).`);
    error.status = 402;
    error.limitName = 'includedCredits';
    error.limit = context.included;
    error.used = used;
    throw error;
  }

  const balanceAfter = Math.max(context.included - Number(updated.creditsUsed || 0), 0);
  CreditLedger.create({
    user: billingUser._id,
    actor: user?._id || billingUser._id,
    brand: brandId || undefined,
    type: 'usage',
    amount: -charge,
    balanceAfter,
    reason,
    referenceType,
    referenceId
  }).catch((error) => console.error('AI credit ledger write failed:', error.message));

  notifyLowCredits({ user: billingUser, balance: balanceAfter }).catch(() => {});
  return balanceAfter;
}

module.exports = { getBalance, spendCredits, subscriptionCreditContext };
