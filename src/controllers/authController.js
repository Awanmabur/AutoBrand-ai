const bcrypt = require('bcryptjs');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const RefreshToken = require('../models/RefreshToken');
const {
  issueAuthTokens,
  rotateRefreshToken,
  revokeAllSessions,
  setAuthCookies,
  clearAuthCookies
} = require('../services/authService');
const { hashToken } = require('../services/tokenService');
const {
  createEmailVerificationToken,
  createPasswordResetToken,
  normalizeEmail,
  verificationUrl
} = require('../services/account/account.service');
const {
  isGoogleConfigured,
  createGoogleState,
  buildGoogleAuthUrl,
  exchangeCodeForProfile,
  GoogleOAuthNetworkError
} = require('../services/googleAuthService');
const { getPublicPricingCards } = require('../services/pricing.service');
const { attachSelectedPlanAfterSignup, resolveSignupPlan } = require('../services/signupPlan.service');
const { validatePassword } = require('../services/account/account.service');
const env = require('../config/env');
const { sendPasswordResetEmail, sendVerificationEmail } = require('../services/emailService');

const DUMMY_PASSWORD_HASH = '$2a$12$rQ0wqYXgCB6aQqGg32rQtehO11sO2qfVfHKv0YkTyMl6o9gQJsK5K';

async function auditAuth(req, action, user, metadata = {}) {
  await AuditLog.create({
    user: user?._id,
    action,
    entityType: 'User',
    entityId: user?._id,
    ipAddress: String(req.ip || '').slice(0, 100),
    userAgent: String(req.get('user-agent') || '').slice(0, 500),
    metadata
  }).catch(() => {});
}

function loginLockDate() {
  return new Date(Date.now() + env.loginLockMinutes * 60 * 1000);
}

function safeRedirectPath(value, fallback = '/dashboard') {
  const raw = String(value || '').trim();
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('://')) return fallback;
  return raw;
}

function appendQuery(url, params = {}) {
  const [path, query = ''] = String(url || '').split('?');
  const search = new URLSearchParams(query);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const suffix = search.toString();
  return `${path}${suffix ? `?${suffix}` : ''}`;
}

function showLogin(req, res) {
  res.render('auth/login', {
    title: 'Login',
    layout: 'layouts/auth',
    form: { next: safeRedirectPath(req.query.next, '') },
    error: null
  });
}

async function showRegister(req, res, next) {
  try {
    const pricingPlans = await getPublicPricingCards();
    const selectedPlanSlug = req.query.plan || pricingPlans[0]?.slug || 'free-trial';
    const selectedPlan = pricingPlans.find((plan) => plan.slug === selectedPlanSlug) || pricingPlans[0];
    const nextPath = safeRedirectPath(req.query.next, selectedPlan?.checkoutUrl || '/dashboard');
    res.render('auth/register', {
      title: 'Create account',
      layout: 'layouts/auth',
      form: { plan: selectedPlan?.slug, next: nextPath },
      error: null,
      pricingPlans,
      selectedPlan
    });
  } catch (error) {
    next(error);
  }
}

