const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'src/config/ensureIndexes.js');

function loadIndexModule() {
  const originalLoad = Module._load;
  Module._load = function mockedLoad(request, parent, isMain) {
    if (request === 'mongoose') {
      return {
        modelNames: () => [],
        model: () => { throw new Error('not used'); }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve(target)];
    return require(target);
  } finally {
    Module._load = originalLoad;
  }
}

function fakePayment({ indexes, duplicates = [] }) {
  const events = [];
  return {
    events,
    collection: {
      indexes: async () => indexes.map((item) => ({ ...item, key: { ...item.key } })),
      dropIndex: async (name) => { events.push(['drop', name]); },
      createIndex: async (key, options) => { events.push(['create', key, options]); return options.name; }
    },
    aggregate: async () => duplicates
  };
}

test('legacy non-unique Payment provider/reference index upgrades only after duplicate check', async () => {
  const { reconcilePaymentReferenceIndex } = loadIndexModule();
  const Payment = fakePayment({
    indexes: [
      { name: '_id_', key: { _id: 1 }, unique: true },
      { name: 'provider_1_reference_1', key: { provider: 1, reference: 1 } }
    ],
    duplicates: []
  });

  const result = await reconcilePaymentReferenceIndex(Payment);
  assert.equal(result.action, 'upgraded_legacy_non_unique_index');
  assert.deepEqual(Payment.events[0], ['drop', 'provider_1_reference_1']);
  assert.deepEqual(Payment.events[1], [
    'create',
    { provider: 1, reference: 1 },
    { unique: true, name: 'uniq_payment_provider_reference', background: true }
  ]);
});

test('duplicate Payment references fail closed and preserve the legacy index', async () => {
  const { reconcilePaymentReferenceIndex } = loadIndexModule();
  const Payment = fakePayment({
    indexes: [{ name: 'provider_1_reference_1', key: { provider: 1, reference: 1 } }],
    duplicates: [{ _id: { provider: 'pesapal', reference: 'ref-1' }, count: 2, paymentIds: ['a', 'b'] }]
  });

  await assert.rejects(
    () => reconcilePaymentReferenceIndex(Payment),
    (error) => {
      assert.equal(error.code, 'EPAYMENTREFERENCEDUPLICATES');
      assert.match(error.message, /pesapal\/ref-1 \(2\)/);
      return true;
    }
  );
  assert.deepEqual(Payment.events, []);
});

test('already-current unique Payment index is left intact', async () => {
  const { reconcilePaymentReferenceIndex } = loadIndexModule();
  const Payment = fakePayment({
    indexes: [{ name: 'uniq_payment_provider_reference', key: { provider: 1, reference: 1 }, unique: true }]
  });
  const result = await reconcilePaymentReferenceIndex(Payment);
  assert.equal(result.action, 'already_current');
  assert.deepEqual(Payment.events, []);
});
