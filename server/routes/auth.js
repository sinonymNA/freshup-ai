'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { createUser, updateUser, getUserByEmail, createTeam, getTeamByCode } = require('../store');
const { requireAuth, JWT_SECRET } = require('../middleware/requireAuth');

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role || 'rep', teamId: user.team_id || null },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function userPayload(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role || 'rep', teamId: user.team_id || null };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, name, password, role = 'rep', team_name, invite_code } = req.body;

    if (!email || !name || !password) {
      res.status(400).json({ error: 'Email, name, and password are required' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }
    if (!['rep', 'manager'].includes(role)) {
      res.status(400).json({ error: 'Role must be rep or manager' });
      return;
    }

    const existing = getUserByEmail(email.toLowerCase().trim());
    if (existing) {
      res.status(409).json({ error: 'An account with that email already exists' });
      return;
    }

    const password_hash = await bcrypt.hash(password, 12);
    let user = createUser({ email: email.toLowerCase().trim(), name: name.trim(), password_hash, role });

    if (role === 'manager') {
      // Create a team automatically
      const tName = (team_name && team_name.trim()) || `${name.trim()}'s Team`;
      const team = createTeam({ name: tName, managerId: user.id });
      user = updateUser(user.id, { team_id: team.id });
    } else if (invite_code && invite_code.trim()) {
      // Join an existing team via invite code
      const team = getTeamByCode(invite_code.trim());
      if (team) user = updateUser(user.id, { team_id: team.id });
    }

    res.json({ token: makeToken(user), user: userPayload(user) });
  } catch (err) {
    console.error('[auth/register] error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = getUserByEmail(email.toLowerCase().trim());
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    res.json({ token: makeToken(user), user: userPayload(user) });
  } catch (err) {
    console.error('[auth/login] error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
