async function createCheckoutSession({ user, plan }) {
  const configured = Boolean(process.env.PAYPAL_SECRET_KEY || process.env.PAYPAL_API_KEY || process.env.PAYPAL_CLIENT_SECRET);
  if (!configured) {
    return require('./manual.provider').createCheckoutSession({ user, plan, reason: 'paypal_not_configured' });
  }
  return {
    provider: 'paypal',
    status: 'requires_redirect',
    checkoutUrl: '/billing?provider=paypal&status=configure-sdk',
    reference: 'paypal_' + Date.now(),
    message: 'paypal adapter is ready; add SDK/API credentials to create real checkout sessions.'
  };
}
async function verifyPayment(payload) { return { provider: 'paypal', status: 'verified', payload }; }
async function cancelSubscription(subscription) { return { provider: 'paypal', status: 'cancelled', subscription }; }
async function resumeSubscription(subscription) { return { provider: 'paypal', status: 'active', subscription }; }
async function handleWebhook(payload) { return { provider: 'paypal', received: true, payload }; }
async function getCustomerPortal() { return { provider: 'paypal', url: '/billing' }; }
module.exports = { cancelSubscription, createCheckoutSession, getCustomerPortal, handleWebhook, resumeSubscription, verifyPayment };
