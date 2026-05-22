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
if (!existingUserCols.includes('phone_number')) {
  db.exec('ALTER TABLE users ADD COLUMN phone_number TEXT');
}
if (!existingUserCols.includes('security_question')) {
  db.exec('ALTER TABLE users ADD COLUMN security_question TEXT');
}
if (!existingUserCols.includes('security_answer_hash')) {
  db.exec('ALTER TABLE users ADD COLUMN security_answer_hash TEXT');
}

const existingCallCols = db.prepare('PRAGMA table_info(calls)').all().map(r => r.name);
if (!existingCallCols.includes('contactInfo')) {
  db.exec('ALTER TABLE calls ADD COLUMN contactInfo TEXT');
}

const existingTeamCols = db.prepare('PRAGMA table_info(teams)').all().map(r => r.name);
if (!existingTeamCols.includes('config')) {
  db.exec("ALTER TABLE teams ADD COLUMN config TEXT DEFAULT '{}'");
}

// Gauntlet scores
db.exec(`
  CREATE TABLE IF NOT EXISTS gauntlet_scores (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    userId      INTEGER NOT NULL,
    challengeId TEXT NOT NULL,
    score       INTEGER NOT NULL,
    createdAt   INTEGER NOT NULL
  );
`);

// Password reset tokens
db.exec(`
  CREATE TABLE IF NOT EXISTS password_resets (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    token     TEXT UNIQUE NOT NULL,
    userId    INTEGER NOT NULL,
    expiresAt INTEGER NOT NULL,
    usedAt    INTEGER
  );
`);

// Leads table (contact/demo request form submissions)
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    contactName    TEXT NOT NULL,
    dealershipName TEXT NOT NULL,
    phone          TEXT,
    email          TEXT,
    zip            TEXT,
    repCount       INTEGER,
    message        TEXT,
    createdAt      INTEGER NOT NULL
  );
`);

// Recorded calls — both outbound bot calls and inbound real calls
db.exec(`
  CREATE TABLE IF NOT EXISTS recorded_calls (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    callSid       TEXT UNIQUE NOT NULL,
    type          TEXT NOT NULL DEFAULT 'bot',
    teamId        INTEGER,
    userId        INTEGER,
    repName       TEXT,
    recordingSid  TEXT,
    recordingUrl  TEXT,
    duration      INTEGER,
    startTime     INTEGER,
    transcript    TEXT,
    grade         TEXT,
    emailSent     INTEGER DEFAULT 0,
    createdAt     INTEGER NOT NULL
  );
`);

// ── Users ────────────────────────────────────────────────────────────────────

function createUser({ email, name, password_hash, role = 'rep', team_id = null, security_question = null, security_answer_hash = null }) {
  const stmt = db.prepare(
    'INSERT INTO users (email, name, password_hash, role, team_id, security_question, security_answer_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(email, name, password_hash, role, team_id, security_question, security_answer_hash, Date.now());
  return getUserById(result.lastInsertRowid);
}

function getSecurityQuestionByEmail(email) {
  const row = db.prepare('SELECT security_question, security_answer_hash FROM users WHERE email = ?').get(email);
  return row || null;
}

function updateUser(id, updates) {
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${fields} WHERE id = ?`).run(...Object.values(updates), id);
  return getUserById(id);
}

