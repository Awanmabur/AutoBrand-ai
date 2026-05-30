const express = require('express');
const mediaController = require('../controllers/mediaController');
const requireAuth = require('../middlewares/auth');
const dashboardRedirect = require('../middlewares/dashboardRedirect');

const router = express.Router();

router.use(requireAuth);
router.get('/', dashboardRedirect('media'));
router.get('/signature', mediaController.signature);
router.post('/upload', mediaController.store);
router.post('/:id/creative', mediaController.creativeAction);
router.post('/:id/create-draft', mediaController.createDraft);
router.delete('/:id', mediaController.destroy);

module.exports = router;
