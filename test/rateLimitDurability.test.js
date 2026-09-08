const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const root = path.join(__dirname, '..');

async function loadRateLimit({ env, queue, bucket }) {
  const absolute = path.join(root, 'src/config/rateLimit.js');
  delete require.cache[require.resolve(absolute)];
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (parent?.filename === absolute && request === './env') return env;
    if (parent?.filename === absolute && request === './queue') return queue;
    if (parent?.filename === absolute && request === '../models/RateLimitBucket') return bucket;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(absolute);
  } finally {
    Module._load = originalLoad;
  }
}

function mongoBucketReturning({ totalHits = 1, resetAt = new Date(Date.now() + 60_000) } = {}) {
  const calls = [];
  return {
    calls,
    model: {
      findOneAndUpdate: (...args) => {
        calls.push(['findOneAndUpdate', ...args]);
        return { lean: async () => ({ totalHits, resetAt }) };
      },
      updateOne: async (...args) => calls.push(['updateOne', ...args]),
      deleteOne: async (...args) => calls.push(['deleteOne', ...args])
    }
  };
}

test('production rate limiting uses MongoDB as the shared store when Redis is disabled', async () => {
  const bucket = mongoBucketReturning({ totalHits: 4 });
  const module = await loadRateLimit({
    env: { nodeEnv: 'production', redisConfigured: false, queuePrefix: 'autobrand' },
    queue: { getQueueConnection: () => { throw new Error('must not use Redis'); } },
    bucket: bucket.model
  });

  const store = new module.DistributedWindowStore('global');
  store.init({ windowMs: 30_000 });
  const result = await store.increment('ip:1');

  assert.equal(result.totalHits, 4);
  assert.equal(bucket.calls.filter((call) => call[0] === 'findOneAndUpdate').length, 1);
});

test('production rate limiting falls back from unavailable Redis to shared MongoDB, not process memory', async () => {
  const bucket = mongoBucketReturning({ totalHits: 7 });
  const module = await loadRateLimit({
    env: { nodeEnv: 'production', redisConfigured: true, queuePrefix: 'autobrand' },
    queue: {
      getQueueConnection: () => ({
        multi: () => ({
          incr() { return this; },
          pttl() { return this; },
          exec: async () => { throw new Error('Redis offline'); }
        })
      })
    },
    bucket: bucket.model
  });

  const store = new module.DistributedWindowStore('auth-login');
  store.init({ windowMs: 60_000 });
  const result = await store.increment('ip:2');

  assert.equal(result.totalHits, 7);
  assert.equal(bucket.calls.filter((call) => call[0] === 'findOneAndUpdate').length, 1);
});

test('production rate limiting fails closed when both shared stores are unavailable', async () => {
  const module = await loadRateLimit({
    env: { nodeEnv: 'production', redisConfigured: true, queuePrefix: 'autobrand' },
    queue: {
      getQueueConnection: () => ({
        multi: () => ({
          incr() { return this; },
          pttl() { return this; },
          exec: async () => { throw new Error('Redis offline'); }
        })
      })
    },
    bucket: {
      findOneAndUpdate: () => ({ lean: async () => { throw new Error('Mongo offline'); } }),
      updateOne: async () => { throw new Error('Mongo offline'); },
      deleteOne: async () => { throw new Error('Mongo offline'); }
    }
  });

  const store = new module.DistributedWindowStore('auth-login');
  store.init({ windowMs: 60_000 });

  await assert.rejects(() => store.increment('ip:3'), (error) => {
    assert.equal(error.code, 'ERATELIMITSTORE');
    return true;
  });
});

test('database startup explicitly creates declared indexes even though production autoIndex is disabled', () => {
  const fs = require('node:fs');
  const dbSource = fs.readFileSync(path.join(root, 'src/config/db.js'), 'utf8');
  const indexSource = fs.readFileSync(path.join(root, 'src/config/ensureIndexes.js'), 'utf8');

  assert.match(dbSource, /autoIndex:\s*false/);
  assert.match(dbSource, /if \(ensureIndexes\)[\s\S]*await ensureDatabaseIndexes\(\)/);
  assert.match(indexSource, /await reconcilePaymentReferenceIndex\(Model\)/);
  assert.match(indexSource, /await Model\.createIndexes\(\)/);
  assert.doesNotMatch(indexSource, /syncIndexes\(/);
});


test('production migration repairs uniqueness before creating indexes and dry-run remains read-only', () => {
  const fs = require('node:fs');
  const migration = fs.readFileSync(path.join(root, 'scripts/migrateProductionData.js'), 'utf8');
  assert.match(migration, /connectDb\(\{ ensureIndexes: false \}\)/);
  assert.match(migration, /socialAccountDuplicates:\s*await deduplicateSocialAccounts\(\)/);
  assert.match(migration, /report\.indexedModels = await ensureDatabaseIndexes\(\)/);
  assert.ok(migration.indexOf('socialAccountDuplicates: await deduplicateSocialAccounts()') < migration.indexOf('report.indexedModels = await ensureDatabaseIndexes()'));
});
