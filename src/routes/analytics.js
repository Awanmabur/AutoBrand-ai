const express = require('express');
const analyticsController = require('../controllers/analyticsController');
const requireAuth = require('../middlewares/auth');
const dashboardRedirect = require('../middlewares/dashboardRedirect');

const router = express.Router();

router.use(requireAuth);
router.get('/', dashboardRedirect('analytics'));

module.exports = router;
