const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolvePaymentTransition, verificationIntegrity } = require('../src/services/billing/billing.service');
const { normalizePaymentStatus } = require('../src/services/billing/providers/pesapal.provider');
const Payment = require('../src/models/Payment');

test('Pesapal payment state distinguishes terminal reversals from refunds and never resurrects either', () => {
  assert.equal(resolvePaymentTransition('reversed', 'paid'), 'reversed');
  assert.equal(resolvePaymentTransition('reversed', 'failed'), 'reversed');
  assert.equal(resolvePaymentTransition('refunded', 'paid'), 'refunded');
  assert.equal(resolvePaymentTransition('refunded', 'failed'), 'refunded');
  assert.equal(resolvePaymentTransition('paid', 'pending'), 'paid');
  assert.equal(resolvePaymentTransition('failed', 'pending'), 'failed');
  assert.equal(resolvePaymentTransition('pending', 'paid'), 'paid');
  assert.equal(resolvePaymentTransition('paid', 'refunded'), 'refunded');
  assert.equal(resolvePaymentTransition('paid', 'reversed'), 'reversed');
  assert.equal(normalizePaymentStatus('REVERSED'), 'reversed');
  assert.equal(normalizePaymentStatus('REFUNDED'), 'refunded');
  assert.ok(Payment.schema.path('status').enumValues.includes('reversed'));
  assert.ok(Payment.schema.path('status').enumValues.includes('refunded'));
});

test('Pesapal integrity checks bind amount, currency, merchant reference and tracking id', () => {
  const payment = { amount: 10, currency: 'USD', reference: 'merchant-1', providerReference: 'track-1' };
  assert.deepEqual(verificationIntegrity(payment, {
    amount: 10,
    currency: 'usd',
    merchantReference: 'merchant-1',
    orderTrackingId: 'track-1'
  }), { valid: true, problems: [] });

  const bad = verificationIntegrity(payment, {
    amount: 11,
    currency: 'UGX',
    merchantReference: 'merchant-2',
    orderTrackingId: 'track-2'
  });
  assert.equal(bad.valid, false);
  assert.deepEqual(new Set(bad.problems), new Set(['amount', 'currency', 'merchant_reference', 'order_tracking_id']));
});

test('paid checkout creation cannot activate a paid plan before provider reconciliation', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/billing/billing.service.js'), 'utf8');
  assert.match(source, /status: isFreePlan\(plan\) \? 'paid' : 'pending'/);
  assert.match(source, /if \(isFreePlan\(plan\)\) await activatePlanForUser/);
  assert.doesNotMatch(source, /if \(payment\.status === 'paid'\) await activatePlanForUser/);
  assert.match(source, /optimistic concurrency prevents callback\/IPN races/i);
});

