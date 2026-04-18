'use strict';

const express = require('express');
const router = express.Router();
const { getAnalytics } = require('../store');

const DASHBOARD_SECRET = process.env.DASHBOARD_SECRET || 'dev-analytics-secret';

// GET /api/analytics — sales performance snapshot for external consumers
// Requires X-Dashboard-Secret header
router.get('/', (req, res) => {
  if (req.headers['x-dashboard-secret'] !== DASHBOARD_SECRET) {
    res.status(401).json({ error: 'Unauthorized — X-Dashboard-Secret header required' });
    return;
  }
  try {
    res.json(getAnalytics());
  } catch (err) {
    console.error('[analytics] error:', err);
    res.status(500).json({ error: 'Failed to compute analytics', details: err.message });
  }
});

module.exports = router;
