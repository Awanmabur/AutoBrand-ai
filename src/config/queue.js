const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const env = require('./env');

let connection;
let postQueue;
let lastRedisWarningAt = 0;

function redisUnavailableError() {
  const error = new Error('Redis is disabled or not configured. The MongoDB publisher fallback remains active.');
  error.code = 'EREDISDISABLED';
  return error;
}

function warnRedisOnce(error) {
  const now = Date.now();
  if (now - lastRedisWarningAt < 60000) return;
  lastRedisWarningAt = now;
  console.warn('[redis] unavailable; using MongoDB fallback', { error: error?.message || String(error) });
}

function getQueueConnection() {
  if (!env.redisConfigured) throw redisUnavailableError();
  if (!connection) {
    const options = {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: Math.max(500, Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 1500)),
      retryStrategy: () => null
    };
    connection = env.redisUrl
      ? new IORedis(env.redisUrl, options)
      : new IORedis({ host: env.redisHost, port: env.redisPort, ...options });

    // ioredis emits an EventEmitter 'error' event in addition to rejecting the
    // command promise. Always consume it so optional Redis downtime never
    // becomes an unhandled process-level error storm.
    connection.on('error', warnRedisOnce);
  }
  return connection;
}

function getPostQueue() {
  if (!env.redisConfigured) throw redisUnavailableError();
  if (!postQueue) {
    postQueue = new Queue('post-publishing', {
      connection: getQueueConnection()
    });
  }
  return postQueue;
}

async function closeQueueResources() {
  const queueToClose = postQueue;
  const connectionToClose = connection;
  postQueue = null;
  connection = null;

  if (queueToClose) await queueToClose.close().catch(() => {});
  if (connectionToClose) {
    try {
      await connectionToClose.quit().catch(() => connectionToClose.disconnect());
    } finally {
      connectionToClose.removeListener('error', warnRedisOnce);
    }
  }
}

module.exports = { closeQueueResources, getQueueConnection, getPostQueue, redisUnavailableError };
