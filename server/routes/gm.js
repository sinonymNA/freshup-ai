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

  const { startDate, endDate, minScore, maxScore, type } = req.query;
  const calls = getRecordedCallsByTeam(team.id, { startDate, endDate, minScore, maxScore, type });
  res.json({ calls });
});

// GET /api/gm/calls/export.csv — export this team's recorded calls as CSV
// (registered before /calls/:id so the literal path isn't matched as an id)
router.get('/calls/export.csv', requireAuth, requireManager, (req, res) => {
  const team = getTeamByManagerId(req.user.id);
  if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

  const { type } = req.query;
  const calls = getRecordedCallsByTeam(team.id, { type, limit: 10000 });

  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = ['Date', 'Type', 'Rep', 'Duration (s)', 'Score', 'Outcome', 'Transcript Excerpt'];
  const rows = calls.map((c) => {
    const date = c.startTime ? new Date(c.startTime).toISOString().slice(0, 10) : '';
    const score = c.grade?.overallScore ?? '';
    const outcome = c.grade ? (score >= 70 ? 'Strong' : 'Needs Work') : '';
    const excerpt = (c.transcript || '').slice(0, 200).replace(/\n/g, ' ');
    return [date, c.type || '', c.repName || '', c.duration || '', score, outcome, excerpt].map(esc).join(',');
  });

  const csv = [header.map(esc).join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="freshup-calls-${Date.now()}.csv"`);
  res.send(csv);
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
