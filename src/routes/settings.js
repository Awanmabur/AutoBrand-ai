const express = require('express');
const settingsController = require('../controllers/settingsController');
const requireAuth = require('../middlewares/auth');
const dashboardRedirect = require('../middlewares/dashboardRedirect');

const router = express.Router();

router.use(requireAuth);
router.get('/', dashboardRedirect('settings'));
router.post('/diagnostics', settingsController.diagnostics);

module.exports = router;
