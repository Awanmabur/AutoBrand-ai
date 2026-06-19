const assert = require('node:assert/strict');
const test = require('node:test');

function freshProvider(env = {}) {
  Object.assign(process.env, {
    APP_URL: 'https://app.example.com',
    BILLING_PROVIDER: 'pesapal',
    PESAPAL_ENVIRONMENT: 'sandbox',
    PESAPAL_CONSUMER_KEY: 'consumer-key',
    PESAPAL_CONSUMER_SECRET: 'consumer-secret',
    PESAPAL_IPN_ID: 'ipn-123',
    PESAPAL_AUTO_REGISTER_IPN: '',
    PESAPAL_BASE_URL: '',
    PESAPAL_CALLBACK_URL: '',
    PESAPAL_IPN_URL: '',
    PESAPAL_CANCELLATION_URL: '',
    ...env
  });
  for (const key of Object.keys(require.cache)) {
    const normalizedKey = key.replace(/\\/g, '/');
    if (normalizedKey.endsWith('/src/config/env.js') || normalizedKey.endsWith('/src/services/billing/providers/pesapal.provider.js')) {
      delete require.cache[key];
    }
  }
  return require('../src/services/billing/providers/pesapal.provider');
}

function jsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    text: async () => JSON.stringify(body)
  };
}

test('Pesapal provider creates a hosted checkout with token auth and SubmitOrderRequest', async () => {
  const calls = [];
  const oldFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/api/Auth/RequestToken')) {
      return jsonResponse({ token: 'token-123', expiryDate: new Date(Date.now() + 60000).toISOString() });
    }
    if (String(url).endsWith('/api/Transactions/SubmitOrderRequest')) {
      const body = JSON.parse(options.body);
      assert.equal(body.notification_id, 'ipn-123');
      assert.equal(body.callback_url, 'https://app.example.com/dashboard/billing/pesapal/callback');
      assert.equal(body.cancellation_url, 'https://app.example.com/dashboard/billing?cancelled=1');
      assert.equal(body.billing_address.email_address, 'buyer@example.com');
      assert.equal(options.headers.Authorization, 'Bearer token-123');
      return jsonResponse({ redirect_url: 'https://pay.pesapal.example/checkout', order_tracking_id: 'track-123', merchant_reference: body.id });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const provider = freshProvider();
    const session = await provider.createCheckoutSession({
      user: { _id: 'user12345678', name: 'Awan Mabur', email: 'buyer@example.com' },
      plan: { slug: 'growth', name: 'Growth', price: 20, currency: 'USD' }
    });
    assert.equal(session.provider, 'pesapal');
    assert.equal(session.status, 'requires_redirect');
    assert.equal(session.checkoutUrl, 'https://pay.pesapal.example/checkout');
    assert.equal(session.orderTrackingId, 'track-123');
    assert.equal(calls.length, 2);
  } finally {
    global.fetch = oldFetch;
  }
});

test('Pesapal verification checks GetTransactionStatus and maps COMPLETED to paid', async () => {
  const oldFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/api/Auth/RequestToken')) {
      return jsonResponse({ token: 'token-456', expiryDate: new Date(Date.now() + 60000).toISOString() });
    }
    if (String(url).includes('/api/Transactions/GetTransactionStatus')) {
      assert.equal(new URL(String(url)).searchParams.get('orderTrackingId'), 'track-456');
      assert.equal(options.headers.Authorization, 'Bearer token-456');
      return jsonResponse({
        payment_status_description: 'COMPLETED',
        status_code: 1,
        merchant_reference: 'AB:growth:user:ref',
        confirmation_code: 'PESA123',
        payment_method: 'CARD'
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const provider = freshProvider();
    const verification = await provider.verifyPayment({ query: { OrderTrackingId: 'track-456', OrderMerchantReference: 'AB:growth:user:ref' } });
    assert.equal(verification.status, 'paid');
    assert.equal(verification.orderTrackingId, 'track-456');
    assert.equal(verification.confirmationCode, 'PESA123');
  } finally {
    global.fetch = oldFetch;
  }
});
