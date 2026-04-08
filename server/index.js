'use strict';

require('dotenv').config();

if (process.env.NODE_ENV === 'production' && !process.env.APP_API_KEY) {
  console.error('FATAL: APP_API_KEY is required in production. Set it in your Railway environment variables.');
  process.exit(1);
}

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const callRoutes = require('./routes/call');
const webhookRoutes = require('./routes/webhook');

const app = express();
const PORT = process.env.PORT || 3000;

// Read and cache index.html with the API key injected so every browser
// automatically gets window.FRESHUP_API_KEY without manual localStorage setup.
const indexPath = path.join(__dirname, 'public', 'index.html');
const rawHtml = fs.readFileSync(indexPath, 'utf8');
const key = process.env.APP_API_KEY || '';
const indexHtml = rawHtml.replace(
  '</head>',
  `<script>window.FRESHUP_API_KEY = ${JSON.stringify(key)};</script></head>`
);

function serveIndex(req, res) {
  res.type('html').send(indexHtml);
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
