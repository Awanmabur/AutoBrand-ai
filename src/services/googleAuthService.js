const crypto = require('crypto');
const dns = require('dns');
const https = require('https');
const env = require('../config/env');

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_PROFILE_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

class GoogleOAuthNetworkError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'GoogleOAuthNetworkError';
    this.status = 503;
    this.code = cause?.cause?.code || cause?.code || cause?.name || 'GOOGLE_OAUTH_NETWORK_ERROR';
    this.cause = cause;
  }
}

function isGoogleConfigured() {
  return Boolean(env.googleClientId && env.googleClientSecret && env.googleCallbackUrl);
}

function createGoogleState() {
  return crypto.randomBytes(24).toString('hex');
}

function buildGoogleAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleCallbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'select_account'
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function configureDnsPreference() {
  const order = String(env.googleOAuthDnsOrder || '').trim().toLowerCase();
  if (!order) return;
  if (!['ipv4first', 'ipv6first', 'verbatim'].includes(order)) return;

  try {
    dns.setDefaultResultOrder(order);
  } catch (error) {
    // Older Node versions may not support all orders. Ignore and let Node use its default.
  }
}

function optionalProxyAgent() {
  const proxyUrl = String(env.googleOAuthProxy || '').trim();
  if (!proxyUrl) return undefined;

  try {
    const { HttpsProxyAgent } = require('https-proxy-agent');
    return new HttpsProxyAgent(proxyUrl);
  } catch (error) {
    return undefined;
  }
}

function responseLike(statusCode, statusMessage, text, headers) {
  return {
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    statusText: statusMessage || '',
    headers,
    async json() {
      return text ? JSON.parse(text) : {};
    },
    async text() {
      return text || '';
    }
  };
}

function normalizeBody(body) {
  if (!body) return '';
  if (body instanceof URLSearchParams) return body.toString();
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return body;
  return String(body);
}

function nativeGoogleRequest(url, options = {}) {
  configureDnsPreference();

  const target = new URL(url);
  const timeoutMs = positiveNumber(env.googleOAuthTimeoutMs, 30000);
  const connectTimeoutMs = positiveNumber(env.googleOAuthConnectTimeoutMs, timeoutMs);
  const body = normalizeBody(options.body);
  const headers = { ...(options.headers || {}) };
  const agent = optionalProxyAgent();

  if (body && !headers['Content-Length'] && !headers['content-length']) {
    headers['Content-Length'] = Buffer.byteLength(body);
  }

  const requestOptions = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || 443,
    method: options.method || 'GET',
    path: `${target.pathname}${target.search}`,
    headers,
    timeout: connectTimeoutMs
  };

  const ipFamily = Number(env.googleOAuthIpFamily);
  if (ipFamily === 4 || ipFamily === 6) {
    requestOptions.family = ipFamily;
  }

  if (agent) {
    requestOptions.agent = agent;
  }

  return new Promise((resolve, reject) => {
    const request = https.request(requestOptions, (response) => {
      const chunks = [];
      response.setEncoding('utf8');
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve(responseLike(response.statusCode || 0, response.statusMessage, chunks.join(''), response.headers));
      });
    });

    request.setTimeout(timeoutMs, () => {
      const timeoutError = new Error(`Google OAuth request timed out after ${timeoutMs}ms`);
      timeoutError.code = 'GOOGLE_OAUTH_TIMEOUT';
      request.destroy(timeoutError);
    });

    request.on('error', reject);

    if (body) request.write(body);
    request.end();
  });
}

let httpClient = nativeGoogleRequest;

function setHttpClientForTest(client) {
  httpClient = client || nativeGoogleRequest;
}

function networkMessage(label, error) {
  const reason = error?.cause?.code || error?.code || error?.name || 'request failed';
  const proxyHint = env.googleOAuthProxy
    ? 'A GOOGLE_OAUTH_PROXY value is configured; if the timeout continues, install/configure https-proxy-agent or verify the proxy credentials.'
    : 'If you are behind a company/school proxy, set HTTPS_PROXY or GOOGLE_OAUTH_PROXY and install/configure a Node HTTPS proxy agent.';

  return `${label} could not reach Google from the Node.js backend (${reason}). Your Google redirect worked, but the server timed out while contacting Google. Check internet access, DNS, VPN/firewall rules, proxy settings, or try GOOGLE_OAUTH_DNS_ORDER=ipv4first. ${proxyHint}`;
}

async function googleFetch(url, options, label) {
  try {
    return await httpClient(url, options);
  } catch (error) {
    throw new GoogleOAuthNetworkError(networkMessage(label, error), error);
  }
}

async function readProviderError(response, fallback) {
  const body = await response.text().catch(() => '');
  if (!body) return fallback;

  try {
    const data = JSON.parse(body);
    return data.error_description || data.error?.message || data.error || fallback;
  } catch (error) {
    return body || fallback;
  }
}

async function exchangeCodeForProfile(code) {
  const tokenResponse = await googleFetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: env.googleCallbackUrl,
      grant_type: 'authorization_code'
    })
  }, 'Google token exchange');

  if (!tokenResponse.ok) {
    const details = await readProviderError(tokenResponse, tokenResponse.statusText || 'Unknown Google OAuth error');
    const error = new Error(`Google token exchange failed (${tokenResponse.status}): ${details}`);
    error.status = tokenResponse.status >= 500 ? 503 : 422;
    throw error;
  }

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    const error = new Error('Google token exchange failed: Google did not return an access token.');
    error.status = 422;
    throw error;
  }

  const profileResponse = await googleFetch(GOOGLE_PROFILE_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  }, 'Google profile fetch');

  if (!profileResponse.ok) {
    const details = await readProviderError(profileResponse, profileResponse.statusText || 'Unknown Google profile error');
    const error = new Error(`Google profile fetch failed (${profileResponse.status}): ${details}`);
    error.status = profileResponse.status >= 500 ? 503 : 422;
    throw error;
  }

  const profile = await profileResponse.json();

  return {
    googleId: profile.sub,
    email: profile.email,
    name: profile.name || profile.email,
    avatar: profile.picture,
    isVerified: Boolean(profile.email_verified)
  };
}

module.exports = {
  isGoogleConfigured,
  createGoogleState,
  buildGoogleAuthUrl,
  exchangeCodeForProfile,
  GoogleOAuthNetworkError,
  __private: {
    GOOGLE_TOKEN_URL,
    GOOGLE_PROFILE_URL,
    setHttpClientForTest,
    nativeGoogleRequest,
    networkMessage
  }
};
