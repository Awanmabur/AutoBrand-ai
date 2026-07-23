const express = require('express');
const campaignController = require('../controllers/campaignController');
const requireAuth = require('../middlewares/auth');
const requireVerified = require('../middlewares/requireVerified');

const router = express.Router();

router.use(requireAuth);
router.use(requireVerified);
router.post('/', campaignController.store);
router.post('/:id/create-drafts', campaignController.createDrafts);
router.post('/:id/schedule', campaignController.scheduleCampaign);
router.post('/:id/status', campaignController.updateStatus);

module.exports = router;
