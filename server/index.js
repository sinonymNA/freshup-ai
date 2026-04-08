'use strict';

require('dotenv').config();

if (process.env.NODE_ENV === 'production' && !process.env.APP_API_KEY) {
  console.error('FATAL: APP_API_KEY is required in production. Set it in your Railway environment variables.');
  process.exit(1);
}

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
