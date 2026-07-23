const mongoose = require('mongoose');
const env = require('./env');

let lastMongoErrorLogAt = 0;
let lastMongoErrorMessage = '';

function logMongoError(error) {
  const message = error?.message || String(error);
  const now = Date.now();
  if (message === lastMongoErrorMessage && now - lastMongoErrorLogAt < 60000) return;
  lastMongoErrorMessage = message;
  lastMongoErrorLogAt = now;
  console.error('[mongodb] connection unavailable', { message });
}

async function connectDb() {
  mongoose.set('strictQuery', true);
  mongoose.set('sanitizeFilter', false);
  mongoose.set('runValidators', true);

  const ipFamily = Number(process.env.MONGO_IP_FAMILY || 0);
  const options = {
    autoIndex: env.nodeEnv !== 'production',
    serverSelectionTimeoutMS: Math.max(3000, Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 15000)),
    connectTimeoutMS: Math.max(3000, Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 15000)),
    socketTimeoutMS: Math.max(10000, Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 45000)),
    heartbeatFrequencyMS: Math.max(2000, Number(process.env.MONGO_HEARTBEAT_FREQUENCY_MS || 10000)),
    maxPoolSize: Math.max(5, Number(process.env.MONGO_MAX_POOL_SIZE || 30)),
    minPoolSize: env.nodeEnv === 'production' ? Math.max(0, Number(process.env.MONGO_MIN_POOL_SIZE || 2)) : 0,
    maxIdleTimeMS: Math.max(10000, Number(process.env.MONGO_MAX_IDLE_TIME_MS || 60000)),
    retryWrites: true
  };
  if ([4, 6].includes(ipFamily)) options.family = ipFamily;

  mongoose.connection.removeListener('error', logMongoError);
  mongoose.connection.on('error', logMongoError);
  mongoose.connection.on('disconnected', () => {
    console.warn('[mongodb] disconnected; background workers are paused until reconnection.');
  });
  mongoose.connection.on('reconnected', () => {
    lastMongoErrorMessage = '';
    console.log('[mongodb] reconnected; background workers will resume automatically.');
  });

  await mongoose.connect(env.mongoUri, options);
  console.log('[mongodb] connected.');
  return mongoose.connection;
}

module.exports = connectDb;
