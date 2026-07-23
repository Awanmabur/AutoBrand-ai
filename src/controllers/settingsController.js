const ApiLog = require('../models/ApiLog');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const User = require('../models/User');
const env = require('../config/env');
const { isEmailConfigured, sendVerificationEmail } = require('../services/emailService');
const { facebookConnectionChecklist } = require('../services/facebookService');
const { checkProviders } = require('../services/providerHealthService');
const { revokeAllSessions, issueAuthTokens, setAuthCookies } = require('../services/authService');
const {
  applyDeleteAccountRequest,
  applyPendingEmailChange,
  applyProfileUpdate,
  createEmailVerificationToken,
  normalizeEmail,
  validateEmail,
  validatePassword
} = require('../services/account/account.service');

function settingsUrl(params = {}) {
  const search = new URLSearchParams(params);
  return `/dashboard/settings${search.toString() ? `?${search.toString()}` : ''}`;
}

function redirectNotice(res, message) {
  return res.redirect(303, settingsUrl({ notice: message }));
}

function redirectError(res, message) {
  return res.redirect(303, settingsUrl({ error: message }));
}

async function loadAccountUser(req) {
  const user = await User.findById(req.user._id);
  if (!user) {
    const error = new Error('Account not found.');
    error.status = 404;
    throw error;
  }
  return user;
}

async function auditAccountAction(req, action, metadata = {}) {
  await AuditLog.create({
    user: req.user._id,
    action,
    entityType: 'User',
    entityId: req.user._id,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    metadata
  });
}

async function verifyCurrentPasswordIfNeeded(user, password) {
  if (!user.passwordHash) return;
  const valid = await user.verifyPassword(password || '');
  if (!valid) throw new Error('Current password is incorrect.');
}

async function renderVerificationPrepared(res, user, token) {
  if (!env.emailVerificationRequired) {
    return res.render('auth/check-email', {
      title: 'Email verification not required',
      layout: 'layouts/auth',
      message: 'Email verification is disabled for this deployment.',
      actionUrl: '/dashboard/settings'
    });
  }
  if (!isEmailConfigured()) {
    return res.status(503).render('auth/check-email', {
      title: 'Verification unavailable',
      layout: 'layouts/auth',
      message: 'Verification email delivery is temporarily unavailable. Configure SMTP before requesting an email change or verification link.',
      actionUrl: '/dashboard/settings'
    });
  }
  const targetEmail = user.pendingEmail || user.email;
  const delivery = await sendVerificationEmail({ user, token });
  return res.render('auth/check-email', {
    title: 'Verify email',
    layout: 'layouts/auth',
    message: `A verification link has been sent to ${targetEmail}.`,
    actionUrl: !delivery.delivered && env.allowDevelopmentEmailLinks
      ? `/auth/verify-email?token=${encodeURIComponent(token)}`
      : '/dashboard/settings'
  });
}

