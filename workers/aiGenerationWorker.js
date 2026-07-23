const mongoose = require('mongoose');
const connectDb = require('../src/config/db');
const { validateEnvironment } = require('../src/config/validateEnv');
const { startPostGenerationWorker, stopPostGenerationWorker } = require('../src/services/postGeneration.service');

async function start() {
  const validation = validateEnvironment();
  validation.warnings.forEach((warning) => console.warn(`Configuration warning: ${warning}`));
  await connectDb();
  await startPostGenerationWorker({ keepAlive: true });

  async function shutdown(signal) {
    console.log(`${signal} received. Stopping AI generation worker.`);
    stopPostGenerationWorker();
    await mongoose.connection.close().catch(() => {});
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  console.error('AI generation worker failed to start:', error);
  process.exit(1);
});
