'use strict';

require('dotenv').config();

if (process.env.NODE_ENV === 'production' && !process.env.APP_API_KEY) {
  console.error('WARNING: APP_API_KEY is not set. Protected endpoints will return 500 until it is configured in Railway.');
}

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const callRoutes = require('./routes/call');
const webhookRoutes = require('./routes/webhook');

const app = express();
const PORT = process.env.PORT || 3000;

// Build index.html with APP_API_KEY injected so every browser gets
// window.FRESHUP_API_KEY automatically — no localStorage setup needed.
let indexHtml = null;
try {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  const rawHtml = fs.readFileSync(indexPath, 'utf8');
  const key = process.env.APP_API_KEY || '';
  indexHtml = rawHtml.replace(
    '</head>',
    `<script>window.FRESHUP_API_KEY = ${JSON.stringify(key)};</script></head>`
  );
} catch (err) {
  console.error('Could not inject API key into index.html:', err.message);
}

function serveIndex(req, res) {
  if (indexHtml) {
    res.type('html').send(indexHtml);
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve generated ElevenLabs audio files to Twilio
app.use('/audio', express.static('/tmp'));

// Serve index.html with injected key; let static middleware handle other assets
app.get('/', serveIndex);
app.get('/index.html', serveIndex);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.use('/api', callRoutes);
app.use('/webhook', webhookRoutes);

// SPA fallback — serve index.html for any unmatched GET
app.get('/{*path}', serveIndex);

app.listen(PORT, () => {
  console.log(`FreshUp AI running on port ${PORT}`);
});

module.exports = app;
