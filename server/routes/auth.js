'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { createUser, updateUser, getUserByEmail, getUserById, createTeam, getTeamByCode, getTeamByManagerId, updateCall, createResetToken, validateResetToken, consumeResetToken, getSecurityQuestionByEmail } = require('../store');
const { requireAuth, JWT_SECRET } = require('../middleware/requireAuth');

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role || 'rep', teamId: user.team_id || null },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function userPayload(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role || 'rep',
    teamId: user.team_id || null,
    phone_number: user.phone_number || null,
  };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, name, password, role = 'rep', team_name, invite_code, access_code, security_question, security_answer } = req.body;

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

    // Validate codes BEFORE creating the user so no orphaned records are left
    let resolvedTeam = null;
    if (role === 'manager') {
      const validCode = process.env.MANAGER_ACCESS_CODE || 'FRESHUP123';
      if (!access_code || access_code.trim().toUpperCase() !== validCode.toUpperCase()) {
        res.status(403).json({ error: 'Invalid manager access code. Contact FreshUp to get your code.' });
        return;
      }
    } else {
      if (!invite_code || !invite_code.trim()) {
        res.status(400).json({ error: 'Invite code from your manager is required to create an account.' });
        return;
      }
      resolvedTeam = getTeamByCode(invite_code.trim());
      if (!resolvedTeam) {
        res.status(400).json({ error: 'Invalid invite code. Ask your manager to check the code.' });
        return;
      }
    }

    const password_hash = await bcrypt.hash(password, 12);
    let security_answer_hash = null;
    if (security_question && security_answer && security_answer.trim()) {
      security_answer_hash = await bcrypt.hash(security_answer.trim().toLowerCase(), 12);
    }
    let user = createUser({ email: email.toLowerCase().trim(), name: name.trim(), password_hash, role, security_question: security_question || null, security_answer_hash });

    if (role === 'manager') {
      const tName = (team_name && team_name.trim()) || `${name.trim()}'s Team`;
      const team = createTeam({ name: tName, managerId: user.id });
      user = updateUser(user.id, { team_id: team.id });
    } else {
      user = updateUser(user.id, { team_id: resolvedTeam.id });
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

// PATCH /api/auth/profile — update name and/or phone number
router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const { name, phone_number } = req.body;
    const updates = {};
    if (name && name.trim()) updates.name = name.trim();
    if (phone_number !== undefined) updates.phone_number = phone_number.trim() || null;
    if (!Object.keys(updates).length) {
      res.status(400).json({ error: 'Nothing to update' });
      return;
    }
    const user = updateUser(req.user.id, updates);
    const token = makeToken(user);
    res.json({ token, user: userPayload(user) });
  } catch (err) {
    console.error('[auth/profile] error:', err);
    res.status(500).json({ error: 'Profile update failed' });
  }
});

// GET /api/auth/team-code — returns the team invite code for the manager (shown in settings)
router.get('/team-code', requireAuth, (req, res) => {
  if (req.user.role !== 'manager') {
    res.status(403).json({ error: 'Only managers can access team codes' });
    return;
  }
  const team = getTeamByManagerId(req.user.id);
  if (!team) {
    res.status(404).json({ error: 'No team found for this manager' });
    return;
  }
  res.json({ teamCode: team.invite_code, teamName: team.name });
});

// POST /api/auth/claim-challenge — create account and link a challenge call to it
router.post('/claim-challenge', async (req, res) => {
  try {
    const { email, name, password, callSid, challengeToken } = req.body;

    if (!email || !name || !password || !callSid || !challengeToken) {
      res.status(400).json({ error: 'email, name, password, callSid, and challengeToken are required' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    // Verify the challenge token
    let payload;
    try {
      payload = jwt.verify(challengeToken, JWT_SECRET);
    } catch {
      res.status(401).json({ error: 'Invalid or expired challenge token' });
      return;
    }
    if (payload.type !== 'challenge' || payload.callSid !== callSid) {
      res.status(403).json({ error: 'Token does not match this call' });
      return;
    }

    const existing = getUserByEmail(email.toLowerCase().trim());
    if (existing) {
      res.status(409).json({ error: 'Email already registered — log in instead' });
      return;
    }

    const password_hash = await bcrypt.hash(password, 12);
    const user = createUser({ email: email.toLowerCase().trim(), name: name.trim(), password_hash, role: 'rep' });

    // Link the challenge call to the new account
    updateCall(callSid, { userId: user.id });

    res.json({ token: makeToken(user), user: userPayload(user) });
  } catch (err) {
    console.error('[auth/claim-challenge] error:', err);
    res.status(500).json({ error: 'Account creation failed' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) { res.status(400).json({ error: 'Email is required' }); return; }

    const user = getUserByEmail(email.toLowerCase().trim());
    if (!user) {
      // Don't reveal whether email exists
      res.json({ ok: true });
      return;
    }

    const token = createResetToken(user.id);
    const base = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const resetUrl = `${base}/#/reset-password?token=${token}`;

    // TODO: send resetUrl via email when email service is configured.
    // For now, return it in the response so the UI can display it.
    res.json({ ok: true, resetUrl });
  } catch (err) {
    console.error('[auth/forgot-password]', err);
    res.status(500).json({ error: 'Failed to generate reset link' });
  }
});

// POST /api/auth/security-question — returns the security question for an email (step 1 of reset)
router.post('/security-question', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) { res.status(400).json({ error: 'Email is required' }); return; }
    const row = getSecurityQuestionByEmail(email.toLowerCase().trim());
    // Always respond OK to avoid revealing whether an account exists; return null if no question set
    res.json({ question: row?.security_question || null });
  } catch (err) {
    console.error('[auth/security-question]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/reset-password — supports both token-based and security-question-based reset
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password, email, answer } = req.body;

    // Security-question flow: email + answer + password
    if (!token && email && answer) {
      if (!password || password.length < 6) { res.status(400).json({ error: 'Password must be at least 6 characters' }); return; }
      const user = getUserByEmail(email.toLowerCase().trim());
      if (!user) { res.status(400).json({ error: 'Incorrect answer. Please try again.' }); return; }
      const row = getSecurityQuestionByEmail(email.toLowerCase().trim());
      if (!row || !row.security_answer_hash) {
        res.status(400).json({ error: 'No security question is set for this account.' });
        return;
      }
      const match = await bcrypt.compare(answer.trim().toLowerCase(), row.security_answer_hash);
      if (!match) { res.status(400).json({ error: 'Incorrect answer. Please try again.' }); return; }
      const password_hash = await bcrypt.hash(password, 12);
      updateUser(user.id, { password_hash });
      res.json({ ok: true });
      return;
    }

    // Token-based flow (legacy, still supported)
    if (!token || !password) { res.status(400).json({ error: 'Token and new password are required' }); return; }
    if (password.length < 6) { res.status(400).json({ error: 'Password must be at least 6 characters' }); return; }

    const record = validateResetToken(token);
    if (!record) {
      res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
      return;
    }

    const password_hash = await bcrypt.hash(password, 12);
    updateUser(record.userId, { password_hash });
    consumeResetToken(token);

    res.json({ ok: true });
  } catch (err) {
    console.error('[auth/reset-password]', err);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

module.exports = router;
