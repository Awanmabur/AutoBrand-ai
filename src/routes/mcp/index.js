const express = require('express');
const controller = require('../../controllers/mcp/mcp.controller');
const { attachMcpAuth } = require('../../middlewares/mcpAuth');
const { createRateLimiter } = require('../../config/rateLimit');
const router = express.Router();
const limiter = createRateLimiter({ prefix:'mcp-tools', windowMs:60*1000, limit:180, message:{error:'Too many MCP requests.'} });
router.post('/', limiter, attachMcpAuth, controller.handle);
module.exports = router;
