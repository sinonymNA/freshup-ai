'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'calls.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS calls (
    callSid     TEXT PRIMARY KEY,
    personaId   TEXT,
    personaName TEXT,
    history     TEXT DEFAULT '[]',
    outcome     TEXT,
    score       TEXT,
    startTime   INTEGER,
    endTime     INTEGER,
    audioFiles  TEXT DEFAULT '[]'
  )
`);

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
    INSERT INTO calls (callSid, personaId, personaName, history, outcome, score, startTime, endTime, audioFiles)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(callSid) DO UPDATE SET
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

function getAllCalls(limit = 50) {
  return db
    .prepare('SELECT * FROM calls ORDER BY startTime DESC LIMIT ?')
    .all(limit)
    .map((row) => ({
      ...row,
      history: JSON.parse(row.history || '[]'),
      score: row.score ? JSON.parse(row.score) : null,
      audioFiles: JSON.parse(row.audioFiles || '[]'),
    }));
}

module.exports = { getCall, setCall, updateCall, getAllCalls };
