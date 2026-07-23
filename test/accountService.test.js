const assert = require('node:assert/strict');
const test = require('node:test');
const { hashToken } = require('../src/services/tokenService');
const {
  applyDeleteAccountRequest,
  applyPendingEmailChange,
  applyProfileUpdate,
  createEmailVerificationToken,
  createPasswordResetToken,
  normalizeEmail,
  validatePassword,
  verificationUrl
} = require('../src/services/account/account.service');

test('account email helpers normalize email and create expiring hashed verification tokens', () => {
  const user = { email: 'Owner@Example.COM', isVerified: true };
  const now = Date.UTC(2026, 0, 1);
  const token = applyPendingEmailChange(user, ' Next@Example.COM ', now);

  assert.equal(normalizeEmail(user.email), 'owner@example.com');
  assert.equal(user.pendingEmail, 'next@example.com');
  assert.equal(user.isVerified, false);
  assert.equal(user.emailVerificationTokenHash, hashToken(token));
  assert.equal(user.emailVerificationExpiresAt.getTime(), now + 24 * 60 * 60 * 1000);
  assert.equal(verificationUrl('abc 123'), '/auth/verify-email?token=abc%20123');
});

test('account profile update validates name and avatar URL', () => {
  const user = {};
  applyProfileUpdate(user, { name: '  Awan   Mabur ', avatar: 'https://cdn.example.com/avatar.png' });

  assert.equal(user.name, 'Awan Mabur');
  assert.equal(user.avatar, 'https://cdn.example.com/avatar.png');
  assert.throws(() => applyProfileUpdate(user, { name: 'A', avatar: '' }), /Enter your name/);
  assert.throws(() => applyProfileUpdate(user, { name: 'Awan Mabur', avatar: 'ftp://bad.example.com' }), /Avatar URL/);
});

test('password reset and password validation enforce account security basics', () => {
  const user = {};
  const now = Date.UTC(2026, 1, 1);
  const verifyToken = createEmailVerificationToken(user, now);
  const resetToken = createPasswordResetToken(user, now);

  assert.equal(user.emailVerificationTokenHash, hashToken(verifyToken));
  assert.equal(user.passwordResetTokenHash, hashToken(resetToken));
  assert.equal(user.passwordResetExpiresAt.getTime(), now + 15 * 60 * 1000);
  assert.equal(validatePassword('long-enough1'), 'long-enough1');
  assert.throws(() => validatePassword('short'), /at least 12/);
  assert.throws(() => validatePassword('password1234'), /too common/);
});

test('delete account request stores reviewable account state without deleting the user', () => {
  const user = {};
  const now = Date.UTC(2026, 2, 1);
  applyDeleteAccountRequest(user, 'Please remove my workspace data after export.', now);

  assert.equal(user.accountDeletionStatus, 'requested');
  assert.equal(user.accountDeletionRequestedAt.getTime(), now);
  assert.equal(user.accountDeletionReason, 'Please remove my workspace data after export.');
});
