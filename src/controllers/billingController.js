const CreditLedger = require('../models/CreditLedger');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const { getPublicPricingCards } = require('../services/pricing.service');
const { activatePlanForUser, getCurrentPlan } = require('../services/subscription.service');
const { buildUsageDashboard } = require('../services/usage.service');
const { createCheckoutSession, markManualPaymentPaid } = require('../services/billing.service');

async function index(req, res, next) {
  try {
    let subscription = await Subscription.findOne({ user: req.user._id }).populate('planRef');
    const currentPlan = await getCurrentPlan(req.user);
    if (!subscription) {
      const activated = await activatePlanForUser(req.user, req.user.plan || 'free-trial');
      subscription = activated.subscription;
    }

    const [ledger, payments, plans, usageDashboard] = await Promise.all([
      CreditLedger.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50),
      Payment.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(20),
      getPublicPricingCards(),
      buildUsageDashboard(req.user)
    ]);
    const balance = ledger.length ? ledger[0].balanceAfter : 0;

    res.render('billing/index', {
      title: 'Billing',
      layout: 'layouts/dashboard',
      subscription,
      currentPlan,
      usageDashboard,
      ledger,
      payments,
      balance,
      plans,
      pendingMessage: req.query.activated
        ? 'Payment confirmed. Your subscription is active.'
        : req.query.pending
          ? 'Checkout is pending. Complete the payment step to activate your subscription.'
          : ''
    });
  } catch (error) {
    next(error);
  }
}

async function changePlan(req, res, next) {
  try {
    const planSlug = req.body.plan || req.params.planSlug;
    await activatePlanForUser(req.user, planSlug, { paymentProvider: 'manual', metadata: { changedFromDashboard: true } });

    const latest = await CreditLedger.findOne({ user: req.user._id }).sort({ createdAt: -1 });
    const balanceBefore = latest ? latest.balanceAfter : 0;
    await CreditLedger.create({
      user: req.user._id,
      type: 'grant',
      amount: 10,
      balanceAfter: balanceBefore + 10,
      reason: `${planSlug} plan activation credit grant`
    });

    res.redirect('/billing');
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
    res.render('billing/checkout', {
      title: `Checkout - ${plan.name}`,
      layout: 'layouts/dashboard',
      plan,
      payment: null
    });
  } catch (error) {
    next(error);
  }
}

async function checkout(req, res, next) {
  try {
    const planSlug = req.params.planSlug || req.body.plan;
    const { session, payment } = await createCheckoutSession({ user: req.user, planSlug, providerName: req.body.provider || process.env.BILLING_PROVIDER || 'manual' });
    if (payment?.status === 'paid') return res.redirect('/billing?activated=1');
    if (session.checkoutUrl && session.provider !== 'manual') return res.redirect(session.checkoutUrl);
    if (payment?._id) return res.redirect(`/billing/payments/${payment._id}`);
    return res.redirect('/billing?pending=1');
  } catch (error) {
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
    res.render('billing/checkout', {
      title: 'Payment',
      layout: 'layouts/dashboard',
      plan,
      payment
    });
  } catch (error) {
    next(error);
  }
}

async function completePayment(req, res, next) {
  try {
    const payment = await Payment.findOne({ _id: req.params.id, user: req.user._id });
    if (!payment) {
      const error = new Error('Payment not found.');
      error.status = 404;
      throw error;
    }
    if (payment.status !== 'paid') await markManualPaymentPaid(payment);
    res.redirect('/billing?activated=1');
  } catch (error) {
    next(error);
  }
}

async function markPaid(req, res, next) {
  try {
    const payment = await Payment.findOne({ _id: req.params.id, user: req.user._id });
    if (!payment) {
      const error = new Error('Payment not found.');
      error.status = 404;
      throw error;
    }

    await markManualPaymentPaid(payment);
    res.redirect('/billing');
  } catch (error) {
    return next(error);
  }
}

module.exports = { changePlan, checkout, checkoutPage, completePayment, index, markPaid, paymentPage };
