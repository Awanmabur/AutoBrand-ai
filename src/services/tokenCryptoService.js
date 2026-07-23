const crypto = require('crypto');
const env = require('../config/env');

class TokenDecryptionError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'TokenDecryptionError';
    this.code = 'TOKEN_DECRYPTION_FAILED';
    this.reconnectRequired = true;
  }
}

function keyBuffer(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function keyId(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex').slice(0, 16);
}

function keyEntries() {
  const values = [env.tokenEncryptionKey, ...(env.tokenEncryptionKeyPrevious || [])]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const seen = new Set();
  return values
    .filter((value) => {
      const id = keyId(value);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((value) => ({ id: keyId(value), key: keyBuffer(value) }));
}

function currentKey() {
  const [entry] = keyEntries();
  if (!entry) throw new Error('TOKEN_ENCRYPTION_KEY is not configured.');
  return entry;
}

function encryptToken(value) {
  if (!value) return '';
  const current = currentKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', current.key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v2', current.id, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

function parsePayload(value) {
  const parts = String(value || '').split('.');
  if (parts[0] === 'v2') {
    const [, id, ivRaw, tagRaw, encryptedRaw] = parts;
    return { version: 'v2', id, ivRaw, tagRaw, encryptedRaw };
  }
  if (parts[0] === 'v1') {
    const [, ivRaw, tagRaw, encryptedRaw] = parts;
    return { version: 'v1', id: '', ivRaw, tagRaw, encryptedRaw };
  }
  const [ivRaw, tagRaw, encryptedRaw] = parts;
  return { version: 'legacy', id: '', ivRaw, tagRaw, encryptedRaw };
}

function decryptWithEntry(payload, entry) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', entry.key, Buffer.from(payload.ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(payload.tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.encryptedRaw, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

function decryptToken(value) {
  if (!value) return '';
  const payload = parsePayload(value);
  if (!payload.ivRaw || !payload.tagRaw || !payload.encryptedRaw) {
    throw new TokenDecryptionError('Stored social account credentials are malformed. Reconnect the account.');
  }

  const entries = keyEntries();
  if (!entries.length) throw new TokenDecryptionError('TOKEN_ENCRYPTION_KEY is not configured. Reconnect cannot succeed until a stable key is configured.');
  const candidates = payload.id
    ? [...entries.filter((entry) => entry.id === payload.id), ...entries.filter((entry) => entry.id !== payload.id)]
    : entries;

  let lastError;
  for (const entry of candidates) {
    try {
      return decryptWithEntry(payload, entry);
    } catch (error) {
      lastError = error;
    }
  }

  throw new TokenDecryptionError(
    'Stored social account credentials cannot be decrypted. Restore the previous TOKEN_ENCRYPTION_KEY using TOKEN_ENCRYPTION_KEY_PREVIOUS, or reconnect the account.',
    { cause: lastError }
  );
}

function canDecryptToken(value) {
  try {
    decryptToken(value);
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error };
  }
}

function isTokenDecryptionError(errorOrMessage) {
  if (errorOrMessage?.code === 'TOKEN_DECRYPTION_FAILED') return true;
  return /cannot be decrypted|credentials are malformed|unsupported state or unable to authenticate data|unable to authenticate data|bad decrypt|authentication tag|TOKEN_ENCRYPTION_KEY/i.test(
    String(errorOrMessage?.message || errorOrMessage || '')
  );
}

module.exports = {
  TokenDecryptionError,
  canDecryptToken,
  decryptToken,
  encryptToken,
  isTokenDecryptionError,
  keyId
};
