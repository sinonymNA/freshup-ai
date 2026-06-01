'use strict';

const express = require('express');
const router = express.Router();

const jwt = require('jsonwebtoken');
const { getAllPersonas, getPersonaById, getRandomPersona, getPersonasByDifficulty } = require('../personas');
const callEmitter = require('../services/callEvents');

// ── Random contact info generation ────────────────────────────────────────────
const _FIRST_MALE   = ['James','John','Robert','Michael','William','David','Richard','Joseph','Thomas','Charles','Daniel','Mark','Kevin','Brian','George','Edward','Ronald','Timothy','Jason','Jeffrey'];
const _FIRST_FEMALE = ['Mary','Patricia','Jennifer','Linda','Barbara','Elizabeth','Susan','Jessica','Sarah','Karen','Lisa','Nancy','Betty','Sandra','Emily','Megan','Ashley','Amanda','Brittany','Stephanie'];
const _LAST  = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Wilson','Martinez','Anderson','Taylor','Thomas','Hernandez','Moore','Jackson','Thompson','White','Lopez','Lee','Harris','Clark','Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott'];
const _DOMAINS = ['gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com'];
const _PERSONA_GENDER = {
  'ashley-thompson': 'F', 'brittany-walsh': 'F', 'margaret-kim': 'F',
  'nina-patel': 'F', 'priya-chandrasekaran': 'F', 'rosa-delgado': 'F',
  'carlos-mendoza': 'M', 'david-chen': 'M', 'james-okafor': 'M',
  'marcus-webb': 'M', 'robert-hayes': 'M', 'tyler-kowalski': 'M',
};
const _CARS = [
  '2025 Toyota Camry','2025 Honda Accord','2025 Ford F-150','2025 Toyota RAV4',
  '2025 Honda CR-V','2025 Chevrolet Silverado','2025 Nissan Altima','2025 Toyota Corolla',
  '2025 Honda Civic','2025 Jeep Grand Cherokee','2025 Ford Explorer','2025 Chevrolet Equinox',
  '2025 Toyota Tacoma','2025 Hyundai Elantra','2025 Kia Telluride','2025 GMC Sierra 1500',
  '2025 Subaru Outback','2025 Mazda CX-5','2025 Nissan Rogue','2025 Toyota Highlander',
  '2025 Honda Pilot','2025 Chevrolet Malibu','2025 Dodge Ram 1500','2025 Ford Mustang',
  '2025 Hyundai Sonata','2025 Kia Sorento','2025 Volkswagen Jetta','2025 Subaru Forester',
];
function _rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function generateContactInfo(persona) {
  const personaName = (persona && persona.name) || 'Customer';
  const [first, ...rest] = personaName.split(' ');
  const lastSlug = (rest.join('') || _rand(_LAST)).toLowerCase().replace(/[^a-z]/g, '');
  const area = String(200 + Math.floor(Math.random() * 800));
  const mid  = String(200 + Math.floor(Math.random() * 800));
  const end  = String(1000 + Math.floor(Math.random() * 9000));
  return {
    name:  personaName,
    phone: `(${area}) ${mid}-${end}`,
    email: `${first.toLowerCase()}.${lastSlug}@${_rand(_DOMAINS)}`,
    car:   _rand(_CARS),
  };
}
const { initiateCall } = require('../services/twilio');
const { getAllCalls, setCall, getCall } = require('../store');
const { requireAuth, JWT_SECRET } = require('../middleware/requireAuth');
const { startCallRateLimit } = require('../middleware/rateLimit');
const { parseAndValidatePhone } = require('../utils/phone');

// Scenario → persona mappings for the challenge block
const CHALLENGE_PERSONAS = {
  'trade-in':  'carlos-mendoza',
  'price':     'marcus-webb',
  'not-ready': 'tyler-kowalski',
  'competitor':'david-chen',
};

// POST /api/call/start
router.post('/call/start', requireAuth, startCallRateLimit, async (req, res) => {
  try {
    const { phoneNumber, personaId, difficulty } = req.body;

    const parsedPhone = parseAndValidatePhone(phoneNumber);
    if (!parsedPhone.ok) {
      res.status(400).json({ error: parsedPhone.error });
      return;
    }

    let persona;
    if (personaId) {
      persona = getPersonaById(personaId);
      if (!persona) { res.status(404).json({ error: 'Persona not found' }); return; }
    } else if (difficulty) {
      const pool = getPersonasByDifficulty(difficulty);
      if (!pool.length) { res.status(400).json({ error: `No personas for difficulty: ${difficulty}` }); return; }
      persona = pool[Math.floor(Math.random() * pool.length)];
    } else {
      persona = getRandomPersona();
    }
    if (!persona) {
      res.status(500).json({ error: 'Could not select a persona' });
      return;
    }

    const call = await initiateCall(parsedPhone.phoneNumber, persona.id, req.user.id);

    // Generate random contact info for this call (rep must capture during call)
    const contactInfo = generateContactInfo(persona);

    // Pre-store with validated persona so webhook reads from DB instead of re-resolving URL params
    setCall(call.sid, {
      userId: req.user.id,
      personaId: persona.id,
      personaName: persona.name,
      history: [],
      startTime: Date.now(),
      outcome: null,
      score: null,
      audioFiles: [],
      contactInfo,
    });

    res.json({
      success: true,
      callSid: call.sid,
      persona: {
        name: persona.name,
        difficulty: persona.difficulty,
        mood: persona.mood,
        intentScore: persona.intentScore,
      },
    });
  } catch (err) {
    console.error('[call/start] error:', err);
    res.status(500).json({ error: 'Failed to initiate call', details: err.message });
  }
});

