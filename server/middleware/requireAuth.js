'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'freshup-dev-secret-change-in-production';

function requireAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  // Also accept ?token= query param so EventSource (SSE) can authenticate
  const token = (header.startsWith('Bearer ') ? header.slice(7) : null) || req.query.token || null;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.id, email: payload.email, name: payload.name, role: payload.role || 'rep', teamId: payload.teamId || null };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireManager(req, res, next) {
  if (!req.user || req.user.role !== 'manager') {
    res.status(403).json({ error: 'Manager access required' });
    return;
  }
  next();
}

module.exports = { requireAuth, requireManager, JWT_SECRET };
