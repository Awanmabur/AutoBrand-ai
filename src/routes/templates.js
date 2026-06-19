const express = require('express');
const templateController = require('../controllers/templateController');
const requireAuth = require('../middlewares/auth');

const router = express.Router();

router.use(requireAuth);
router.post('/render', templateController.renderTemplate);
router.post('/renders/:id/status', templateController.updateRenderStatus);
router.post('/renders/:id/create-post', templateController.createPostFromRender);

module.exports = router;
