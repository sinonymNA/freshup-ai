'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'calls.db');
const db = new Database(dbPath);

// Disable FK enforcement — the production SQLite binary may have it on by default.
// We rely on application-level integrity; strict FK checks break calls when a session
// JWT outlives a DB reset (userId in token no longer exists in users table).
db.pragma('foreign_keys = OFF');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    email        TEXT UNIQUE NOT NULL,
    name         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS teams (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    manager_id  INTEGER NOT NULL REFERENCES users(id),
    invite_code TEXT UNIQUE NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS calls (
    callSid     TEXT PRIMARY KEY,
    userId      INTEGER REFERENCES users(id),
    personaId   TEXT,
    personaName TEXT,
    history     TEXT DEFAULT '[]',
    outcome     TEXT,
    score       TEXT,
    startTime   INTEGER,
    endTime     INTEGER,
    audioFiles  TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS module_completions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    userId      INTEGER NOT NULL REFERENCES users(id),
    moduleId    TEXT NOT NULL,
    courseId    TEXT NOT NULL,
    callSid     TEXT,
    score       INTEGER,
    passed      INTEGER DEFAULT 0,
    completedAt INTEGER NOT NULL,
    UNIQUE(userId, moduleId)
  );
`);

// ── Migrations (safe column additions) ──────────────────────────────────────

const existingUserCols = db.prepare('PRAGMA table_info(users)').all().map(r => r.name);
if (!existingUserCols.includes('role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'rep'");
}
if (!existingUserCols.includes('team_id')) {
  db.exec('ALTER TABLE users ADD COLUMN team_id INTEGER');
}

const existingCallCols = db.prepare('PRAGMA table_info(calls)').all().map(r => r.name);
if (!existingCallCols.includes('contactInfo')) {
  db.exec('ALTER TABLE calls ADD COLUMN contactInfo TEXT');
}

// ── Users ────────────────────────────────────────────────────────────────────

function createUser({ email, name, password_hash, role = 'rep', team_id = null }) {
  const stmt = db.prepare(
    'INSERT INTO users (email, name, password_hash, role, team_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(email, name, password_hash, role, team_id, Date.now());
  return getUserById(result.lastInsertRowid);
}

function updateUser(id, updates) {
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${fields} WHERE id = ?`).run(...Object.values(updates), id);
  return getUserById(id);
}

