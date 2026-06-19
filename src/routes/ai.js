const express = require('express');
const requireAuth = require('../middlewares/auth');
const aiController = require('../controllers/aiController');

const router = express.Router();

router.use(requireAuth);
router.post('/generate-image', aiController.generateImage);
router.post('/generate-content', aiController.generatePost);
router.post('/generate-post', aiController.generatePost);
router.post('/generate-campaign', aiController.generateCampaign);
router.post('/generate-hashtags', aiController.generateHashtags);
router.post('/generate-video-script', aiController.generateVideoScript);

module.exports = router;
