'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const callRoutes = require('./routes/call');
const webhookRoutes = require('./routes/webhook');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve generated ElevenLabs audio files to Twilio
app.use('/audio', express.static('/tmp'));

app.use('/call', callRoutes);
app.use('/webhook', webhookRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
