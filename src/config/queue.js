const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const env = require('./env');

let connection;
let postQueue;

function getQueueConnection() {
  if (!connection) {
    const options = { maxRetriesPerRequest: null, enableReadyCheck: false, lazyConnect: true };
    connection = env.redisUrl
      ? new IORedis(env.redisUrl, options)
      : new IORedis({ host: env.redisHost, port: env.redisPort, ...options });
  }
  return connection;
}

function getPostQueue() {
  if (!postQueue) {
    postQueue = new Queue('post-publishing', {
      connection: getQueueConnection()
    });
  }
  return postQueue;
}

module.exports = { getQueueConnection, getPostQueue };
