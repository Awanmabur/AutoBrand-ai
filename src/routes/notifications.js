const express = require('express');
const notificationController = require('../controllers/notificationController');
const requireAuth = require('../middlewares/auth');
const dashboardRedirect = require('../middlewares/dashboardRedirect');

const router = express.Router();

router.use(requireAuth);
router.get('/', dashboardRedirect('notifications'));
router.post('/read-all', notificationController.markAllRead);

module.exports = router;
