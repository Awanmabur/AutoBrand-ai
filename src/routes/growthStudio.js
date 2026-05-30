const express = require('express');
const growthStudioController = require('../controllers/growthStudioController');
const requireAuth = require('../middlewares/auth');
const dashboardRedirect = require('../middlewares/dashboardRedirect');

const router = express.Router();

router.use(requireAuth);
router.get('/', dashboardRedirect('campaigns'));
router.post('/run', growthStudioController.run);

module.exports = router;
