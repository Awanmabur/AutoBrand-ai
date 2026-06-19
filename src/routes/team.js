const express = require('express');
const teamController = require('../controllers/teamController');
const requireAuth = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/permissions');

const router = express.Router();

router.use(requireAuth);
router.get('/accept', teamController.accept);
router.post('/invite', requirePermission('team.manage'), teamController.invite);
router.post('/:id', requirePermission('team.manage'), teamController.update);
router.post('/:id/remove', requirePermission('team.manage'), teamController.remove);

module.exports = router;
