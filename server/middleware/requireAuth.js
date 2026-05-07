'use strict';

const { getAuth } = require('@clerk/express');
const { getUserByClerkId } = require('../store');

// JWT_SECRET is still needed for anonymous challenge-call tokens in call.js/auth.js
const JWT_SECRET = process.env.JWT_SECRET || 'freshup-dev-secret-change-in-production';

function requireAuth(req, res, next) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = getUserByClerkId(userId);
  if (!user) {
    res.status(401).json({ error: 'Account setup required. Please complete your profile.', code: 'setup_required' });
    return;
  }

  req.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role || 'rep',
    teamId: user.team_id || null,
  };
  next();
}

// Validates Clerk auth without requiring a local user record (used for /setup endpoint)
function requireClerkAuth(req, res, next) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.clerkUserId = userId;
  next();
}

function requireManager(req, res, next) {
  if (!req.user || req.user.role !== 'manager') {
    res.status(403).json({ error: 'Manager access required' });
    return;
  }
  next();
}

module.exports = { requireAuth, requireClerkAuth, requireManager, JWT_SECRET };
