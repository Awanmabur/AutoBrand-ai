const crypto = require('crypto');
const env = require('../config/env');

function key() {
  return crypto.createHash('sha256').update(env.jwtRefreshSecret || env.cookieSecret).digest();
}

function encryptToken(value) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

function decryptToken(value) {
  if (!value) return '';
  const [ivRaw, tagRaw, encryptedRaw] = String(value).split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64url')), decipher.final()]).toString('utf8');
}

module.exports = { decryptToken, encryptToken };
