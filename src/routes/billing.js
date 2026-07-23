const express = require('express');
const billingController = require('../controllers/billingController');
const requireAuth = require('../middlewares/auth');
const requireVerified = require('../middlewares/requireVerified');

const router = express.Router();

router.get('/pesapal/callback', billingController.pesapalCallback);
router.get('/pesapal/ipn', billingController.pesapalIpn);
router.post('/pesapal/ipn', billingController.pesapalIpn);

router.use(requireAuth);
router.use(requireVerified);
router.post('/plan', billingController.changePlan);
router.get('/checkout/:planSlug', billingController.checkoutPage);
router.post('/checkout/:planSlug', billingController.checkout);
router.post('/checkout', billingController.checkout);
router.get('/payments/:id', billingController.paymentPage);

module.exports = router;
