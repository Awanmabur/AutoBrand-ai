const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const net = require('net');
const env = require('../config/env');

const MAX_REDIRECTS = 3;
const ALLOWED_PORTS = new Set(['', '80', '443']);

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function isPrivateIpv6(ip) {
  const normalized = ip.toLowerCase().split('%')[0];
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    return net.isIP(mapped) === 4 ? isPrivateIpv4(mapped) : true;
  }
  return false;
}

function isPublicIp(ip) {
  const version = net.isIP(ip);
  if (version === 4) return !isPrivateIpv4(ip);
  if (version === 6) return !isPrivateIpv6(ip);
  return false;
}

function parseRemoteUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch (_error) {
    throw new Error('Remote media URL is invalid.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Remote media URL must use HTTP or HTTPS.');
  if (url.username || url.password) throw new Error('Remote media URL must not contain credentials.');
  if (!ALLOWED_PORTS.has(url.port)) throw new Error('Remote media URL uses a disallowed port.');
  if (!url.hostname || url.hostname === 'localhost' || url.hostname.endsWith('.local')) throw new Error('Private network URLs are not allowed.');
  return url;
}

async function resolvePublicAddresses(hostname) {
  if (net.isIP(hostname)) {
    if (!isPublicIp(hostname)) throw new Error('Private network URLs are not allowed.');
    return [{ address: hostname, family: net.isIP(hostname) }];
  }
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => !isPublicIp(record.address))) {
    throw new Error('Remote media host resolves to a private or invalid network address.');
  }
  return records;
}

function requestOnce(url, { method = 'GET', timeoutMs, maxBytes, allowedMimePrefixes = [] } = {}) {
  return new Promise(async (resolve, reject) => {
    let records;
    try {
      records = await resolvePublicAddresses(url.hostname);
    } catch (error) {
      reject(error);
      return;
    }

    let lookupIndex = 0;
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method,
      headers: {
        Accept: '*/*',
        'User-Agent': 'AutoBrandAI-MediaFetcher/1.0'
      },
      timeout: timeoutMs,
      servername: url.hostname,
      lookup: (_hostname, _options, callback) => {
        const record = records[Math.min(lookupIndex++, records.length - 1)];
        callback(null, record.address, record.family);
      }
    }, (response) => {
      const statusCode = Number(response.statusCode || 0);
      const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const contentLength = Number(response.headers['content-length'] || 0);

      if (contentLength > maxBytes) {
        response.destroy();
        reject(new Error('Remote media exceeds the maximum allowed size.'));
        return;
      }
      if (allowedMimePrefixes.length && contentType && !allowedMimePrefixes.some((prefix) => contentType.startsWith(prefix))) {
        response.destroy();
        reject(new Error(`Remote media type ${contentType} is not allowed.`));
        return;
      }

      if (method === 'HEAD' || [301, 302, 303, 307, 308].includes(statusCode)) {
        response.resume();
        resolve({ statusCode, headers: response.headers, contentType, contentLength, buffer: Buffer.alloc(0) });
        return;
      }

      const chunks = [];
      let total = 0;
      response.on('data', (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          request.destroy(new Error('Remote media exceeds the maximum allowed size.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        statusCode,
        headers: response.headers,
        contentType,
        contentLength: total,
        buffer: Buffer.concat(chunks)
      }));
      response.on('error', reject);
    });

    request.on('timeout', () => request.destroy(new Error('Remote media request timed out.')));
    request.on('error', reject);
    request.end();
  });
}

async function remoteRequest(value, options = {}, redirectCount = 0) {
  const url = parseRemoteUrl(value);
  const result = await requestOnce(url, {
    timeoutMs: options.timeoutMs || env.remoteFetchTimeoutMs,
    maxBytes: options.maxBytes || env.remoteFetchMaxBytes,
    allowedMimePrefixes: options.allowedMimePrefixes || [],
    method: options.method || 'GET'
  });

  if ([301, 302, 303, 307, 308].includes(result.statusCode)) {
    if (redirectCount >= MAX_REDIRECTS) throw new Error('Remote media redirected too many times.');
    const location = result.headers.location;
    if (!location) throw new Error('Remote media redirect is missing a location.');
    return remoteRequest(new URL(location, url).toString(), options, redirectCount + 1);
  }

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(`Remote media request failed with status ${result.statusCode}.`);
  }

  return { ...result, finalUrl: url.toString() };
}

async function inspectRemoteResource(value, { allowedMimePrefixes = [], maxBytes = env.maxUploadBytes } = {}) {
  let result;
  try {
    result = await remoteRequest(value, { method: 'HEAD', allowedMimePrefixes, maxBytes });
  } catch (_error) {
    result = null;
  }
  if (!result || !result.contentType || !result.contentLength) {
    result = await remoteRequest(value, { method: 'GET', allowedMimePrefixes, maxBytes: Math.min(maxBytes, 2 * 1024 * 1024) });
  }
  return {
    finalUrl: result.finalUrl,
    mimeType: result.contentType || 'application/octet-stream',
    size: result.contentLength || result.buffer.length
  };
}

async function downloadRemoteBuffer(value, options = {}) {
  const result = await remoteRequest(value, { ...options, method: 'GET' });
  return {
    buffer: result.buffer,
    mimeType: result.contentType || 'application/octet-stream',
    size: result.buffer.length,
    finalUrl: result.finalUrl
  };
}

module.exports = {
  downloadRemoteBuffer,
  inspectRemoteResource,
  isPublicIp,
  parseRemoteUrl,
  resolvePublicAddresses
};
