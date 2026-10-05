const express = require('express');
const settingsController = require('../controllers/settingsController');
const storageController = require('../controllers/storageController');
const requireAuth = require('../middlewares/auth');

const router = express.Router();

router.use(requireAuth);
router.post('/profile', settingsController.profile);
router.post('/password', settingsController.password);
router.post('/email', settingsController.email);
router.post('/resend-verification', settingsController.resendVerification);
router.post('/link-google', settingsController.linkGoogle);
router.post('/unlink-google', settingsController.unlinkGoogle);
router.post('/delete-account', settingsController.deleteAccountRequest);
router.post('/cancel-delete-account', settingsController.cancelDeleteAccount);
router.post('/diagnostics', settingsController.diagnostics);
router.post('/mcp/revoke', settingsController.revokeMcpAuthorization);
router.post('/google-drive/disconnect', storageController.googleDriveDisconnect);
router.post('/storage-preference', storageController.storagePreference);

module.exports = router;
