'use strict';

const express = require('express');
const router = express.Router();
const { createLead, getLeads } = require('../store');

// POST /api/contact — anonymous lead capture form submission
router.post('/contact', (req, res) => {
  try {
    const { contactName, dealershipName, phone, email, zip, repCount, message } = req.body;
    if (!contactName || !dealershipName) {
      res.status(400).json({ error: 'Name and dealership are required' });
      return;
    }
    const lead = createLead({ contactName, dealershipName, phone, email, zip, repCount, message });
    res.json({ success: true, id: lead.id });
  } catch (err) {
    console.error('[contact] error:', err);
    res.status(500).json({ error: 'Failed to save request' });
  }
});

// GET /api/contact/leads — admin endpoint to view submitted leads
router.get('/contact/leads', (req, res) => {
  const secret = req.headers['x-dashboard-secret'];
  if (!secret || secret !== process.env.DASHBOARD_SECRET) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  try {
    res.json(getLeads(200));
  } catch (err) {
    console.error('[contact/leads] error:', err);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

module.exports = router;
