const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const env = require('./env');

let connection;
let postQueue;

function getQueueConnection() {
  if (!connection) {
    connection = new IORedis({
      host: env.redisHost,
      port: env.redisPort,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true
    });
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