async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;
    const selectedPlan = await resolveSignupPlan(req.body.plan || 'free-trial');
    const existingUser = await User.findOne({ email: normalizeEmail(email) });
    const nextPath = safeRedirectPath(req.body.next, selectedPlan.checkoutUrl || '/dashboard');

    if (existingUser) {
      return res.status(422).render('auth/register', {
        title: 'Create account',
        layout: 'layouts/auth',
        form: { ...req.body, next: nextPath },
        pricingPlans: await getPublicPricingCards(),
        selectedPlan,
        error: 'That email is already registered. Log in instead to continue checkout.'
      });
    }

    try {
      validatePassword(password);
    } catch (validationError) {
      return res.status(422).render('auth/register', {
        title: 'Create account',
        layout: 'layouts/auth',
        form: { ...req.body, next: nextPath },
        pricingPlans: await getPublicPricingCards(),
        selectedPlan,
        error: validationError.message
      });
    }

    const isFreeOrTrial = selectedPlan.billingInterval === 'trial' || Number(selectedPlan.price || 0) <= 0;
    const user = new User({
      name,
      email: normalizeEmail(email),
      status: 'active',
      isVerified: false,
      plan: isFreeOrTrial ? selectedPlan.slug : 'free-trial',
      selectedPlanSlug: selectedPlan.slug
    });

    await user.setPassword(password);
    const verificationToken = createEmailVerificationToken(user);
    await user.save();
    await sendVerificationEmail({ user, token: verificationToken });

    const planAction = await attachSelectedPlanAfterSignup(user, selectedPlan.slug);
    user.lastLoginAt = new Date();
    await user.save();

    const tokens = await issueAuthTokens(user, req);
    setAuthCookies(res, tokens);

    const redirectUrl = appendQuery(nextPath || planAction.nextUrl || '/dashboard', { onboarding: 1 });
    return res.redirect(redirectUrl);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(422).render('auth/register', {
        title: 'Create account', layout: 'layouts/auth', form: req.body,
        pricingPlans: await getPublicPricingCards(), selectedPlan: await resolveSignupPlan(req.body.plan || 'free-trial'),
        error: 'That email is already registered. Log in instead.'
      });
    }
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail });
    const nextPath = safeRedirectPath(req.body.next || req.query.next, '/dashboard');

    if (!user) {
      await bcrypt.compare(String(password || ''), DUMMY_PASSWORD_HASH);
      await auditAuth(req, 'auth.login_failed', null, { emailHash: hashToken(normalizedEmail) });
      return res.status(422).render('auth/login', {
        title: 'Login', layout: 'layouts/auth', form: { ...req.body, next: nextPath }, error: 'Invalid email or password.'
      });
    }

    if (user.isLoginLocked()) {
      await auditAuth(req, 'auth.login_blocked', user, { lockUntil: user.lockUntil });
      return res.status(429).render('auth/login', {
        title: 'Login', layout: 'layouts/auth', form: { email, next: nextPath }, error: 'Too many attempts. Try again later.'
      });
    }

    const isValid = await user.verifyPassword(password);
    if (!isValid || user.status !== 'active') {
      user.failedLoginAttempts = Number(user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= env.loginMaxFailures) {
        user.lockUntil = loginLockDate();
        user.failedLoginAttempts = 0;
      }
      await user.save();
      await auditAuth(req, 'auth.login_failed', user, { locked: Boolean(user.lockUntil && user.lockUntil > new Date()) });
      return res.status(422).render('auth/login', {
        title: 'Login', layout: 'layouts/auth', form: { email, next: nextPath }, error: 'Invalid email or password.'
      });
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLoginAt = new Date();
    await user.save();

    const tokens = await issueAuthTokens(user, req);
    setAuthCookies(res, tokens);
    await auditAuth(req, 'auth.login_succeeded', user);
    return res.redirect(nextPath);
  } catch (error) {
    return next(error);
  }
}

function googleStart(req, res) {
  if (!isGoogleConfigured()) {
    return res.status(503).render('auth/check-email', {
      title: 'Google login unavailable',
      layout: 'layouts/auth',
      message: 'Google OAuth is not configured yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL to .env.',
      actionUrl: '/auth/login'
    });
  }

  if (req.query.plan) {
    res.cookie('signupSelectedPlan', String(req.query.plan), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 15 * 60 * 1000
    });
  }

  if (req.query.next) {
    res.cookie('signupNextPath', safeRedirectPath(req.query.next, '/dashboard'), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 15 * 60 * 1000
    });
  }

  const state = createGoogleState();
  res.cookie('googleOAuthState', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000
  });
  return res.redirect(buildGoogleAuthUrl(state));
}

