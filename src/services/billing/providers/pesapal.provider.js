const crypto = require('crypto');
const env = require('../../../config/env');

const SANDBOX_BASE_URL = 'https://cybqa.pesapal.com/pesapalv3';
const LIVE_BASE_URL = 'https://pay.pesapal.com/v3';
const TOKEN_REFRESH_SKEW_MS = 30 * 1000;

let tokenCache = { token: '', expiresAt: 0 };
let registeredIpnCache = { id: '', url: '' };

function baseUrl() {
  if (env.pesapalBaseUrl) return env.pesapalBaseUrl.replace(/\/+$/, '');
  return String(env.pesapalEnvironment || '').toLowerCase() === 'production' ? LIVE_BASE_URL : SANDBOX_BASE_URL;
}

function isConfigured() {
  return Boolean(env.pesapalConsumerKey && env.pesapalConsumerSecret);
}

function appBaseUrl() {
  return (env.publicAppUrl || env.appUrl || `http://localhost:${env.port || 3200}`).replace(/\/+$/, '');
}

function callbackUrl() {
  return env.pesapalCallbackUrl || `${appBaseUrl()}/dashboard/billing/pesapal/callback`;
}

function cancellationUrl() {
  return env.pesapalCancellationUrl || `${appBaseUrl()}/dashboard/billing?cancelled=1`;
}

function ipnUrl() {
  return env.pesapalIpnUrl || `${appBaseUrl()}/dashboard/billing/pesapal/ipn`;
}

function normalizeRedirectMode(value) {
  const mode = String(value || 'TOP_WINDOW').trim().toUpperCase();
  return ['TOP_WINDOW', 'PARENT_WINDOW'].includes(mode) ? mode : 'TOP_WINDOW';
}

function normalizeReference(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_.:-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function makeReference(user, plan) {
  const userId = String(user?._id || user?.id || 'guest').slice(-8);
  const planSlug = String(plan?.slug || 'plan').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 14);
  const stamp = Date.now().toString(36);
  const random = crypto.randomBytes(3).toString('hex');
  return normalizeReference(`AB:${planSlug}:${userId}:${stamp}:${random}`);
}

function nameParts(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] || '',
    middle_name: parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
    last_name: parts.length > 1 ? parts[parts.length - 1] : ''
  };
}

function customerAddress(user = {}) {
  const names = nameParts(user.name || user.email || '');
  return {
    email_address: user.email || '',
    phone_number: user.phone || user.phoneNumber || '',
    country_code: user.countryCode || '',
    ...names,
    line_1: user.addressLine1 || '',
    line_2: user.addressLine2 || '',
    city: user.city || '',
    state: user.state || '',
    postal_code: user.postalCode || '',
    zip_code: user.zipCode || user.postalCode || ''
  };
}

function description(plan) {
  return `${env.appName || 'AutoBrand AI'} ${plan?.name || plan?.slug || 'subscription'}`.slice(0, 100);
}

function assertFetch() {
  if (typeof fetch !== 'function') {
    const error = new Error('Pesapal checkout requires Node.js 18 or newer because global fetch is required.');
    error.status = 500;
    throw error;
  }
}

