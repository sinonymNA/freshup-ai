'use strict';

const fs = require('fs');
const express = require('express');
const router = express.Router();

const { getPersonaById, getRandomPersona } = require('../personas');
const { generateCustomerResponse, analyzeCall } = require('../services/claude');
const { textToSpeech, saveAudioFile } = require('../services/elevenlabs');
const { generateTwiML, generateEndTwiML } = require('../services/twilio');
const { getCall, setCall, updateCall } = require('../store');
const { requireApiKey } = require('../middleware/auth');

function stripTags(text) {
  return text.replace(/\[HANG_UP\]/g, '').replace(/\[APPOINTMENT_SET\]/g, '').trim();
}

function formatTranscript(history) {
  return history
    .map((msg) => `${msg.role === 'user' ? 'Sales Rep' : 'Customer'}: ${msg.content}`)
    .join('\n');
}

function deleteAudioFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn('[audio cleanup] failed to delete', filePath, e.message);
  }
}

function cleanupCallAudio(callSid) {
  const callData = getCall(callSid);
  if (!callData) return;
  (callData.audioFiles || []).forEach(deleteAudioFile);
  updateCall(callSid, { audioFiles: [] });
}

// POST /webhook/voice — entry point for a new inbound/outbound call
router.post('/voice', async (req, res) => {
  try {
    const callSid = req.body.CallSid;

    const personaId = req.query.personaId;
    const persona = (personaId && getPersonaById(personaId)) || getRandomPersona();

    setCall(callSid, {
      personaId: persona.id,
      personaName: persona.name,
      history: [],
      startTime: Date.now(),
      outcome: null,
      score: null,
      audioFiles: [],
    });

    const openingHistory = [{ role: 'user', content: 'Hello?' }];
    const rawResponse = await generateCustomerResponse(openingHistory, persona);
    const spokenText = stripTags(rawResponse);

    const audioBuffer = await textToSpeech(spokenText, persona.voiceId);
    const audioPath = saveAudioFile(audioBuffer, callSid);
    const audioUrl = `${process.env.BASE_URL}/audio/${callSid}.mp3`;

    updateCall(callSid, { audioFiles: [audioPath] });

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

    const callData = getCall(CallSid);
    if (!callData) {
      res.set('Content-Type', 'text/xml');
      res.send('<Response><Say>Session not found.</Say><Hangup/></Response>');
      return;
    }

    const persona = getPersonaById(callData.personaId);
    if (!persona) {
      updateCall(CallSid, {
        outcome: callData.outcome || 'InternalError',
        endTime: Date.now(),
      });
      console.error(`[webhook/respond] persona not found for CallSid=${CallSid} personaId=${callData.personaId}`);
      res.set('Content-Type', 'text/xml');
      res.send('<Response><Say>Sorry, we could not load your session.</Say><Hangup/></Response>');
      return;
    }

    const history = callData.history;
    const nextWebhook = `${process.env.BASE_URL}/webhook/respond`;

    // No speech detected — replay last audio and gather again
    if (!SpeechResult || SpeechResult.trim() === '') {
      const lastAudio = (callData.audioFiles || []).slice(-1)[0];
      const retryFilename = lastAudio
        ? require('path').basename(lastAudio, '.mp3')
        : CallSid;
      const retryUrl = `${process.env.BASE_URL}/audio/${retryFilename}.mp3`;
      const twiml = generateTwiML(retryUrl, nextWebhook);
      res.set('Content-Type', 'text/xml');
      res.send(twiml);
      return;
    }

    const updatedHistory = [...history, { role: 'user', content: SpeechResult.trim() }];

    const rawResponse = await generateCustomerResponse(updatedHistory, persona);
    updatedHistory.push({ role: 'assistant', content: rawResponse });

    const hangUp = rawResponse.includes('[HANG_UP]');
    const appointmentSet = rawResponse.includes('[APPOINTMENT_SET]');
    const spokenText = stripTags(rawResponse);

    const audioBuffer = await textToSpeech(spokenText, persona.voiceId);
    const audioFilename = `${CallSid}-${Date.now()}`;
    const audioPath = saveAudioFile(audioBuffer, audioFilename);
    const audioUrl = `${process.env.BASE_URL}/audio/${audioFilename}.mp3`;

    // Delete all previous audio files for this call (keep only the new one)
    (callData.audioFiles || []).forEach(deleteAudioFile);

    if (hangUp || appointmentSet) {
      const outcome = appointmentSet ? 'Appointment' : 'HangUp';
      const transcript = formatTranscript(updatedHistory);
      const score = await analyzeCall(transcript, persona);

      updateCall(CallSid, {
        history: updatedHistory,
        outcome,
        score,
        endTime: Date.now(),
        audioFiles: [audioPath],
      });

      const twiml = generateEndTwiML(audioUrl);
      res.set('Content-Type', 'text/xml');
      res.send(twiml);

      // Cleanup the final audio after a short delay (Twilio needs time to fetch it)
      setTimeout(() => deleteAudioFile(audioPath), 30000);
      return;
    }

    updateCall(CallSid, {
      history: updatedHistory,
      audioFiles: [audioPath],
    });

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
    const callData = getCall(CallSid);
    if (callData && !callData.score) {
      try {
        const persona = getPersonaById(callData.personaId);
        if (!persona) {
          updateCall(CallSid, {
            outcome: callData.outcome || 'InternalError',
            endTime: Date.now(),
          });
          console.error(`[webhook/status] persona not found for CallSid=${CallSid} personaId=${callData.personaId}`);
          res.sendStatus(204);
          return;
        }

        const transcript = formatTranscript(callData.history);
        const score = await analyzeCall(transcript, persona);
        updateCall(CallSid, {
          score,
          outcome: callData.outcome || 'Completed',
          endTime: Date.now(),
        });
        console.log(`[webhook/status] analysis for ${CallSid}:`, score);
      } catch (err) {
        console.error('[webhook/status] analyzeCall error:', err);
      }
    }
    // Clean up any remaining audio files
    setTimeout(() => cleanupCallAudio(CallSid), 30000);
  }

  res.sendStatus(204);
});

// GET /webhook/results/:callSid — retrieve stored call data and score
router.get('/results/:callSid', requireApiKey, (req, res) => {
  const callData = getCall(req.params.callSid);
  if (!callData) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  const { audioFiles, ...publicData } = callData; // eslint-disable-line no-unused-vars
  res.json(publicData);
});

module.exports = router;
