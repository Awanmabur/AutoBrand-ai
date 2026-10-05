const mongoose = require('mongoose');
const connectDb = require('../src/config/db');
const { validateEnvironment } = require('../src/config/validateEnv');
const env = require('../src/config/env');
const { startAiBrainProcessor, stopAiBrainProcessor } = require('../src/services/aiBrain/aiBrainProcessor.service');

async function start() {
  const validation = validateEnvironment();
  validation.warnings.forEach((warning) => console.warn(`Configuration warning: ${warning}`));
  if (env.aiBrainWorkerMode !== 'external') throw new Error('Dedicated AI Brain worker requires AI_BRAIN_WORKER_MODE=external.');
  await connectDb();
  startAiBrainProcessor({ pollMs: env.aiBrainPollMs, concurrency: env.aiBrainConcurrency });
  const keepAlive = setInterval(() => {}, 60_000);
  async function shutdown(signal) {
    console.log(`${signal} received. Stopping AI Brain worker.`);
    clearInterval(keepAlive); stopAiBrainProcessor(); await mongoose.connection.close().catch(() => {}); process.exit(0);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  console.log('AI Brain worker running.');
}
start().catch((error) => { console.error('AI Brain worker failed to start:', error); process.exit(1); });
