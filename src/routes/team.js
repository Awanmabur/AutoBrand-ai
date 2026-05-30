const express = require('express');
const teamController = require('../controllers/teamController');
const requireAuth = require('../middlewares/auth');
const dashboardRedirect = require('../middlewares/dashboardRedirect');

const router = express.Router();

router.use(requireAuth);
router.get('/', dashboardRedirect('team'));
router.get('/accept', teamController.accept);
router.post('/invite', teamController.invite);
router.post('/:id', teamController.update);
router.post('/:id/remove', teamController.remove);

module.exports = router;
