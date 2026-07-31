'use strict';

const express = require('express');
const router = express.Router();

const { initiateTrainingCall } = require('../services/twilio');
const { setTrainingCall, getAllTrainingCalls } = require('../store');
const { requireAuth } = require('../middleware/requireAuth');
const { startCallRateLimit } = require('../middleware/rateLimit');
const { parseAndValidatePhone } = require('../utils/phone');
const { normalizeDifficulty } = require('../training');

// POST /api/training/start
router.post('/training/start', requireAuth, startCallRateLimit, async (req, res) => {
  try {
    const { phoneNumber, difficulty } = req.body;

    const parsedPhone = parseAndValidatePhone(phoneNumber);
    if (!parsedPhone.ok) {
      res.status(400).json({ error: parsedPhone.error });
      return;
    }

    const normalizedDifficulty = normalizeDifficulty(difficulty);
    const difficultyLabel = normalizedDifficulty.charAt(0).toUpperCase() + normalizedDifficulty.slice(1);

    const call = await initiateTrainingCall(parsedPhone.phoneNumber, normalizedDifficulty, req.user.id);

    setTrainingCall(call.sid, {
      userId: req.user.id,
      difficulty: difficultyLabel,
      phase: 'menu',
      history: [],
      startTime: Date.now(),
      outcome: null,
      score: null,
    });

    res.json({ success: true, callSid: call.sid, difficulty: difficultyLabel });
  } catch (err) {
    console.error('[training/start] error:', err);
    res.status(500).json({ error: 'Failed to initiate practice call', details: err.message });
  }
});

// GET /api/training/history
router.get('/training/history', requireAuth, (req, res) => {
  const entries = getAllTrainingCalls(req.user.id, 50).map((data) => ({
    callSid: data.callSid,
    difficulty: data.difficulty,
    dealershipName: data.dealershipName,
    gatekeeperPersonaId: data.gatekeeperPersonaId,
    gmPersonaName: data.gmPersonaName,
    outcome: data.outcome,
    score: data.score,
    duration: data.endTime != null ? Math.round((data.endTime - data.startTime) / 1000) : null,
    timestamp: data.startTime,
  }));

  res.json(entries);
});

module.exports = router;
