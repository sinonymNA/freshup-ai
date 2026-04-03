'use strict';

const express = require('express');
const router = express.Router();

const personas = require('../personas');
const { generateCustomerResponse, analyzeCall } = require('../services/claude');
const { textToSpeech, saveAudioFile } = require('../services/elevenlabs');
const { generateTwiML, generateEndTwiML } = require('../services/twilio');

// In-memory call state store. Keyed by Twilio CallSid.
const activeCalls = new Map();

const PERSONA_IDS = Object.keys(personas);

function stripTags(text) {
  return text.replace(/\[HANG_UP\]/g, '').replace(/\[APPOINTMENT_SET\]/g, '').trim();
}

function formatTranscript(history) {
  return history
    .map((msg) => `${msg.role === 'user' ? 'Sales Rep' : 'Customer'}: ${msg.content}`)
    .join('\n');
}

// POST /webhook/voice — entry point for a new inbound/outbound call
router.post('/voice', async (req, res) => {
  try {
    const callSid = req.body.CallSid;

    let personaId = req.query.personaId;
    if (!personaId || !personas[personaId]) {
      personaId = PERSONA_IDS[Math.floor(Math.random() * PERSONA_IDS.length)];
    }

    const persona = personas[personaId];

    activeCalls.set(callSid, {
      persona,
      personaId,
      history: [],
      startTime: Date.now(),
      outcome: null,
      score: null,
    });

    // Generate opening line with empty history
    const rawResponse = await generateCustomerResponse([], persona);
    const spokenText = stripTags(rawResponse);

    const audioBuffer = await textToSpeech(spokenText, persona.voiceId);
    const audioPath = saveAudioFile(audioBuffer, callSid);  // eslint-disable-line no-unused-vars
    const audioUrl = `${process.env.BASE_URL}/audio/${callSid}.mp3`;

    const nextWebhook = `${process.env.BASE_URL}/webhook/respond`;
    const twiml = generateTwiML(audioUrl, nextWebhook);

    res.set('Content-Type', 'text/xml');
    res.send(twiml);
  } catch (err) {
    console.error('[webhook/voice] error:', err);
    res.set('Content-Type', 'text/xml');
    res.send('<Response><Say>An error occurred. Please try again.</Say><Hangup/></Response>');
  }
});

// POST /webhook/respond — handles each rep turn
router.post('/respond', async (req, res) => {
  try {
    const { CallSid, SpeechResult } = req.body;

    const callData = activeCalls.get(CallSid);
    if (!callData) {
      res.set('Content-Type', 'text/xml');
      res.send('<Response><Say>Session not found.</Say><Hangup/></Response>');
      return;
    }

    const { persona, history } = callData;
    const nextWebhook = `${process.env.BASE_URL}/webhook/respond`;

    // No speech detected — ask the rep to try again
    if (!SpeechResult || SpeechResult.trim() === '') {
      const retryUrl = `${process.env.BASE_URL}/audio/${CallSid}.mp3`;
      const twiml = generateTwiML(retryUrl, nextWebhook);
      res.set('Content-Type', 'text/xml');
      res.send(twiml);
      return;
    }

    // Append rep turn
    history.push({ role: 'user', content: SpeechResult.trim() });

    // Generate customer response
    const rawResponse = await generateCustomerResponse(history, persona);

    // Append customer turn
    history.push({ role: 'assistant', content: rawResponse });

    const hangUp = rawResponse.includes('[HANG_UP]');
    const appointmentSet = rawResponse.includes('[APPOINTMENT_SET]');
    const spokenText = stripTags(rawResponse);

    const audioBuffer = await textToSpeech(spokenText, persona.voiceId);
    const audioFilename = `${CallSid}-${Date.now()}`;
    saveAudioFile(audioBuffer, audioFilename);
    const audioUrl = `${process.env.BASE_URL}/audio/${audioFilename}.mp3`;

    if (hangUp || appointmentSet) {
      const outcome = appointmentSet ? 'Appointment' : 'HangUp';
      const transcript = formatTranscript(history);
      const score = await analyzeCall(transcript, persona);

      callData.outcome = outcome;
      callData.score = score;
      callData.endTime = Date.now();

      const twiml = generateEndTwiML(audioUrl);
      res.set('Content-Type', 'text/xml');
      res.send(twiml);
      return;
    }

    const twiml = generateTwiML(audioUrl, nextWebhook);
    res.set('Content-Type', 'text/xml');
    res.send(twiml);
  } catch (err) {
    console.error('[webhook/respond] error:', err);
    res.set('Content-Type', 'text/xml');
    res.send('<Response><Say>An error occurred.</Say><Hangup/></Response>');
  }
});

// POST /webhook/status — Twilio call status callback
router.post('/status', async (req, res) => {
  const { CallSid, CallStatus } = req.body;
  console.log(`[webhook/status] CallSid=${CallSid} status=${CallStatus}`);

  if (CallStatus === 'completed') {
    const callData = activeCalls.get(CallSid);
    if (callData && !callData.score) {
      try {
        const transcript = formatTranscript(callData.history);
        const score = await analyzeCall(transcript, callData.persona);
        callData.score = score;
        callData.outcome = callData.outcome || 'Completed';
        callData.endTime = Date.now();
        console.log(`[webhook/status] analysis for ${CallSid}:`, score);
      } catch (err) {
        console.error('[webhook/status] analyzeCall error:', err);
      }
    }
  }

  res.sendStatus(204);
});

// GET /webhook/results/:callSid — retrieve stored call data and score
router.get('/results/:callSid', (req, res) => {
  const callData = activeCalls.get(req.params.callSid);
  if (!callData) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  res.json(callData);
});

module.exports = router;
