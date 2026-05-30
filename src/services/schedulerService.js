const { getPostQueue } = require('../config/queue');
const net = require('net');
const env = require('../config/env');

function canReachRedis() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: env.redisHost, port: env.redisPort });
    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(300);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function enqueuePost(post) {
  const redisAvailable = await canReachRedis();
  if (!redisAvailable) {
    throw new Error('Redis is not reachable.');
  }

  const delay = post.scheduledAt ? Math.max(post.scheduledAt.getTime() - Date.now(), 0) : 0;
  const queue = getPostQueue();
  await queue.add(
    'publish-post',
    { postId: post._id.toString() },
    {
      delay,
      attempts: 3,
      backoff: { type: 'exponential', delay: 60 * 1000 },
      removeOnComplete: 100,
      removeOnFail: 200
    }
  );
}

module.exports = { enqueuePost, canReachRedis };
