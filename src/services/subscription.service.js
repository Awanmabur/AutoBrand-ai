const SubscriptionPlan = require('../models/SubscriptionPlan');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const UsageRecord = require('../models/UsageRecord');
const { DEFAULT_PLAN_MATRIX } = require('./subscription/defaultPlans');
const { buildPlanSeedOperation } = require('./subscription/planSeedOperation');
const { planFromSnapshot, snapshotPlan } = require('./subscription/planSnapshot.service');

function normalizeSlug(slug) {
  return String(slug || 'free-trial').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

function plainPlan(plan) {
  if (!plan) return null;
  const source = typeof plan.toObject === 'function' ? plan.toObject({ virtuals: true }) : plan;
  return { ...source, price: Number(source.price || 0), isTrial: source.billingInterval === 'trial' || Number(source.price || 0) === 0 };
}

function defaultPlanBySlug(slug = 'free-trial') {
  const normalized = normalizeSlug(slug);
  return DEFAULT_PLAN_MATRIX.find((plan) => plan.slug === normalized) || DEFAULT_PLAN_MATRIX[0];
}

const BILLING_REQUIRED_PLAN = Object.freeze({
  name: 'Billing required', slug: 'billing-required', description: 'No paid entitlement is active. Complete payment to resume publishing.',
  price: 0, currency: 'USD', billingInterval: 'one_time', isPublic: false, isActive: true, sortOrder: 998, queuePriority: 0, includedCredits: 0,
  limits: { maxBrands: 0, maxSocialAccounts: 0, maxTeamMembers: 0, maxScheduledPosts: 0, maxManualPosts: 0, maxAiTextGenerations: 0, maxAiImageGenerations: 0, maxAiVideoGenerations: 0, maxAvatarVideos: 0, maxHandoffPosts: 0, maxAutoPosts: 0, maxClientApprovalLinks: 0, maxStorageMb: 0 },
  features: { brandBrainLevel: 'none', smartComposerLevel: 'none', analyticsLevel: 'none', calendarAccess: false, campaignAccess: false, growthStudioAccess: false, manualPublisherAccess: false, bulkImportAccess: false, autoModeAccess: false, handoffModeAccess: false, approvalWorkflowAccess: false },
  aiConfig: { allowedProviders: [], allowedModels: [], monthlyTokenLimit: 0, monthlyImageLimit: 0, monthlyVideoLimit: 0, allowUserProviderSelection: false },
  featureList: ['Billing and settings access only']
});

async function seedDefaultPlans({ overwrite = false } = {}) {
  const results = [];
  for (const plan of DEFAULT_PLAN_MATRIX) {
    results.push(await SubscriptionPlan.findOneAndUpdate({ slug: plan.slug }, buildPlanSeedOperation(plan, { overwrite }), { upsert: true, new: true, setDefaultsOnInsert: true }));
  }
  return results;
}

async function listPlans({ includeInactive = false, publicOnly = false, includeDeleted = false } = {}) {
  const query = {};
  if (!includeInactive) query.isActive = true;
  if (publicOnly) query.isPublic = true;
  if (!includeDeleted) query.deletedAt = null;
  const plans = await SubscriptionPlan.find(query).sort({ sortOrder: 1, price: 1, name: 1 });
  if (plans.length) return plans;
  return DEFAULT_PLAN_MATRIX.filter((plan) => (includeInactive || plan.isActive !== false) && (!publicOnly || plan.isPublic !== false)).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

async function listPublicPlans() { return listPlans({ publicOnly: true }); }

async function getPlanBySlug(slug, { includeInactive = false } = {}) {
  const normalized = normalizeSlug(slug);
  const query = { slug: normalized, deletedAt: null };
  if (!includeInactive) query.isActive = true;
  const plan = await SubscriptionPlan.findOne(query);
  return plan || defaultPlanBySlug(normalized);
}

function entitlementDateQuery(now = new Date()) {
  return {
    status: { $in: ['active', 'trialing'] },
    $and: [
      { $or: [{ currentPeriodStart: { $lte: now } }, { currentPeriodStart: null }, { currentPeriodStart: { $exists: false } }] },
      { $or: [{ currentPeriodEnd: { $gt: now } }, { currentPeriodEnd: null }] },
      { $or: [{ trialEndsAt: { $gt: now } }, { trialEndsAt: null }, { status: 'active' }] }
    ]
  };
}

async function processDueScheduledPlanChanges(userId, now = new Date()) {
  if (!userId) return { applied: 0 };
  const due = await Subscription.find({
    user: userId,
    status: { $in: ['active', 'trialing'] },
    currentPeriodEnd: { $lte: now },
    'scheduledPlanChange.status': 'pending',
    'scheduledPlanChange.effectiveAt': { $lte: now }
  }).sort({ currentPeriodEnd: 1, createdAt: 1 });

  let applied = 0;
  for (const subscription of due) {
    const target = subscription.scheduledPlanChange?.targetPlan;
    subscription.status = 'expired';
    subscription.endsAt = subscription.currentPeriodEnd || now;
    subscription.scheduledPlanChange.status = 'applied';
    await subscription.save();
    if (target) {
      await User.updateOne({ _id: userId }, { $set: { selectedPlanSlug: target } }, { runValidators: true });
    }
    applied += 1;
  }
  return { applied };
}

async function getCurrentSubscription(user) {
  if (!user?._id) return null;
  await processDueScheduledPlanChanges(user._id);
  return Subscription.findOne({ user: user._id, ...entitlementDateQuery() }).populate('planRef').sort({ createdAt: -1 });
}

async function planForSubscription(subscription) {
  if (!subscription) return null;
  if (subscription.planSnapshot?.slug) return planFromSnapshot(subscription.planSnapshot, subscription.planRef?._id || subscription.planRef);
  if (subscription.planRef) return subscription.planRef;
  if (subscription.plan) return getPlanBySlug(subscription.plan, { includeInactive: true });
  return null;
}

async function getCurrentPlan(user) {
  if (user?.role === 'super_admin') return defaultPlanBySlug('superadmin');
  const subscription = await getCurrentSubscription(user);
  const contractedPlan = await planForSubscription(subscription);
  if (contractedPlan) return contractedPlan;

  const fallbackSlug = normalizeSlug(user?.plan || 'free-trial');
  // Never trust a paid User.plan field without a valid active/trialing Subscription.
  const fallback = defaultPlanBySlug(fallbackSlug);
  const fallbackIsFreeTrial = fallback.billingInterval === 'trial' || Number(fallback.price || 0) === 0;
  if (!fallbackIsFreeTrial || user?.trialUsed) return BILLING_REQUIRED_PLAN;
  return getPlanBySlug('free-trial', { includeInactive: true });
}

function calendarMonthWindow(date = new Date()) {
  const value = new Date(date);
  const start = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

function addCalendarMonths(date, months = 1) {
  const source = new Date(date);
  const year = source.getUTCFullYear();
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  const targetFirst = new Date(Date.UTC(year, month + Number(months || 0), 1, source.getUTCHours(), source.getUTCMinutes(), source.getUTCSeconds(), source.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth() + 1, 0)).getUTCDate();
  targetFirst.setUTCDate(Math.min(day, lastDay));
  return targetFirst;
}

function addCalendarYears(date, years = 1) {
  const source = new Date(date);
  const targetYear = source.getUTCFullYear() + Number(years || 0);
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  const lastDay = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, month, Math.min(day, lastDay), source.getUTCHours(), source.getUTCMinutes(), source.getUTCSeconds(), source.getUTCMilliseconds()));
}

function calculateSubscriptionDates(plan, at = new Date()) {
  const startsAt = new Date(at);
  const isTrial = plan.billingInterval === 'trial' || Number(plan.price || 0) === 0;
  const trialDays = Number(plan.trialDays || (isTrial ? 7 : 0));
  const trialEndsAt = trialDays > 0 ? new Date(startsAt.getTime() + trialDays * 86400000) : undefined;
  let periodEnd;
  if (plan.billingInterval === 'month') periodEnd = addCalendarMonths(startsAt, 1);
  else if (plan.billingInterval === 'year') periodEnd = addCalendarYears(startsAt, 1);
  else periodEnd = trialEndsAt;
  // `renewsAt` is retained for backward compatibility with existing records. AutoBrand's
  // current Pesapal flow does not auto-charge; currentPeriodEnd is the access/payment-due boundary.
  return { startsAt, trialEndsAt, renewsAt: periodEnd, currentPeriodStart: startsAt, currentPeriodEnd: periodEnd };
}

async function getUsagePeriod(user, now = new Date()) {
  if (!user?._id || user?.role === 'super_admin') {
    const { start, end } = calendarMonthWindow(now);
    return { start, end, source: 'calendar', subscriptionId: null, planSlug: user?.role === 'super_admin' ? 'superadmin' : '' };
  }
  const subscription = await getCurrentSubscription(user);
  if (subscription) {
    const start = new Date(subscription.currentPeriodStart || subscription.startsAt || subscription.createdAt || now);
    const end = new Date(subscription.currentPeriodEnd || subscription.trialEndsAt || subscription.renewsAt || now);
    if (Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && end > start) {
      return {
        start,
        end,
        source: subscription.status === 'trialing' ? 'trial' : 'subscription',
        subscriptionId: subscription._id,
        planSlug: subscription.plan || subscription.planRef?.slug || ''
      };
    }
  }
  const { start, end } = calendarMonthWindow(now);
  return { start, end, source: 'calendar', subscriptionId: null, planSlug: '' };
}


function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function periodRemainingFraction(subscription, now = new Date()) {
  const start = new Date(subscription?.currentPeriodStart || subscription?.startsAt || subscription?.createdAt || now);
  const end = new Date(subscription?.currentPeriodEnd || subscription?.endsAt || now);
  const total = end.getTime() - start.getTime();
  if (!Number.isFinite(total) || total <= 0) return 0;
  const remaining = Math.max(0, end.getTime() - now.getTime());
  return Math.max(0, Math.min(1, remaining / total));
}

async function getPlanChangeQuote(user, targetPlanOrSlug, now = new Date()) {
  const targetPlan = typeof targetPlanOrSlug === 'string'
    ? await getPlanBySlug(targetPlanOrSlug)
    : targetPlanOrSlug;
  if (!targetPlan || targetPlan.isActive === false) {
    const error = new Error('Selected plan is not available.');
    error.status = 404;
    throw error;
  }

  if (user?.role === 'super_admin') {
    return { kind: 'superadmin', targetPlan, amountDue: 0, unusedCredit: 0, remainingFraction: 0, currentSubscription: null, currentPlan: defaultPlanBySlug('superadmin') };
  }

  const currentSubscription = await getCurrentSubscription(user);
  const currentPlan = await planForSubscription(currentSubscription);
  if (!currentSubscription || !currentPlan) {
    return { kind: 'new', targetPlan, amountDue: roundMoney(targetPlan.price), unusedCredit: 0, remainingFraction: 0, currentSubscription: null, currentPlan: null };
  }

  if (String(currentPlan.slug) === String(targetPlan.slug)) {
    return { kind: 'same', targetPlan, amountDue: 0, unusedCredit: 0, remainingFraction: periodRemainingFraction(currentSubscription, now), currentSubscription, currentPlan };
  }

  const currentPrice = Number(currentPlan.price || 0);
  const targetPrice = Number(targetPlan.price || 0);
  const sameCurrency = String(currentPlan.currency || 'USD').toUpperCase() === String(targetPlan.currency || 'USD').toUpperCase();
  const remainingFraction = periodRemainingFraction(currentSubscription, now);

  if (targetPrice <= currentPrice) {
    return {
      kind: targetPrice < currentPrice ? 'downgrade' : 'lateral',
      targetPlan,
      amountDue: 0,
      unusedCredit: 0,
      remainingFraction,
      effectiveAt: currentSubscription.currentPeriodEnd,
      currentSubscription,
      currentPlan
    };
  }

  const unusedCredit = sameCurrency ? roundMoney(currentPrice * remainingFraction) : 0;
  return {
    kind: 'upgrade',
    targetPlan,
    currentSubscription,
    currentPlan,
    remainingFraction,
    unusedCredit,
    fullPrice: roundMoney(targetPrice),
    amountDue: roundMoney(Math.max(0, targetPrice - unusedCredit)),
    currency: String(targetPlan.currency || 'USD').toUpperCase(),
    calculatedAt: new Date(now)
  };
}

async function schedulePlanChange(user, targetPlanOrSlug, { reason = 'user_requested' } = {}) {
  const quote = await getPlanChangeQuote(user, targetPlanOrSlug);
  if (!['downgrade', 'lateral'].includes(quote.kind)) {
    const error = new Error('Only lower-price or equal-price plan switches can be scheduled for period end.');
    error.status = 409;
    throw error;
  }
  const targetSnapshot = snapshotPlan(quote.targetPlan);
  const effectiveAt = new Date(quote.currentSubscription.currentPeriodEnd);
  await Subscription.updateOne(
    { _id: quote.currentSubscription._id, status: { $in: ['active', 'trialing'] } },
    {
      $set: {
        scheduledPlanChange: {
          targetPlan: quote.targetPlan.slug,
          targetPlanRef: quote.targetPlan._id,
          targetPlanSnapshot: targetSnapshot,
          requestedAt: new Date(),
          effectiveAt,
          status: 'pending',
          reason
        },
        cancelAtPeriodEnd: true
      }
    }
  );
  await User.updateOne({ _id: user._id }, { $set: { selectedPlanSlug: quote.targetPlan.slug } });
  return { ...quote, effectiveAt, targetPlanSnapshot: targetSnapshot };
}

async function cancelScheduledPlanChange(user) {
  const subscription = await getCurrentSubscription(user);
  if (!subscription || subscription.scheduledPlanChange?.status !== 'pending') return { cancelled: false, subscription };
  await Subscription.updateOne(
    { _id: subscription._id },
    { $set: { 'scheduledPlanChange.status': 'cancelled', cancelAtPeriodEnd: false } }
  );
  await User.updateOne({ _id: user._id }, { $set: { selectedPlanSlug: '' } });
  return { cancelled: true, subscription };
}

async function activatePlanForUser(user, planSlug, { status, paymentProvider = 'free', metadata = {}, planSnapshot: suppliedPlanSnapshot } = {}) {
  const plan = await getPlanBySlug(planSlug);
  if (!plan || plan.isActive === false) throw new Error('Selected plan is not available.');
  const isTrial = plan.billingInterval === 'trial' || Number(plan.price || 0) === 0;
  const contractedSnapshot = suppliedPlanSnapshot?.slug ? suppliedPlanSnapshot : snapshotPlan(plan);
  if (isTrial && user.trialUsed && !metadata.allowExistingTrial) {
    const existing = await getCurrentSubscription(user);
    if (existing?.plan === plan.slug) return { plan, subscription: existing };
    const error = new Error('The free trial has already been used. Choose a paid plan to continue.');
    error.status = 409;
    throw error;
  }

  const activationKey = metadata.paymentId ? `payment:${String(metadata.paymentId)}` : isTrial ? `trial:${String(user._id)}` : `activation:${String(user._id)}:${Date.now()}`;
  const dates = calculateSubscriptionDates(plan);
  const resolvedStatus = status || (isTrial ? 'trialing' : 'active');
  const now = new Date();

  // The activation key is the financial idempotency boundary. Upsert it atomically before
  // cancelling any older entitlement so concurrent Pesapal callback/IPN deliveries cannot
  // cancel each other's newly-created subscription.
  let subscription;
  try {
    subscription = await Subscription.findOneAndUpdate(
      { activationKey },
      {
        $setOnInsert: {
          user: user._id,
          plan: plan.slug,
          planRef: plan._id,
          planSnapshot: contractedSnapshot,
          aiTokensUsed: 0,
          aiTokensReserved: 0,
          status: resolvedStatus,
          paymentProvider,
          provider: paymentProvider,
          activationKey,
          ...dates,
          metadata
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate('planRef');
  } catch (error) {
    if (error?.code !== 11000) throw error;
    subscription = await Subscription.findOne({ activationKey }).populate('planRef');
  }
  if (!subscription) throw new Error('Subscription activation could not be persisted.');

  // Only the winning activation can cancel older entitlements; never include itself.
  await Subscription.updateMany(
    { user: user._id, _id: { $ne: subscription._id }, status: { $in: ['active', 'trialing'] } },
    { $set: { status: 'cancelled', cancelledAt: now, endsAt: now, cancelAtPeriodEnd: false } }
  );

  await User.updateOne({ _id: user._id }, { $set: { plan: plan.slug, trialUsed: Boolean(user.trialUsed || isTrial), selectedPlanSlug: '' } }, { runValidators: true });
  return { plan: await planForSubscription(subscription) || plan, subscription };
}

// Kept for API compatibility: a pending checkout is not an entitlement and never creates a Subscription.
async function createPendingSubscription(user, planSlug, { paymentProvider = 'pesapal', metadata = {} } = {}) {
  const plan = await getPlanBySlug(planSlug);
  if (!plan || plan.isActive === false) throw new Error('Selected plan is not available.');
  await User.updateOne({ _id: user._id }, { $set: { selectedPlanSlug: plan.slug } }, { runValidators: true });
  return { plan, subscription: null, paymentProvider, metadata };
}

async function revokeSubscriptionForPayment(payment, { reason = 'payment_reversed' } = {}) {
  if (!payment?._id) return null;
  const now = new Date();
  const subscription = await Subscription.findOneAndUpdate(
    { user: payment.user, status: { $in: ['active', 'trialing'] }, 'metadata.paymentId': payment._id },
    { $set: { status: 'cancelled', cancelledAt: now, endsAt: now, cancelAtPeriodEnd: false, 'metadata.revokedReason': reason, 'metadata.revokedAt': now.toISOString() } },
    { new: true }
  );

  let restored = null;
  const previousSubscriptionId = payment.billingChange?.previousSubscriptionId || payment.metadata?.previousSubscriptionId;
  if (subscription && previousSubscriptionId && payment.billingChange?.kind === 'upgrade') {
    const previous = await Subscription.findById(previousSubscriptionId);
    const previousEnd = new Date(previous?.currentPeriodEnd || previous?.endsAt || 0);
    if (previous && Number.isFinite(previousEnd.getTime()) && previousEnd > now) {
      previous.status = previous.trialEndsAt && new Date(previous.trialEndsAt) > now ? 'trialing' : 'active';
      previous.cancelledAt = undefined;
      previous.endsAt = undefined;
      previous.cancelAtPeriodEnd = previous.scheduledPlanChange?.status === 'pending';
      previous.metadata = { ...(previous.metadata || {}), restoredAfterPaymentReversalAt: now.toISOString(), restoredBecause: reason };
      await previous.save();
      restored = previous;
      await User.updateOne({ _id: payment.user }, { $set: { plan: previous.plan, selectedPlanSlug: previous.scheduledPlanChange?.status === 'pending' ? previous.scheduledPlanChange.targetPlan : '' } });
    }
  }

  if (subscription && !restored) await User.updateOne({ _id: payment.user }, { $set: { selectedPlanSlug: '' } });
  return subscription;
}

async function countUsage(user, metric, { since, until = new Date() } = {}) {
  if (!user?._id) return 0;
  const query = { user: user._id, metric };
  if (since || until) query.createdAt = {};
  if (since) query.createdAt.$gte = since;
  if (until) query.createdAt.$lte = until;
  const rows = await UsageRecord.aggregate([{ $match: query }, { $group: { _id: null, total: { $sum: '$quantity' } } }]);
  return Number(rows[0]?.total || 0);
}

function isUnlimited(value, user) { return user?.role === 'super_admin' || Number(value) < 0; }
async function checkLimit(user, limitName, currentValue) {
  const plan = await getCurrentPlan(user); const limit = plan?.limits?.[limitName];
  if (isUnlimited(limit, user)) return { allowed: true, limit, used: Number(currentValue || 0), plan: plainPlan(plan) };
  const numericLimit = Number(limit || 0); const used = Number(currentValue || 0); const allowed = used < numericLimit;
  const percent = numericLimit > 0 ? Math.round((used / numericLimit) * 100) : 100;
  return { allowed, limit: numericLimit, used, percent, plan: plainPlan(plan), upgradePrompt: percent >= 80 };
}

module.exports = { DEFAULT_PLAN_MATRIX, BILLING_REQUIRED_PLAN, activatePlanForUser, addCalendarMonths, addCalendarYears, buildPlanSeedOperation, calculateSubscriptionDates, calendarMonthWindow, cancelScheduledPlanChange, checkLimit, countUsage, createPendingSubscription, defaultPlanBySlug, entitlementDateQuery, getCurrentPlan, getCurrentSubscription, getPlanBySlug, getPlanChangeQuote, getUsagePeriod, listPlans, listPublicPlans, normalizeSlug, periodRemainingFraction, plainPlan, planForSubscription, processDueScheduledPlanChanges, revokeSubscriptionForPayment, roundMoney, schedulePlanChange, seedDefaultPlans };
