const mongoose = require('mongoose');
const connectDb = require('../src/config/db');
const { validateEnvironment } = require('../src/config/validateEnv');
const env = require('../src/config/env');
const {
  startPaymentReconciliationProcessor,
  stopPaymentReconciliationProcessor
} = require('../src/services/billing/paymentReconciliation.service');

async function start() {
  const validation = validateEnvironment();
  validation.warnings.forEach((warning) => console.warn(`Configuration warning: ${warning}`));
  if (env.paymentReconciliationWorkerMode !== 'external') {
    throw new Error('Dedicated payment reconciliation worker requires PAYMENT_RECONCILIATION_WORKER_MODE=external.');
  }
  await connectDb();
  startPaymentReconciliationProcessor({
    pollMs: env.paymentReconciliationPollMs,
    concurrency: env.paymentReconciliationConcurrency
  });

  const keepAlive = setInterval(() => {}, 60_000);
  async function shutdown(signal) {
    console.log(`${signal} received. Stopping payment reconciliation worker.`);
    clearInterval(keepAlive);
    stopPaymentReconciliationProcessor();
    await mongoose.connection.close().catch(() => {});
    process.exit(0);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  console.log('Payment reconciliation worker running.');
}

start().catch((error) => {
  console.error('Payment reconciliation worker failed to start:', error);
  process.exit(1);
});
