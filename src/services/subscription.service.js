const SubscriptionPlan = require('../models/SubscriptionPlan');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const UsageRecord = require('../models/UsageRecord');
const { DEFAULT_PLAN_MATRIX } = require('./subscription/defaultPlans');
const { buildPlanSeedOperation } = require('./subscription/planSeedOperation');

function normalizeSlug(slug) {
  return String(slug || 'free-trial').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

function plainPlan(plan) {
  if (!plan) return null;
  const source = typeof plan.toObject === 'function' ? plan.toObject({ virtuals: true }) : plan;
  return {
    ...source,
    price: Number(source.price || 0),
    isTrial: source.billingInterval === 'trial' || Number(source.price || 0) === 0
  };
}

function defaultPlanBySlug(slug = 'free-trial') {
  const normalized = normalizeSlug(slug);
  return DEFAULT_PLAN_MATRIX.find((plan) => plan.slug === normalized) || DEFAULT_PLAN_MATRIX[0];
}

async function seedDefaultPlans({ overwrite = false } = {}) {
  const results = [];
  for (const plan of DEFAULT_PLAN_MATRIX) {
    const options = { upsert: true, new: true, setDefaultsOnInsert: true };
    const operation = buildPlanSeedOperation(plan, { overwrite });
    const saved = await SubscriptionPlan.findOneAndUpdate({ slug: plan.slug }, operation, options);
    results.push(saved);
  }
  return results;
}

async function listPlans({ includeInactive = false, publicOnly = false, includeDeleted = false } = {}) {
  const query = {};
  if (!includeInactive) query.isActive = true;
  if (publicOnly) query.isPublic = true;
  if (!includeDeleted) query.deletedAt = { $exists: false };
  const plans = await SubscriptionPlan.find(query).sort({ sortOrder: 1, price: 1, name: 1 });
  if (plans.length) return plans;
  return DEFAULT_PLAN_MATRIX
    .filter((plan) => (includeInactive || plan.isActive !== false) && (!publicOnly || plan.isPublic !== false))
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

async function listPublicPlans() {
  return listPlans({ publicOnly: true });
}

async function getPlanBySlug(slug, { includeInactive = false } = {}) {
  const normalized = normalizeSlug(slug);
  const query = { slug: normalized, deletedAt: { $exists: false } };
  if (!includeInactive) query.isActive = true;
  const plan = await SubscriptionPlan.findOne(query);
  return plan || defaultPlanBySlug(normalized);
}

async function getCurrentSubscription(user) {
  if (!user?._id) return null;
  return Subscription.findOne({ user: user._id }).populate('planRef').sort({ createdAt: -1 });
}

async function getCurrentPlan(user) {
  if (user?.role === 'super_admin') return defaultPlanBySlug('superadmin');
  const subscription = await getCurrentSubscription(user);
  if (subscription?.planRef) return subscription.planRef;
  return getPlanBySlug(subscription?.plan || user?.plan || 'free-trial', { includeInactive: true });
}

function calculateSubscriptionDates(plan) {
  const startsAt = new Date();
  const price = Number(plan.price || 0);
  const isTrial = plan.billingInterval === 'trial' || price === 0;
  const trialDays = Number(plan.trialDays || (isTrial ? 7 : 0));
  const trialEndsAt = trialDays ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000) : undefined;
  const renewsAt = plan.billingInterval === 'month'
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    : plan.billingInterval === 'year'
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      : trialEndsAt;
  return { startsAt, trialEndsAt, renewsAt, currentPeriodStart: startsAt, currentPeriodEnd: renewsAt };
}

async function activatePlanForUser(user, planSlug, { status, paymentProvider = 'manual', metadata = {} } = {}) {
  const plan = await getPlanBySlug(planSlug);
  if (!plan || plan.isActive === false) throw new Error('Selected plan is not available.');
  const isTrial = plan.billingInterval === 'trial' || Number(plan.price || 0) === 0;
  const dates = calculateSubscriptionDates(plan);
  const resolvedStatus = status || (isTrial ? 'trialing' : 'active');

  const subscription = await Subscription.findOneAndUpdate(
    { user: user._id },
    {
      user: user._id,
      plan: plan.slug,
      planRef: plan._id,
      status: resolvedStatus,
      paymentProvider,
      provider: paymentProvider,
      ...dates,
      metadata
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await User.updateOne(
    { _id: user._id },
    {
      plan: plan.slug,
      trialUsed: user.trialUsed || isTrial,
      selectedPlanSlug: ''
    }
  );

  return { plan, subscription };
}

async function createPendingSubscription(user, planSlug, { paymentProvider = 'manual', metadata = {} } = {}) {
  const plan = await getPlanBySlug(planSlug);
  const dates = calculateSubscriptionDates(plan);
  const subscription = await Subscription.findOneAndUpdate(
    { user: user._id },
    {
      user: user._id,
      plan: plan.slug,
      planRef: plan._id,
      status: 'pending',
      paymentProvider,
      provider: paymentProvider,
      ...dates,
      metadata
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await User.updateOne({ _id: user._id }, { plan: plan.slug, selectedPlanSlug: '' });
  return { plan, subscription };
}

async function countUsage(user, metric, { since, until = new Date() } = {}) {
  if (!user?._id) return 0;
  const query = { user: user._id, metric };
  if (since || until) query.createdAt = {};
  if (since) query.createdAt.$gte = since;
  if (until) query.createdAt.$lte = until;
  const rows = await UsageRecord.aggregate([
    { $match: query },
    { $group: { _id: null, total: { $sum: '$quantity' } } }
  ]);
  return rows[0]?.total || 0;
}

function isUnlimited(value, user) {
  return user?.role === 'super_admin' || Number(value) < 0;
}

async function checkLimit(user, limitName, currentValue) {
  const plan = await getCurrentPlan(user);
  const limit = plan?.limits?.[limitName];
  if (isUnlimited(limit, user)) return { allowed: true, limit, used: currentValue || 0, plan: plainPlan(plan) };
  const used = Number(currentValue || 0);
  const allowed = used < Number(limit || 0);
  const percent = Number(limit || 0) > 0 ? Math.round((used / Number(limit)) * 100) : 100;
  return { allowed, limit: Number(limit || 0), used, percent, plan: plainPlan(plan), upgradePrompt: percent >= 80 };
}

module.exports = {
  DEFAULT_PLAN_MATRIX,
  activatePlanForUser,
  buildPlanSeedOperation,
  calculateSubscriptionDates,
  checkLimit,
  countUsage,
  createPendingSubscription,
  defaultPlanBySlug,
  getCurrentPlan,
  getCurrentSubscription,
  getPlanBySlug,
  listPlans,
  listPublicPlans,
  normalizeSlug,
  plainPlan,
  seedDefaultPlans
};
