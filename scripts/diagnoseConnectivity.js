#!/usr/bin/env node
try { require('dotenv').config(); } catch (_error) { /* optional */ }

const dns = require('node:dns').promises;
const net = require('node:net');

function clean(value) {
  return String(value || '').trim();
}

function mongoHostFromUri(uri) {
  const match = String(uri || '').match(/^mongodb(?:\+srv)?:\/\/([^/]+)/i);
  if (!match) return '';
  const authority = match[1].replace(/^.*@/, '');
  return authority.split(',')[0].replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
}

async function tcpProbe(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs, () => finish({ ok: false, error: `timeout after ${timeoutMs}ms` }));
    socket.once('connect', () => finish({ ok: true }));
    socket.once('error', (error) => finish({ ok: false, error: `${error.code || error.name}: ${error.message}` }));
  });
}

async function diagnoseMongo() {
  const uri = clean(process.env.MONGO_URI);
  if (!uri) return { ok: false, message: 'MONGO_URI is missing.' };
  const rootHost = mongoHostFromUri(uri);
  if (!rootHost) return { ok: false, message: 'MONGO_URI format is invalid.' };

  const result = { rootHost, srv: uri.startsWith('mongodb+srv://'), targets: [] };
  try {
    if (result.srv) {
      const records = await dns.resolveSrv(`_mongodb._tcp.${rootHost}`);
      result.targets = records.map((record) => ({ host: record.name, port: record.port }));
    } else {
      const portMatch = String(uri).match(new RegExp(`${rootHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+)`));
      result.targets = [{ host: rootHost, port: Number(portMatch?.[1] || 27017) }];
    }

    if (!result.targets.length) throw new Error('No MongoDB hosts were returned by DNS.');
    for (const target of result.targets.slice(0, 3)) {
      try {
        target.addresses = await dns.lookup(target.host, { all: true });
      } catch (error) {
        target.dnsError = `${error.code || error.name}: ${error.message}`;
        continue;
      }
      target.tcp = await tcpProbe(target.host, target.port);
    }
    result.ok = result.targets.some((target) => target.tcp?.ok);
    return result;
  } catch (error) {
    return { ...result, ok: false, error: `${error.code || error.name}: ${error.message}` };
  }
}

async function diagnoseRedis() {
  const url = clean(process.env.REDIS_URL || process.env.REDISCLOUD_URL || process.env.REDIS_TLS_URL);
  const enabled = clean(process.env.REDIS_ENABLED).toLowerCase() === 'true' || Boolean(url);
  if (!enabled) return { ok: true, configured: false, message: 'Redis disabled; MongoDB fallback is active.' };

  let host = clean(process.env.REDIS_HOST) || '127.0.0.1';
  let port = Number(process.env.REDIS_PORT || 6379);
  if (url) {
    try {
      const parsed = new URL(url);
      host = parsed.hostname;
      port = Number(parsed.port || (parsed.protocol === 'rediss:' ? 6380 : 6379));
    } catch (error) {
      return { ok: false, configured: true, error: `Invalid REDIS_URL: ${error.message}` };
    }
  }
  const probe = await tcpProbe(host, port, 2500);
  return { configured: true, host, port, ...probe };
}

(async () => {
  const [mongo, redis] = await Promise.all([diagnoseMongo(), diagnoseRedis()]);
  console.log(JSON.stringify({ mongo, redis }, null, 2));
  if (!mongo.ok) {
    console.error('\nMongoDB is unreachable. On Windows, run:');
    console.error('  ipconfig /flushdns');
    console.error('  nslookup <the rootHost shown above>');
    console.error('Also verify internet access, VPN/firewall rules, Atlas Network Access, and the exact Atlas connection string.');
  }
  process.exitCode = mongo.ok ? 0 : 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
