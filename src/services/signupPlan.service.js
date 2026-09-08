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

function signupNextUrlForPlan(plan) {
  if (!plan) return '/dashboard';
  const isFreeOrTrial = plan.billingInterval === 'trial' || Number(plan.price || 0) <= 0;
  return isFreeOrTrial ? '/dashboard?welcome=1' : `/dashboard/billing/checkout/${encodeURIComponent(plan.slug)}?onboarding=1`;
}

async function attachSelectedPlanAfterSignup(user, selectedPlanSlug) {
  const plan = await resolveSignupPlan(selectedPlanSlug);
  const isFreeOrTrial = plan.billingInterval === 'trial' || Number(plan.price || 0) <= 0;
  if (isFreeOrTrial) {
    return { ...(await activatePlanForUser(user, plan.slug)), nextUrl: signupNextUrlForPlan(plan) };
  }
  // Selecting a paid plan must never grant entitlement before verified payment.
  await createPendingSubscription(user, plan.slug, { metadata: { reason: 'checkout_required', selectedAt: new Date().toISOString() } });
  return { plan, nextUrl: signupNextUrlForPlan(plan) };
}

module.exports = { attachSelectedPlanAfterSignup, resolveSignupPlan, signupNextUrlForPlan };