function configRows() {
  return [
    { name: 'OpenAI', keys: ['OPENAI_API_KEY'], ready: Boolean(env.openaiApiKey) },
    { name: 'Google OAuth', keys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'], ready: Boolean(env.googleClientId && env.googleClientSecret && env.googleCallbackUrl) },
    { name: 'Cloudinary', keys: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'], ready: Boolean(env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret) },
    { name: 'Redis (optional)', keys: ['REDIS_ENABLED', 'REDIS_URL'], ready: !env.redisEnabled || env.redisConfigured },
    {
      name: 'Meta / Facebook',
      keys: ['FACEBOOK_APP_ID or META_APP_ID', 'FACEBOOK_APP_SECRET or META_APP_SECRET', 'FACEBOOK_CALLBACK_URL or META_CALLBACK_URL', 'FACEBOOK_LOGIN_CONFIG_ID', 'FACEBOOK_APP_DOMAINS'],
      ready: facebookConnectionChecklist().canStartOAuth
    }
  ];
}

async function index(req, res) {
  return res.redirect(303, '/dashboard/settings');
}

async function diagnostics(req, res, next) {
  try {
    await checkProviders(req.user);
    await ApiLog.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(1);
    return res.redirect(303, '/dashboard/settings?diagnostics=refreshed');
  } catch (error) {
    return next(error);
  }
}

async function profile(req, res, next) {
  try {
    const user = await loadAccountUser(req);
    applyProfileUpdate(user, req.body);
    await user.save();
    await auditAccountAction(req, 'account.profile_updated', { name: user.name, avatar: user.avatar || '' });
    return redirectNotice(res, 'Profile updated.');
  } catch (error) {
    if (!error.status) return redirectError(res, error.message);
    return next(error);
  }
}

async function password(req, res, next) {
  try {
    const user = await loadAccountUser(req);
    await verifyCurrentPasswordIfNeeded(user, req.body.currentPassword);

    const nextPassword = validatePassword(req.body.newPassword, 'New password');
    if (nextPassword !== String(req.body.confirmPassword || '')) {
      throw new Error('New password confirmation does not match.');
    }

    await user.setPassword(nextPassword);
    await user.save();

    await revokeAllSessions(user._id, 'password_changed');
    const tokens = await issueAuthTokens(user, req);
    setAuthCookies(res, tokens);
    await auditAccountAction(req, 'account.password_changed');

    return redirectNotice(res, 'Password updated. Other sessions were signed out.');
  } catch (error) {
    if (!error.status) return redirectError(res, error.message);
    return next(error);
  }
}

async function email(req, res, next) {
  try {
    if (!env.emailVerificationRequired || !isEmailConfigured()) {
      return redirectError(res, 'Email changes require configured verification email delivery.');
    }
    const user = await loadAccountUser(req);
    await verifyCurrentPasswordIfNeeded(user, req.body.password);

    const nextEmail = validateEmail(req.body.email);
    const existing = await User.findOne({
      _id: { $ne: user._id },
      $or: [{ email: nextEmail }, { pendingEmail: nextEmail }]
    });
    if (existing) throw new Error('That email address is already used by another account.');

    const token = applyPendingEmailChange(user, nextEmail);
    await user.save();
    await auditAccountAction(req, 'account.email_change_requested', { pendingEmail: nextEmail });
    return await renderVerificationPrepared(res, user, token);
  } catch (error) {
    if (!error.status) return redirectError(res, error.message);
    return next(error);
  }
}

async function resendVerification(req, res, next) {
  try {
    const user = await loadAccountUser(req);
    if (!env.emailVerificationRequired) {
      if (!user.pendingEmail && !user.isVerified) {
        user.isVerified = true;
        user.emailVerificationTokenHash = undefined;
        user.emailVerificationExpiresAt = undefined;
        await user.save();
      }
      return redirectNotice(res, 'Email verification is disabled for this deployment.');
    }
    if (!isEmailConfigured()) return redirectError(res, 'Verification email delivery is unavailable. Configure SMTP first.');
    if (user.isVerified && !user.pendingEmail) {
      return redirectNotice(res, 'Your account email is already verified.');
    }

    const token = createEmailVerificationToken(user);
    await user.save();
    await auditAccountAction(req, 'account.verification_resent', { targetEmail: user.pendingEmail || user.email });
    return await renderVerificationPrepared(res, user, token);
  } catch (error) {
    return next(error);
  }
}

async function deleteAccountRequest(req, res, next) {
  try {
    const user = await loadAccountUser(req);
    await verifyCurrentPasswordIfNeeded(user, req.body.password);

    const confirmation = String(req.body.confirmation || '').trim();
    if (confirmation !== 'DELETE' && normalizeEmail(confirmation) !== normalizeEmail(user.email)) {
      throw new Error('Confirm the request by typing DELETE or your account email.');
    }

    applyDeleteAccountRequest(user, req.body.reason);
    await user.save();
    await Notification.create({
      user: user._id,
      type: 'account_deletion_requested',
      title: 'Account deletion requested',
      message: 'Your account deletion request has been recorded. An admin can review and complete it.'
    });
    await auditAccountAction(req, 'account.deletion_requested', { reason: user.accountDeletionReason || '' });

    return redirectNotice(res, 'Account deletion request saved.');
  } catch (error) {
    if (!error.status) return redirectError(res, error.message);
    return next(error);
  }
}

module.exports = {
  index,
  diagnostics,
  profile,
  password,
  email,
  resendVerification,
  deleteAccountRequest
};
