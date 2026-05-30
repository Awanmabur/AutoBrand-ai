const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const requireAuth = require('../middlewares/auth');
const { requirePermission } = require('../middlewares/permissions');

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => res.redirect('/dashboard/overview'));
router.get('/admin/plans', requirePermission('plans.view'), (req, res) => res.redirect(303, '/dashboard/plans'));
router.get('/admin/plans/new', requirePermission('plans.create'), (req, res) => res.redirect(303, '/dashboard/plans?mode=create'));
router.get('/admin/plans/:id/edit', requirePermission('plans.edit'), (req, res) => res.redirect(303, `/dashboard/plans?mode=edit&id=${encodeURIComponent(req.params.id)}`));
router.get('/admin/plans/:id', requirePermission('plans.view'), (req, res) => res.redirect(303, `/dashboard/plans?view=${encodeURIComponent(req.params.id)}`));
router.get('/plans/new', requirePermission('plans.create'), (req, res) => res.redirect(303, '/dashboard/plans?mode=create'));
router.get('/plans/:id/edit', requirePermission('plans.edit'), (req, res) => res.redirect(303, `/dashboard/plans?mode=edit&id=${encodeURIComponent(req.params.id)}`));
router.get('/plans/:id', requirePermission('plans.view'), (req, res) => res.redirect(303, `/dashboard/plans?view=${encodeURIComponent(req.params.id)}`));
router.get('/:page', dashboardController.index);

module.exports = router;