function getUserById(id) {
  return db.prepare('SELECT id, email, name, role, team_id, phone_number, created_at FROM users WHERE id = ?').get(id);
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

function getTeamById(teamId) {
  return db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
}

function getTeamConfig(teamId) {
  const team = getTeamById(teamId);
  if (!team) return {};
  try { return JSON.parse(team.config || '{}'); } catch { return {}; }
}

function setTeamConfig(teamId, config) {
  db.prepare('UPDATE teams SET config = ? WHERE id = ?').run(JSON.stringify(config), teamId);
}

function getTeamAnalytics(teamId) {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

  // Member IDs on this team
  const memberIds = db.prepare('SELECT id FROM users WHERE team_id = ?').all(teamId).map(r => r.id);
  if (!memberIds.length) {
    return {
      appointmentRate: 0, callsThisWeek: 0, callsLastWeek: 0,
      teamAvgScore: 0, activeRepsThisWeek: 0, totalReps: 0,
      dimensionAverages: { opening: 0, rapport: 0, infoCapture: 0, objectionHandling: 0, appointment: 0 },
      repStats: [], recentCalls: [],
    };
  }

  const placeholders = memberIds.map(() => '?').join(',');

  // Calls this month — all completed calls for rate, scored calls for dimension averages
  const monthCallsAll = db.prepare(
    `SELECT userId, outcome, score FROM calls WHERE userId IN (${placeholders}) AND startTime >= ?`
  ).all(...memberIds, monthAgo);

  const monthCalls = monthCallsAll.filter(c => c.score);
  const completedCalls = monthCallsAll.filter(c => c.outcome === 'Appointment' || c.outcome === 'HangUp');
  const appointmentCalls = completedCalls.filter(c => c.outcome === 'Appointment');
  const appointmentRate = completedCalls.length ? appointmentCalls.length / completedCalls.length : 0;

  // Calls this week / last week
  const callsThisWeek = db.prepare(
    `SELECT COUNT(*) AS n FROM calls WHERE userId IN (${placeholders}) AND startTime >= ?`
  ).get(...memberIds, weekAgo).n;

  const callsLastWeek = db.prepare(
    `SELECT COUNT(*) AS n FROM calls WHERE userId IN (${placeholders}) AND startTime >= ? AND startTime < ?`
  ).get(...memberIds, twoWeeksAgo, weekAgo).n;

  // Team avg overall score (this month)
  const scores = monthCalls.map(c => { try { return JSON.parse(c.score); } catch { return null; } }).filter(Boolean);
  const teamAvgScore = scores.length
    ? Math.round(scores.reduce((s, sc) => s + (sc.overallScore || 0), 0) / scores.length)
    : 0;

  // Active reps this week
  const activeRepsThisWeek = db.prepare(
    `SELECT COUNT(DISTINCT userId) AS n FROM calls WHERE userId IN (${placeholders}) AND startTime >= ?`
  ).get(...memberIds, weekAgo).n;

  // Dimension averages (this month)
  const dims = { opening: 0, rapport: 0, infoCapture: 0, objectionHandling: 0, appointment: 0 };
  if (scores.length) {
    for (const d of Object.keys(dims)) {
      const vals = scores.map(s => s[d] ?? 0);
      dims[d] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
  }

  // Per-rep stats: appointmentRate, weakest dimension, trend
  const repStats = memberIds.map(uid => {
    const repCalls = db.prepare(
      'SELECT outcome, score, startTime FROM calls WHERE userId = ? AND score IS NOT NULL ORDER BY startTime DESC LIMIT 30'
    ).all(uid);
    const repScores = repCalls.map(c => { try { return JSON.parse(c.score); } catch { return null; } }).filter(Boolean);
    const repCompleted = repCalls.filter(c => c.outcome === 'Appointment' || c.outcome === 'HangUp');
    const repAppt = repCalls.filter(c => c.outcome === 'Appointment');
    const repApptRate = repCompleted.length ? repAppt.length / repCompleted.length : 0;

    const repDims = { opening: 0, rapport: 0, infoCapture: 0, objectionHandling: 0, appointment: 0 };
    if (repScores.length) {
      for (const d of Object.keys(repDims)) {
        const vals = repScores.map(s => s[d] ?? 0);
        repDims[d] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      }
    }

    const weakestDim = Object.entries(repDims).sort((a, b) => a[1] - b[1])[0];

    // Trend: compare avg score of last 5 vs previous 5
    const last5 = repScores.slice(0, 5);
    const prev5 = repScores.slice(5, 10);
    let trend = 'flat';
    if (last5.length && prev5.length) {
      const avgLast = last5.reduce((s, sc) => s + (sc.overallScore || 0), 0) / last5.length;
      const avgPrev = prev5.reduce((s, sc) => s + (sc.overallScore || 0), 0) / prev5.length;
      if (avgLast - avgPrev >= 3) trend = 'up';
      else if (avgPrev - avgLast >= 3) trend = 'down';
    }

    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(uid);
    const lastActive = db.prepare('SELECT MAX(startTime) AS t FROM calls WHERE userId = ?').get(uid)?.t ?? null;

    return {
      id: uid, name: user?.name ?? '', email: user?.email ?? '',
      lastActive,
      totalCalls: repCalls.length,
      avgScore: repScores.length
        ? Math.round(repScores.reduce((s, sc) => s + (sc.overallScore || 0), 0) / repScores.length)
        : 0,
      appointmentRate: repApptRate,
      dimensionAverages: repDims,
      weakestDim: weakestDim ? { key: weakestDim[0], value: weakestDim[1] } : null,
      trend,
    };
  });

  // Recent calls across team (last 15)
  const recentCalls = db.prepare(
    `SELECT c.callSid, c.userId, c.personaName, c.outcome, c.score, c.startTime,
            u.name AS repName
     FROM calls c JOIN users u ON u.id = c.userId
     WHERE c.userId IN (${placeholders}) AND c.score IS NOT NULL
     ORDER BY c.startTime DESC LIMIT 15`
  ).all(...memberIds).map(r => ({
    ...r,
    score: r.score ? JSON.parse(r.score) : null,
  }));

  const appointmentsThisMonth = appointmentCalls.length;
  const callsThisMonth = completedCalls.length;

  return {
    appointmentRate, callsThisWeek, callsLastWeek,
    appointmentsThisMonth, callsThisMonth,
    teamAvgScore, activeRepsThisWeek, totalReps: memberIds.length,
    dimensionAverages: dims, repStats, recentCalls,
  };
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

// ── Sales Analytics ───────────────────────────────────────────────────────────

function getAnalytics() {
  const now   = Date.now();
  const todayTs = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
  const weekAgo  = now - 7 * 24 * 60 * 60 * 1000;
  const monthTs  = (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.getTime(); })();

  // ── Call counts ──────────────────────────────────────────────────────────────
  const q = (sql, ...p) => db.prepare(sql).get(...p);
  const callsTotal = q('SELECT COUNT(*) AS n FROM calls').n;
  const callsToday = q('SELECT COUNT(*) AS n FROM calls WHERE startTime >= ?', todayTs).n;
  const callsWeek  = q('SELECT COUNT(*) AS n FROM calls WHERE startTime >= ?', weekAgo).n;
  const callsMonth = q('SELECT COUNT(*) AS n FROM calls WHERE startTime >= ?', monthTs).n;

  // ── Outcomes ─────────────────────────────────────────────────────────────────
  const apptsTotal = q("SELECT COUNT(*) AS n FROM calls WHERE outcome = 'Appointment'").n;
  const apptsToday = q("SELECT COUNT(*) AS n FROM calls WHERE outcome = 'Appointment' AND startTime >= ?", todayTs).n;
  const apptsWeek  = q("SELECT COUNT(*) AS n FROM calls WHERE outcome = 'Appointment' AND startTime >= ?", weekAgo).n;
  const apptsMonth = q("SELECT COUNT(*) AS n FROM calls WHERE outcome = 'Appointment' AND startTime >= ?", monthTs).n;

  const compTotal = q("SELECT COUNT(*) AS n FROM calls WHERE outcome IN ('Appointment','HangUp')").n;
  const compToday = q("SELECT COUNT(*) AS n FROM calls WHERE outcome IN ('Appointment','HangUp') AND startTime >= ?", todayTs).n;
  const compWeek  = q("SELECT COUNT(*) AS n FROM calls WHERE outcome IN ('Appointment','HangUp') AND startTime >= ?", weekAgo).n;
  const compMonth = q("SELECT COUNT(*) AS n FROM calls WHERE outcome IN ('Appointment','HangUp') AND startTime >= ?", monthTs).n;

  const rate = (a, b) => b > 0 ? Math.round(a / b * 1000) / 10 : 0;

  // ── Average scores ───────────────────────────────────────────────────────────
  const scoreBase = "SELECT ROUND(AVG(CAST(json_extract(score,'$.overallScore') AS REAL)),1) AS v FROM calls WHERE score IS NOT NULL";
  const avgAll   = q(scoreBase).v || 0;
  const avgWeek  = q(scoreBase + ' AND startTime >= ?', weekAgo).v || 0;
  const avgToday = q(scoreBase + ' AND startTime >= ?', todayTs).v || 0;

  // ── Dimension averages (all-time) ─────────────────────────────────────────────
  const dimRow = db.prepare(`
    SELECT
      ROUND(AVG(CAST(json_extract(score,'$.opening')            AS REAL)),1) AS opening,
      ROUND(AVG(CAST(json_extract(score,'$.rapport')           AS REAL)),1) AS rapport,
      ROUND(AVG(CAST(json_extract(score,'$.infoCapture')       AS REAL)),1) AS infoCapture,
      ROUND(AVG(CAST(json_extract(score,'$.objectionHandling') AS REAL)),1) AS objectionHandling,
      ROUND(AVG(CAST(json_extract(score,'$.appointment')       AS REAL)),1) AS appointment
    FROM calls WHERE score IS NOT NULL
  `).get();

  const dims = {
    opening:            dimRow?.opening            || 0,
    rapport:            dimRow?.rapport            || 0,
    infoCapture:        dimRow?.infoCapture        || 0,
    objectionHandling:  dimRow?.objectionHandling  || 0,
    appointment:        dimRow?.appointment        || 0,
  };
  const sortedDims = Object.entries(dims).sort((a, b) => a[1] - b[1]);
  const topWeakness = sortedDims[0]?.[0]   || null;
  const topStrength = sortedDims.at(-1)?.[0] || null;

  // ── Active reps + headcount ──────────────────────────────────────────────────
  const activeToday = q('SELECT COUNT(DISTINCT userId) AS n FROM calls WHERE startTime >= ? AND userId IS NOT NULL', todayTs).n;
  const activeWeek  = q('SELECT COUNT(DISTINCT userId) AS n FROM calls WHERE startTime >= ? AND userId IS NOT NULL', weekAgo).n;
  const totalReps   = q("SELECT COUNT(*) AS n FROM users WHERE role = 'rep'").n;

  // ── Revenue pipeline (appointments × 25% close × avgDealValue) ───────────────
  const teams = db.prepare("SELECT config FROM teams WHERE config IS NOT NULL AND config != '{}'").all();
  let configuredDealValue = null;
  for (const t of teams) {
    try {
      const cfg = JSON.parse(t.config || '{}');
      if (cfg.avgDealValue) { configuredDealValue = Number(cfg.avgDealValue); break; }
    } catch {}
  }
  const dealValue = configuredDealValue || 35000;
  const pipeline = (appts) => Math.round(appts * 0.25 * dealValue);

  // ── Top performers this week ──────────────────────────────────────────────────
  const topPerformers = db.prepare(`
    SELECT
      u.name,
      ROUND(AVG(CAST(json_extract(c.score,'$.overallScore') AS REAL)),1) AS avg_score,
      COUNT(*)                                                             AS call_count,
      SUM(CASE WHEN c.outcome = 'Appointment' THEN 1 ELSE 0 END)         AS appointments
    FROM calls c
    JOIN users u ON u.id = c.userId
    WHERE c.score IS NOT NULL AND c.startTime >= ? AND c.userId IS NOT NULL
    GROUP BY c.userId
    ORDER BY avg_score DESC
    LIMIT 5
  `).all(weekAgo);

  return {
    generated_at: new Date().toISOString(),
    calls: {
      today:    callsToday,
      week:     callsWeek,
      month:    callsMonth,
      all_time: callsTotal,
    },
    appointments: {
      today:    apptsToday,
      week:     apptsWeek,
      month:    apptsMonth,
      all_time: apptsTotal,
    },
    appointment_rate: {
      today:    rate(apptsToday, compToday),
      week:     rate(apptsWeek,  compWeek),
      month:    rate(apptsMonth, compMonth),
      all_time: rate(apptsTotal, compTotal),
    },
    avg_score: {
      today:    avgToday,
      week:     avgWeek,
      all_time: avgAll,
    },
    revenue_pipeline_usd: {
      today: pipeline(apptsToday),
      week:  pipeline(apptsWeek),
      month: pipeline(apptsMonth),
      avg_deal_value: dealValue,
      close_rate_assumption: 0.25,
    },
    reps: {
      active_today: activeToday,
      active_week:  activeWeek,
      total:        totalReps,
    },
    dimension_averages: { ...dims, max_per_dimension: 20 },
    top_weakness: topWeakness,
    top_strength: topStrength,
    top_performers_this_week: topPerformers,
  };
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

// ── Leads ────────────────────────────────────────────────────────────────────

function createLead({ contactName, dealershipName, phone, email, zip, repCount, message }) {
  const stmt = db.prepare(
    'INSERT INTO leads (contactName, dealershipName, phone, email, zip, repCount, message, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(contactName, dealershipName, phone || null, email || null, zip || null, repCount ? parseInt(repCount, 10) : null, message || null, Date.now());
  return db.prepare('SELECT * FROM leads WHERE id = ?').get(result.lastInsertRowid);
}

function getLeads(limit = 100) {
  return db.prepare('SELECT * FROM leads ORDER BY createdAt DESC LIMIT ?').all(limit);
}

// ── Recorded calls ────────────────────────────────────────────────────────────

function parseRecordedCall(row) {
  if (!row) return null;
  return { ...row, grade: row.grade ? JSON.parse(row.grade) : null };
}

function createRecordedCall(data) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO recorded_calls
      (callSid, type, teamId, userId, repName, recordingSid, recordingUrl,
       duration, startTime, transcript, grade, emailSent, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);
  const result = stmt.run(
    data.callSid, data.type || 'bot', data.teamId || null, data.userId || null,
    data.repName || null, data.recordingSid || null, data.recordingUrl || null,
    data.duration || null, data.startTime || Date.now(),
    data.transcript || null, data.grade ? JSON.stringify(data.grade) : null,
    Date.now()
  );
  return parseRecordedCall(db.prepare('SELECT * FROM recorded_calls WHERE id = ?').get(result.lastInsertRowid));
}

function updateRecordedCall(id, updates) {
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE recorded_calls SET ${fields} WHERE id = ?`).run(...Object.values(updates), id);
  return parseRecordedCall(db.prepare('SELECT * FROM recorded_calls WHERE id = ?').get(id));
}

function getRecordedCallById(id) {
  return parseRecordedCall(db.prepare('SELECT * FROM recorded_calls WHERE id = ?').get(id));
}

function getRecordedCallBySid(callSid) {
  return parseRecordedCall(db.prepare('SELECT * FROM recorded_calls WHERE callSid = ?').get(callSid));
}

function getRecordedCallsByTeam(teamId, opts = {}) {
  const { startDate, endDate, minScore, maxScore, limit = 100 } = opts;
  let query = 'SELECT * FROM recorded_calls WHERE teamId = ?';
  const params = [teamId];
  if (startDate) { query += ' AND startTime >= ?'; params.push(new Date(startDate).getTime()); }
  if (endDate) { query += ' AND startTime <= ?'; params.push(new Date(endDate).getTime() + 86399999); }
  if (minScore !== undefined && minScore !== '') {
    query += " AND CAST(json_extract(grade, '$.overallScore') AS INTEGER) >= ?";
    params.push(parseInt(minScore, 10));
  }
  if (maxScore !== undefined && maxScore !== '') {
    query += " AND CAST(json_extract(grade, '$.overallScore') AS INTEGER) <= ?";
    params.push(parseInt(maxScore, 10));
  }
  query += ' ORDER BY startTime DESC LIMIT ?';
  params.push(limit);
  return db.prepare(query).all(...params).map(parseRecordedCall);
}

function getTeamByTrackingNumber(number) {
  return db.prepare("SELECT * FROM teams WHERE json_extract(config, '$.trackingNumber') = ?").get(number) || null;
}

// ── Gauntlet scores ───────────────────────────────────────────────────────────

function saveGauntletScore(userId, challengeId, score) {
  db.prepare(
    'INSERT INTO gauntlet_scores (userId, challengeId, score, createdAt) VALUES (?, ?, ?, ?)'
  ).run(userId, challengeId, score, Date.now());
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

function getLeaderboard(limit = 20, teamId = null) {
  const teamFilter = teamId ? 'AND u.team_id = ?' : '';

  // Composite: 0.70 * avgCallScore + 0.25 * avgGauntletScore + 0.25 * MIN(20, modulesCompleted)
  const sql = `
    SELECT
      u.id,
      u.name,
      u.team_id,
      COUNT(DISTINCT CASE WHEN c.score IS NOT NULL THEN c.callSid END) AS totalCalls,
      ROUND(AVG(CASE WHEN c.score IS NOT NULL THEN CAST(json_extract(c.score, '$.overallScore') AS REAL) END), 1) AS avgCallScore,
      ROUND(AVG(gs.score), 1) AS avgGauntletScore,
      COUNT(DISTINCT CASE WHEN mc.passed = 1 THEN mc.moduleId END) AS modulesCompleted,
      ROUND(
        COALESCE(AVG(CASE WHEN c.score IS NOT NULL THEN CAST(json_extract(c.score, '$.overallScore') AS REAL) END), 0) * 0.70
        + COALESCE(AVG(gs.score), 0) * 0.25
        + MIN(20, COUNT(DISTINCT CASE WHEN mc.passed = 1 THEN mc.moduleId END)) * 0.25
      , 1) AS compositeScore
    FROM users u
    LEFT JOIN calls c ON c.userId = u.id
    LEFT JOIN gauntlet_scores gs ON gs.userId = u.id
    LEFT JOIN module_completions mc ON mc.userId = u.id
    WHERE 1=1 ${teamFilter}
    GROUP BY u.id
    ORDER BY compositeScore DESC, totalCalls DESC
    LIMIT ?
  `;
  return db.prepare(sql).all(...(teamId ? [teamId, limit] : [limit]));
}

// ── Password Resets ───────────────────────────────────────────────────────────

const crypto = require('crypto');

function createResetToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
  db.prepare('DELETE FROM password_resets WHERE userId = ?').run(userId);
  db.prepare('INSERT INTO password_resets (token, userId, expiresAt) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  return token;
}

function validateResetToken(token) {
  const row = db.prepare('SELECT * FROM password_resets WHERE token = ? AND usedAt IS NULL').get(token);
  if (!row) return null;
  if (Date.now() > row.expiresAt) return null;
  return row;
}

function consumeResetToken(token) {
  db.prepare('UPDATE password_resets SET usedAt = ? WHERE token = ?').run(Date.now(), token);
}

module.exports = {
  createUser, updateUser, getUserById, getUserByEmail, getSecurityQuestionByEmail,
  createTeam, getTeamByCode, getTeamByManagerId, getTeamById,
  getTeamMembers, getTeamConfig, setTeamConfig, getTeamAnalytics,
  getCall, setCall, updateCall, getAllCalls,
  completeModule, getProgress,
  saveGauntletScore, getLeaderboard,
  getAnalytics,
  createLead, getLeads,
  createRecordedCall, updateRecordedCall, getRecordedCallById, getRecordedCallBySid, getRecordedCallsByTeam,
  getTeamByTrackingNumber,
  createResetToken, validateResetToken, consumeResetToken,
};
