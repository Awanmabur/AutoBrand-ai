const Payment = require('../../models/Payment');
const User = require('../../models/User');
const env = require('../../config/env');
const { getPlanBySlug, createPendingSubscription, activatePlanForUser, revokeSubscriptionForPayment } = require('../subscription.service');

const pesapalProvider = () => require('./providers/pesapal.provider');
function normalizeProviderName() { return 'pesapal'; }
function getBillingProvider() { return pesapalProvider(); }
function isPaymentProviderConfigured() { return Boolean(env.pesapalConsumerKey && env.pesapalConsumerSecret && (env.pesapalIpnId || env.pesapalAutoRegisterIpn)); }
function liveCheckoutProviderName() { return 'pesapal'; }
function mergeMetadata(...items) { return items.reduce((acc, item) => (!item || typeof item !== 'object' ? acc : { ...acc, ...item }), {}); }
function isFreePlan(plan) { return Number(plan?.price || 0) <= 0 || plan?.billingInterval === 'trial'; }

function reconciliationSchedule(payment, status, now = new Date()) {
  const normalized = String(status || payment?.status || 'pending');
  if (payment?.provider !== 'pesapal' || ['failed', 'refunded', 'reversed', 'cancelled'].includes(normalized)) {
    return { reconciliationStatus: 'settled', nextReconcileAt: undefined };
  }

  if (normalized === 'pending') {
    const createdAt = new Date(payment?.createdAt || now);
    const ageMs = Math.max(0, now.getTime() - createdAt.getTime());
    const maxMs = Number(env.paymentReconciliationPendingDays || 7) * 86400000;
    if (ageMs >= maxMs) return { reconciliationStatus: 'exhausted', nextReconcileAt: undefined };
    const delayMs = ageMs < 15 * 60 * 1000
      ? 2 * 60 * 1000
      : (ageMs < 24 * 60 * 60 * 1000 ? 15 * 60 * 1000 : 2 * 60 * 60 * 1000);
    return { reconciliationStatus: 'scheduled', nextReconcileAt: new Date(now.getTime() + delayMs) };
  }

  if (normalized === 'paid') {
    const paidAt = new Date(payment?.paidAt || now);
    const ageMs = Math.max(0, now.getTime() - paidAt.getTime());
    const maxMs = Number(env.paymentReconciliationPaidDays || 180) * 86400000;
    if (ageMs >= maxMs) return { reconciliationStatus: 'settled', nextReconcileAt: undefined };
    const delayMs = ageMs < 24 * 60 * 60 * 1000
      ? 6 * 60 * 60 * 1000
      : (ageMs < 30 * 86400000 ? 24 * 60 * 60 * 1000 : 7 * 86400000);
    return { reconciliationStatus: 'scheduled', nextReconcileAt: new Date(now.getTime() + delayMs) };
  }

  return { reconciliationStatus: 'settled', nextReconcileAt: undefined };
}

function applyReconciliationSchedule(payment, status, now = new Date()) {
  const schedule = reconciliationSchedule(payment, status, now);
  payment.reconciliationStatus = schedule.reconciliationStatus;
  payment.nextReconcileAt = schedule.nextReconcileAt;
  payment.lastReconciledAt = now;
  payment.reconciliationLeaseUntil = undefined;
  payment.reconciliationLeaseOwner = '';
  payment.reconciliationAttempts = 0;
  payment.reconciliationError = '';
  return schedule;
}

async function findReusableCheckout(user, plan) {
  const since = new Date(Date.now() - 15 * 60 * 1000);
  return Payment.findOne({ user: user._id, provider: 'pesapal', status: 'pending', 'metadata.plan': plan.slug, createdAt: { $gte: since }, checkoutUrl: { $ne: '' } }).sort({ createdAt: -1 });
}

