const crypto = require('crypto');
const { hashToken } = require('../tokenService');

const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;

function plainToken() {
  return crypto.randomBytes(32).toString('hex');
}

function normalizeEmail(value = '') {
  return String(value || '').toLowerCase().trim();
}

function validateEmail(value = '') {
  const email = normalizeEmail(value);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address.');
  }
  return email;
}

function validateName(value = '') {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2) throw new Error('Enter your name.');
  if (name.length > 120) throw new Error('Name must be 120 characters or less.');
  return name;
}

function validatePassword(value = '', label = 'Password') {
  const password = String(value || '');
  if (password.length < 8) throw new Error(`${label} must be at least 8 characters.`);
  return password;
}

function sanitizeUrl(value = '') {
  const url = String(value || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) throw new Error('Avatar URL must start with http:// or https://.');
  return url.slice(0, 500);
}

function createExpiringToken(user, hashField, expiresField, ttlMs, now = Date.now()) {
  const token = plainToken();
  user[hashField] = hashToken(token);
  user[expiresField] = new Date(now + ttlMs);
  return token;
}

function createEmailVerificationToken(user, now) {
  return createExpiringToken(user, 'emailVerificationTokenHash', 'emailVerificationExpiresAt', EMAIL_TOKEN_TTL_MS, now);
}

function createPasswordResetToken(user, now) {
  return createExpiringToken(user, 'passwordResetTokenHash', 'passwordResetExpiresAt', PASSWORD_RESET_TTL_MS, now);
}

function applyProfileUpdate(user, body = {}) {
  user.name = validateName(body.name);
  user.avatar = sanitizeUrl(body.avatar);
}

function applyPendingEmailChange(user, email, now = Date.now()) {
  const nextEmail = validateEmail(email);
  if (nextEmail === normalizeEmail(user.email)) {
    throw new Error('That email is already saved on your account.');
  }

  user.pendingEmail = nextEmail;
  user.emailChangeRequestedAt = new Date(now);
  user.isVerified = false;
  return createEmailVerificationToken(user, now);
}

function applyDeleteAccountRequest(user, reason = '', now = Date.now()) {
  user.accountDeletionStatus = 'requested';
  user.accountDeletionRequestedAt = new Date(now);
  user.accountDeletionReason = String(reason || '').trim().slice(0, 1000);
}

function verificationUrl(token) {
  return `/auth/verify-email?token=${encodeURIComponent(token)}`;
}

module.exports = {
  EMAIL_TOKEN_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  applyDeleteAccountRequest,
  applyPendingEmailChange,
  applyProfileUpdate,
  createEmailVerificationToken,
  createPasswordResetToken,
  normalizeEmail,
  validateEmail,
  validateName,
  validatePassword,
  verificationUrl
};
