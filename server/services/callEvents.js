'use strict';

const EventEmitter = require('events');

// Singleton EventEmitter for real-time call events.
// openai-realtime.js emits events; SSE stream endpoint listens.
const callEmitter = new EventEmitter();
callEmitter.setMaxListeners(500); // up to 500 concurrent SSE connections

module.exports = callEmitter;
