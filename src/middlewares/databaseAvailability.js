const { isMongoReady, mongoStateName } = require('../services/runtimeConnectivity.service');

module.exports = function databaseAvailability(req, res, next) {
  if (isMongoReady()) return next();

  res.set('Cache-Control', 'no-store');
  res.set('Retry-After', '5');
  const payload = {
    ok: false,
    error: 'Database temporarily unavailable',
    message: 'The platform is reconnecting to MongoDB. No queued posts or generation jobs are being lost.',
    mongoState: mongoStateName(),
    requestId: req.id
  };

  if (req.accepts('html') && !req.path.startsWith('/api/')) {
    return res.status(503).type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Temporarily unavailable</title><style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f7f8;color:#18181b}.card{max-width:560px;margin:24px;padding:28px;border:1px solid #ddd;border-radius:18px;background:#fff;box-shadow:0 12px 40px rgba(0,0,0,.08)}h1{margin-top:0;font-size:1.5rem}p{line-height:1.6}.muted{color:#666;font-size:.92rem}</style></head>
<body><main class="card"><h1>Database temporarily unavailable</h1><p>The platform is reconnecting to MongoDB. Your queued posts and AI jobs remain saved and will resume automatically.</p><p class="muted">Retry in a few seconds. Request ID: ${String(req.id || '')}</p></main></body></html>`);
  }

  return res.status(503).json(payload);
};
