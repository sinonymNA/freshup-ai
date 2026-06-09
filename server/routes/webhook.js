'use strict';

const express = require('express');
const twilio = require('twilio');
const router = express.Router();

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
    console.warn(`[webhook] Rejected invalid Twilio signature for ${req.originalUrl}`);
    res.status(403).send('Forbidden');
    return;
  }
  next();
}

const { getPersonaById } = require('../personas');
const { analyzeCall } = require('../services/claude');
const { downloadAndTranscribe, gradeRecordedCall } = require('../services/recording');
const { sendGradeReport } = require('../services/email');
const {
  getCall, setCall, updateCall,
  createRecordedCall, updateRecordedCall,
  getTeamByTrackingNumber, getUserById, getTeamById,
} = require('../store');
const callEmitter = require('../services/callEvents');
const { requireAuth } = require('../middleware/requireAuth');

function formatTranscript(history) {
  return history
    .map((m) => `${m.role === 'user' ? 'Sales Rep' : 'Customer'}: ${m.content}`)
    .join('\n');
}

// ── Shared recording pipeline ────────────────────────────────────────────────
// Called async after Twilio fires the recording callback.
async function processRecording({ callSid, recordingSid, recordingUrl, duration, type, teamId }) {
  console.log(`[recording] Processing callSid=${callSid} type=${type}`);

  // Resolve user/team info from the training call record if available
  const existingCall = getCall(callSid);
  const userId = existingCall?.userId || null;
  let repName = null;
  let resolvedTeamId = teamId || null;

  if (userId) {
    const user = getUserById(userId);
    if (user) {
      repName = user.name;
      if (!resolvedTeamId && user.team_id) resolvedTeamId = user.team_id;
    }
  }

  // Create the initial DB record (INSERT OR IGNORE so duplicate callbacks are safe)
  const record = createRecordedCall({
    callSid,
    type,
    teamId: resolvedTeamId,
    userId,
    repName: repName || 'Unknown Rep',
    recordingSid,
    recordingUrl,
    duration,
    startTime: existingCall?.startTime || Date.now(),
  });

  if (!record) {
    console.warn(`[recording] Duplicate callback or insert failed for callSid=${callSid}`);
    return;
  }

  // Build transcript — try Whisper first, fall back to stored text history for bot calls
  let transcript = null;
  try {
    const whisper = await downloadAndTranscribe(recordingUrl);
    if (whisper && whisper.trim().length > 20) transcript = whisper;
  } catch (err) {
    console.error('[recording] Whisper failed:', err.message);
  }

  if (!transcript && type === 'bot' && existingCall?.history?.length > 0) {
    transcript = formatTranscript(existingCall.history);
    console.log(`[recording] Using text transcript fallback for callSid=${callSid}`);
  }

  if (!transcript) {
    console.warn(`[recording] No transcript available for callSid=${callSid} — skipping grade`);
    updateRecordedCall(record.id, { transcript: '' });
    return;
  }

  // Grade with the 6-dimension rubric
  let grade = null;
  try {
    grade = await gradeRecordedCall(transcript);
    console.log(`[recording] Graded callSid=${callSid} score=${grade.overallScore}`);
  } catch (err) {
    console.error('[recording] Grading failed:', err.message);
  }

  updateRecordedCall(record.id, {
    transcript,
    grade: grade ? JSON.stringify(grade) : null,
  });

  if (!grade || !resolvedTeamId) return;

  // Send email report to GM if configured
  try {
    const team = getTeamById(resolvedTeamId);
    if (team) {
      let config = {};
      try { config = JSON.parse(team.config || '{}'); } catch { /* ignore */ }
      const gmEmail = config.gmEmail || null;
      if (gmEmail) {
        const base = (process.env.BASE_URL || '').replace(/\/$/, '');
        await sendGradeReport({
          repName: repName || 'Unknown Rep',
          score: grade.overallScore,
          callDate: existingCall?.startTime || Date.now(),
          summary: grade.strengths || grade.improvements || 'See the full report for details.',
          dashboardUrl: `${base}/#/gm`,
          gmEmail,
        });
        updateRecordedCall(record.id, { emailSent: 1 });
      }
    }
  } catch (err) {
    console.error('[recording] Email failed:', err.message);
  }
}

