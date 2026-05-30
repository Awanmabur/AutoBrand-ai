const express = require('express');
const avatarController = require('../controllers/avatarController');
const requireAuth = require('../middlewares/auth');
const dashboardRedirect = require('../middlewares/dashboardRedirect');

const router = express.Router();

router.use(requireAuth);
router.get('/', dashboardRedirect('avatar-video'));
router.post('/', avatarController.store);
router.post('/:id/generate-video', avatarController.generateVideo);
router.post('/:id/revoke', avatarController.revoke);

module.exports = router;
