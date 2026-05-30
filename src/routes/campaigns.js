const express = require('express');
const campaignController = require('../controllers/campaignController');
const requireAuth = require('../middlewares/auth');
const dashboardRedirect = require('../middlewares/dashboardRedirect');

const router = express.Router();

router.use(requireAuth);
router.get('/', dashboardRedirect('campaigns'));
router.post('/', campaignController.store);
router.post('/:id/create-drafts', campaignController.createDrafts);
router.post('/:id/status', campaignController.updateStatus);

module.exports = router;
