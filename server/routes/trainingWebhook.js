'use strict';

const express = require('express');
const twilio = require('twilio');
const router = express.Router();

const {
  getTrainingCall, setTrainingCall, updateTrainingCall,
} = require('../store');
const { analyzeTrainingCall } = require('../services/claude');
const { formatTrainingTranscript } = require('../services/openai-realtime-training');
const { getRandomDealership, getDealershipById, getGatekeeperForDifficulty, normalizeDifficulty } = require('../training');
const { requireAuth } = require('../middleware/requireAuth');

// Validate that incoming webhook requests are genuinely from Twilio.
// Only enforced when TWILIO_AUTH_TOKEN is set; skipped in dev/test.
function validateTwilioRequest(req, res, next) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) { next(); return; }
  const baseUrl = (process.env.BASE_URL || '').replace(/\/$/, '');
  const fullUrl = `${baseUrl}${req.originalUrl}`;
  const isValid = twilio.validateRequest(
    authToken,
    req.headers['x-twilio-signature'] || '',
    fullUrl,
    req.body || {}
  );
  if (!isValid) {
    console.warn(`[trainingWebhook] Rejected invalid Twilio signature for ${req.originalUrl}`);
    res.status(403).send('Forbidden');
    return;
  }
  next();
}

function buildMenuPrompt(dealership) {
  const opts = dealership.menu.map((m) => `Press ${m.digit} for ${m.label}.`).join(' ');
  return `${dealership.greeting} ${opts}`;
}

function buildMenuResponse(dealership, base) {
  const response = new twilio.twiml.VoiceResponse();
  const gather = response.gather({
    input: 'dtmf', numDigits: 1, timeout: 6, action: `${base}/training-webhook/menu`, method: 'POST',
  });
  gather.say(buildMenuPrompt(dealership));
  response.redirect(`${base}/training-webhook/voice`);
  return response;
}

// ── POST /training-webhook/voice ─────────────────────────────────────────────
router.post('/voice', validateTwilioRequest, (req, res) => {
  try {
    const callSid = req.body.CallSid;
    const base = (process.env.BASE_URL || '').replace(/\/$/, '');

    let trainingCall = getTrainingCall(callSid);
    if (!trainingCall) {
      const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;
      const normalizedDifficulty = normalizeDifficulty(req.query.difficulty);
      const difficultyLabel = normalizedDifficulty.charAt(0).toUpperCase() + normalizedDifficulty.slice(1);

      setTrainingCall(callSid, {
        userId,
        difficulty: difficultyLabel,
        phase: 'menu',
        history: [],
        startTime: Date.now(),
        outcome: null,
        score: null,
      });
      trainingCall = getTrainingCall(callSid);
    }

    // /api/training/start pre-creates the row before a dealership is chosen, so
    // it may exist yet still be missing dealershipId/dealershipName here.
    if (!trainingCall.dealershipId) {
      const dealership = getRandomDealership();
      updateTrainingCall(callSid, { dealershipId: dealership.id, dealershipName: dealership.name });
      trainingCall = getTrainingCall(callSid);
    }

    const dealership = getDealershipById(trainingCall.dealershipId) || getRandomDealership();
    res.set('Content-Type', 'text/xml');
    res.send(buildMenuResponse(dealership, base).toString());
  } catch (err) {
    console.error('[trainingWebhook/voice] error:', err);
    res.set('Content-Type', 'text/xml');
    res.send('<Response><Say>An error occurred. Please try again.</Say><Hangup/></Response>');
  }
});

// ── POST /training-webhook/menu ──────────────────────────────────────────────
router.post('/menu', validateTwilioRequest, (req, res) => {
  try {
    const callSid = req.body.CallSid;
    const digits = req.body.Digits;
    const base = (process.env.BASE_URL || '').replace(/\/$/, '');

    const trainingCall = getTrainingCall(callSid);
    if (!trainingCall) {
      res.set('Content-Type', 'text/xml');
      res.send('<Response><Say>An error occurred. Please try again.</Say><Hangup/></Response>');
      return;
    }

    const dealership = getDealershipById(trainingCall.dealershipId);
    const option = dealership?.menu.find((m) => m.digit === digits);

    const response = new twilio.twiml.VoiceResponse();

    if (option && option.correct) {
      updateTrainingCall(callSid, { phase: 'gatekeeper' });
      const wsBase = base.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
      const connect = response.connect();
      connect.stream({ url: `${wsBase}/training-webhook/media-stream?callSid=${callSid}` });
    } else if (option && option.repeat) {
      const gather = response.gather({
        input: 'dtmf', numDigits: 1, timeout: 6, action: `${base}/training-webhook/menu`, method: 'POST',
      });
      gather.say(buildMenuPrompt(dealership));
      response.redirect(`${base}/training-webhook/voice`);
    } else {
      const gather = response.gather({
        input: 'dtmf', numDigits: 1, timeout: 6, action: `${base}/training-webhook/menu`, method: 'POST',
      });
      gather.say("Sorry, let me connect you to the right place. One moment.");
      gather.say(buildMenuPrompt(dealership));
      response.redirect(`${base}/training-webhook/voice`);
    }

    res.set('Content-Type', 'text/xml');
    res.send(response.toString());
  } catch (err) {
    console.error('[trainingWebhook/menu] error:', err);
    res.set('Content-Type', 'text/xml');
    res.send('<Response><Say>An error occurred. Please try again.</Say><Hangup/></Response>');
  }
});

// ── POST /training-webhook/status ────────────────────────────────────────────
router.post('/status', validateTwilioRequest, async (req, res) => {
  const { CallSid, CallStatus } = req.body;
  console.log(`[trainingWebhook/status] CallSid=${CallSid} status=${CallStatus}`);

  if (CallStatus === 'completed') {
    const trainingCall = getTrainingCall(CallSid);
    if (trainingCall) {
      const updates = {};
      if (!trainingCall.endTime) updates.endTime = Date.now();
      if (!trainingCall.outcome) updates.outcome = 'Completed';

      if (!trainingCall.score && !trainingCall.outcome && trainingCall.history?.length > 0) {
        try {
          const gatekeeper = getGatekeeperForDifficulty(trainingCall.difficulty);
          const scenario = {
            dealershipName: trainingCall.dealershipName,
            difficulty: trainingCall.difficulty,
            gatekeeperName: gatekeeper?.name,
            gmName: trainingCall.gmPersonaName,
            phase: trainingCall.phase,
          };
          updates.score = await analyzeTrainingCall(formatTrainingTranscript(trainingCall.history), scenario);
        } catch (err) {
          console.error('[trainingWebhook/status] analyzeTrainingCall error:', err);
        }
      }

      if (Object.keys(updates).length > 0) updateTrainingCall(CallSid, updates);
    }
  }

  res.sendStatus(204);
});

// ── GET /training-webhook/results/:callSid ───────────────────────────────────
router.get('/results/:callSid', requireAuth, (req, res) => {
  const trainingCall = getTrainingCall(req.params.callSid);
  if (!trainingCall) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  if (trainingCall.userId !== req.user.id) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json(trainingCall);
});

module.exports = router;
