'use strict';

require('dotenv').config();

const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const express = require('express');
const cors = require('cors');

const callRoutes = require('./routes/call');
const webhookRoutes = require('./routes/webhook');
const authRoutes = require('./routes/auth');
const coursesRoutes = require('./routes/courses');
const teamRoutes = require('./routes/team');
const gauntletRoutes = require('./routes/gauntlet');
const analyticsRoutes = require('./routes/analytics');
const { handleMediaStream } = require('./services/openai-realtime');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the frontend SPA
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Quick connectivity check — opens a WebSocket to OpenAI Realtime and closes it
app.get('/health/openai', async (req, res) => {
  const { WebSocket } = require('ws');
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    res.status(500).json({ ok: false, error: 'OPENAI_API_KEY is not set' });
    return;
  }
  try {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview',
        { headers: { Authorization: `Bearer ${key}`, 'OpenAI-Beta': 'realtime=v1' } }
      );
      const timeout = setTimeout(() => { ws.terminate(); reject(new Error('Connection timed out after 8s')); }, 8000);
      ws.on('open', () => { clearTimeout(timeout); ws.close(); resolve(); });
      ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
    });
    res.json({ ok: true, model: 'gpt-4o-realtime-preview' });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/gauntlet', gauntletRoutes);
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
