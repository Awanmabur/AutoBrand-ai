async function createCheckoutSession({ user, plan }) {
  const configured = Boolean(process.env.FLUTTERWAVE_SECRET_KEY || process.env.FLUTTERWAVE_API_KEY || process.env.FLUTTERWAVE_CLIENT_SECRET);
  if (!configured) {
    const error = new Error('Flutterwave checkout is not configured. Use Pesapal for production checkout or add Flutterwave credentials.');
    error.status = 503;
    throw error;
  }
  return {
    provider: 'flutterwave',
    status: 'requires_redirect',
    checkoutUrl: '/dashboard/billing?provider=flutterwave&status=configure-sdk',
    reference: 'flutterwave_' + Date.now(),
    message: 'flutterwave adapter is ready; add SDK/API credentials to create real checkout sessions.'
  };
}
async function verifyPayment(payload) { return { provider: 'flutterwave', status: 'verified', payload }; }
async function cancelSubscription(subscription) { return { provider: 'flutterwave', status: 'cancelled', subscription }; }
async function resumeSubscription(subscription) { return { provider: 'flutterwave', status: 'active', subscription }; }
async function handleWebhook(payload) { return { provider: 'flutterwave', received: true, payload }; }
async function getCustomerPortal() { return { provider: 'flutterwave', url: '/dashboard/billing' }; }
module.exports = { cancelSubscription, createCheckoutSession, getCustomerPortal, handleWebhook, resumeSubscription, verifyPayment };
