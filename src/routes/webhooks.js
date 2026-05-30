const express = require('express');
const webhookController = require('../controllers/webhookController');

const router = express.Router();

router.post('/:provider', webhookController.receive);

module.exports = router;
