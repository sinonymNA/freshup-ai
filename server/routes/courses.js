'use strict';

const express = require('express');
const router = express.Router();

const { getAllCourses, getCourseById } = require('../courses');
const { requireAuth } = require('../middleware/requireAuth');
const { completeModule, getProgress, getLeaderboard } = require('../store');

// GET /api/courses
router.get('/', (req, res) => {
  res.json(getAllCourses());
});

// GET /api/courses/progress — current user's passed module IDs
router.get('/progress', requireAuth, (req, res) => {
  const rows = getProgress(req.user.id);
  res.json(rows.map((r) => r.moduleId));
});

// GET /api/courses/:id — must come AFTER /progress to avoid route collision
router.get('/:id', (req, res) => {
  const course = getCourseById(req.params.id);
  if (!course) {
    res.status(404).json({ error: 'Course not found' });
    return;
  }
  res.json(course);
});

// POST /api/courses/:courseId/modules/:moduleId/complete
router.post('/:courseId/modules/:moduleId/complete', requireAuth, (req, res) => {
  const { courseId, moduleId } = req.params;
  const { callSid, score, passed } = req.body;

  const course = getCourseById(courseId);
  if (!course) {
    res.status(404).json({ error: 'Course not found' });
    return;
  }

  const mod = course.modules.find((m) => m.id === moduleId);
  if (!mod) {
    res.status(404).json({ error: 'Module not found' });
    return;
  }

  completeModule({
    userId: req.user.id,
    moduleId,
    courseId,
    callSid: callSid || null,
    score: typeof score === 'number' ? score : null,
    passed: !!passed,
  });

  res.json({ ok: true });
});

// GET /api/leaderboard  (?scope=team requires auth)
router.get('/leaderboard/top', (req, res, next) => {
  if (req.query.scope === 'team') return requireAuth(req, res, next);
  next();
}, (req, res) => {
  const teamId = req.query.scope === 'team' ? (req.user?.team_id ?? null) : null;
  const rows = getLeaderboard(20, teamId);
  const ranked = rows.map((row, i) => ({ rank: i + 1, ...row }));
  res.json(ranked);
});

module.exports = router;