async function createCheckoutSession({ user, planSlug, onboarding = false }) {
  const plan = await getPlanBySlug(planSlug);
  if (!plan || plan.isActive === false) { const error = new Error('Selected plan is not available.'); error.status = 404; throw error; }

  if (!isFreePlan(plan)) {
    const reusable = await findReusableCheckout(user, plan);
    if (reusable) {
      if (onboarding && !reusable.metadata?.onboarding) {
        reusable.metadata = mergeMetadata(reusable.metadata || {}, { onboarding: true });
        await reusable.save();
      }
      return { plan, payment: reusable, session: { provider: 'pesapal', status: 'requires_redirect', checkoutUrl: reusable.checkoutUrl, reference: reusable.reference, orderTrackingId: reusable.providerReference, reused: true } };
    }
  }

  const resolvedProvider = isFreePlan(plan) ? 'free' : 'pesapal';
  const session = isFreePlan(plan)
    ? { provider: 'free', status: 'paid', checkoutUrl: '', reference: `free_${Date.now()}_${user._id || user.id}`, message: 'Free trial activated.' }
    : await getBillingProvider().createCheckoutSession({ user, plan });

  if (!isFreePlan(plan)) await createPendingSubscription(user, plan.slug, { paymentProvider: resolvedProvider, metadata: { selectedAt: new Date().toISOString() } });

  const payment = await Payment.create({
    user: user._id, provider: resolvedProvider, amount: Number(plan.price || 0), currency: String(plan.currency || 'USD').toUpperCase(),
    status: isFreePlan(plan) ? 'paid' : 'pending', reference: session.reference || `${resolvedProvider}_${Date.now()}`,
    providerReference: session.orderTrackingId || session.providerReference || '', checkoutUrl: session.checkoutUrl || '',
    metadata: mergeMetadata({ plan: plan.slug, onboarding: Boolean(onboarding), expectedAmount: Number(plan.price || 0), expectedCurrency: String(plan.currency || 'USD').toUpperCase(), checkoutUrl: session.checkoutUrl, message: session.message, providerCheckoutStatus: session.status || '', events: [{ type: 'checkout_created', at: new Date().toISOString() }] }, session.metadata ? { [resolvedProvider]: session.metadata } : {}, session.orderTrackingId ? { orderTrackingId: session.orderTrackingId } : {}),
    paidAt: isFreePlan(plan) ? new Date() : undefined,
    reconciliationStatus: isFreePlan(plan) ? 'settled' : 'scheduled',
    nextReconcileAt: isFreePlan(plan) ? undefined : new Date(Date.now() + 2 * 60 * 1000)
  });

  // Free trials need no provider proof. Paid plans are activated only by
  // reconcilePaymentFromProvider after a server-to-server Pesapal verification.
  if (isFreePlan(plan)) await activatePlanForUser(user, plan.slug, { paymentProvider: payment.provider, metadata: { paymentId: payment._id, activatedBy: 'free_checkout' } });
  return { plan, session, payment };
}

async function verifyPayment({ payload }) { return getBillingProvider().verifyPayment(payload); }
function providerStatusToPaymentStatus(v = {}) { const status = String(v.status || v.paymentStatusDescription || v.statusCode || '').toLowerCase(); if (['paid','completed','complete','1'].includes(status)) return 'paid'; if (['failed','invalid','cancelled','canceled','2','0'].includes(status)) return 'failed'; if (['reversed','3'].includes(status)) return 'reversed'; if (status === 'refunded') return 'refunded'; return 'pending'; }
function resolvePaymentTransition(currentStatus, incomingStatus) {
  const current = String(currentStatus || 'pending');
  const incoming = String(incomingStatus || 'pending');
  // Refunds and verified provider reversals are terminal. A stale or duplicated
  // COMPLETED response must never resurrect an entitlement after money moved back.
  if (['refunded', 'reversed'].includes(current)) return current;
  if (['refunded', 'reversed'].includes(incoming)) return incoming;
  // Never downgrade a settled provider result back to an ambiguous pending state.
  if (incoming === 'pending' && ['paid', 'failed', 'cancelled'].includes(current)) return current;
  return incoming;
}
function paymentLookupQuery({ providerName, verification = {}, payload = {}, user } = {}) {
  const source = { ...(payload.query || {}), ...(payload.body || {}), ...(!payload.query && !payload.body ? payload : {}) };
  const reference = verification.merchantReference || source.OrderMerchantReference || source.orderMerchantReference || source.reference;
  const trackingId = verification.orderTrackingId || source.OrderTrackingId || source.orderTrackingId || source.order_tracking_id;
  const or = []; if (reference) or.push({ reference }); if (trackingId) { or.push({ providerReference: trackingId }, { 'metadata.orderTrackingId': trackingId }, { [`metadata.${providerName}.orderTrackingId`]: trackingId }); }
  if (!or.length) return null; const query = { provider: providerName, $or: or }; if (user?._id) query.user = user._id; return query;
}
function amountsMatch(expected, actual) { const a=Number(expected), b=Number(actual); return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b) < 0.000001; }
function verificationIntegrity(payment, verification) {
  const problems = [];
  if (verification.merchantReference && payment.reference && verification.merchantReference !== payment.reference) problems.push('merchant_reference');
  if (verification.orderTrackingId && payment.providerReference && verification.orderTrackingId !== payment.providerReference) problems.push('order_tracking_id');
  if (verification.amount !== undefined && verification.amount !== null && verification.amount !== '' && !amountsMatch(payment.amount, verification.amount)) problems.push('amount');
  if (verification.currency && String(verification.currency).toUpperCase() !== String(payment.currency).toUpperCase()) problems.push('currency');
  return { valid: problems.length === 0, problems };
}

