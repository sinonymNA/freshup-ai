'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const router = express.Router();

const {
  getUserByEmail, createUser, updateUser,
  createTeam, getTeamByManagerId, getTeamConfig, setTeamConfig,
  wipeAllCallData,
} = require('../store');

// No ADMIN_RESET_SECRET env var to configure — if one isn't set, generate a
// one-time secret at boot and print it to the deploy log. Check the Railway
// logs for the line below to get the value.
const ADMIN_SECRET = process.env.ADMIN_RESET_SECRET || crypto.randomBytes(24).toString('hex');
if (!process.env.ADMIN_RESET_SECRET) {
  console.log(`[admin] No ADMIN_RESET_SECRET set — generated one-time pilot-reset secret: ${ADMIN_SECRET}`);
}

// One-time pilot setup: wipes all call history (calls/training_calls/recorded_calls)
// while leaving other accounts intact, then creates (or updates) one manager
// account + team, optionally branding that team with a dealership logo shown
// centered in the header for anyone signed into it.
router.post('/pilot-reset', async (req, res) => {
  if (req.get('X-Admin-Secret') !== ADMIN_SECRET) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const { email, name, password, teamName, dealershipLogo } = req.body;
    if (!email || !name || !password || !teamName) {
      res.status(400).json({ error: 'email, name, password, and teamName are required' });
      return;
    }

    const wiped = wipeAllCallData();

    let user = getUserByEmail(email.toLowerCase().trim());
    let created = false;
    let team;
    if (!user) {
      const password_hash = await bcrypt.hash(password, 12);
      user = createUser({ email: email.toLowerCase().trim(), name: name.trim(), password_hash, role: 'manager' });
      team = createTeam({ name: teamName.trim(), managerId: user.id });
      user = updateUser(user.id, { team_id: team.id });
      created = true;
    } else {
      const password_hash = await bcrypt.hash(password, 12);
      user = updateUser(user.id, { name: name.trim(), password_hash, role: 'manager' });
      team = getTeamByManagerId(user.id);
      if (!team) {
        team = createTeam({ name: teamName.trim(), managerId: user.id });
        user = updateUser(user.id, { team_id: team.id });
      }
    }

    const logoUrl = dealershipLogo || '/brannen-logo.jpeg';
    setTeamConfig(team.id, { ...getTeamConfig(team.id), dealershipLogo: logoUrl });

    res.json({ ok: true, wiped, managerCreated: created, userId: user.id, email: user.email, teamId: team.id, dealershipLogo: logoUrl });
  } catch (err) {
    console.error('[admin/pilot-reset] error:', err);
    res.status(500).json({ error: 'Pilot reset failed' });
  }
});

module.exports = router;
