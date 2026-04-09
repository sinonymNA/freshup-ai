'use strict';

const express = require('express');
const router = express.Router();

const { getAllPersonas, getPersonaById, getRandomPersona } = require('../personas');

// ── Random contact info generation ────────────────────────────────────────────
const _FIRST = ['James','John','Robert','Michael','William','David','Richard','Joseph','Thomas','Charles','Mary','Patricia','Jennifer','Linda','Barbara','Elizabeth','Susan','Jessica','Sarah','Karen','Lisa','Nancy','Betty','Sandra','Emily','Megan','Ashley','Amanda','Brittany','Stephanie'];
const _LAST  = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Wilson','Martinez','Anderson','Taylor','Thomas','Hernandez','Moore','Jackson','Thompson','White','Lopez','Lee','Harris','Clark','Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott'];
const _DOMAINS = ['gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com'];
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
function generateContactInfo() {
  const first = _rand(_FIRST);
  const last  = _rand(_LAST);
  const area  = String(200 + Math.floor(Math.random() * 800));
  const mid   = String(200 + Math.floor(Math.random() * 800));
  const end   = String(1000 + Math.floor(Math.random() * 9000));
  return {
    name:  `${first} ${last}`,
    phone: `(${area}) ${mid}-${end}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@${_rand(_DOMAINS)}`,
    car:   _rand(_CARS),
  };
}
const { initiateCall } = require('../services/twilio');
const { getAllCalls, setCall } = require('../store');
const { requireAuth } = require('../middleware/requireAuth');
const { startCallRateLimit } = require('../middleware/rateLimit');
const { parseAndValidatePhone } = require('../utils/phone');

// POST /api/call/start
router.post('/call/start', requireAuth, startCallRateLimit, async (req, res) => {
  try {
    const { phoneNumber, personaId } = req.body;

    const parsedPhone = parseAndValidatePhone(phoneNumber);
    if (!parsedPhone.ok) {
      res.status(400).json({ error: parsedPhone.error });
      return;
    }

    const persona = personaId ? getPersonaById(personaId) : getRandomPersona();
    if (!persona) {
      res.status(404).json({ error: 'Persona not found' });
      return;
    }

    const call = await initiateCall(parsedPhone.phoneNumber, persona.id, req.user.id);

    // Generate random contact info for this call (rep must capture during call)
    const contactInfo = generateContactInfo();

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

// GET /api/personas
router.get('/personas', (req, res) => {
  const result = getAllPersonas().map(({ systemPrompt, ...rest }) => rest); // eslint-disable-line no-unused-vars
  res.json(result);
});

module.exports = router;
