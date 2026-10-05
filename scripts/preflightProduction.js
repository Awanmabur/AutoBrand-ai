#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const env = require('../src/config/env');
const { validateEnvironment } = require('../src/config/validateEnv');

const runtimeMode = process.argv.includes('--runtime') || env.nodeEnv === 'production';
const failures = [];
const notices = [];

function check(label, fn, { required = true } = {}) {
  try {
    const value = fn();
    console.log(`OK  ${label}${value ? `: ${value}` : ''}`);
  } catch (error) {
    const message = `${label}: ${error.message}`;
    if (required) failures.push(message);
    else notices.push(message);
  }
}

check('package-lock.json', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf8'));
  if (!lock.packages?.['node_modules/sharp']) throw new Error('sharp is missing from the lockfile');
  if (!lock.packages?.['node_modules/@img/sharp-linux-x64']) throw new Error('Linux x64 sharp optional dependency is missing from the lockfile');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  if (!String(pkg.engines?.node || '').startsWith('24')) throw new Error('package.json must require Node.js 24.x');
  if (!lock.packages?.['node_modules/ffmpeg-static']) throw new Error('ffmpeg-static is missing from the lockfile');
  return 'Node 24 + Linux Sharp + ffmpeg dependencies are locked';
});

if (runtimeMode) {
  const major = Number(process.versions.node.split('.')[0]);
  if (major !== 24) failures.push(`Node.js 24.x is required; current runtime is ${process.version}.`);
  else console.log(`OK  Node.js runtime: ${process.version}`);
  check('ffmpeg-static runtime', () => {
    const binary = require('ffmpeg-static');
    if (!binary || !fs.existsSync(binary)) throw new Error('ffmpeg binary is unavailable');
    return binary;
  });
  check('Sharp native runtime', () => {
    const sharp = require('sharp');
    return sharp.versions?.sharp || require('sharp/package.json').version;
  });
  check('Production environment', () => {
    const result = validateEnvironment({ production: true });
    result.warnings.forEach((warning) => notices.push(`environment: ${warning}`));
    return 'validated';
  });
} else {
  notices.push(`Source preflight only (current host ${process.version}). Runtime/native Sharp + FFmpeg and production secrets must be checked with NODE_ENV=production npm run preflight:runtime after npm install --include=optional on the first v1.6.4 deployment (then npm ci --include=optional after committing the refreshed lockfile).`);
}

if (notices.length) {
  console.log('\nNotices:');
  notices.forEach((notice) => console.log(`- ${notice}`));
}
if (failures.length) {
  console.error(`\nPreflight failed with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('\nProduction preflight passed.');
