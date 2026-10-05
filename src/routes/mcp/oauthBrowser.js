const express = require('express');
const controller = require('../../controllers/mcp/oauth.controller');

const router = express.Router();
router.get('/authorize', controller.authorize);
router.post('/authorize', controller.confirm);
module.exports = router;
