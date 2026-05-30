#!/usr/bin/env node
const dns = require('dns');

const timeoutMs = Number(process.env.GOOGLE_OAUTH_TIMEOUT_MS || 30000);
const dnsOrder = String(process.env.GOOGLE_OAUTH_DNS_ORDER || '').trim();

if (dnsOrder) {
  try {
    dns.setDefaultResultOrder(dnsOrder);
    console.log(`DNS result order: ${dnsOrder}`);
  } catch (error) {
    console.warn(`Could not set DNS result order to ${dnsOrder}: ${error.message}`);
  }
}

async function main() {
  console.log(`Testing backend access to https://oauth2.googleapis.com/token with ${timeoutMs}ms timeout...`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code' }),
      signal: controller.signal
    });
    const body = await response.text();
    console.log(`Connected to Google. HTTP ${response.status} is expected without a real authorization code.`);
    console.log(body.slice(0, 500));
  } finally {
    clearTimeout(timeout);
  }
}

main().catch((error) => {
  console.error('Could not reach Google from Node.js.');
  console.error(error);
  process.exitCode = 1;
});
