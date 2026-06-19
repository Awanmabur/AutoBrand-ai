async function createCheckoutSession({ user, plan }) {
  const configured = Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY || process.env.STRIPE_CLIENT_SECRET);
  if (!configured) {
    const error = new Error('Stripe checkout is not configured. Use Pesapal for production checkout or add Stripe credentials.');
    error.status = 503;
    throw error;
  }
  return {
    provider: 'stripe',
    status: 'requires_redirect',
    checkoutUrl: '/dashboard/billing?provider=stripe&status=configure-sdk',
    reference: 'stripe_' + Date.now(),
    message: 'stripe adapter is ready; add SDK/API credentials to create real checkout sessions.'
  };
}
async function verifyPayment(payload) { return { provider: 'stripe', status: 'verified', payload }; }
async function cancelSubscription(subscription) { return { provider: 'stripe', status: 'cancelled', subscription }; }
async function resumeSubscription(subscription) { return { provider: 'stripe', status: 'active', subscription }; }
async function handleWebhook(payload) { return { provider: 'stripe', received: true, payload }; }
async function getCustomerPortal() { return { provider: 'stripe', url: '/dashboard/billing' }; }
module.exports = { cancelSubscription, createCheckoutSession, getCustomerPortal, handleWebhook, resumeSubscription, verifyPayment };
