const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const requireGuest = require('../middlewares/guest');
const requireAuth = require('../middlewares/auth');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' }
});

router.get('/login', requireGuest, authController.showLogin);
router.post('/login', authLimiter, requireGuest, authController.login);
router.get('/register', requireGuest, authController.showRegister);
router.post('/register', authLimiter, requireGuest, authController.register);
router.get('/google', requireGuest, authController.googleStart);
router.get('/google/callback', authController.googleCallback);
router.get('/forgot-password', requireGuest, authController.showForgot);
router.post('/forgot-password', authLimiter, requireGuest, authController.forgot);
router.get('/reset-password', requireGuest, authController.showReset);
router.post('/reset-password', authLimiter, requireGuest, authController.reset);
router.get('/verify-email', authController.verifyEmail);
router.post('/resend-verification', requireAuth, authController.resendVerification);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/logout-all', requireAuth, authController.logoutAll);

module.exports = router;
