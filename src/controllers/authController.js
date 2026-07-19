const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { issueAuthTokens, rotateRefreshToken, setAuthCookies, clearAuthCookies } = require('../services/authService');
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
    createEmailVerificationToken(user);
    await user.save();

    const planAction = await attachSelectedPlanAfterSignup(user, selectedPlan.slug);
    user.lastLoginAt = new Date();
    await user.save();

    const tokens = await issueAuthTokens(user, req);
    setAuthCookies(res, tokens);

    const redirectUrl = appendQuery(nextPath || planAction.nextUrl || '/dashboard', { onboarding: 1 });
    return res.redirect(redirectUrl);
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: normalizeEmail(email) });
    const isValid = user ? await user.verifyPassword(password) : false;
    const nextPath = safeRedirectPath(req.body.next || req.query.next, '/dashboard');

    if (!isValid || user.status === 'suspended') {
      return res.status(422).render('auth/login', {
        title: 'Login',
        layout: 'layouts/auth',
        form: { ...req.body, next: nextPath },
        error: 'Invalid email or password.'
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const tokens = await issueAuthTokens(user, req);
    setAuthCookies(res, tokens);
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
      await RefreshToken.updateOne({ tokenHash: hashToken(refreshToken) }, { revokedAt: new Date() });
    }

    clearAuthCookies(res);
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
      await RefreshToken.updateMany({ user: req.user._id, revokedAt: null }, { revokedAt: new Date() });
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
    const isProduction = env.nodeEnv === 'production';
    let actionUrl = '/auth/login';

    if (user) {
      const resetToken = createPasswordResetToken(user);
      await user.save();
      // TODO: send resetToken via a real email provider instead of exposing it below.
      if (!isProduction) {
        actionUrl = `/auth/reset-password?token=${resetToken}`;
      }
    }

    return res.render('auth/check-email', {
      title: 'Reset password',
      layout: 'layouts/auth',
      message: isProduction
        ? 'If that email exists, a password reset link has been sent. Check your inbox.'
        : 'If the email exists, a password reset link will be sent. Email delivery is not connected yet, so development shows the link here.',
      actionUrl
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
    await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });

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

    const isProduction = env.nodeEnv === 'production';
    const targetEmail = user.pendingEmail || user.email;
    // TODO: send `token` via a real email provider instead of exposing it below.
    return res.render('auth/check-email', {
      title: 'Verify email',
      layout: 'layouts/auth',
      message: isProduction
        ? `A verification link has been sent to ${targetEmail}.`
        : `A verification link has been prepared for ${targetEmail}. Email delivery is not connected yet, so development shows the link here.`,
      actionUrl: isProduction ? '/dashboard' : verificationUrl(token)
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
