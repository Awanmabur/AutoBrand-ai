const express = require('express');
const growthStudioController = require('../controllers/growthStudioController');
const requireAuth = require('../middlewares/auth');

const router = express.Router();

router.use(requireAuth);
router.post('/run', growthStudioController.run);

module.exports = router;