async function googleCallback(req, res, next) {
  try {
    if (!isGoogleConfigured()) return res.redirect('/auth/login');

    const expectedState = req.cookies.googleOAuthState;
    const selectedPlanSlug = req.cookies.signupSelectedPlan;
    const signupNextPath = safeRedirectPath(req.cookies.signupNextPath, '');
    res.clearCookie('googleOAuthState');
    res.clearCookie('signupSelectedPlan');
    res.clearCookie('signupNextPath');

    if (!req.query.state || req.query.state !== expectedState) {
      return res.status(403).render('dashboard/pages/error', { message: 'Invalid Google OAuth state.' });
    }

    if (!req.query.code) {
      return res.redirect('/auth/login');
    }

    const profile = await exchangeCodeForProfile(req.query.code);
    if (!profile.email) {
      return res.status(422).render('auth/check-email', {
        title: 'Google login failed',
        layout: 'layouts/auth',
        message: 'Google did not return an email address.',
        actionUrl: '/auth/login'
      });
    }

    let user = await User.findOne({ $or: [{ googleId: profile.googleId }, { email: profile.email.toLowerCase() }] });

    const isNewUser = !user;
    if (!user) {
      user = await User.create({
        name: profile.name,
        email: profile.email.toLowerCase(),
        googleId: profile.googleId,
        avatar: profile.avatar,
        isVerified: profile.isVerified,
        status: 'active',
        plan: 'free-trial',
        selectedPlanSlug: selectedPlanSlug || ''
      });
    } else {
      user.googleId = user.googleId || profile.googleId;
      user.avatar = profile.avatar || user.avatar;
      user.isVerified = user.isVerified || profile.isVerified;
      user.status = user.status === 'pending' ? 'active' : user.status;
      await user.save();
    }

    if (user.status === 'suspended') {
      return res.status(403).render('dashboard/pages/error', { message: 'This account is suspended.' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    let redirectUrl = signupNextPath || '/dashboard';
    if (selectedPlanSlug && isNewUser) {
      const planAction = await attachSelectedPlanAfterSignup(user, selectedPlanSlug);
      redirectUrl = signupNextPath || planAction.nextUrl || redirectUrl;
    } else if (selectedPlanSlug && signupNextPath) {
      redirectUrl = signupNextPath;
    }
    if (redirectUrl.startsWith('/dashboard/billing')) redirectUrl = appendQuery(redirectUrl, { onboarding: 1 });

    const tokens = await issueAuthTokens(user, req);
    setAuthCookies(res, tokens);
    return res.redirect(redirectUrl);
  } catch (error) {
    if (error instanceof GoogleOAuthNetworkError) {
      return res.status(503).render('auth/check-email', {
        title: 'Google login could not reach Google',
        layout: 'layouts/auth',
        message: error.message,
        actionUrl: '/auth/login'
      });
    }

    if (error.status && error.status < 500) {
      return res.status(error.status).render('auth/check-email', {
        title: 'Google login failed',
        layout: 'layouts/auth',
        message: error.message,
        actionUrl: '/auth/login'
      });
    }

    return next(error);
  }
}

async function logout(req, res, next) {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      await RefreshToken.updateOne(
        { tokenHash: hashToken(refreshToken) },
        { $set: { revokedAt: new Date(), revokeReason: 'logout' } }
      );
    }

    clearAuthCookies(res);
    await auditAuth(req, 'auth.logout', req.user);
    return res.redirect('/');
  } catch (error) {
    return next(error);
  }
}

async function refresh(req, res, next) {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
    if (!refreshToken) return res.status(401).json({ error: 'Missing refresh token.' });

    const tokens = await rotateRefreshToken(refreshToken, req);
    setAuthCookies(res, tokens);
    return res.json({ ok: true, user: tokens.user.safeProfile() });
  } catch (error) {
    clearAuthCookies(res);
    return res.status(401).json({ error: 'Invalid refresh token.' });
  }
}

async function logoutAll(req, res, next) {
  try {
    if (req.user) {
      await revokeAllSessions(req.user._id, 'logout_all', { incrementVersion: true });
      await auditAuth(req, 'auth.logout_all', req.user);
    }
    clearAuthCookies(res);
    return res.redirect('/');
  } catch (error) {
    return next(error);
  }
}

function showForgot(req, res) {
  res.render('auth/forgot', { title: 'Forgot password', layout: 'layouts/auth', form: {}, error: null });
}

