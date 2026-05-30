const express = require('express');
const calendarController = require('../controllers/calendarController');
const requireAuth = require('../middlewares/auth');
const dashboardRedirect = require('../middlewares/dashboardRedirect');

const router = express.Router();

router.use(requireAuth);
router.get('/', dashboardRedirect('calendar'));

module.exports = router;
