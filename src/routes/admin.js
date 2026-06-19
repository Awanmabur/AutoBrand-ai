const express = require('express');
const requireRole = require('../middlewares/role');
const adminController = require('../controllers/adminController');
const adminPlanController = require('../controllers/adminPlanController');
const { requirePermission, requireSuperadmin } = require('../middlewares/permissions');

const router = express.Router();

router.post('/plans/seed', requirePermission('plans.create'), adminPlanController.seed);
router.post('/plans', requirePermission('plans.create'), adminPlanController.create);
router.post('/plans/reorder', requirePermission('plans.edit'), adminPlanController.reorder);
router.put('/plans/:id', requirePermission('plans.edit'), adminPlanController.update);
router.post('/plans/:id/duplicate', requirePermission('plans.create'), adminPlanController.duplicate);
router.post('/plans/:id/activate', requirePermission('plans.edit'), adminPlanController.setActive);
router.post('/plans/:id/deactivate', requirePermission('plans.edit'), adminPlanController.setActive);
router.post('/plans/:id/restore', requirePermission('plans.edit'), adminPlanController.restore);
router.delete('/plans/:id', requireSuperadmin, adminPlanController.remove);
router.post('/users/:id/status', requireRole('super_admin'), adminController.updateUserStatus);
router.post('/users/:id/plan', requireRole('super_admin'), adminController.updateUserPlan);
router.post('/posts/:id/retry', requireRole('super_admin'), adminController.retryPost);
router.post('/jobs/:id/retry', requireRole('super_admin'), adminController.retryJob);

module.exports = router;
