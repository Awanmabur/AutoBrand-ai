let cachedMongoose;
function mongooseConnection() {
  if (!cachedMongoose) {
    try { cachedMongoose = require('mongoose'); } catch (_error) { return { readyState: 0 }; }
  }
  return cachedMongoose.connection;
}

const CONNECTIVITY_PATTERNS = [
  /MongoServerSelectionError/i,
  /MongoNetworkError/i,
  /MongoTopologyClosedError/i,
  /ReplicaSetNoPrimary/i,
  /connection pool .* cleared/i,
  /server selection timed out/i,
  /topology .* closed/i,
  /client must be connected/i,
  /getaddrinfo ENOTFOUND/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /EAI_AGAIN/i,
  /socket hang up/i
];

function errorChain(error) {
  const values = [];
  const seen = new Set();
  let current = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    values.push(current);
    current = current.cause;
  }
  return values;
}

function errorText(error) {
  return errorChain(error)
    .map((item) => [item?.name, item?.code, item?.message].filter(Boolean).join(' '))
    .join(' | ');
}

function isMongoConnectivityError(error) {
  const text = errorText(error);
  return CONNECTIVITY_PATTERNS.some((pattern) => pattern.test(text));
}

function mongoStateName(state = mongooseConnection().readyState) {
  return ['disconnected', 'connected', 'connecting', 'disconnecting'][state] || 'unknown';
}

function isMongoReady() {
  return mongooseConnection().readyState === 1;
}

function createConnectivityBackoff({
  label,
  minMs = 5000,
  maxMs = 120000,
  logIntervalMs = 60000,
  logger = console.warn
}) {
  let failures = 0;
  let nextAttemptAt = 0;
  let lastLogAt = 0;
  let lastMessage = '';

  function delayForFailure() {
    return Math.min(maxMs, minMs * (2 ** Math.max(0, failures - 1)));
  }

  return {
    canAttempt(now = Date.now()) {
      return now >= nextAttemptAt;
    },
    remainingMs(now = Date.now()) {
      return Math.max(0, nextAttemptAt - now);
    },
    recordFailure(error, { forceLog = false } = {}) {
      failures += 1;
      const delayMs = delayForFailure();
      const now = Date.now();
      nextAttemptAt = now + delayMs;
      const message = error?.message || String(error || 'MongoDB is unavailable.');
      const shouldLog = forceLog || message !== lastMessage || now - lastLogAt >= logIntervalMs;
      if (shouldLog) {
        lastLogAt = now;
        lastMessage = message;
        logger(`[runtime] ${label} paused until MongoDB is available`, {
          mongoState: mongoStateName(),
          retryInMs: delayMs,
          failures,
          error: message
        });
      }
      return delayMs;
    },
    recordSuccess() {
      const recovered = failures > 0;
      failures = 0;
      nextAttemptAt = 0;
      lastMessage = '';
      return recovered;
    },
    snapshot() {
      return { failures, nextAttemptAt, remainingMs: Math.max(0, nextAttemptAt - Date.now()) };
    }
  };
}


function onMongoReady(callback) {
  const connection = mongooseConnection();
  if (!connection || typeof connection.on !== 'function') return () => {};
  const handler = () => callback();
  connection.on('connected', handler);
  connection.on('reconnected', handler);
  return () => {
    connection.removeListener?.('connected', handler);
    connection.removeListener?.('reconnected', handler);
  };
}

function mongoUnavailableError() {
  const error = new Error(`MongoDB is not connected (state: ${mongoStateName()}).`);
  error.code = 'EMONGOUNAVAILABLE';
  return error;
}

module.exports = {
  createConnectivityBackoff,
  errorText,
  isMongoConnectivityError,
  isMongoReady,
  mongoStateName,
  mongoUnavailableError,
  onMongoReady
};
