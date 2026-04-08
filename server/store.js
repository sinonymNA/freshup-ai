'use strict';

const {
  createUser, updateUser, getUserById, getUserByEmail,
  createTeam, getTeamByCode, getTeamByManagerId, getTeamMembers,
  getCall, setCall, updateCall, getAllCalls,
  completeModule, getProgress,
  getLeaderboard,
} = require('./db');

module.exports = {
  createUser, updateUser, getUserById, getUserByEmail,
  createTeam, getTeamByCode, getTeamByManagerId, getTeamMembers,
  getCall, setCall, updateCall, getAllCalls,
  completeModule, getProgress,
  getLeaderboard,
};
