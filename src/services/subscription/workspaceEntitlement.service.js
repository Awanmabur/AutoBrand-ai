const Brand = require('../../models/Brand');
const User = require('../../models/User');
const { getCurrentPlan, plainPlan } = require('../subscription.service');

const LEVEL_ORDER = Object.freeze({ none: 0, basic: 1, standard: 2, advanced: 3, premium: 4, unlimited: 100 });

function mergeLimit(values = []) {
  if (values.some((value) => Number(value) < 0)) return -1;
  return Math.max(0, ...values.map((value) => Number(value || 0)).filter(Number.isFinite));
}

function mergeFeature(values = []) {
  if (values.some((value) => value === true)) return true;
  const levelValues = values
    .map((value) => String(value ?? '').toLowerCase())
    .filter((value) => Object.prototype.hasOwnProperty.call(LEVEL_ORDER, value));
  if (levelValues.length) {
    return levelValues.sort((a, b) => LEVEL_ORDER[b] - LEVEL_ORDER[a])[0];
  }
  return values.find((value) => Boolean(value)) || false;
}

function mergePlans(plans = [], personalPlan = null) {
  const normalized = plans.filter(Boolean).map(plainPlan);
  if (!normalized.length) return personalPlan ? plainPlan(personalPlan) : null;
  if (normalized.length === 1) return normalized[0];

  const limitKeys = [...new Set(normalized.flatMap((plan) => Object.keys(plan.limits || {})))];
  const featureKeys = [...new Set(normalized.flatMap((plan) => Object.keys(plan.features || {})))];
  const limits = Object.fromEntries(limitKeys.map((key) => [key, mergeLimit(normalized.map((plan) => plan.limits?.[key]))]));
  const features = Object.fromEntries(featureKeys.map((key) => [key, mergeFeature(normalized.map((plan) => plan.features?.[key]))]));

  return {
    name: 'Workspace entitlements',
    slug: 'workspace-entitlements',
    description: 'Combined dashboard visibility across the workspaces this user can access. Actions still enforce the selected workspace plan.',
    price: 0,
    currency: normalized[0]?.currency || 'USD',
    billingInterval: 'workspace',
    isActive: true,
    isPublic: false,
    limits,
    features,
    aiConfig: {},
    featureList: [...new Set(normalized.flatMap((plan) => plan.featureList || []))]
  };
}

async function getDashboardEntitlementPlan(user, accessibleBrandIds = []) {
  const personalPlan = await getCurrentPlan(user);
  if (!user?._id || user.role === 'super_admin' || !accessibleBrandIds.length) return personalPlan;

  const owners = await Brand.find({ _id: { $in: accessibleBrandIds } }).distinct('owner');
  const ownerIds = [...new Set(owners.map(String))];
  if (!ownerIds.length) return personalPlan;
  const users = await User.find({ _id: { $in: ownerIds } }).select('_id role plan selectedPlanSlug trialUsed status').lean();
  const plans = await Promise.all(users.map((owner) => getCurrentPlan(owner)));
  return mergePlans(plans, personalPlan);
}

module.exports = { LEVEL_ORDER, getDashboardEntitlementPlan, mergeFeature, mergeLimit, mergePlans };
