const express = require('express');
const videoController = require('../controllers/videoController');
const requireAuth = require('../middlewares/auth');
const dashboardRedirect = require('../middlewares/dashboardRedirect');

const router = express.Router();

router.use(requireAuth);
router.get('/', dashboardRedirect('video-system'));
router.post('/auto-generate', videoController.storeAutoVideo);
router.post('/clean-generate', videoController.storeCleanVideo);
router.post('/image-to-video', videoController.storeImageToVideo);
router.post('/avatar-video', videoController.storeAvatarVideo);
router.post('/:id/status', videoController.updateStatus);
router.post('/:id/regenerate-scene', videoController.regenerateScene);
router.post('/:id/create-post', videoController.createPostFromVideo);
router.post('/:id/cancel', videoController.cancel);

module.exports = router;
