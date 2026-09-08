const crypto = require('crypto');
const Payment = require('../../models/Payment');
const env = require('../../config/env');
const { notifyPayment } = require('../notification.service');
const { reconcilePaymentFromProvider, reconciliationSchedule } = require('./billing.service');

let timer = null;
let sweepRunning = false;

function retryDelayMs(attempts = 1) {
  const exponent = Math.min(8, Math.max(0, Number(attempts || 1) - 1));
  return Math.min(6 * 60 * 60 * 1000, 60 * 1000 * (2 ** exponent));
}

async function claimPayment({ now = new Date(), leaseOwner = crypto.randomUUID() } = {}) {
  const leaseUntil = new Date(now.getTime() + Number(env.paymentReconciliationLeaseMs || 5 * 60 * 1000));
  const payment = await Payment.findOneAndUpdate(
    {
      provider: 'pesapal',
      status: { $in: ['pending', 'paid'] },
      reconciliationStatus: { $in: ['scheduled', 'processing'] },
      nextReconcileAt: { $lte: now },
      $or: [
        { reconciliationLeaseUntil: { $exists: false } },
        { reconciliationLeaseUntil: null },
        { reconciliationLeaseUntil: { $lte: now } }
      ]
    },
    {
      $set: {
        reconciliationStatus: 'processing',
        reconciliationLeaseOwner: leaseOwner,
        reconciliationLeaseUntil: leaseUntil
      },
      $inc: { reconciliationAttempts: 1 }
    },
    { new: true, sort: { nextReconcileAt: 1, createdAt: 1 } }
  );
  return payment;
}

async function markReconciliationFailure(payment, error, now = new Date()) {
  const schedule = reconciliationSchedule(payment, payment.status, now);
  const attempts = Number(payment.reconciliationAttempts || 1);
  const terminal = schedule.reconciliationStatus !== 'scheduled';
  const nextReconcileAt = terminal
    ? undefined
    : new Date(now.getTime() + retryDelayMs(attempts));

  await Payment.updateOne(
    { _id: payment._id, reconciliationLeaseOwner: payment.reconciliationLeaseOwner },
    {
      $set: {
        reconciliationStatus: terminal ? schedule.reconciliationStatus : 'scheduled',
        nextReconcileAt,
        reconciliationLeaseOwner: '',
        reconciliationError: String(error?.message || error || 'Pesapal reconciliation failed.').slice(0, 1000)
      },
      $unset: { reconciliationLeaseUntil: 1 }
    }
  );
}

async function exhaustUnrecoverablePayment(payment, message) {
  await Payment.updateOne(
    { _id: payment._id, reconciliationLeaseOwner: payment.reconciliationLeaseOwner },
    {
      $set: {
        reconciliationStatus: 'exhausted',
        reconciliationLeaseOwner: '',
        reconciliationError: String(message || 'Payment cannot be reconciled automatically.').slice(0, 1000)
      },
      $unset: { reconciliationLeaseUntil: 1, nextReconcileAt: 1 }
    }
  );
}

async function processClaimedPayment(payment) {
  const trackingId = payment.providerReference || payment.metadata?.orderTrackingId || payment.metadata?.pesapal?.orderTrackingId;
  if (!trackingId) {
    await exhaustUnrecoverablePayment(payment, 'Pesapal OrderTrackingId is missing; manual finance review is required.');
    return { paymentId: payment._id, status: 'exhausted', reason: 'missing_tracking_id' };
  }

  try {
    const result = await reconcilePaymentFromProvider({
      providerName: 'pesapal',
      payload: {
        OrderTrackingId: trackingId,
        OrderMerchantReference: payment.reference
      },
      source: 'reconciliation_worker'
    });

    if (result.payment && result.previousStatus !== result.status && ['paid', 'failed', 'refunded', 'reversed'].includes(result.status)) {
      await notifyPayment({ payment: result.payment, status: result.status });
    }
    return result;
  } catch (error) {
    await markReconciliationFailure(payment, error);
    return { paymentId: payment._id, status: 'retry_scheduled', error };
  }
}

async function runPaymentReconciliationSweep({ concurrency = env.paymentReconciliationConcurrency } = {}) {
  if (sweepRunning) return { skipped: true, reason: 'already_running' };
  sweepRunning = true;
  const results = [];
  try {
    const workers = Array.from({ length: Math.max(1, Number(concurrency || 1)) }, async () => {
      while (true) {
        const payment = await claimPayment();
        if (!payment) return;
        results.push(await processClaimedPayment(payment));
      }
    });
    await Promise.all(workers);
    return { processed: results.length, results };
  } finally {
    sweepRunning = false;
  }
}

function startPaymentReconciliationProcessor({ pollMs = env.paymentReconciliationPollMs, concurrency = env.paymentReconciliationConcurrency } = {}) {
  if (timer) return timer;
  const run = () => runPaymentReconciliationSweep({ concurrency }).catch((error) => {
    console.error('[billing] payment reconciliation sweep failed', { message: error?.message || String(error) });
  });
  setTimeout(run, 500).unref();
  timer = setInterval(run, Math.max(30_000, Number(pollMs || 60_000)));
  timer.unref();
  return timer;
}

function stopPaymentReconciliationProcessor() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = {
  claimPayment,
  exhaustUnrecoverablePayment,
  markReconciliationFailure,
  processClaimedPayment,
  retryDelayMs,
  runPaymentReconciliationSweep,
  startPaymentReconciliationProcessor,
  stopPaymentReconciliationProcessor
};
