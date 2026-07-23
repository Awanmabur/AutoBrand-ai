const express = require('express');
const authController = require('../controllers/authController');
const requireGuest = require('../middlewares/guest');
const requireAuth = require('../middlewares/auth');
const { createRateLimiter } = require('../config/rateLimit');

const router = express.Router();

const loginLimiter = createRateLimiter({
  prefix: 'auth-login',
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Try again later.' }
});
const registrationLimiter = createRateLimiter({
  prefix: 'auth-register',
  windowMs: 60 * 60 * 1000,
  limit: 8,
  message: { error: 'Too many registration attempts. Try again later.' }
});
const recoveryLimiter = createRateLimiter({
  prefix: 'auth-recovery',
  windowMs: 60 * 60 * 1000,
  limit: 8,
  message: { error: 'Too many recovery attempts. Try again later.' }
});
const refreshLimiter = createRateLimiter({
  prefix: 'auth-refresh',
  windowMs: 5 * 60 * 1000,
  limit: 30,
  message: { error: 'Too many session refresh attempts.' }
});

router.get('/login', requireGuest, authController.showLogin);
router.post('/login', loginLimiter, requireGuest, authController.login);
router.get('/register', requireGuest, authController.showRegister);
router.post('/register', registrationLimiter, requireGuest, authController.register);
router.get('/google', requireGuest, authController.googleStart);
router.get('/google/callback', authController.googleCallback);
router.get('/forgot-password', requireGuest, authController.showForgot);
router.post('/forgot-password', recoveryLimiter, requireGuest, authController.forgot);
router.get('/reset-password', requireGuest, authController.showReset);
router.post('/reset-password', recoveryLimiter, requireGuest, authController.reset);
router.get('/verify-email', authController.verifyEmail);
router.post('/resend-verification', recoveryLimiter, requireAuth, authController.resendVerification);
router.post('/refresh', refreshLimiter, authController.refresh);
router.post('/logout', authController.logout);
router.post('/logout-all', requireAuth, authController.logoutAll);

module.exports = router;
