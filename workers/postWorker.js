const { Worker } = require('bullmq');
const connectDb = require('../src/config/db');
const { getQueueConnection } = require('../src/config/queue');
const { publishPost } = require('../src/services/publishingService');

async function start() {
  await connectDb();

  const worker = new Worker(
    'post-publishing',
    async (job) => {
      await publishPost(job.data.postId);
    },
    { connection: getQueueConnection() }
  );

  worker.on('completed', (job) => {
    console.log(`Published queued post job ${job.id}`);
  });

  worker.on('failed', (job, error) => {
    console.error(`Post job ${job?.id} failed`, error);
  });

  console.log('Post worker running.');
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
