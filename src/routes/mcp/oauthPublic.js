const express = require('express');
const controller = require('../../controllers/mcp/oauth.controller');
const { createRateLimiter } = require('../../config/rateLimit');

const router = express.Router();
const oauthLimiter = createRateLimiter({ prefix: 'mcp-oauth-public', windowMs: 60 * 1000, limit: 120, message: { error: 'Too many OAuth requests.' } });

router.post('/register', oauthLimiter, controller.register);
router.post('/token', oauthLimiter, controller.token);
router.post('/revoke', oauthLimiter, controller.revoke);

module.exports = router;
