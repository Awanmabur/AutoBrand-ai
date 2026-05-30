const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { issueAuthTokens, rotateRefreshToken, setAuthCookies, clearAuthCookies } = require('../services/authService');
const { hashToken } = require('../services/tokenService');
const {
  isGoogleConfigured,
  createGoogleState,
  buildGoogleAuthUrl,
  exchangeCodeForProfile,
  GoogleOAuthNetworkError
} = require('../services/googleAuthService');
const crypto = require('crypto');
const { getPublicPricingCards } = require('../services/pricing.service');
const { attachSelectedPlanAfterSignup, resolveSignupPlan } = require('../services/signupPlan.service');

function showLogin(req, res) {
  res.render('auth/login', { title: 'Login', layout: 'layouts/auth', form: {}, error: null });
}

async function showRegister(req, res, next) {
  try {
    const pricingPlans = await getPublicPricingCards();
    const selectedPlanSlug = req.query.plan || pricingPlans[0]?.slug || 'free-trial';
    const selectedPlan = pricingPlans.find((plan) => plan.slug === selectedPlanSlug) || pricingPlans[0];
    res.render('auth/register', { title: 'Create account', layout: 'layouts/auth', form: { plan: selectedPlan?.slug }, error: null, pricingPlans, selectedPlan });
  } catch (error) {
    next(error);
  }
}

function makePlainToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;
    const selectedPlan = await resolveSignupPlan(req.body.plan || 'free-trial');
    const existingUser = await User.findOne({ email: String(email).toLowerCase().trim() });

    if (existingUser) {
      return res.status(422).render('auth/register', {
        title: 'Create account',
        layout: 'layouts/auth',
        form: req.body,
        pricingPlans: await getPublicPricingCards(),
        selectedPlan,
        error: 'That email is already registered.'
      });
    }

    const user = new User({
      name,
      email,
      status: 'active',
      isVerified: false,
      plan: selectedPlan.slug,
      selectedPlanSlug: selectedPlan.slug
    });

    await user.setPassword(password);
    const verifyToken = makePlainToken();
    user.emailVerificationTokenHash = hashToken(verifyToken);
    user.emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();
    const planAction = await attachSelectedPlanAfterSignup(user, selectedPlan.slug, { paymentConfigured: false });

    return res.render('auth/check-email', {
      title: 'Verify email',
      layout: 'layouts/auth',
      message: `Account created on the ${planAction.plan.name} plan. Email delivery is not connected yet, so use this development verification link.`,
      actionUrl: `/auth/verify-email?token=${verifyToken}`
    });
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    const isValid = user ? await user.verifyPassword(password) : false;

    if (!isValid || user.status === 'suspended') {
      return res.status(422).render('auth/login', {
        title: 'Login',
        layout: 'layouts/auth',
        form: req.body,
        error: 'Invalid email or password.'
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const tokens = await issueAuthTokens(user, req);
    setAuthCookies(res, tokens);
    return res.redirect('/dashboard');
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
    res.clearCookie('googleOAuthState');
    res.clearCookie('signupSelectedPlan');

    if (!req.query.state || req.query.state !== expectedState) {
      return res.status(403).render('errors/403', { message: 'Invalid Google OAuth state.' });
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
        plan: selectedPlanSlug || 'free-trial',
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
      return res.status(403).render('errors/403', { message: 'This account is suspended.' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    let redirectUrl = '/dashboard';
    if (selectedPlanSlug && isNewUser) {
      const planAction = await attachSelectedPlanAfterSignup(user, selectedPlanSlug, { paymentConfigured: false });
      redirectUrl = planAction.nextUrl || redirectUrl;
    }

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
    const email = String(req.body.email || '').toLowerCase().trim();
    const user = await User.findOne({ email });
    let actionUrl = '/auth/login';

    if (user) {
      const resetToken = makePlainToken();
      user.passwordResetTokenHash = hashToken(resetToken);
      user.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();
      actionUrl = `/auth/reset-password?token=${resetToken}`;
    }

    return res.render('auth/check-email', {
      title: 'Reset password',
      layout: 'layouts/auth',
      message: 'If the email exists, a password reset link will be sent. Email delivery is not connected yet, so development shows the link here.',
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
  googleStart,
  googleCallback
};
