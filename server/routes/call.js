'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const personas = require('../personas');
const { initiateCall } = require('../services/twilio');
const { generateCustomerResponse } = require('../services/claude');
const { activeCalls } = require('./webhook');

const PERSONA_IDS = Object.keys(personas);

// POST /api/call/start
router.post('/start', async (req, res) => {
  const { phoneNumber, personaId: requestedPersonaId } = req.body;

  if (!phoneNumber) {
    res.status(400).json({ error: 'phoneNumber is required' });
    return;
  }

  const personaId =
    requestedPersonaId && personas[requestedPersonaId]
      ? requestedPersonaId
      : PERSONA_IDS[Math.floor(Math.random() * PERSONA_IDS.length)];

  const persona = personas[personaId];

  const call = await initiateCall(phoneNumber, personaId);

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
});

// GET /api/call/history
router.get('/history', (req, res) => {
  const entries = Array.from(activeCalls.entries())
    .slice(-20)
    .map(([callSid, data]) => ({
      callSid,
      personaName: data.persona.name,
      outcome: data.outcome,
      score: data.score,
      duration:
        data.endTime != null ? Math.round((data.endTime - data.startTime) / 1000) : null,
      timestamp: data.startTime,
    }));

  res.json(entries);
});

// GET /api/personas
router.get('/', (req, res) => {
  const dataDir = path.join(__dirname, '../personas/data');
  const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));

  const result = files.map((file) => {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    const { systemPrompt, ...rest } = raw;  // eslint-disable-line no-unused-vars
    return rest;
  });

  res.json(result);
});

// GET /api/test/persona/:personaId
router.get('/test/:personaId', async (req, res) => {
  const persona = personas[req.params.personaId];
  if (!persona) {
    res.status(404).json({ error: 'Persona not found' });
    return;
  }

  const openingLine = await generateCustomerResponse([], persona);

  res.json({
    persona: persona.name,
    openingLine,
  });
});

module.exports = router;
