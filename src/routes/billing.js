const express = require('express');
const billingController = require('../controllers/billingController');
const requireAuth = require('../middlewares/auth');

const router = express.Router();

router.use(requireAuth);
router.get('/', billingController.index);
router.post('/plan', billingController.changePlan);
router.get('/checkout/:planSlug', billingController.checkoutPage);
router.post('/checkout/:planSlug', billingController.checkout);
router.post('/checkout', billingController.checkout);
router.get('/payments/:id', billingController.paymentPage);
router.post('/payments/:id/complete', billingController.completePayment);
router.post('/payments/:id/mark-paid', billingController.markPaid);

module.exports = router;
