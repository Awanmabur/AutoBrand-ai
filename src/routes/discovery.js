const express = require('express');
const publicController = require('../controllers/publicController');

const router = express.Router();

// Discovery/security documents must remain reachable even when MongoDB is
// reconnecting. None of these handlers depend on tenant/customer data.
router.get('/robots.txt', publicController.robots);
router.get('/llms.txt', publicController.llms);
router.get('/llms-full.txt', publicController.llms);
router.get('/.well-known/security.txt', publicController.securityText);

module.exports = router;
