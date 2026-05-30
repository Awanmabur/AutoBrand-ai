const express = require('express');
const approvalController = require('../controllers/approvalController');
const requireAuth = require('../middlewares/auth');
const dashboardRedirect = require('../middlewares/dashboardRedirect');

const router = express.Router();

router.get('/review/:token', approvalController.publicReview);
router.post('/review/:token', approvalController.publicDecision);

router.use(requireAuth);
router.get('/', dashboardRedirect('approvals'));
router.post('/request', approvalController.requestApproval);
router.post('/:id/resolve', approvalController.resolve);
router.post('/:id/comment', approvalController.comment);

module.exports = router;
