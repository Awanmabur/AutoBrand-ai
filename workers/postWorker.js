const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const connectDb = require('../src/config/db');
const { validateEnvironment } = require('../src/config/validateEnv');
const { closeQueueResources, getQueueConnection } = require('../src/config/queue');
const { publishPost } = require('../src/services/publishingService');
const { enqueuePost } = require('../src/services/schedulerService');
const Post = require('../src/models/Post');

async function start() {
  const validation = validateEnvironment();
  validation.warnings.forEach((warning) => console.warn(`Configuration warning: ${warning}`));
  await connectDb();

  const worker = new Worker(
    'post-publishing',
    async (job) => {
      const result = await publishPost(job.data.postId, { expectedScheduleVersion: job.data.scheduleVersion });
      if (result) return;

      const post = await Post.findById(job.data.postId);
      if (
        post
        && post.status === 'scheduled'
        && Number(post.scheduleVersion || 0) === Number(job.data.scheduleVersion || 0)
        && post.scheduledAt
        && post.scheduledAt.getTime() > Date.now()
      ) {
        await enqueuePost(post);
      }
    },
    {
      connection: getQueueConnection(),
      concurrency: Math.max(1, Math.min(10, Number(process.env.POST_PUBLISH_CONCURRENCY || 3)))
    }
  );

  worker.on('completed', (job) => {
    console.log(`Published queued post job ${job.id}`);
  });

  worker.on('failed', (job, error) => {
    console.error(`Post job ${job?.id} failed`, error);
  });

  async function shutdown(signal) {
    console.log(`${signal} received. Stopping post publishing worker.`);
    await worker.close().catch(() => {});
    await closeQueueResources().catch(() => {});
    await mongoose.connection.close().catch(() => {});
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  console.log('Post worker running.');
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
