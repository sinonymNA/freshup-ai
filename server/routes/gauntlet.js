'use strict';

const express = require('express');
const router = express.Router();

const challenges = require('../gauntlet/challenges');
const { gradeGauntlet } = require('../services/claude');
const { requireAuth } = require('../middleware/requireAuth');
const { saveGauntletScore } = require('../db');

// GET /api/gauntlet/challenges
router.get('/challenges', (req, res) => {
  res.json(challenges);
});

// POST /api/gauntlet/grade
router.post('/grade', requireAuth, async (req, res) => {
  try {
    const { challengeId, response } = req.body;
    if (!challengeId || !response || !response.trim()) {
      res.status(400).json({ error: 'challengeId and response are required' });
      return;
    }
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge) {
      res.status(404).json({ error: 'Challenge not found' });
      return;
    }
    const score = await gradeGauntlet(challenge, response.trim());
    try { saveGauntletScore(req.user.id, challengeId, score.score); } catch { /* non-fatal */ }
    res.json(score);
  } catch (err) {
    console.error('[gauntlet/grade] error:', err);
    res.status(500).json({ error: 'Grading failed' });
  }
});

module.exports = router;
