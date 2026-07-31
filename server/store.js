'use strict';

// store.js is a thin re-export so route files don't import directly from db.js.
// Add any new db.js exports here too.
module.exports = require('./db');
