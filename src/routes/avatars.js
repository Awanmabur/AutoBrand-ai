const express = require('express');
const avatarController = require('../controllers/avatarController');
const requireAuth = require('../middlewares/auth');
const requireVerified = require('../middlewares/requireVerified');

const router = express.Router();

router.use(requireAuth);
router.use(requireVerified);
router.post('/', avatarController.store);
router.post('/:id/generate-video', avatarController.generateVideo);
router.post('/:id/revoke', avatarController.revoke);

module.exports = router;
