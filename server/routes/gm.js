'use strict';

const express = require('express');
const router = express.Router();

const { requireAuth, requireManager } = require('../middleware/requireAuth');
const { getRecordedCallsByTeam, getRecordedCallById, getTeamByManagerId } = require('../store');

// GET /api/gm/calls — list recorded calls for this manager's team
// Query params: startDate, endDate, minScore, maxScore
router.get('/calls', requireAuth, requireManager, (req, res) => {
  const team = getTeamByManagerId(req.user.id);
  if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

  const { startDate, endDate, minScore, maxScore } = req.query;
  const calls = getRecordedCallsByTeam(team.id, { startDate, endDate, minScore, maxScore });
  res.json({ calls });
});

// GET /api/gm/calls/:id — full call with transcript and coaching report
router.get('/calls/:id', requireAuth, requireManager, (req, res) => {
  const team = getTeamByManagerId(req.user.id);
  if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

  const call = getRecordedCallById(parseInt(req.params.id, 10));
  if (!call) { res.status(404).json({ error: 'Call not found' }); return; }
  if (call.teamId !== team.id) { res.status(403).json({ error: 'Forbidden' }); return; }

  res.json(call);
});

module.exports = router;
