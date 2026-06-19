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

async function attachSelectedPlanAfterSignup(user, selectedPlanSlug) {
  const plan = await resolveSignupPlan(selectedPlanSlug);
  const isFreeOrTrial = plan.billingInterval === 'trial' || Number(plan.price || 0) <= 0;
  if (isFreeOrTrial) {
    return { ...(await activatePlanForUser(user, plan.slug)), nextUrl: '/dashboard?welcome=1' };
  }
  await createPendingSubscription(user, plan.slug, { metadata: { reason: 'checkout_required', selectedAt: new Date().toISOString() } });
  return { plan, nextUrl: `/dashboard/billing/checkout/${encodeURIComponent(plan.slug)}` };
}

module.exports = { attachSelectedPlanAfterSignup, resolveSignupPlan };
