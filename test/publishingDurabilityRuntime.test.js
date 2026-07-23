const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const root = path.join(__dirname, '..');

async function withMockedModule(relativePath, mocks, callback) {
  const absolute = path.join(root, relativePath);
  delete require.cache[require.resolve(absolute)];
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const loaded = require(absolute);
    return await callback(loaded);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve(absolute)];
  }
}

test('dispatch falls back to MongoDB immediately when Redis is unavailable', async () => {
  const sweeps = [];
  const notifications = [];
  await withMockedModule('src/services/postDispatchService.js', {
    './schedulerService': {
      enqueuePost: async () => { throw new Error('Redis is not reachable.'); }
    },
    './duePostPublisherService': {
      triggerDuePostPublisher: (options) => sweeps.push(options)
    },
    '../models/Notification': {
      create: async (payload) => notifications.push(payload)
    },
    '../config/env': { redisConfigured: true }
  }, async (service) => {
    const result = await service.dispatchScheduledPost({
      _id: 'post_due_now',
      scheduledAt: new Date(Date.now() - 1000),
      scheduleVersion: 3
    }, { userId: 'user_1' });

    assert.equal(result.queued, false);
    assert.match(result.queueError.message, /Redis is not reachable/);
  });

  assert.deepEqual(sweeps, [{ delayMs: 0 }]);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].message, /built-in database publisher/);
});

test('database sweep repairs old records and publishes versioned due work', async () => {
  const updates = [];
  const publishCalls = [];
  const fakePost = {
    updateMany: async (filter, update) => { updates.push({ filter, update }); },
    find: () => ({
      select() { return this; },
      sort() { return this; },
      limit() { return this; },
      async lean() {
        return [{ _id: 'due_1', scheduledAt: new Date(Date.now() - 1000), scheduleVersion: 9 }];
      }
    })
  };

  await withMockedModule('src/services/duePostPublisherService.js', {
    '../models/Post': fakePost,
    './publishingService': {
      publishPost: async (id, options) => {
        publishCalls.push({ id, options });
        return { _id: id, status: 'published' };
      }
    },
    '../config/env': { publishingPaused: false },
    './runtimeConnectivity.service': {
      createConnectivityBackoff: () => ({ canAttempt: () => true, remainingMs: () => 0, recordFailure: () => 0, recordSuccess: () => false }),
      isMongoConnectivityError: () => false,
      isMongoReady: () => true,
      mongoUnavailableError: () => new Error('MongoDB unavailable')
    }
  }, async (service) => {
    const result = await service.publishDueScheduledPosts({ limit: 10 });
    assert.equal(result.processed, 1);
  });

  assert.equal(updates.some(({ filter }) => filter.status === 'scheduled' && filter.scheduledAt === null), true);
  assert.equal(updates.some(({ filter }) => filter.status === 'approved' && filter.publishAfterApproval === true && filter.scheduledAt === null), true);
  assert.equal(updates.some(({ filter }) => filter.status === 'approved' && filter.publishAfterApproval === true && filter.scheduledAt?.$ne === null), true);
  assert.deepEqual(publishCalls, [{ id: 'due_1', options: { expectedScheduleVersion: 9 } }]);
});

test('database sweep leaves jobs untouched while MongoDB is unavailable', async () => {
  let touched = false;
  const fakePost = {
    updateMany: async () => { touched = true; throw new Error('must not run'); },
    find: () => { touched = true; throw new Error('must not run'); }
  };

  await withMockedModule('src/services/duePostPublisherService.js', {
    '../models/Post': fakePost,
    './publishingService': { publishPost: async () => null },
    '../config/env': { publishingPaused: false },
    './runtimeConnectivity.service': {
      createConnectivityBackoff: () => ({ canAttempt: () => true, remainingMs: () => 5000, recordFailure: () => 5000, recordSuccess: () => false }),
      isMongoConnectivityError: () => false,
      isMongoReady: () => false,
      mongoUnavailableError: () => new Error('MongoDB is not connected.'),
      onMongoReady: () => () => {}
    }
  }, async (service) => {
    const result = await service.publishDueScheduledPosts();
    assert.equal(result.databaseUnavailable, true);
    assert.equal(result.skipped, true);
  });

  assert.equal(touched, false);
});


test('intentional Redis disable uses MongoDB fallback without warning notifications', async () => {
  const sweeps = [];
  const notifications = [];
  await withMockedModule('src/services/postDispatchService.js', {
    './schedulerService': {
      enqueuePost: async () => {
        const error = new Error('Redis is disabled; the MongoDB publisher fallback is active.');
        error.code = 'EREDISDISABLED';
        throw error;
      }
    },
    './duePostPublisherService': {
      triggerDuePostPublisher: (options) => sweeps.push(options)
    },
    '../models/Notification': {
      create: async (payload) => notifications.push(payload)
    },
    '../config/env': { redisConfigured: false }
  }, async (service) => {
    const result = await service.dispatchScheduledPost({
      _id: 'post_mongo_fallback',
      scheduledAt: new Date(Date.now() - 1000),
      scheduleVersion: 1
    }, { userId: 'user_1' });

    assert.equal(result.queued, false);
    assert.equal(result.queueError.code, 'EREDISDISABLED');
  });

  assert.deepEqual(sweeps, [{ delayMs: 0 }]);
  assert.equal(notifications.length, 0);
});
