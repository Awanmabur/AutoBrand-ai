const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const analyticsController = require('../controllers/analyticsController');
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

function redirectToDashboardPage(page, query = {}) {
  return (req, res) => {
    const params = new URLSearchParams(query);
    Object.entries(req.params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, value);
    });
    const suffix = params.toString() ? `?${params.toString()}` : '';
    res.redirect(303, `/dashboard/${page}${suffix}`);
  };
}

router.get('/brand-brain/create', redirectToDashboardPage('brand-brain', { mode: 'create' }));
router.get('/brand-brain/:id/edit', redirectToDashboardPage('brand-brain', { mode: 'edit' }));
router.get('/brand-brain/:id', redirectToDashboardPage('brand-brain', { mode: 'view' }));
router.get('/content-library/:id/edit', redirectToDashboardPage('content-library', { mode: 'edit' }));
router.get('/content-library/:id', redirectToDashboardPage('content-library', { mode: 'view' }));
router.get('/analytics/export.csv', analyticsController.exportCsv);

router.get('/:page', dashboardController.index);

module.exports = router;
