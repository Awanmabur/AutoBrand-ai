const express = require('express');
const growthStudioController = require('../controllers/growthStudioController');
const requireAuth = require('../middlewares/auth');
const requireVerified = require('../middlewares/requireVerified');

const router = express.Router();

router.use(requireAuth);
router.use(requireVerified);
router.post('/run', growthStudioController.run);

module.exports = router;