async function forgot(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email);
    const user = await User.findOne({ email });
    let developmentActionUrl = '/auth/login';

    if (user) {
      const resetToken = createPasswordResetToken(user);
      await user.save();
      const delivery = await sendPasswordResetEmail({ user, token: resetToken });
      if (!delivery.delivered && env.allowDevelopmentEmailLinks) {
        developmentActionUrl = `/auth/reset-password?token=${encodeURIComponent(resetToken)}`;
      }
      await auditAuth(req, 'auth.password_reset_requested', user);
    } else {
      await bcrypt.compare('not-a-real-password', DUMMY_PASSWORD_HASH);
    }

    return res.render('auth/check-email', {
      title: 'Reset password',
      layout: 'layouts/auth',
      message: 'If that email exists, a password reset link has been sent. Check your inbox.',
      actionUrl: developmentActionUrl
    });
  } catch (error) {
    return next(error);
  }
}

async function showReset(req, res) {
  res.render('auth/reset', { title: 'Reset password', layout: 'layouts/auth', token: req.query.token, error: null });
}

async function reset(req, res, next) {
  try {
    const tokenHash = hashToken(req.body.token || '');
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() }
    });

    if (!user) {
      return res.status(422).render('auth/reset', {
        title: 'Reset password',
        layout: 'layouts/auth',
        token: req.body.token,
        error: 'Reset link is invalid or expired.'
      });
    }

    try {
      validatePassword(req.body.password);
    } catch (validationError) {
      return res.status(422).render('auth/reset', {
        title: 'Reset password',
        layout: 'layouts/auth',
        token: req.body.token,
        error: validationError.message
      });
    }

    await user.setPassword(req.body.password);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    await user.save();
    await revokeAllSessions(user._id, 'password_reset');
    await auditAuth(req, 'auth.password_reset_completed', user);

    return res.redirect('/auth/login');
  } catch (error) {
    return next(error);
  }
}

async function verifyEmail(req, res, next) {
  try {
    const tokenHash = hashToken(req.query.token || req.body.token || '');
    const user = await User.findOne({
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpiresAt: { $gt: new Date() }
    });

    if (!user) {
      return res.status(422).render('auth/check-email', {
        title: 'Verify email',
        layout: 'layouts/auth',
        message: 'Verification link is invalid or expired.',
        actionUrl: '/auth/login'
      });
    }

    if (user.pendingEmail) {
      const existing = await User.findOne({ email: user.pendingEmail, _id: { $ne: user._id } });
      if (existing) {
        return res.status(409).render('auth/check-email', {
          title: 'Verify email',
          layout: 'layouts/auth',
          message: 'That email address is already used by another account. Open settings and choose a different email.',
          actionUrl: '/dashboard/settings'
        });
      }
      user.email = user.pendingEmail;
      user.pendingEmail = undefined;
      user.emailChangeRequestedAt = undefined;
    }

    user.isVerified = true;
    user.status = 'active';
    user.emailVerificationTokenHash = undefined;
    user.emailVerificationExpiresAt = undefined;
    await user.save();
    await auditAuth(req, 'auth.email_verified', user);

    return res.redirect('/dashboard');
  } catch (error) {
    return next(error);
  }
}

async function resendVerification(req, res, next) {
  try {
    if (!req.user) return res.redirect('/auth/login');
    const user = await User.findById(req.user._id);
    if (!user) return res.redirect('/auth/login');

    if (user.isVerified && !user.pendingEmail) {
      return res.render('auth/check-email', {
        title: 'Email verified',
        layout: 'layouts/auth',
        message: 'Your account email is already verified.',
        actionUrl: '/dashboard/settings'
      });
    }

    const token = createEmailVerificationToken(user);
    await user.save();
    const delivery = await sendVerificationEmail({ user, token });
    const targetEmail = user.pendingEmail || user.email;
    await auditAuth(req, 'auth.verification_resent', user, { targetEmail });
    return res.render('auth/check-email', {
      title: 'Verify email',
      layout: 'layouts/auth',
      message: `A verification link has been sent to ${targetEmail}.`,
      actionUrl: !delivery.delivered && env.allowDevelopmentEmailLinks ? verificationUrl(token) : '/dashboard'
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  showLogin,
  showRegister,
  register,
  login,
  logout,
  refresh,
  logoutAll,
  showForgot,
  forgot,
  showReset,
  reset,
  verifyEmail,
  resendVerification,
  googleStart,
  googleCallback
};
