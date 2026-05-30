const express = require('express');
const authController = require('../controllers/authController');
const requireGuest = require('../middlewares/guest');
const requireAuth = require('../middlewares/auth');

const router = express.Router();

router.get('/login', requireGuest, authController.showLogin);
router.post('/login', requireGuest, authController.login);
router.get('/register', requireGuest, authController.showRegister);
router.post('/register', requireGuest, authController.register);
router.get('/google', requireGuest, authController.googleStart);
router.get('/google/callback', authController.googleCallback);
router.get('/forgot-password', requireGuest, authController.showForgot);
router.post('/forgot-password', requireGuest, authController.forgot);
router.get('/reset-password', requireGuest, authController.showReset);
router.post('/reset-password', requireGuest, authController.reset);
router.get('/verify-email', authController.verifyEmail);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/logout-all', requireAuth, authController.logoutAll);

module.exports = router;
