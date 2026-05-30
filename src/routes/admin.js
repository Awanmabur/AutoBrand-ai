const express = require('express');
const requireRole = require('../middlewares/role');
const adminController = require('../controllers/adminController');
const adminPlanController = require('../controllers/adminPlanController');
const { requirePermission, requireSuperadmin } = require('../middlewares/permissions');

const router = express.Router();

router.get('/', requireRole('super_admin'), adminController.index);
router.get('/plans', requirePermission('plans.view'), (req, res) => res.redirect(303, '/dashboard/plans'));
router.post('/plans/seed', requirePermission('plans.create'), adminPlanController.seed);
router.get('/plans/new', requirePermission('plans.create'), (req, res) => res.redirect(303, '/dashboard/plans?mode=create'));
router.post('/plans', requirePermission('plans.create'), adminPlanController.create);
router.post('/plans/reorder', requirePermission('plans.edit'), adminPlanController.reorder);
router.get('/plans/:id/edit', requirePermission('plans.edit'), (req, res) => res.redirect(303, `/dashboard/plans?mode=edit&id=${encodeURIComponent(req.params.id)}`));
router.get('/plans/:id', requirePermission('plans.view'), (req, res) => res.redirect(303, `/dashboard/plans?view=${encodeURIComponent(req.params.id)}`));
router.put('/plans/:id', requirePermission('plans.edit'), adminPlanController.update);
router.post('/plans/:id/duplicate', requirePermission('plans.create'), adminPlanController.duplicate);
router.post('/plans/:id/activate', requirePermission('plans.edit'), adminPlanController.setActive);
router.post('/plans/:id/deactivate', requirePermission('plans.edit'), adminPlanController.setActive);
router.post('/plans/:id/restore', requirePermission('plans.edit'), adminPlanController.restore);
router.delete('/plans/:id', requireSuperadmin, adminPlanController.remove);
router.post('/users/:id/status', requireRole('super_admin'), adminController.updateUserStatus);
router.post('/users/:id/plan', requireRole('super_admin'), adminController.updateUserPlan);
router.post('/posts/:id/retry', requireRole('super_admin'), adminController.retryPost);
router.post('/payments/:id/mark-paid', requireRole('super_admin'), adminController.markPaymentPaid);

module.exports = router;
