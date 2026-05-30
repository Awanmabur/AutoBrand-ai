const { DEFAULT_PLAN_MATRIX, defaultPlanBySlug } = require('../services/subscription.service');

const plans = DEFAULT_PLAN_MATRIX.reduce((map, plan) => {
  map[plan.slug] = plan;
  return map;
}, {});

function getPlan(planName) {
  return defaultPlanBySlug(planName || 'free-trial');
}

module.exports = { plans, getPlan };
