const express = require('express');
const approvalController = require('../controllers/approvalController');
const requireAuth = require('../middlewares/auth');

const router = express.Router();

router.use(requireAuth);
router.post('/request', approvalController.requestApproval);
router.post('/:id/resolve', approvalController.resolve);
router.post('/:id/comment', approvalController.comment);

module.exports = router;
