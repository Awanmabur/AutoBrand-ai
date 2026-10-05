const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const env = require('../config/env');
const { getPublicPricingCards } = require('../services/pricing.service');
const { decoratePlanForDisplay, formatMoney } = require('../services/planDisplay.service');
const { activatePlanForUser, cancelScheduledPlanChange, getCurrentPlan, getPlanBySlug, getPlanChangeQuote, schedulePlanChange } = require('../services/subscription.service');
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
  if (query.activated) return 'Payment confirmed. Your paid access period is active.';
  if (query.cancelled) return 'Checkout was cancelled. Your current plan is unchanged.';
  if (query.reversed) return 'Pesapal reversed this payment. The linked paid entitlement has been revoked; contact support with the payment reference if this is unexpected.';
  if (query.refunded) return 'This payment was refunded. The linked paid entitlement is no longer active.';
  if (query.failed) return 'Payment could not be confirmed. Try again or contact support with your reference.';
  if (query.pending) return 'Checkout is pending. Complete the Pesapal payment step to activate the selected access period.';
  if (query.onboarding) return 'Review the selected plan, then complete secure Pesapal payment to activate the paid access period.';
  if (query.scheduled) return 'Plan change scheduled. Your current plan stays active until the end of this access period.';
  if (query.schedule_cancelled) return 'Scheduled plan change cancelled. Your current plan remains unchanged.';
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

    const quote = await getPlanChangeQuote(req.user, plan);
    if (quote.kind === 'same') {
      return res.redirect(`/dashboard/billing?error=${encodeURIComponent(`${plan.name} is already active for this access period.`)}`);
    }
    if (['downgrade', 'lateral'].includes(quote.kind)) {
      const scheduled = await schedulePlanChange(req.user, plan, { reason: quote.kind === 'downgrade' ? 'user_downgrade' : 'user_lateral_switch' });
      await notifyUser({
        user: req.user,
        type: 'plan_change_scheduled',
        title: 'Plan change scheduled',
        message: `${plan.name} is selected for your next access period. Your current plan remains active through ${new Date(scheduled.effectiveAt).toLocaleDateString('en-US')}.`,
        severity: 'info',
        actionUrl: '/dashboard/billing',
        metadata: { plan: plan.slug, effectiveAt: scheduled.effectiveAt, changeKind: quote.kind }
      });
      return res.redirect('/dashboard/billing?scheduled=1');
    }

    const isFreeOrTrial = plan.billingInterval === 'trial' || Number(plan.price || 0) <= 0;
    if (isFreeOrTrial) {
      await activatePlanForUser(req.user, plan.slug, {
        paymentProvider: 'free',
        metadata: { changedFromDashboard: true, activatedWithoutPayment: true }
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
    const rawPlan = await getPlanBySlug(req.params.planSlug);
    const changeQuote = rawPlan ? await getPlanChangeQuote(req.user, rawPlan) : null;
    res.render('dashboard/pages/billing-checkout', {
      title: `Checkout - ${plan.name}`,
      layout: 'layouts/dashboard',
      plan,
      changeQuote,
      changeQuoteAmountLabel: changeQuote ? formatMoney(changeQuote.amountDue || plan.price || 0, plan.currency || 'USD', { decimals: true }) : '',
      changeQuoteCreditLabel: changeQuote ? formatMoney(changeQuote.unusedCredit || 0, plan.currency || 'USD', { decimals: true }) : '',
      payment: null,
      paymentAmountLabel: '',
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
    const onboarding = req.body.onboarding === '1' || req.query.onboarding === '1';
    const { session, payment } = await createCheckoutSession({ user: req.user, planSlug, providerName, onboarding });
    if (payment?.status === 'paid') {
      await notifyPayment({ user: req.user, payment, status: 'paid', planName: payment.metadata?.plan || planSlug });
      return res.redirect(payment?.metadata?.onboarding ? '/dashboard?welcome=1' : '/dashboard/billing?activated=1');
    }
    if (session.checkoutUrl) return res.redirect(session.checkoutUrl);
    if (payment?._id) return res.redirect(`/dashboard/billing/payments/${payment._id}`);
    return res.redirect('/dashboard/billing?pending=1');
  } catch (error) {
    if (error.status && error.status < 500) {
      const onboardingSuffix = req.body.onboarding === '1' || req.query.onboarding === '1' ? '&onboarding=1' : '';
      return res.redirect(`/dashboard/billing/checkout/${encodeURIComponent(req.params.planSlug || req.body.plan || '')}?error=${encodeURIComponent(error.message)}${onboardingSuffix}`);
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
    const plan = payment.planSnapshot?.slug
      ? decoratePlanForDisplay(payment.planSnapshot)
      : plans.find((item) => item.slug === payment.metadata?.plan);
    res.render('dashboard/pages/billing-checkout', {
      title: 'Payment',
      layout: 'layouts/dashboard',
      plan,
      changeQuote: null,
      changeQuoteAmountLabel: '',
      changeQuoteCreditLabel: '',
      payment,
      paymentAmountLabel: formatMoney(payment.amount, payment.currency || 'USD', { decimals: true }),
      selectedProvider: payment.provider || liveCheckoutProviderName(),
      pesapalConfigured: isPaymentProviderConfigured('pesapal'),
      onboarding: Boolean(req.query.onboarding || payment.metadata?.onboarding),
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
    if (['paid', 'failed', 'refunded', 'reversed'].includes(result.status)) {
      await notifyPayment({ user: req.user, payment: result.payment, status: result.status });
    }
    if (result.status === 'paid') return res.redirect(result.payment?.metadata?.onboarding ? '/dashboard?welcome=1' : '/dashboard/billing?activated=1');
    if (result.status === 'reversed') return res.redirect('/dashboard/billing?reversed=1');
    if (result.status === 'refunded') return res.redirect('/dashboard/billing?refunded=1');
    if (result.status === 'failed') return res.redirect('/dashboard/billing?failed=1');
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
    if (['paid', 'failed', 'refunded', 'reversed'].includes(result.status)) {
      await notifyPayment({ payment: result.payment, status: result.status });
    }
    response.status = 200;
    return res.status(200).json(response);
  } catch (error) {
    response.error = env.nodeEnv === 'production' ? 'processing_failed' : error.message;
    return res.status(200).json(response);
  }
}

async function cancelScheduledChange(req, res, next) {
  try {
    const result = await cancelScheduledPlanChange(req.user);
    return res.redirect(result.cancelled ? '/dashboard/billing?schedule_cancelled=1' : '/dashboard/billing');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  cancelScheduledChange,
  changePlan,
  checkout,
  checkoutPage,
  index,
  paymentPage,
  pesapalCallback,
  pesapalIpn
};
