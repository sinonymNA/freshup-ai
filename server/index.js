'use strict';

require('dotenv').config();

const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const express = require('express');
const cors = require('cors');

const callRoutes = require('./routes/call');
const webhookRoutes = require('./routes/webhook');
const { handleMediaStream } = require('./services/openai-realtime');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Expose APP_API_KEY to the browser so it can authenticate API calls
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

// ── WebSocket server (Twilio Media Streams) ──────────────────────────────────
const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = req.url || '';
  if (url.startsWith('/webhook/media-stream')) {
    handleMediaStream(ws, url);
  } else {
    ws.close(1008, 'Unknown endpoint');
  }
});

server.listen(PORT, () => {
  console.log(`FreshUp AI running on port ${PORT}`);
});

module.exports = app;
