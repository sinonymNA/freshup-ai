'use strict';

// Shared in-memory call state store.
// Keyed by Twilio CallSid. Imported by both webhook and call routes.
const activeCalls = new Map();

module.exports = { activeCalls };
