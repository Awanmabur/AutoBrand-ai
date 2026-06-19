const express = require('express');
const settingsController = require('../controllers/settingsController');
const requireAuth = require('../middlewares/auth');

const router = express.Router();

router.use(requireAuth);
router.post('/profile', settingsController.profile);
router.post('/password', settingsController.password);
router.post('/email', settingsController.email);
router.post('/resend-verification', settingsController.resendVerification);
router.post('/delete-account', settingsController.deleteAccountRequest);
router.post('/diagnostics', settingsController.diagnostics);

module.exports = router;
