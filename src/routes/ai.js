const express = require('express');
const requireAuth = require('../middlewares/auth');
const aiController = require('../controllers/aiController');
const dashboardRedirect = require('../middlewares/dashboardRedirect');

const router = express.Router();

router.use(requireAuth);
router.get('/generator', dashboardRedirect('quick-create'));
router.post('/generate-post', aiController.generatePost);
router.post('/generate-campaign', aiController.generateCampaign);
router.post('/generate-hashtags', aiController.generateHashtags);
router.post('/generate-video-script', aiController.generateVideoScript);

module.exports = router;
