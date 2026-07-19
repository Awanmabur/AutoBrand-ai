const mongoose = require('mongoose');
const app = require('./src/app');
const connectDb = require('./src/config/db');
const env = require('./src/config/env');
const { startDuePostPublisher, stopDuePostPublisher } = require('./src/services/duePostPublisherService');

async function startServer() {
  await connectDb();
  if (env.scheduledPublishingEnabled) {
    startDuePostPublisher();
  } else {
    console.log('Scheduled post auto-publishing is disabled (ENABLE_SCHEDULED_PUBLISHING=false). Scheduled posts will stay scheduled until this is turned back on or published manually.');
  }

  const server = app.listen(env.port, () => {
    console.log(`${env.appName} running on ${env.appUrl}`);
  });

  async function shutdown(signal) {
    console.log(`${signal} received. Shutting down gracefully.`);
    stopDuePostPublisher();
    server.close(async () => {
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