async function reconcilePaymentFromProvider({ providerName, payload, user, source = 'callback' }) {
  const normalizedProvider = normalizeProviderName(providerName);
  const verification = await verifyPayment({ providerName: normalizedProvider, payload });
  const query = paymentLookupQuery({ providerName: normalizedProvider, verification, payload, user });
  if (!query) return { payment: null, verification, status: 'not_found' };

  // Optimistic concurrency prevents callback/IPN races from losing a newer provider
  // state. If another verifier writes first, reload and recompute the transition.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const payment = await Payment.findOne(query);
    if (!payment) return { payment: null, verification, status: 'not_found' };

    const integrity = verificationIntegrity(payment, verification);
    const verifiedStatus = integrity.valid ? providerStatusToPaymentStatus(verification) : 'failed';
    const previousStatus = payment.status;
    const status = resolvePaymentTransition(previousStatus, verifiedStatus);
    const now = new Date();
    const event = {
      type: integrity.valid ? `provider_${verifiedStatus}` : 'integrity_mismatch',
      source,
      at: now.toISOString(),
      effectiveStatus: status,
      problems: integrity.problems
    };

    payment.status = status;
    payment.providerReference = verification.orderTrackingId || payment.providerReference;
    const events = Array.isArray(payment.metadata?.events) ? payment.metadata.events.slice(-49) : [];
    events.push(event);
    payment.metadata = mergeMetadata(
      payment.metadata || {},
      {
        lastVerifiedAt: now.toISOString(),
        lastVerificationSource: source,
        integrity,
        events,
        [normalizedProvider]: mergeMetadata(
          payment.metadata?.[normalizedProvider],
          verification.raw ? { status: verification.raw } : {},
          {
            orderTrackingId: verification.orderTrackingId,
            merchantReference: verification.merchantReference,
            paymentMethod: verification.paymentMethod,
            confirmationCode: verification.confirmationCode,
            paymentAccount: verification.paymentAccount,
            paymentStatusDescription: verification.paymentStatusDescription,
            statusCode: verification.statusCode
          }
        )
      }
    );
    if (status === 'paid' && !payment.paidAt) payment.paidAt = now;
    if (status === 'failed' && !payment.failedAt) payment.failedAt = now;
    if (status === 'refunded' && !payment.refundedAt) payment.refundedAt = now;
    if (status === 'reversed' && !payment.reversedAt) payment.reversedAt = now;
    applyReconciliationSchedule(payment, status, now);

    try {
      await payment.save();
    } catch (error) {
      if (error?.name === 'VersionError' && attempt < 3) continue;
      throw error;
    }

    if (status === 'paid' && payment.metadata?.plan) {
      const billingUser = await User.findById(payment.user).select('_id trialUsed plan selectedPlanSlug');
      if (!billingUser) throw new Error('The account for this verified payment no longer exists.');
      await activatePlanForUser(billingUser, payment.metadata.plan, {
        paymentProvider: payment.provider,
        metadata: {
          paymentId: payment._id,
          providerReference: payment.providerReference,
          confirmationCode: verification.confirmationCode,
          activatedBy: source
        }
      });
    } else if (['failed', 'refunded', 'reversed'].includes(status) && previousStatus === 'paid') {
      await revokeSubscriptionForPayment(payment, {
        reason: status === 'reversed'
          ? 'pesapal_reversed'
          : (status === 'refunded'
              ? 'pesapal_refunded'
              : (integrity.valid ? 'pesapal_failed_after_payment' : 'pesapal_integrity_mismatch'))
      });
    }

    return { payment, verification, status, previousStatus, integrity };
  }

  throw new Error('Payment reconciliation could not obtain a stable concurrent state.');
}

async function cancelSubscription(subscription) { return getBillingProvider().cancelSubscription(subscription); }
async function resumeSubscription(subscription) { return getBillingProvider().resumeSubscription(subscription); }
async function handleWebhook(providerName, payload) { return getBillingProvider().handleWebhook(payload); }
async function getCustomerPortal(user) { return getBillingProvider().getCustomerPortal(user); }
module.exports = { applyReconciliationSchedule, cancelSubscription, createCheckoutSession, getBillingProvider, getCustomerPortal, handleWebhook, isPaymentProviderConfigured, liveCheckoutProviderName, normalizeProviderName, reconcilePaymentFromProvider, reconciliationSchedule, resolvePaymentTransition, resumeSubscription, verifyPayment, verificationIntegrity };
