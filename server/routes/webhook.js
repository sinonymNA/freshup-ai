'use strict';

const express = require('express');
const twilio = require('twilio');
const router = express.Router();

const { getPersonaById, getRandomPersona } = require('../personas');
const { analyzeCall } = require('../services/claude');
const { getCall, setCall, updateCall } = require('../store');
const { requireAuth } = require('../middleware/requireAuth');

function formatTranscript(history) {
  return history
    .map((m) => `${m.role === 'user' ? 'Sales Rep' : 'Customer'}: ${m.content}`)
    .join('\n');
}

// POST /webhook/voice — returns TwiML connecting Twilio to the OpenAI Realtime WebSocket bridge
router.post('/voice', (req, res) => {
  try {
    const callSid = req.body.CallSid;
    const personaId = req.query.personaId;
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;
    const persona = (personaId && getPersonaById(personaId)) || getRandomPersona();

    setCall(callSid, {
      userId,
      personaId: persona.id,
      personaName: persona.name,
      history: [],
      startTime: Date.now(),
      outcome: null,
      score: null,
      audioFiles: [],
    });

    const wsBase = (process.env.BASE_URL || '')
      .replace(/\/$/, '')
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://');

    const streamUrl = `${wsBase}/webhook/media-stream?callSid=${callSid}&personaId=${persona.id}`;

    const response = new twilio.twiml.VoiceResponse();
    const connect = response.connect();
    connect.stream({ url: streamUrl });

    res.set('Content-Type', 'text/xml');
    res.send(response.toString());
  } catch (err) {
    console.error('[webhook/voice] error:', err);
    res.set('Content-Type', 'text/xml');
    res.send('<Response><Say>An error occurred. Please try again.</Say><Hangup/></Response>');
  }
});

// POST /webhook/status — fallback scoring when AI doesn't call end_call
router.post('/status', async (req, res) => {
  const { CallSid, CallStatus } = req.body;
  console.log(`[webhook/status] CallSid=${CallSid} status=${CallStatus}`);

  if (CallStatus === 'completed') {
    const callData = getCall(CallSid);
    if (callData) {
      const updates = {};
      if (!callData.endTime) updates.endTime = Date.now();
      if (!callData.outcome) updates.outcome = 'Completed';

      if (!callData.score && callData.history && callData.history.length > 0) {
        try {
          const persona = getPersonaById(callData.personaId);
          if (persona) {
            updates.score = await analyzeCall(formatTranscript(callData.history), persona);
          }
        } catch (err) {
          console.error('[webhook/status] analyzeCall error:', err);
        }
      }

      if (Object.keys(updates).length > 0) updateCall(CallSid, updates);
    }
  }

  res.sendStatus(204);
});

// GET /webhook/results/:callSid — frontend polls this after the call
router.get('/results/:callSid', requireAuth, (req, res) => {
  const callData = getCall(req.params.callSid);
  if (!callData) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  // Only return calls belonging to this user
  if (callData.userId && callData.userId !== req.user.id) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { audioFiles, ...publicData } = callData; // eslint-disable-line no-unused-vars
  res.json(publicData);
});

module.exports = router;