// ── POST /webhook/voice ───────────────────────────────────────────────────────
router.post('/voice', validateTwilioRequest, (req, res) => {
  try {
    const callSid = req.body.CallSid;

    const storedCall = getCall(callSid);
    const personaId = (storedCall && storedCall.personaId) || req.query.personaId;
    const persona = personaId ? getPersonaById(personaId) : null;

    if (!persona) {
      console.error(`[webhook/voice] Persona not found: ${personaId} for callSid=${callSid}`);
      res.set('Content-Type', 'text/xml');
      res.send('<Response><Say>Sorry, we could not set up your training session. Please try again.</Say><Hangup/></Response>');
      return;
    }

    if (!storedCall) {
      setCall(callSid, {
        userId: req.query.userId ? parseInt(req.query.userId, 10) : null,
        personaId: persona.id,
        personaName: persona.name,
        history: [],
        startTime: Date.now(),
        outcome: null,
        score: null,
        audioFiles: [],
        contactInfo: null,
      });
    }

    const wsBase = (process.env.BASE_URL || '')
      .replace(/\/$/, '')
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://');

    const streamUrl = `${wsBase}/webhook/media-stream?callSid=${callSid}&personaId=${persona.id}`;
    console.log(`[DIAG] ── voice webhook callSid=${callSid} persona=${persona.id} streamUrl=${streamUrl}`);

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

// ── POST /webhook/status ──────────────────────────────────────────────────────
router.post('/status', validateTwilioRequest, async (req, res) => {
  const { CallSid, CallStatus } = req.body;
  console.log(`[webhook/status] CallSid=${CallSid} status=${CallStatus}`);

  if (CallStatus === 'completed') {
    const callData = getCall(CallSid);
    if (callData) {
      const updates = {};
      if (!callData.endTime) updates.endTime = Date.now();
      // 'Completed' = user hung up manually; don't overwrite an outcome already set by end_call
      if (!callData.outcome) updates.outcome = 'Completed';

      // Only score if end_call handler hasn't already started (outcome set = end_call ran)
      if (!callData.score && !callData.outcome && callData.history && callData.history.length > 0) {
        try {
          const persona = getPersonaById(callData.personaId);
          if (persona) {
            updates.score = await analyzeCall(formatTranscript(callData.history), persona);
          }
        } catch (err) {
          console.error('[webhook/status] analyzeCall error:', err);
        }
      }

      if (Object.keys(updates).length > 0) {
        updateCall(CallSid, updates);
        // Notify the SSE stream so the browser gets outcome/score immediately
        // instead of waiting for the EventSource reconnect/poll cycle.
        if (updates.outcome) callEmitter.emit(`call:${CallSid}`, { type: 'outcome', outcome: updates.outcome });
        if (updates.score) callEmitter.emit(`call:${CallSid}`, { type: 'score', score: updates.score });
      }
    }
  }

  res.sendStatus(204);
});

// ── POST /webhook/recording ───────────────────────────────────────────────────
// Twilio fires this when a call recording is ready. Respond immediately to
// avoid timeouts, then run the transcription + grading pipeline async.
router.post('/recording', validateTwilioRequest, (req, res) => {
  res.sendStatus(204);

  const { CallSid, RecordingSid, RecordingUrl, RecordingDuration, RecordingStatus } = req.body;
  if (RecordingStatus !== 'completed') return;

  const type = req.query.type || 'bot';
  const teamId = req.query.teamId ? parseInt(req.query.teamId, 10) : null;

  processRecording({
    callSid: CallSid,
    recordingSid: RecordingSid,
    recordingUrl: RecordingUrl,
    duration: parseInt(RecordingDuration || '0', 10),
    type,
    teamId,
  }).catch(err => console.error('[webhook/recording] pipeline error:', err));
});

// ── POST /webhook/inbound ─────────────────────────────────────────────────────
// Handles a real inbound call on a FreshUp tracked Twilio number.
// Records the call and (if configured) forwards to the dealership's actual line.
router.post('/inbound', validateTwilioRequest, (req, res) => {
  try {
    const { CallSid, From, To } = req.body;
    const base = (process.env.BASE_URL || '').replace(/\/$/, '');

    // Identify which team owns this tracking number
    let team = getTeamByTrackingNumber(To);
    const teamId = team?.id || '';

    let config = {};
    if (team) {
      try { config = JSON.parse(team.config || '{}'); } catch { /* ignore */ }
    }

    const recordingCb = `${base}/webhook/recording?type=inbound&teamId=${teamId}`;
    const response = new twilio.twiml.VoiceResponse();

    if (config.forwardNumber) {
      // Forward the call to the real sales rep line and record both sides
      const dial = response.dial({
        record: 'record-from-answer',
        recordingStatusCallback: recordingCb,
        recordingStatusCallbackEvent: 'completed',
        action: `${base}/webhook/inbound-complete`,
        callerId: From,
      });
      dial.number(config.forwardNumber);
    } else {
      // No forward number — just record a standalone message (demo/test mode)
      response.say(
        'Thanks for calling. This line is being recorded for quality coaching. Please leave a message after the tone.'
      );
      response.record({
        action: `${base}/webhook/inbound-complete`,
        recordingStatusCallback: recordingCb,
        recordingStatusCallbackEvent: 'completed',
        maxLength: 3600,
        playBeep: true,
      });
    }

    console.log(`[webhook/inbound] CallSid=${CallSid} From=${From} To=${To} teamId=${teamId}`);
    res.set('Content-Type', 'text/xml');
    res.send(response.toString());
  } catch (err) {
    console.error('[webhook/inbound] error:', err);
    res.set('Content-Type', 'text/xml');
    res.send('<Response><Say>An error occurred.</Say><Hangup/></Response>');
  }
});

// ── POST /webhook/inbound-complete ───────────────────────────────────────────
// Twilio action callback when the inbound call/recording finishes.
router.post('/inbound-complete', validateTwilioRequest, (req, res) => {
  res.set('Content-Type', 'text/xml');
  res.send('<Response><Hangup/></Response>');
});

// ── GET /webhook/results/:callSid ─────────────────────────────────────────────
router.get('/results/:callSid', requireAuth, (req, res) => {
  const callData = getCall(req.params.callSid);
  if (!callData) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  if (callData.userId !== req.user.id) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { audioFiles, ...publicData } = callData; // eslint-disable-line no-unused-vars
  res.json(publicData);
});

module.exports = router;
