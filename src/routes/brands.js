const express = require('express');
const brandController = require('../controllers/brandController');
const requireAuth = require('../middlewares/auth');
const requireVerified = require('../middlewares/requireVerified');

const router = express.Router();

router.use(requireAuth);
router.use(requireVerified);
router.post('/', brandController.store);
router.put('/:id', brandController.update);
router.post('/:id/archive', brandController.archive);
router.post('/:id/restore', brandController.restore);

module.exports = router;
