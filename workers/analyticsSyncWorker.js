const mongoose = require('mongoose');
const connectDb = require('../src/config/db');
const { validateEnvironment } = require('../src/config/validateEnv');
const env = require('../src/config/env');
const {
  startAnalyticsSyncProcessor,
  stopAnalyticsSyncProcessor
} = require('../src/services/analytics/analyticsSync.service');

async function start() {
  const validation = validateEnvironment();
  validation.warnings.forEach((warning) => console.warn(`Configuration warning: ${warning}`));
  if (env.analyticsSyncWorkerMode !== 'external') {
    throw new Error('Dedicated analytics worker requires ANALYTICS_SYNC_WORKER_MODE=external.');
  }
  await connectDb();
  startAnalyticsSyncProcessor({
    pollMs: env.analyticsSyncPollMs,
    concurrency: env.analyticsSyncConcurrency
  });

  // Keep the dedicated process alive even though the shared processor timer is unref'd
  // so the web process can still shut down naturally during tests and one-shot scripts.
  const keepAlive = setInterval(() => {}, 60_000);

  async function shutdown(signal) {
    console.log(`${signal} received. Stopping analytics synchronization worker.`);
    clearInterval(keepAlive);
    stopAnalyticsSyncProcessor();
    await mongoose.connection.close().catch(() => {});
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  console.error('Analytics synchronization worker failed to start:', error);
  process.exit(1);
});