// GET /api/call/history
router.get('/call/history', requireAuth, (req, res) => {
  const entries = getAllCalls(req.user.id, 50).map((data) => ({
    callSid: data.callSid,
    personaName: data.personaName,
    personaId: data.personaId,
    outcome: data.outcome,
    score: data.score,
    duration: data.endTime != null ? Math.round((data.endTime - data.startTime) / 1000) : null,
    timestamp: data.startTime,
  }));

  res.json(entries);
});

// GET /api/call/:callSid/stream — SSE stream of live call events
// Uses ?token= query param because EventSource doesn't support custom headers
router.get('/call/:callSid/stream', requireAuth, (req, res) => {
  const { callSid } = req.params;
  const callData = getCall(callSid);

  if (!callData) { res.status(404).json({ error: 'Call not found' }); return; }
  if (callData.userId !== req.user.id) { res.status(403).json({ error: 'Forbidden' }); return; }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Catch up: replay history that was captured before the browser subscribed
  if (callData.history && callData.history.length > 0) {
    for (const msg of callData.history) {
      res.write(`data: ${JSON.stringify({
        type: msg.role === 'user' ? 'user_message' : 'assistant_message',
        content: msg.content,
      })}\n\n`);
    }
  }

  // If call already complete, send outcome + score immediately and close
  if (callData.outcome) {
    res.write(`data: ${JSON.stringify({ type: 'outcome', outcome: callData.outcome })}\n\n`);
  }
  if (callData.score) {
    res.write(`data: ${JSON.stringify({ type: 'score', score: callData.score })}\n\n`);
    res.write('data: {"type":"done"}\n\n');
    res.end();
    return;
  }

  // Live: forward events from callEmitter
  const listener = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (event.type === 'score') {
      // Immediately follow with done so the client can render analysis without waiting
      // for the EventSource reconnect/onerror cycle.
      res.write('data: {"type":"done"}\n\n');
      setTimeout(() => res.end(), 500);
    }
  };

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  callEmitter.on(`call:${callSid}`, listener);
  req.on('close', () => {
    callEmitter.off(`call:${callSid}`, listener);
    clearInterval(heartbeat);
  });
});

// GET /api/personas
router.get('/personas', (req, res) => {
  const result = getAllPersonas().map(({ systemPrompt, ...rest }) => rest); // eslint-disable-line no-unused-vars
  res.json(result);
});

// POST /api/call/challenge — anonymous challenge call (no auth required)
router.post('/call/challenge', startCallRateLimit, async (req, res) => {
  try {
    const { phoneNumber, scenarioType } = req.body;

    const parsedPhone = parseAndValidatePhone(phoneNumber);
    if (!parsedPhone.ok) {
      res.status(400).json({ error: parsedPhone.error });
      return;
    }

    // Resolve persona from scenarioType
    const personaId = CHALLENGE_PERSONAS[scenarioType];
    let persona;
    if (personaId) {
      persona = getPersonaById(personaId);
    }
    if (!persona) persona = getRandomPersona();

    // Initiate Twilio call with no userId (FK enforcement is OFF)
    const call = await initiateCall(parsedPhone.phoneNumber, persona.id, null);

    const contactInfo = generateContactInfo(persona);
    setCall(call.sid, {
      userId: null,
      personaId: persona.id,
      personaName: persona.name,
      history: [],
      startTime: Date.now(),
      outcome: null,
      score: null,
      audioFiles: [],
      contactInfo,
    });

    // Issue a short-lived challenge token tied to this callSid
    const challengeToken = jwt.sign(
      { callSid: call.sid, type: 'challenge' },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({
      success: true,
      callSid: call.sid,
      challengeToken,
      persona: {
        name: persona.name,
        difficulty: persona.difficulty,
        mood: persona.mood,
      },
    });
  } catch (err) {
    console.error('[call/challenge] error:', err);
    res.status(500).json({ error: 'Failed to initiate challenge call', details: err.message });
  }
});

// GET /api/call/challenge-results/:callSid — poll for challenge call results (no auth)
router.get('/call/challenge-results/:callSid', (req, res) => {
  try {
    const { callSid } = req.params;
    const { challengeToken } = req.query;

    if (!challengeToken) {
      res.status(401).json({ error: 'challengeToken required' });
      return;
    }

    let payload;
    try {
      payload = jwt.verify(challengeToken, JWT_SECRET);
    } catch {
      res.status(401).json({ error: 'Invalid or expired challenge token' });
      return;
    }

    if (payload.type !== 'challenge' || payload.callSid !== callSid) {
      res.status(403).json({ error: 'Token does not match this call' });
      return;
    }

    const callData = getCall(callSid);
    if (!callData) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }

    if (!callData.score) {
      res.json({ pending: true });
      return;
    }

    res.json({
      outcome: callData.outcome,
      score: callData.score,
      contactInfo: callData.contactInfo,
    });
  } catch (err) {
    console.error('[call/challenge-results] error:', err);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

module.exports = router;
