'use strict';

const buckets = new Map();

function keyFromReq(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function makeRateLimiter({ windowMs, max, name }) {
  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const key = `${name}:${keyFromReq(req)}`;
    const current = buckets.get(key);

    if (!current || now > current.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (current.count >= max) {
      const retryAfterSec = Math.ceil((current.resetAt - now) / 1000);
      res.set('Retry-After', String(Math.max(retryAfterSec, 1)));
      res.status(429).json({ error: 'Too many requests' });
      return;
    }

    current.count += 1;
    buckets.set(key, current);
    next();
  };
}

const startCallRateLimit = makeRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  name: 'start-call',
});

module.exports = { startCallRateLimit };