async function request(path, { method = 'GET', token, body, query } = {}) {
  assertFetch();
  const url = new URL(`${baseUrl()}${path}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(Number(env.pesapalTimeoutMs || 30000), 5000));
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    let json = {};
    if (text) {
      try { json = JSON.parse(text); } catch (error) { json = { raw: text }; }
    }
    if (!response.ok || json.error) {
      const detail = json?.error?.message || json?.message || response.statusText || 'Pesapal API request failed.';
      const error = new Error(detail);
      error.status = response.status || 502;
      error.payload = json;
      throw error;
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

function expiryToMs(expiryDate) {
  const parsed = Date.parse(expiryDate || '');
  if (Number.isFinite(parsed)) return parsed;
  return Date.now() + 4 * 60 * 1000;
}

async function getAccessToken({ force = false } = {}) {
  if (!isConfigured()) {
    const error = new Error('Pesapal is not configured. Add PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET.');
    error.status = 503;
    error.code = 'PESAPAL_NOT_CONFIGURED';
    throw error;
  }
  if (!force && tokenCache.token && tokenCache.expiresAt - TOKEN_REFRESH_SKEW_MS > Date.now()) {
    return tokenCache.token;
  }
  const json = await request('/api/Auth/RequestToken', {
    method: 'POST',
    body: {
      consumer_key: env.pesapalConsumerKey,
      consumer_secret: env.pesapalConsumerSecret
    }
  });
  if (!json.token) {
    const error = new Error(json.message || 'Pesapal did not return an access token.');
    error.status = 502;
    error.payload = json;
    throw error;
  }
  tokenCache = { token: json.token, expiresAt: expiryToMs(json.expiryDate) };
  return tokenCache.token;
}

async function registerIpnUrl({ force = false } = {}) {
  const url = ipnUrl();
  if (!force && env.pesapalIpnId) return { ipn_id: env.pesapalIpnId, url, fromEnv: true };
  if (!force && registeredIpnCache.id && registeredIpnCache.url === url) return { ipn_id: registeredIpnCache.id, url, cached: true };

  const token = await getAccessToken();
  const json = await request('/api/URLSetup/RegisterIPN', {
    method: 'POST',
    token,
    body: { url, ipn_notification_type: env.pesapalIpnNotificationType || 'POST' }
  });
  if (!json.ipn_id) {
    const error = new Error(json.message || 'Pesapal did not return an IPN notification ID.');
    error.status = 502;
    error.payload = json;
    throw error;
  }
  registeredIpnCache = { id: json.ipn_id, url };
  return json;
}

async function resolveNotificationId() {
  if (env.pesapalIpnId) return env.pesapalIpnId;
  if (env.pesapalAutoRegisterIpn) {
    const registration = await registerIpnUrl();
    return registration.ipn_id;
  }
  const error = new Error('Pesapal IPN is not configured. Set PESAPAL_IPN_ID or enable PESAPAL_AUTO_REGISTER_IPN=true with a public PESAPAL_IPN_URL.');
  error.status = 503;
  error.code = 'PESAPAL_IPN_NOT_CONFIGURED';
  throw error;
}

async function submitOrder({ user, plan, reference }) {
  const token = await getAccessToken();
  const notificationId = await resolveNotificationId();
  const payload = {
    id: reference,
    currency: String(plan.currency || 'USD').toUpperCase(),
    amount: Number(plan.price || 0),
    description: description(plan),
    callback_url: callbackUrl(),
    cancellation_url: cancellationUrl(),
    redirect_mode: normalizeRedirectMode(env.pesapalRedirectMode),
    notification_id: notificationId,
    billing_address: customerAddress(user)
  };
  if (env.pesapalBranch) payload.branch = env.pesapalBranch;

  const json = await request('/api/Transactions/SubmitOrderRequest', {
    method: 'POST',
    token,
    body: payload
  });
  if (!json.redirect_url || !json.order_tracking_id) {
    const error = new Error(json.message || 'Pesapal did not return a redirect URL.');
    error.status = 502;
    error.payload = json;
    throw error;
  }
  return { payload, response: json };
}

async function createCheckoutSession({ user, plan }) {
  if (!isConfigured()) {
    const error = new Error('Pesapal is not configured. Add PESAPAL_CONSUMER_KEY, PESAPAL_CONSUMER_SECRET, and PESAPAL_IPN_ID before taking live payments.');
    error.status = 503;
    error.code = 'PESAPAL_NOT_CONFIGURED';
    throw error;
  }
  const reference = makeReference(user, plan);
  const order = await submitOrder({ user, plan, reference });
  return {
    provider: 'pesapal',
    status: 'requires_redirect',
    checkoutUrl: order.response.redirect_url,
    reference: order.response.merchant_reference || reference,
    orderTrackingId: order.response.order_tracking_id,
    message: 'Pesapal checkout created. Redirect the customer to complete mobile money or card payment.',
    metadata: {
      orderTrackingId: order.response.order_tracking_id,
      merchantReference: order.response.merchant_reference || reference,
      redirectUrl: order.response.redirect_url,
      request: order.payload,
      response: order.response
    }
  };
}

function extractPesapalPayload(payload = {}) {
  const source = { ...(payload.query || {}), ...(payload.body || {}), ...(!payload.query && !payload.body ? payload : {}) };
  return {
    orderTrackingId: source.OrderTrackingId || source.orderTrackingId || source.order_tracking_id,
    merchantReference: source.OrderMerchantReference || source.orderMerchantReference || source.merchant_reference || source.reference,
    notificationType: source.OrderNotificationType || source.orderNotificationType || source.order_notification_type
  };
}

async function getTransactionStatus(orderTrackingId) {
  if (!orderTrackingId) {
    const error = new Error('Missing Pesapal OrderTrackingId.');
    error.status = 422;
    throw error;
  }
  const token = await getAccessToken();
  return request('/api/Transactions/GetTransactionStatus', {
    method: 'GET',
    token,
    query: { orderTrackingId }
  });
}

function normalizePaymentStatus(status) {
  const text = String(status || '').toUpperCase();
  if (['COMPLETED', 'COMPLETE', 'PAID', '1'].includes(text)) return 'paid';
  if (['FAILED', 'INVALID', 'CANCELLED', 'CANCELED', '2', '0'].includes(text)) return 'failed';
  if (['REVERSED', 'REFUNDED', '3'].includes(text)) return 'refunded';
  return 'pending';
}

async function verifyPayment(payload) {
  const extracted = extractPesapalPayload(payload);
  const raw = await getTransactionStatus(extracted.orderTrackingId);
  const statusDescription = raw.payment_status_description || raw.payment_status_code || raw.status_code;
  return {
    provider: 'pesapal',
    status: normalizePaymentStatus(statusDescription || raw.status_code),
    paymentStatusDescription: raw.payment_status_description || '',
    statusCode: raw.status_code,
    orderTrackingId: extracted.orderTrackingId,
    merchantReference: raw.merchant_reference || extracted.merchantReference,
    amount: raw.amount,
    currency: raw.currency,
    paymentMethod: raw.payment_method,
    confirmationCode: raw.confirmation_code,
    paymentAccount: raw.payment_account,
    notificationType: extracted.notificationType,
    raw
  };
}

async function cancelSubscription(subscription) { return { provider: 'pesapal', status: 'cancelled', subscription }; }
async function resumeSubscription(subscription) { return { provider: 'pesapal', status: 'active', subscription }; }
async function handleWebhook(payload) { return verifyPayment(payload); }
async function getCustomerPortal() { return { provider: 'pesapal', url: '/dashboard/billing' }; }

module.exports = {
  baseUrl,
  callbackUrl,
  cancelSubscription,
  createCheckoutSession,
  getAccessToken,
  getCustomerPortal,
  getTransactionStatus,
  handleWebhook,
  ipnUrl,
  isConfigured,
  normalizePaymentStatus,
  registerIpnUrl,
  resumeSubscription,
  verifyPayment,
  _test: { customerAddress, description, extractPesapalPayload, makeReference, normalizeReference, normalizeRedirectMode }
};
