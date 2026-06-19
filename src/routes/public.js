const express = require('express');
const publicController = require('../controllers/publicController');
const approvalController = require('../controllers/approvalController');

const router = express.Router();

router.get('/', publicController.landing);
router.get('/pricing', publicController.pricing);
router.get('/pricing/:planSlug', publicController.planDetails);
router.get('/start/:planSlug', publicController.startPlan);
router.get('/signup', publicController.signup);
router.get('/review/:token', approvalController.publicReview);
router.post('/review/:token', approvalController.publicDecision);

module.exports = router;