function getUserById(id) {
  return db.prepare('SELECT id, email, name, role, team_id, created_at FROM users WHERE id = ?').get(id);
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

// ── Teams ─────────────────────────────────────────────────────────────────────

function makeInviteCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function createTeam({ name, managerId }) {
  let code;
  // Retry until unique code is found
  for (let i = 0; i < 10; i++) {
    code = makeInviteCode();
    const existing = db.prepare('SELECT id FROM teams WHERE invite_code = ?').get(code);
    if (!existing) break;
  }
  const result = db.prepare(
    'INSERT INTO teams (name, manager_id, invite_code, created_at) VALUES (?, ?, ?, ?)'
  ).run(name, managerId, code, Date.now());
  return db.prepare('SELECT * FROM teams WHERE id = ?').get(result.lastInsertRowid);
}

function getTeamByCode(code) {
  return db.prepare('SELECT * FROM teams WHERE invite_code = ?').get(code.toUpperCase());
}

function getTeamByManagerId(managerId) {
  return db.prepare('SELECT * FROM teams WHERE manager_id = ?').get(managerId);
}

function getTeamMembers(teamId) {
  return db.prepare(`
    SELECT
      u.id, u.name, u.email, u.created_at,
      COUNT(DISTINCT c.callSid) AS totalCalls,
      ROUND(AVG(CASE WHEN c.score IS NOT NULL THEN CAST(json_extract(c.score, '$.overallScore') AS REAL) END), 1) AS avgScore,
      MAX(CASE WHEN c.score IS NOT NULL THEN CAST(json_extract(c.score, '$.overallScore') AS INTEGER) END) AS bestScore,
      COUNT(DISTINCT CASE WHEN mc.passed = 1 THEN mc.moduleId END) AS modulesCompleted,
      MAX(c.startTime) AS lastActive
    FROM users u
    LEFT JOIN calls c ON c.userId = u.id
    LEFT JOIN module_completions mc ON mc.userId = u.id
    WHERE u.team_id = ?
    GROUP BY u.id
    ORDER BY avgScore DESC, totalCalls DESC
  `).all(teamId);
}

// ── Calls ─────────────────────────────────────────────────────────────────────

function getCall(callSid) {
  const row = db.prepare('SELECT * FROM calls WHERE callSid = ?').get(callSid);
  if (!row) return null;
  return {
    ...row,
    history: JSON.parse(row.history || '[]'),
    score: row.score ? JSON.parse(row.score) : null,
    audioFiles: JSON.parse(row.audioFiles || '[]'),
    contactInfo: row.contactInfo ? JSON.parse(row.contactInfo) : null,
  };
}

function setCall(callSid, data) {
  db.prepare(`
    INSERT INTO calls (callSid, userId, personaId, personaName, history, outcome, score, startTime, endTime, audioFiles, contactInfo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(callSid) DO UPDATE SET
      userId      = excluded.userId,
      personaId   = excluded.personaId,
      personaName = excluded.personaName,
      history     = excluded.history,
      outcome     = excluded.outcome,
      score       = excluded.score,
      startTime   = excluded.startTime,
      endTime     = excluded.endTime,
      audioFiles  = excluded.audioFiles,
      contactInfo = excluded.contactInfo
  `).run(
    callSid,
    data.userId ?? null,
    data.personaId ?? null,
    data.personaName ?? null,
    JSON.stringify(data.history ?? []),
    data.outcome ?? null,
    data.score ? JSON.stringify(data.score) : null,
    data.startTime ?? null,
    data.endTime ?? null,
    JSON.stringify(data.audioFiles ?? []),
    data.contactInfo ? JSON.stringify(data.contactInfo) : null
  );
}

function updateCall(callSid, updates) {
  const existing = getCall(callSid);
  if (!existing) return;
  setCall(callSid, { ...existing, ...updates });
}

function getAllCalls(userId, limit = 50) {
  return db
    .prepare('SELECT * FROM calls WHERE userId = ? ORDER BY startTime DESC LIMIT ?')
    .all(userId, limit)
    .map((row) => ({
      ...row,
      history: JSON.parse(row.history || '[]'),
      score: row.score ? JSON.parse(row.score) : null,
      audioFiles: JSON.parse(row.audioFiles || '[]'),
    }));
}

// ── Module completions ────────────────────────────────────────────────────────

function completeModule({ userId, moduleId, courseId, callSid, score, passed }) {
  db.prepare(`
    INSERT INTO module_completions (userId, moduleId, courseId, callSid, score, passed, completedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(userId, moduleId) DO UPDATE SET
      callSid     = excluded.callSid,
      score       = excluded.score,
      passed      = excluded.passed,
      completedAt = excluded.completedAt
  `).run(userId, moduleId, courseId, callSid ?? null, score ?? null, passed ? 1 : 0, Date.now());
}

function getProgress(userId) {
  return db
    .prepare('SELECT moduleId, courseId, score, passed FROM module_completions WHERE userId = ? AND passed = 1')
    .all(userId);
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

function getLeaderboard(limit = 20) {
  return db.prepare(`
    SELECT
      u.id,
      u.name,
      COUNT(DISTINCT CASE WHEN c.score IS NOT NULL THEN c.callSid END) AS totalCalls,
      ROUND(AVG(CASE WHEN c.score IS NOT NULL THEN CAST(json_extract(c.score, '$.overallScore') AS REAL) END), 1) AS avgScore,
      MAX(CASE WHEN c.score IS NOT NULL THEN CAST(json_extract(c.score, '$.overallScore') AS INTEGER) END) AS bestScore,
      COUNT(DISTINCT CASE WHEN mc.passed = 1 THEN mc.moduleId END) AS modulesCompleted
    FROM users u
    LEFT JOIN calls c ON c.userId = u.id
    LEFT JOIN module_completions mc ON mc.userId = u.id
    GROUP BY u.id
    ORDER BY avgScore DESC, totalCalls DESC
    LIMIT ?
  `).all(limit);
}

module.exports = {
  createUser, updateUser, getUserById, getUserByEmail,
  createTeam, getTeamByCode, getTeamByManagerId, getTeamMembers,
  getCall, setCall, updateCall, getAllCalls,
  completeModule, getProgress,
  getLeaderboard,
};
