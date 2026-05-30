async function createCheckoutSession({ user, plan }) {
  return {
    provider: 'manual',
    status: 'pending',
    checkoutUrl: `/billing?pending=1&plan=${encodeURIComponent(plan.slug)}`,
    reference: `manual_${Date.now()}_${user._id || user.id}`,
    message: 'Manual billing is enabled. An admin can mark this invoice as paid.'
  };
}

async function verifyPayment() { return { provider: 'manual', status: 'pending' }; }
async function cancelSubscription(subscription) { return { provider: 'manual', status: 'cancelled', subscription }; }
async function resumeSubscription(subscription) { return { provider: 'manual', status: 'active', subscription }; }
async function handleWebhook(payload) { return { provider: 'manual', received: true, payload }; }
async function getCustomerPortal() { return { provider: 'manual', url: '/billing' }; }

module.exports = { cancelSubscription, createCheckoutSession, getCustomerPortal, handleWebhook, resumeSubscription, verifyPayment };
