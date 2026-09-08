const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const fs = require('node:fs');

const root = path.join(__dirname, '..');
const { reconciliationSchedule } = require('../src/services/billing/billing.service');

test('Pesapal reconciliation schedule is frequent while pending and backs off for settled paid payments', () => {
  const now = new Date('2030-01-01T12:00:00Z');
  const pending = reconciliationSchedule({ provider: 'pesapal', createdAt: new Date(now.getTime() - 5 * 60_000) }, 'pending', now);
  assert.equal(pending.reconciliationStatus, 'scheduled');
  assert.equal(pending.nextReconcileAt.getTime() - now.getTime(), 2 * 60_000);

  const olderPending = reconciliationSchedule({ provider: 'pesapal', createdAt: new Date(now.getTime() - 2 * 86400000) }, 'pending', now);
  assert.equal(olderPending.nextReconcileAt.getTime() - now.getTime(), 2 * 60 * 60_000);

  const recentPaid = reconciliationSchedule({ provider: 'pesapal', paidAt: new Date(now.getTime() - 2 * 60 * 60_000) }, 'paid', now);
  assert.equal(recentPaid.nextReconcileAt.getTime() - now.getTime(), 6 * 60 * 60_000);

  const monthOldPaid = reconciliationSchedule({ provider: 'pesapal', paidAt: new Date(now.getTime() - 45 * 86400000) }, 'paid', now);
  assert.equal(monthOldPaid.nextReconcileAt.getTime() - now.getTime(), 7 * 86400000);
});

test('terminal Pesapal outcomes stop polling and pending payments eventually exhaust without provider truth', () => {
  const now = new Date('2030-01-10T12:00:00Z');
  for (const status of ['failed', 'refunded', 'reversed', 'cancelled']) {
    const result = reconciliationSchedule({ provider: 'pesapal' }, status, now);
    assert.equal(result.reconciliationStatus, 'settled');
    assert.equal(result.nextReconcileAt, undefined);
  }

  const exhausted = reconciliationSchedule({ provider: 'pesapal', createdAt: new Date(now.getTime() - 8 * 86400000) }, 'pending', now);
  assert.equal(exhausted.reconciliationStatus, 'exhausted');
  assert.equal(exhausted.nextReconcileAt, undefined);
});

async function withWorkerMocks(mocks, callback) {
  const absolute = path.join(root, 'src/services/billing/paymentReconciliation.service.js');
  delete require.cache[require.resolve(absolute)];
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (parent?.filename === absolute && Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return await callback(require(absolute));
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve(absolute)];
  }
}

test('reconciliation worker claims only due pending/paid Pesapal rows with an expiring lease', async () => {
  let captured = null;
  const fakePayment = {
    findOneAndUpdate: async (filter, update, options) => {
      captured = { filter, update, options };
      return null;
    }
  };
  await withWorkerMocks({
    '../../models/Payment': fakePayment,
    '../../config/env': { paymentReconciliationLeaseMs: 300000 },
    '../notification.service': { notifyPayment: async () => null },
    './billing.service': { reconcilePaymentFromProvider: async () => null, reconciliationSchedule: () => ({ reconciliationStatus: 'scheduled', nextReconcileAt: new Date() }) }
  }, async (service) => {
    await service.claimPayment({ now: new Date('2030-01-01T00:00:00Z'), leaseOwner: 'worker-1' });
  });

  assert.equal(captured.filter.provider, 'pesapal');
  assert.deepEqual(captured.filter.status.$in, ['pending', 'paid']);
  assert.deepEqual(captured.filter.reconciliationStatus.$in, ['scheduled', 'processing']);
  assert.equal(captured.update.$set.reconciliationLeaseOwner, 'worker-1');
  assert.equal(captured.update.$inc.reconciliationAttempts, 1);
  assert.equal(captured.options.new, true);
});

test('reconciliation worker never treats a payment without Pesapal tracking id as successfully reconciled', async () => {
  const updates = [];
  await withWorkerMocks({
    '../../models/Payment': { updateOne: async (...args) => updates.push(args) },
    '../../config/env': {},
    '../notification.service': { notifyPayment: async () => { throw new Error('must not notify'); } },
    './billing.service': { reconcilePaymentFromProvider: async () => { throw new Error('must not call provider'); }, reconciliationSchedule: () => ({ reconciliationStatus: 'scheduled', nextReconcileAt: new Date() }) }
  }, async (service) => {
    const result = await service.processClaimedPayment({ _id: 'p1', reference: 'ref1', reconciliationLeaseOwner: 'lease1', metadata: {} });
    assert.equal(result.status, 'exhausted');
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0][1].$set.reconciliationStatus, 'exhausted');
  assert.match(updates[0][1].$set.reconciliationError, /OrderTrackingId/);
});

test('runtime exposes Pesapal reconciliation in web and dedicated-worker deployment modes', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const procfile = fs.readFileSync(path.join(root, 'Procfile'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.match(server, /startPaymentReconciliationProcessor/);
  assert.match(server, /runPaymentReconciliationWorkerInWeb/);
  assert.match(procfile, /billingworker:\s+node workers\/paymentReconciliationWorker\.js/);
  assert.equal(pkg.scripts['worker:billing'], 'node workers/paymentReconciliationWorker.js');
});
