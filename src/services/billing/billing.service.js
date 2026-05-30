const Payment = require('../../models/Payment');
const { getPlanBySlug, createPendingSubscription, activatePlanForUser } = require('../subscription.service');

const providers = {
  stripe: () => require('./providers/stripe.provider'),
  paypal: () => require('./providers/paypal.provider'),
  flutterwave: () => require('./providers/flutterwave.provider'),
  manual: () => require('./providers/manual.provider')
};

function getBillingProvider(name = process.env.BILLING_PROVIDER || 'manual') {
  return (providers[String(name || 'manual').toLowerCase()] || providers.manual)();
}

async function createCheckoutSession({ user, planSlug, providerName }) {
  const plan = await getPlanBySlug(planSlug);
  if (!plan || plan.isActive === false) {
    const error = new Error('Selected plan is not available.');
    error.status = 404;
    throw error;
  }
  const provider = getBillingProvider(providerName);
  const session = await provider.createCheckoutSession({ user, plan });
  await createPendingSubscription(user, plan.slug, { paymentProvider: session.provider || providerName || 'manual', metadata: { checkout: session } });
  const payment = await Payment.create({
    user: user._id,
    provider: session.provider || providerName || 'manual',
    amount: plan.price,
    currency: plan.currency || 'USD',
    status: session.status === 'paid' ? 'paid' : 'pending',
    reference: session.reference || `${session.provider || 'manual'}_${Date.now()}`,
    metadata: { plan: plan.slug, checkoutUrl: session.checkoutUrl, message: session.message }
  });
  if (payment.status === 'paid') {
    await activatePlanForUser(user, plan.slug, { paymentProvider: payment.provider, metadata: { paymentId: payment._id } });
  }
  return { plan, session, payment };
}

async function verifyPayment({ providerName, payload }) {
  const provider = getBillingProvider(providerName);
  return provider.verifyPayment(payload);
}

async function cancelSubscription(subscription, providerName) {
  return getBillingProvider(providerName || subscription.paymentProvider || subscription.provider).cancelSubscription(subscription);
}

async function resumeSubscription(subscription, providerName) {
  return getBillingProvider(providerName || subscription.paymentProvider || subscription.provider).resumeSubscription(subscription);
}

async function handleWebhook(providerName, payload) {
  return getBillingProvider(providerName).handleWebhook(payload);
}

async function getCustomerPortal(user, providerName) {
  return getBillingProvider(providerName).getCustomerPortal(user);
}

async function markManualPaymentPaid(payment) {
  payment.status = 'paid';
  await payment.save();
  if (payment.metadata?.plan) {
    await activatePlanForUser({ _id: payment.user }, payment.metadata.plan, { paymentProvider: payment.provider, metadata: { paymentId: payment._id } });
  }
  return payment;
}

module.exports = { cancelSubscription, createCheckoutSession, getBillingProvider, getCustomerPortal, handleWebhook, markManualPaymentPaid, resumeSubscription, verifyPayment };
