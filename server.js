const mongoose = require('mongoose');
const app = require('./src/app');
const connectDb = require('./src/config/db');
const { validateEnvironment } = require('./src/config/validateEnv');
const env = require('./src/config/env');
const { startDuePostPublisher, stopDuePostPublisher } = require('./src/services/duePostPublisherService');
const { startPostGenerationWorker, stopPostGenerationWorker } = require('./src/services/postGeneration.service');
const { closeQueueResources } = require('./src/config/queue');
const { markLegacyInstagramAccountsForReconnect } = require('./src/services/metaAccountReadiness.service');
const { markUndecryptableSocialAccountsForReconnect } = require('./src/services/socialCredentialReadiness.service');
const { startAccountDeletionProcessor, stopAccountDeletionProcessor } = require('./src/services/account/accountDeletionProcessor.service');
const { startAnalyticsSyncProcessor, stopAnalyticsSyncProcessor } = require('./src/services/analytics/analyticsSync.service');
const { ensureDefaultTemplates } = require('./src/services/templateVideoService');
const { startPaymentReconciliationProcessor, stopPaymentReconciliationProcessor } = require('./src/services/billing/paymentReconciliation.service');
const { startAiBrainProcessor, stopAiBrainProcessor } = require('./src/services/aiBrain/aiBrainProcessor.service');

async function startServer() {
  const validation = validateEnvironment();
  validation.warnings.forEach((warning) => console.warn(`Configuration warning: ${warning}`));
  await connectDb();
  await ensureDefaultTemplates();
  await markLegacyInstagramAccountsForReconnect();
  await markUndecryptableSocialAccountsForReconnect();
  startAccountDeletionProcessor();
  if (env.runAnalyticsSyncWorkerInWeb) {
    startAnalyticsSyncProcessor({ pollMs: env.analyticsSyncPollMs, concurrency: env.analyticsSyncConcurrency });
  } else if (env.analyticsSyncWorkerMode === 'external') {
    console.log('Provider analytics synchronization is delegated to a dedicated worker (ANALYTICS_SYNC_WORKER_MODE=external).');
  } else {
    console.warn('Provider analytics synchronization is intentionally disabled (ANALYTICS_SYNC_WORKER_MODE=off).');
  }
  if (env.runPaymentReconciliationWorkerInWeb) {
    startPaymentReconciliationProcessor({ pollMs: env.paymentReconciliationPollMs, concurrency: env.paymentReconciliationConcurrency });
  } else if (env.paymentReconciliationWorkerMode === 'external') {
    console.log('Pesapal reconciliation is delegated to a dedicated worker (PAYMENT_RECONCILIATION_WORKER_MODE=external).');
  } else {
    console.warn('Pesapal reconciliation is intentionally disabled (PAYMENT_RECONCILIATION_WORKER_MODE=off). Callback/IPN verification remains active.');
  }
  if (env.runAiBrainWorkerInWeb) {
    startAiBrainProcessor({ pollMs: env.aiBrainPollMs, concurrency: env.aiBrainConcurrency });
  } else if (env.aiBrainWorkerMode === 'external') {
    console.log('AI Brain automation is delegated to a dedicated worker (AI_BRAIN_WORKER_MODE=external).');
  } else {
    console.warn('AI Brain background automation is intentionally disabled (AI_BRAIN_WORKER_MODE=off).');
  }
  if (env.publishingPaused) {
    console.warn('Publishing is intentionally paused (PAUSE_PUBLISHING=true).');
  } else {
    startDuePostPublisher();
    if (env.legacyScheduledPublishingDisabled) {
      console.warn('ENABLE_SCHEDULED_PUBLISHING=false is deprecated and ignored. Use PAUSE_PUBLISHING=true only for an intentional emergency stop.');
    }
  }
  if (env.runAiGenerationWorkerInWeb) {
    await startPostGenerationWorker();
    if (env.legacyAiWorkerDisabledInWeb) {
      console.warn('RUN_AI_GENERATION_WORKER_IN_WEB=false is deprecated and ignored. Use AI_GENERATION_WORKER_MODE=external only when a dedicated aiworker is running.');
    }
  } else if (env.aiGenerationWorkerMode === 'external') {
    console.log('AI generation is delegated to a dedicated aiworker (AI_GENERATION_WORKER_MODE=external).');
  } else {
    console.warn('AI generation is intentionally disabled (AI_GENERATION_WORKER_MODE=off).');
  }

  const server = app.listen(env.port, () => {
    console.log(`${env.appName} running on ${env.appUrl}`);
  });

  async function shutdown(signal) {
    console.log(`${signal} received. Shutting down gracefully.`);
    stopDuePostPublisher();
    stopPostGenerationWorker();
    stopAccountDeletionProcessor();
    stopAnalyticsSyncProcessor();
    stopPaymentReconciliationProcessor();
    stopAiBrainProcessor();
    server.close(async () => {
      await closeQueueResources().catch(() => {});
      await mongoose.connection.close().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${env.port} is already in use. Open ${env.appUrl} if the app is already running, or stop the other process before starting again.`);
      process.exit(1);
    }

    console.error('Server error:', error);
    process.exit(1);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
