'use strict';

const express = require('express');
const router = express.Router();

const { requireAuth, requireManager } = require('../middleware/requireAuth');
const { getRecordedCallsByTeam, getRecordedCallById, getTeamByManagerId } = require('../store');
const callEmitter = require('../services/callEvents');

// In-memory active call tracking per team (lives as long as the server process)
// Map<teamId, Map<callSid, {type, repName, personaName?, from?, startTime, ended, score, transcript[]}>>
const activeCallsByTeam = new Map();

function getTeamCalls(teamId) {
  if (!activeCallsByTeam.has(teamId)) activeCallsByTeam.set(teamId, new Map());
  return activeCallsByTeam.get(teamId);
}

// Auto-remove ended+graded calls from the active set after 60 seconds
function scheduleRemoval(teamId, callSid) {
  setTimeout(() => {
    const tc = activeCallsByTeam.get(teamId);
    if (tc) tc.delete(callSid);
  }, 60000);
}

// GET /api/gm/live — SSE stream of live call activity for this manager's team
router.get('/live', requireAuth, requireManager, (req, res) => {
  const team = getTeamByManagerId(req.user.id);
  if (!team) { res.status(404).json({ error: 'Team not found' }); return; }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const teamId = team.id;
  const teamCalls = getTeamCalls(teamId);

  function send(event, data) {
    res.write(`data: ${JSON.stringify({ event, ...data })}\n\n`);
  }

  // Send current active calls as initial snapshot
  const snapshot = Array.from(teamCalls.entries()).map(([callSid, info]) => ({ callSid, ...info }));
  send('snapshot', { calls: snapshot });

  // Handlers for team events
  function onCallStarted(data) {
    teamCalls.set(data.callSid, { type: 'inbound', from: data.from, startTime: data.startTime, ended: false, score: null, transcript: [] });
    send('call_started', data);
  }
  function onCallEnded(data) {
    const c = teamCalls.get(data.callSid);
    if (c) c.ended = true;
    send('call_ended', data);
  }
  function onCallGraded(data) {
    const c = teamCalls.get(data.callSid);
    if (c) { c.score = data.score; c.repName = data.repName; }
    send('call_graded', data);
    scheduleRemoval(teamId, data.callSid);
  }
  function onTrainingStarted(data) {
    teamCalls.set(data.callSid, { type: 'training', repName: data.repName, personaName: data.personaName, startTime: data.startTime, ended: false, score: null, transcript: [] });
    send('training_started', data);
  }
  function onTrainingEnded(data) {
    const c = teamCalls.get(data.callSid);
    if (c) c.ended = true;
    send('training_ended', data);
  }
  function onTrainingGraded(data) {
    const c = teamCalls.get(data.callSid);
    if (c) c.score = data.score;
    send('training_graded', data);
    scheduleRemoval(teamId, data.callSid);
  }
  function onTrainingTranscript(data) {
    const c = teamCalls.get(data.callSid);
    if (c && c.transcript) c.transcript.push({ role: data.role, content: data.content });
    send('training_transcript', data);
  }

  callEmitter.on(`team:${teamId}:call_started`, onCallStarted);
  callEmitter.on(`team:${teamId}:call_ended`, onCallEnded);
  callEmitter.on(`team:${teamId}:call_graded`, onCallGraded);
  callEmitter.on(`team:${teamId}:training_started`, onTrainingStarted);
  callEmitter.on(`team:${teamId}:training_ended`, onTrainingEnded);
  callEmitter.on(`team:${teamId}:training_graded`, onTrainingGraded);
  callEmitter.on(`team:${teamId}:training_transcript`, onTrainingTranscript);

  // Keep-alive ping every 30 s
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* ignore */ } }, 30000);

  req.on('close', () => {
    clearInterval(ping);
    callEmitter.off(`team:${teamId}:call_started`, onCallStarted);
    callEmitter.off(`team:${teamId}:call_ended`, onCallEnded);
    callEmitter.off(`team:${teamId}:call_graded`, onCallGraded);
    callEmitter.off(`team:${teamId}:training_started`, onTrainingStarted);
    callEmitter.off(`team:${teamId}:training_ended`, onTrainingEnded);
    callEmitter.off(`team:${teamId}:training_graded`, onTrainingGraded);
    callEmitter.off(`team:${teamId}:training_transcript`, onTrainingTranscript);
  });
});

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
