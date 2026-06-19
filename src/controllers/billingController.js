const CreditLedger = require('../models/CreditLedger');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const env = require('../config/env');
const { getPublicPricingCards } = require('../services/pricing.service');
const { activatePlanForUser, getCurrentPlan, getPlanBySlug } = require('../services/subscription.service');
const { buildUsageDashboard } = require('../services/usage.service');
const { notifyPayment, notifyUser } = require('../services/notification.service');
const {
  createCheckoutSession,
  liveCheckoutProviderName,
  reconcilePaymentFromProvider,
  isPaymentProviderConfigured
} = require('../services/billing.service');

function checkoutProviderFromRequest(req) {
  return req.body.provider || req.query.provider || liveCheckoutProviderName();
}

function paymentStatusMessage(query = {}) {
  if (query.activated) return 'Payment confirmed. Your subscription is active.';
  if (query.cancelled) return 'Checkout was cancelled. Your current plan is unchanged.';
  if (query.failed) return 'Payment could not be confirmed. Try again or contact support with your reference.';
  if (query.pending) return 'Checkout is pending. Complete the payment step to activate your subscription.';
  if (query.onboarding) return 'Choose a plan and complete secure payment to finish onboarding.';
  return '';
}

async function index(req, res) {
  return res.redirect(303, '/dashboard/billing');
}

async function changePlan(req, res, next) {
  try {
    const planSlug = req.body.plan || req.params.planSlug;
    const plan = await getPlanBySlug(planSlug);
    if (!plan) {
      const error = new Error('Selected plan is not available.');
      error.status = 404;
      throw error;
    }

    const isFreeOrTrial = plan.billingInterval === 'trial' || Number(plan.price || 0) <= 0;
    if (isFreeOrTrial) {
      await activatePlanForUser(req.user, plan.slug, {
        paymentProvider: 'free',
        metadata: { changedFromDashboard: true, activatedWithoutPayment: true }
      });

      const latest = await CreditLedger.findOne({ user: req.user._id }).sort({ createdAt: -1 });
      const balanceBefore = latest ? latest.balanceAfter : 0;
      await CreditLedger.create({
        user: req.user._id,
        type: 'grant',
        amount: 10,
        balanceAfter: balanceBefore + 10,
        reason: `${plan.slug} plan activation credit grant`
      });
      await notifyUser({
        user: req.user,
        type: 'payment_success',
        title: 'Plan activated',
        message: `${plan.name || plan.slug} is active.`,
        severity: 'success',
        actionUrl: '/dashboard/billing',
        metadata: { plan: plan.slug, provider: 'free' }
      });

      return res.redirect('/dashboard/billing?activated=1');
    }

    return res.redirect(`/dashboard/billing/checkout/${encodeURIComponent(plan.slug)}?upgrade=1`);
  } catch (error) {
    next(error);
  }
}

async function checkoutPage(req, res, next) {
  try {
    const plans = await getPublicPricingCards();
    const plan = plans.find((item) => item.slug === req.params.planSlug);
    if (!plan) {
      const error = new Error('Plan not found.');
      error.status = 404;
      throw error;
    }
    res.render('dashboard/pages/billing-checkout', {
      title: `Checkout - ${plan.name}`,
      layout: 'layouts/dashboard',
      plan,
      payment: null,
      selectedProvider: checkoutProviderFromRequest(req),
      pesapalConfigured: isPaymentProviderConfigured('pesapal'),
      onboarding: Boolean(req.query.onboarding),
      error: req.query.error || ''
    });
  } catch (error) {
    next(error);
  }
}

async function checkout(req, res, next) {
  try {
    const planSlug = req.params.planSlug || req.body.plan;
    const providerName = checkoutProviderFromRequest(req);
    const { session, payment } = await createCheckoutSession({ user: req.user, planSlug, providerName });
    if (payment?.status === 'paid') {
      await notifyPayment({ user: req.user, payment, status: 'paid', planName: payment.metadata?.plan || planSlug });
      return res.redirect('/dashboard/billing?activated=1');
    }
    if (session.checkoutUrl) return res.redirect(session.checkoutUrl);
    if (payment?._id) return res.redirect(`/dashboard/billing/payments/${payment._id}`);
    return res.redirect('/dashboard/billing?pending=1');
  } catch (error) {
    if (error.status && error.status < 500) {
      return res.redirect(`/dashboard/billing/checkout/${encodeURIComponent(req.params.planSlug || req.body.plan || '')}?error=${encodeURIComponent(error.message)}`);
    }
    next(error);
  }
}

async function paymentPage(req, res, next) {
  try {
    const payment = await Payment.findOne({ _id: req.params.id, user: req.user._id });
    if (!payment) {
      const error = new Error('Payment not found.');
      error.status = 404;
      throw error;
    }
    const plans = await getPublicPricingCards();
    const plan = plans.find((item) => item.slug === payment.metadata?.plan);
    res.render('dashboard/pages/billing-checkout', {
      title: 'Payment',
      layout: 'layouts/dashboard',
      plan,
      payment,
      selectedProvider: payment.provider || liveCheckoutProviderName(),
      pesapalConfigured: isPaymentProviderConfigured('pesapal'),
      onboarding: Boolean(req.query.onboarding),
      error: ''
    });
  } catch (error) {
    next(error);
  }
}

function pesapalPayload(req) {
  return { query: req.query || {}, body: req.body || {} };
}

async function pesapalCallback(req, res, next) {
  try {
    const result = await reconcilePaymentFromProvider({
      providerName: 'pesapal',
      payload: pesapalPayload(req),
      user: req.user,
      source: 'callback'
    });
    if (['paid', 'failed', 'refunded'].includes(result.status)) {
      await notifyPayment({ user: req.user, payment: result.payment, status: result.status });
    }
    if (result.status === 'paid') return res.redirect('/dashboard/billing?activated=1');
    if (result.status === 'failed' || result.status === 'refunded') return res.redirect('/dashboard/billing?failed=1');
    return res.redirect('/dashboard/billing?pending=1');
  } catch (error) {
    if (req.user) return next(error);
    return res.redirect('/auth/login?next=/dashboard/billing');
  }
}

async function pesapalIpn(req, res) {
  const payload = pesapalPayload(req);
  const data = { ...payload.query, ...payload.body };
  const response = {
    orderNotificationType: data.OrderNotificationType || data.orderNotificationType || 'IPNCHANGE',
    orderTrackingId: data.OrderTrackingId || data.orderTrackingId || '',
    orderMerchantReference: data.OrderMerchantReference || data.orderMerchantReference || '',
    status: 500
  };

  try {
    const result = await reconcilePaymentFromProvider({ providerName: 'pesapal', payload, source: 'ipn' });
    if (['paid', 'failed', 'refunded'].includes(result.status)) {
      await notifyPayment({ payment: result.payment, status: result.status });
    }
    response.status = 200;
    return res.status(200).json(response);
  } catch (error) {
    response.error = env.nodeEnv === 'production' ? 'processing_failed' : error.message;
    return res.status(200).json(response);
  }
}

module.exports = {
  changePlan,
  checkout,
  checkoutPage,
  index,
  paymentPage,
  pesapalCallback,
  pesapalIpn
};
