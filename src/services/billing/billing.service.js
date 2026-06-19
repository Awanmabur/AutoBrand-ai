const Payment = require('../../models/Payment');
const env = require('../../config/env');
const { getPlanBySlug, createPendingSubscription, activatePlanForUser } = require('../subscription.service');

const pesapalProvider = () => require('./providers/pesapal.provider');

function normalizeProviderName() {
  return 'pesapal';
}

function getBillingProvider() {
  return pesapalProvider();
}

function isPaymentProviderConfigured() {
  return Boolean(env.pesapalConsumerKey && env.pesapalConsumerSecret && (env.pesapalIpnId || env.pesapalAutoRegisterIpn));
}

function liveCheckoutProviderName() {
  return 'pesapal';
}

function mergeMetadata(...items) {
  return items.reduce((acc, item) => {
    if (!item || typeof item !== 'object') return acc;
    return { ...acc, ...item };
  }, {});
}

function isFreePlan(plan) {
  return Number(plan?.price || 0) <= 0 || plan?.billingInterval === 'trial';
}

async function createCheckoutSession({ user, planSlug, providerName }) {
  const plan = await getPlanBySlug(planSlug);
  if (!plan || plan.isActive === false) {
    const error = new Error('Selected plan is not available.');
    error.status = 404;
    throw error;
  }

  const requestedProvider = isFreePlan(plan) ? 'free' : 'pesapal';
  const session = isFreePlan(plan)
    ? {
        provider: 'free',
        status: 'paid',
        checkoutUrl: '',
        reference: `free_${Date.now()}_${user._id || user.id}`,
        message: 'Free trial activated.'
      }
    : await getBillingProvider().createCheckoutSession({ user, plan });

  const resolvedProvider = isFreePlan(plan) ? 'free' : 'pesapal';
  await createPendingSubscription(user, plan.slug, {
    paymentProvider: resolvedProvider,
    metadata: { checkout: session, selectedAt: new Date().toISOString() }
  });

  const payment = await Payment.create({
    user: user._id,
    provider: resolvedProvider,
    amount: plan.price,
    currency: plan.currency || 'USD',
    status: session.status === 'paid' ? 'paid' : 'pending',
    reference: session.reference || `${resolvedProvider}_${Date.now()}`,
    providerReference: session.orderTrackingId || session.providerReference || '',
    checkoutUrl: session.checkoutUrl || '',
    metadata: mergeMetadata(
      { plan: plan.slug, checkoutUrl: session.checkoutUrl, message: session.message },
      session.metadata ? { [resolvedProvider]: session.metadata } : {},
      session.orderTrackingId ? { orderTrackingId: session.orderTrackingId } : {}
    ),
    paidAt: session.status === 'paid' ? new Date() : undefined
  });

  if (payment.status === 'paid') {
    await activatePlanForUser(user, plan.slug, {
      paymentProvider: payment.provider,
      metadata: { paymentId: payment._id, activatedBy: 'checkout' }
    });
  }

  return { plan, session, payment };
}

async function verifyPayment({ providerName, payload }) {
  const provider = getBillingProvider();
  return provider.verifyPayment(payload);
}

function providerStatusToPaymentStatus(verification = {}) {
  const status = String(verification.status || verification.paymentStatusDescription || verification.statusCode || '').toLowerCase();
  if (['paid', 'completed', 'complete', '1'].includes(status)) return 'paid';
  if (['failed', 'invalid', 'cancelled', 'canceled', '2', '0'].includes(status)) return 'failed';
  if (['reversed', 'refunded', '3'].includes(status)) return 'refunded';
  return 'pending';
}

function paymentLookupQuery({ providerName, verification = {}, payload = {}, user } = {}) {
  const source = { ...(payload.query || {}), ...(payload.body || {}), ...(!payload.query && !payload.body ? payload : {}) };
  const reference = verification.merchantReference || source.OrderMerchantReference || source.orderMerchantReference || source.reference;
  const trackingId = verification.orderTrackingId || source.OrderTrackingId || source.orderTrackingId || source.order_tracking_id;
  const or = [];
  if (reference) or.push({ reference });
  if (trackingId) {
    or.push({ providerReference: trackingId });
    or.push({ 'metadata.orderTrackingId': trackingId });
    or.push({ [`metadata.${providerName}.orderTrackingId`]: trackingId });
  }
  if (!or.length) return null;
  const query = { provider: providerName, $or: or };
  if (user?._id) query.user = user._id;
  return query;
}

async function reconcilePaymentFromProvider({ providerName, payload, user, source = 'callback' }) {
  const normalizedProvider = normalizeProviderName(providerName);
  const verification = await verifyPayment({ providerName: normalizedProvider, payload });
  const query = paymentLookupQuery({ providerName: normalizedProvider, verification, payload, user });
  const payment = query ? await Payment.findOne(query) : null;
  if (!payment) return { payment: null, verification, status: 'not_found' };

  const status = providerStatusToPaymentStatus(verification);
  payment.status = status;
  payment.providerReference = verification.orderTrackingId || payment.providerReference;
  payment.metadata = mergeMetadata(payment.metadata || {}, {
    lastVerifiedAt: new Date().toISOString(),
    lastVerificationSource: source,
    [normalizedProvider]: mergeMetadata(payment.metadata?.[normalizedProvider], verification.raw ? { status: verification.raw } : {}, {
      orderTrackingId: verification.orderTrackingId,
      merchantReference: verification.merchantReference,
      paymentMethod: verification.paymentMethod,
      confirmationCode: verification.confirmationCode,
      paymentAccount: verification.paymentAccount,
      paymentStatusDescription: verification.paymentStatusDescription,
      statusCode: verification.statusCode
    })
  });
  if (status === 'paid' && !payment.paidAt) payment.paidAt = new Date();
  if (status === 'failed' && !payment.failedAt) payment.failedAt = new Date();
  await payment.save();

  if (status === 'paid' && payment.metadata?.plan) {
    await activatePlanForUser({ _id: payment.user }, payment.metadata.plan, {
      paymentProvider: payment.provider,
      metadata: {
        paymentId: payment._id,
        providerReference: payment.providerReference,
        confirmationCode: verification.confirmationCode,
        activatedBy: source
      }
    });
  }

  return { payment, verification, status };
}

async function cancelSubscription(subscription, providerName) {
  return getBillingProvider().cancelSubscription(subscription);
}

async function resumeSubscription(subscription, providerName) {
  return getBillingProvider().resumeSubscription(subscription);
}

async function handleWebhook(providerName, payload) {
  return getBillingProvider().handleWebhook(payload);
}

async function getCustomerPortal(user, providerName) {
  return getBillingProvider().getCustomerPortal(user);
}

module.exports = {
  cancelSubscription,
  createCheckoutSession,
  getBillingProvider,
  getCustomerPortal,
  handleWebhook,
  isPaymentProviderConfigured,
  liveCheckoutProviderName,
  normalizeProviderName,
  reconcilePaymentFromProvider,
  resumeSubscription,
  verifyPayment
};
