'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

const { getUserByEmail, createUser, createTeam, updateUser, wipeAllCallData } = require('../store');

// One-time pilot setup: wipes all call history (calls/training_calls/recorded_calls)
// while leaving existing accounts intact, then ensures the given manager account exists.
// Guarded by ADMIN_RESET_SECRET — the route is a no-op (404) if that env var isn't set.
router.post('/pilot-reset', async (req, res) => {
  const secret = process.env.ADMIN_RESET_SECRET;
  if (!secret) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (req.get('X-Admin-Secret') !== secret) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const { email, name, password, teamName } = req.body;
    if (!email || !name || !password || !teamName) {
      res.status(400).json({ error: 'email, name, password, and teamName are required' });
      return;
    }

    const wiped = wipeAllCallData();

    let user = getUserByEmail(email.toLowerCase().trim());
    let created = false;
    if (!user) {
      const password_hash = await bcrypt.hash(password, 12);
      user = createUser({ email: email.toLowerCase().trim(), name: name.trim(), password_hash, role: 'manager' });
      const team = createTeam({ name: teamName.trim(), managerId: user.id });
      user = updateUser(user.id, { team_id: team.id });
      created = true;
    }

    res.json({ ok: true, wiped, managerCreated: created, userId: user.id, email: user.email });
  } catch (err) {
    console.error('[admin/pilot-reset] error:', err);
    res.status(500).json({ error: 'Pilot reset failed' });
  }
});

module.exports = router;
