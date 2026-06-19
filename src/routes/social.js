const express = require('express');
const socialController = require('../controllers/socialController');
const requireAuth = require('../middlewares/auth');

const router = express.Router();

router.use(requireAuth);
router.get('/facebook/connect', socialController.facebookConnect);
router.get('/facebook/callback', socialController.facebookCallback);
router.get('/tiktok/connect', socialController.tiktokConnect);
router.get('/tiktok/callback', socialController.tiktokCallback);
router.get('/youtube/connect', socialController.youtubeConnect);
router.get('/youtube/callback', socialController.youtubeCallback);
router.get('/linkedin/connect', socialController.linkedinConnect);
router.get('/linkedin/callback', socialController.linkedinCallback);
router.get('/google-business/connect', socialController.googleBusinessConnect);
router.get('/google-business/callback', socialController.googleBusinessCallback);
router.get('/pinterest/connect', socialController.pinterestConnect);
router.get('/pinterest/callback', socialController.pinterestCallback);
router.get('/x/connect', socialController.xConnect);
router.get('/x/callback', socialController.xCallback);
router.get('/threads/connect', socialController.threadsConnect);
router.get('/threads/callback', socialController.threadsCallback);
router.post('/facebook/page-token', socialController.facebookPageToken);
router.post('/api-connect', socialController.manualApiConnect);
router.post('/:id/update', socialController.updateAccount);
router.post('/:id/health-check', socialController.healthCheck);
router.post('/:id/disconnect', socialController.disconnect);
router.post('/:id/reconnect', socialController.reconnect);
router.post('/:id/tiktok-sync', socialController.tiktokSync);
router.post('/:id/youtube-sync', socialController.youtubeSync);
router.post('/:id/linkedin-sync', socialController.linkedinSync);
router.post('/:id/google-business-sync', socialController.googleBusinessSync);
router.post('/:id/pinterest-sync', socialController.pinterestSync);
router.post('/:id/x-sync', socialController.xSync);
router.post('/:id/threads-sync', socialController.threadsSync);

module.exports = router;
