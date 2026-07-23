const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Module = require('node:module');

const root = path.join(__dirname, '..');

function readRedisConfig(extra = {}) {
  const result = spawnSync(process.execPath, ['-e', "const e=require('./src/config/env'); console.log(JSON.stringify({enabled:e.redisEnabled, configured:e.redisConfigured, host:e.redisHost}));"], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      TOKEN_ENCRYPTION_KEY: 'test-token-key'.padEnd(48, 'x'),
      ...extra
    },
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test('localhost REDIS_HOST alone does not enable optional Redis', () => {
  const config = readRedisConfig({ REDIS_HOST: '127.0.0.1', REDIS_URL: '', REDIS_ENABLED: '' });
  assert.equal(config.enabled, false);
  assert.equal(config.configured, false);
});

test('REDIS_ENABLED explicitly enables host and port mode', () => {
  const config = readRedisConfig({ REDIS_HOST: '127.0.0.1', REDIS_ENABLED: 'true' });
  assert.equal(config.enabled, true);
  assert.equal(config.configured, true);
});

test('a Redis URL enables Redis automatically', () => {
  const config = readRedisConfig({ REDIS_URL: 'redis://cache.example.test:6379', REDIS_ENABLED: 'false' });
  assert.equal(config.enabled, true);
  assert.equal(config.configured, true);
});

test('MongoDB connectivity errors are classified for worker backoff', () => {
  const service = require('../src/services/runtimeConnectivity.service');
  assert.equal(service.isMongoConnectivityError(new Error('getaddrinfo ENOTFOUND cluster.mongodb.net')), true);
  assert.equal(service.isMongoConnectivityError(new Error('Connection pool was cleared because another operation timed out')), true);
  assert.equal(service.isMongoConnectivityError(new Error('Caption is required.')), false);
});

test('queue does not instantiate ioredis when Redis is disabled', () => {
  const absolute = path.join(root, 'src/config/queue.js');
  delete require.cache[require.resolve(absolute)];
  let constructed = 0;
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'ioredis') return function FakeRedis() { constructed += 1; };
    if (request === 'bullmq') return { Queue: function FakeQueue() {} };
    if (request === './env' && parent?.filename === absolute) {
      return { redisConfigured: false, redisUrl: '', redisHost: '127.0.0.1', redisPort: 6379 };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const queue = require(absolute);
    assert.throws(() => queue.getQueueConnection(), /Redis is disabled or not configured/);
    assert.equal(constructed, 0);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve(absolute)];
  }
});

test('connectivity backoff suppresses repeated attempts and resets after recovery', () => {
  const { createConnectivityBackoff } = require('../src/services/runtimeConnectivity.service');
  const logs = [];
  const backoff = createConnectivityBackoff({ label: 'test', minMs: 50, maxMs: 100, logIntervalMs: 1000, logger: (...args) => logs.push(args) });
  assert.equal(backoff.canAttempt(), true);
  backoff.recordFailure(new Error('offline'));
  assert.equal(backoff.canAttempt(), false);
  assert.equal(logs.length, 1);
  assert.equal(backoff.recordSuccess(), true);
  assert.equal(backoff.canAttempt(), true);
});

test('runtime wiring pauses database work and exposes fast readiness behavior', () => {
  const fs = require('node:fs');
  const duePublisher = fs.readFileSync(path.join(root, 'src/services/duePostPublisherService.js'), 'utf8');
  const generation = fs.readFileSync(path.join(root, 'src/services/postGeneration.service.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');

  assert.match(duePublisher, /if \(!isMongoReady\(\)\) return pauseForMongo\(\)/);
  assert.match(duePublisher, /onMongoReady\(\(\) =>/);
  assert.match(generation, /generationMongoBackoff\.canAttempt\(\)/);
  assert.match(generation, /if \(!isMongoReady\(\)\)/);
  assert.match(generation, /onMongoReady\(\(\) =>/);
  assert.ok(app.indexOf("app.use(databaseAvailability)") < app.indexOf("app.get('/uploads/db"));
  assert.ok(app.indexOf("app.get('/readyz'") < app.indexOf("app.use(databaseAvailability)"));
});
