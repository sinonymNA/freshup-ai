'use strict';

const express = require('express');
const router = express.Router();

const { getAllPersonas, getPersonaById, getRandomPersona } = require('../personas');
const { initiateCall } = require('../services/twilio');
const { getAllCalls } = require('../store');
const { requireApiKey } = require('../middleware/auth');
const { startCallRateLimit } = require('../middleware/rateLimit');
const { parseAndValidatePhone } = require('../utils/phone');

// POST /api/call/start
router.post('/call/start', requireApiKey, startCallRateLimit, async (req, res) => {
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

    const call = await initiateCall(parsedPhone.phoneNumber, persona.id);

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
router.get('/call/history', requireApiKey, (req, res) => {
  const entries = getAllCalls(50).map((data) => ({
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
