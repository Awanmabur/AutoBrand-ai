const express = require('express');
const brandController = require('../controllers/brandController');
const requireAuth = require('../middlewares/auth');
const dashboardRedirect = require('../middlewares/dashboardRedirect');

const router = express.Router();

router.use(requireAuth);
router.get('/', dashboardRedirect('brand-brain'));
router.get('/create', dashboardRedirect('brand-brain'));
router.post('/', brandController.store);
router.get('/:id', dashboardRedirect('brand-brain'));
router.get('/:id/edit', dashboardRedirect('brand-brain'));
router.put('/:id', brandController.update);

module.exports = router;
