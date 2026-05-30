const express = require('express');
const publicController = require('../controllers/publicController');

const router = express.Router();

router.get('/', publicController.landing);
router.get('/pricing', publicController.pricing);
router.get('/pricing/:planSlug', publicController.planDetails);
router.get('/signup', publicController.signup);

module.exports = router;
