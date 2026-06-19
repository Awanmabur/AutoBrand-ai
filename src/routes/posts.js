const express = require('express');
const postController = require('../controllers/postController');
const requireAuth = require('../middlewares/auth');

const router = express.Router();

router.use(requireAuth);
router.post('/handoff', postController.createHandoff);
router.post('/bulk-reschedule', postController.bulkReschedule);
router.post('/', postController.createPost);
router.put('/:id', postController.update);
router.post('/:id/schedule', postController.schedule);
router.post('/:id/retry', postController.retry);
router.post('/:id/duplicate', postController.duplicate);
router.post('/:id/publish-now', postController.publishNow);
router.post('/:id/cancel', postController.cancel);
router.delete('/:id', postController.destroy);

module.exports = router;
