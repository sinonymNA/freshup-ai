'use strict';

// Thin wrapper over SQLite db — keeps the same API as the old in-memory Map
// so all routes continue to work without changes.
const { getCall, setCall, updateCall, getAllCalls } = require('./db');

module.exports = { getCall, setCall, updateCall, getAllCalls };
