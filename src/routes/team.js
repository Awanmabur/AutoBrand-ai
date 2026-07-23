const express = require('express');
const teamController = require('../controllers/teamController');
const requireAuth = require('../middlewares/auth');
const requireVerified = require('../middlewares/requireVerified');
const { requireBodyBrandPermission, requireTeamMemberBrandPermission } = require('../middlewares/brandPermission');

const router = express.Router();

router.use(requireAuth);
router.get('/accept', teamController.accept);
router.use(requireVerified);
router.post('/invite', requireBodyBrandPermission('team.manage'), teamController.invite);
router.post('/:id', requireTeamMemberBrandPermission('team.manage'), teamController.update);
router.post('/:id/remove', requireTeamMemberBrandPermission('team.manage'), teamController.remove);

module.exports = router;
