'use strict';

function requireApiKey(req, res, next) {
  const configured = process.env.APP_API_KEY;
  const provided = req.get('x-api-key') || req.query.apiKey;

  // For local/dev convenience only; enforce in production.
  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      res.status(500).json({ error: 'Server misconfiguration: APP_API_KEY is required in production' });
      return;
    }
    next();
    return;
  }

  if (provided !== configured) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

module.exports = { requireApiKey };
