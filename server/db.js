'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'calls.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    email        TEXT UNIQUE NOT NULL,
    name         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at   INTEGER NOT NULL
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

// ── Users ────────────────────────────────────────────────────────────────────

function createUser({ email, name, password_hash }) {
  const stmt = db.prepare(
    'INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(email, name, password_hash, Date.now());
  return getUserById(result.lastInsertRowid);
}

function getUserById(id) {
  return db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(id);
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
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
  };
}

function setCall(callSid, data) {
  db.prepare(`
    INSERT INTO calls (callSid, userId, personaId, personaName, history, outcome, score, startTime, endTime, audioFiles)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(callSid) DO UPDATE SET
      userId      = excluded.userId,
      personaId   = excluded.personaId,
      personaName = excluded.personaName,
      history     = excluded.history,
      outcome     = excluded.outcome,
      score       = excluded.score,
      startTime   = excluded.startTime,
      endTime     = excluded.endTime,
      audioFiles  = excluded.audioFiles
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
    JSON.stringify(data.audioFiles ?? [])
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
  createUser, getUserById, getUserByEmail,
  getCall, setCall, updateCall, getAllCalls,
  completeModule, getProgress,
  getLeaderboard,
};
