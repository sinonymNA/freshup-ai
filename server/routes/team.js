'use strict';

const express = require('express');
const router = express.Router();

const { requireAuth, requireManager } = require('../middleware/requireAuth');
const { getTeamByManagerId, getTeamMembers, getAllCalls, getProgress } = require('../store');

// GET /api/team — team overview + member list
router.get('/', requireAuth, requireManager, (req, res) => {
  const team = getTeamByManagerId(req.user.id);
  if (!team) {
    res.status(404).json({ error: 'No team found. This should not happen — please re-register.' });
    return;
  }
  const members = getTeamMembers(team.id);
  res.json({ team, members });
});

// GET /api/team/invite — invite code + link
router.get('/invite', requireAuth, requireManager, (req, res) => {
  const team = getTeamByManagerId(req.user.id);
  if (!team) { res.status(404).json({ error: 'Team not found' }); return; }
  const base = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  res.json({
    invite_code: team.invite_code,
    invite_url: `${base}/#/register?invite=${team.invite_code}`,
  });
});

// GET /api/team/rep/:userId — drill into one rep's data
router.get('/rep/:userId', requireAuth, requireManager, (req, res) => {
  const managerTeam = getTeamByManagerId(req.user.id);
  if (!managerTeam) { res.status(404).json({ error: 'Team not found' }); return; }

  // Verify the rep is on this team
  const members = getTeamMembers(managerTeam.id);
  const rep = members.find(m => m.id === Number(req.params.userId));
  if (!rep) { res.status(404).json({ error: 'Rep not found on your team' }); return; }

  const calls = getAllCalls(rep.id, 50);
  const progress = getProgress(rep.id);

  res.json({ rep, calls, progress: progress.map(p => p.moduleId) });
});

module.exports = router;
