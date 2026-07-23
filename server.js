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

async function startServer() {
  const validation = validateEnvironment();
  validation.warnings.forEach((warning) => console.warn(`Configuration warning: ${warning}`));
  await connectDb();
  await markLegacyInstagramAccountsForReconnect();
  await markUndecryptableSocialAccountsForReconnect();
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
