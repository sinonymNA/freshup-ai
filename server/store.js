'use strict';

const {
  createUser, getUserById, getUserByEmail,
  getCall, setCall, updateCall, getAllCalls,
  completeModule, getProgress,
  getLeaderboard,
} = require('./db');

module.exports = {
  createUser, getUserById, getUserByEmail,
  getCall, setCall, updateCall, getAllCalls,
  completeModule, getProgress,
  getLeaderboard,
};
