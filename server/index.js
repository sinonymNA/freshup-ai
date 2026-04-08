'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

const callRoutes = require('./routes/call');
const webhookRoutes = require('./routes/webhook');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve generated ElevenLabs audio files to Twilio
app.use('/audio', express.static('/tmp'));

// Expose APP_API_KEY to the browser as a JS file loaded by index.html
app.get('/config.js', (req, res) => {
  const key = process.env.APP_API_KEY || '';
  res.type('js').send(`window.FRESHUP_API_KEY = ${JSON.stringify(key)};`);
});

// Serve the frontend SPA
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.use('/api', callRoutes);
app.use('/webhook', webhookRoutes);

// SPA fallback — serve index.html for any unmatched GET
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`FreshUp AI running on port ${PORT}`);
});

module.exports = app;
