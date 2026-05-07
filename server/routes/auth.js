'use strict';

const express = require('express');
const router = express.Router();

const {
  createUser, updateUser, getUserByEmail, getUserByClerkId,
  createTeam, getTeamByCode, getTeamByManagerId,
} = require('../store');
const { requireAuth, requireClerkAuth } = require('../middleware/requireAuth');

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

// GET /api/auth/me — returns the local user record for the signed-in Clerk user
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/setup — called once after Clerk sign-up to link the account to a team
// Uses requireClerkAuth (validates Clerk JWT) instead of requireAuth (needs local user)
router.post('/setup', requireClerkAuth, async (req, res) => {
  try {
    const { role = 'rep', inviteCode, accessCode, teamName, name, email } = req.body;
    const clerkId = req.clerkUserId;

    if (!name || !email) {
      res.status(400).json({ error: 'Name and email are required' });
      return;
    }
    if (!['rep', 'manager'].includes(role)) {
      res.status(400).json({ error: 'Role must be rep or manager' });
      return;
    }

    // If the Clerk user already has a local record, just return it
    const alreadyLinked = getUserByClerkId(clerkId);
    if (alreadyLinked) {
      return res.json({ user: userPayload(alreadyLinked) });
    }

    // If a user with this email already exists (migrating from old auth), link them
    const existingByEmail = getUserByEmail(email.toLowerCase().trim());
    if (existingByEmail) {
      const linked = updateUser(existingByEmail.id, { clerk_id: clerkId });
      return res.json({ user: userPayload(linked) });
    }

    // Validate invite / access codes before creating any records
    let resolvedTeam = null;
    if (role === 'manager') {
      const validCode = process.env.MANAGER_ACCESS_CODE || 'FRESHUP123';
      if (!accessCode || accessCode.trim().toUpperCase() !== validCode.toUpperCase()) {
        res.status(403).json({ error: 'Invalid manager access code. Contact FreshUp.' });
        return;
      }
    } else {
      if (!inviteCode || !inviteCode.trim()) {
        res.status(400).json({ error: 'Invite code from your manager is required.' });
        return;
      }
      resolvedTeam = getTeamByCode(inviteCode.trim());
      if (!resolvedTeam) {
        res.status(400).json({ error: 'Invalid invite code. Ask your manager.' });
        return;
      }
    }

    // Create local user — no password (Clerk handles auth)
    let user = createUser({
      email: email.toLowerCase().trim(),
      name: name.trim(),
      password_hash: 'clerk_managed',
      role,
      clerk_id: clerkId,
    });

    if (role === 'manager') {
      const tName = (teamName && teamName.trim()) || `${name.trim()}'s Team`;
      const team = createTeam({ name: tName, managerId: user.id });
      user = updateUser(user.id, { team_id: team.id });
    } else {
      user = updateUser(user.id, { team_id: resolvedTeam.id });
    }

    res.json({ user: userPayload(user) });
  } catch (err) {
    console.error('[auth/setup] error:', err);
    res.status(500).json({ error: 'Account setup failed' });
  }
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
    res.json({ user: userPayload(user) });
  } catch (err) {
    console.error('[auth/profile] error:', err);
    res.status(500).json({ error: 'Profile update failed' });
  }
});

// GET /api/auth/team-code — returns the team invite code for the manager
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

module.exports = router;
