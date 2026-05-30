const { getPlanBySlug, activatePlanForUser, createPendingSubscription, normalizeSlug } = require('./subscription.service');

async function resolveSignupPlan(planSlug) {
  const slug = normalizeSlug(planSlug || 'free-trial');
  const plan = await getPlanBySlug(slug);
  if (!plan || plan.isActive === false || plan.isPublic === false) {
    const error = new Error('The selected plan is not available.');
    error.status = 422;
    throw error;
  }
  return plan;
}

async function attachSelectedPlanAfterSignup(user, selectedPlanSlug, { paymentConfigured = false } = {}) {
  const plan = await resolveSignupPlan(selectedPlanSlug);
  const isFreeOrTrial = plan.billingInterval === 'trial' || Number(plan.price || 0) === 0;
  if (isFreeOrTrial) {
    return { ...(await activatePlanForUser(user, plan.slug)), nextUrl: '/dashboard' };
  }
  if (!paymentConfigured) {
    return { ...(await createPendingSubscription(user, plan.slug, { metadata: { reason: 'billing_provider_missing' } })), nextUrl: '/billing?pending=1' };
  }
  await createPendingSubscription(user, plan.slug, { metadata: { reason: 'checkout_required' } });
  return { plan, nextUrl: `/billing/checkout/${encodeURIComponent(plan.slug)}` };
}

module.exports = { attachSelectedPlanAfterSignup, resolveSignupPlan };
