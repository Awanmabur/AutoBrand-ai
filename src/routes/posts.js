const express = require('express');
const postController = require('../controllers/postController');
const requireAuth = require('../middlewares/auth');
const dashboardRedirect = require('../middlewares/dashboardRedirect');

const router = express.Router();

router.use(requireAuth);
router.get('/', dashboardRedirect('content-library'));
router.get('/new', (req, res, next) => {
  if (req.query.embedded === '1' || req.get('X-Requested-With') === 'XMLHttpRequest') {
    return postController.newPost(req, res, next);
  }
  return dashboardRedirect('quick-create')(req, res, next);
});
router.get('/handoff', dashboardRedirect('approvals'));
router.post('/handoff', postController.createHandoff);
router.post('/', postController.createPost);
router.get('/drafts', dashboardRedirect('content-library'));
router.get('/:id/edit', dashboardRedirect('content-library'));
router.put('/:id', postController.update);
router.post('/:id/schedule', postController.schedule);
router.post('/:id/duplicate', postController.duplicate);
router.post('/:id/publish-now', postController.publishNow);
router.post('/:id/cancel', postController.cancel);
router.delete('/:id', postController.destroy);

module.exports = router;
