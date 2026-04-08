'use strict';

// ── AUTH ──────────────────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('freshup_token') || null;
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('freshup_user') || 'null');
  } catch { return null; }
}

function setAuth(token, user) {
  localStorage.setItem('freshup_token', token);
  localStorage.setItem('freshup_user', JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem('freshup_token');
  localStorage.removeItem('freshup_user');
}

// ── API ───────────────────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 401) {
      clearAuth();
      navigate('/login');
      throw new Error('Session expired. Please log in again.');
    }
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ── ROUTER ────────────────────────────────────────────────────────────────────

const app = document.getElementById('app');
function getRoute() {
  const hash = location.hash || '#/';
  return hash.slice(1) || '/';
}

function navigate(path) {
  location.hash = '#' + path;
}

window.addEventListener('hashchange', render);
window.addEventListener('load', render);

window.addEventListener('scroll', () => {
  document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 4);
}, { passive: true });

function render() {
  const path = getRoute();
  const token = getToken();

  const needsAuth = path === '/' || path === '/start' || path === '/history' || path.startsWith('/call/');
  if (needsAuth && !token) {
    navigate('/login');
    return;
  }

  updateNav(path);

  if (path === '/') return renderDashboard();
  if (path === '/login') return renderLogin();
  if (path === '/register') return renderRegister();
  if (path === '/start') return renderStart();
  if (path === '/history') return renderHistory();
  if (path === '/personas') return renderPersonas();
  if (path === '/courses') return renderCourses();
  if (path === '/leaderboard') return renderLeaderboard();
  if (path.startsWith('/call/')) return renderCallResult(path.slice('/call/'.length));

  const courseModuleMatch = path.match(/^\/courses\/([^/]+)\/([^/]+)$/);
  if (courseModuleMatch) return renderModule(courseModuleMatch[1], courseModuleMatch[2]);
  const courseMatch = path.match(/^\/courses\/([^/]+)$/);
  if (courseMatch) return renderCourse(courseMatch[1]);

  app.innerHTML = '<div class="empty-state">Page not found.</div>';
}

function updateNav(path) {
  const user = getUser();
  const linksEl = document.getElementById('nav-links');
  const authEl = document.getElementById('nav-auth');
  if (!linksEl || !authEl) return;

  function navLink(href, key, label) {
    const active = (
      (key === 'dashboard' && path === '/') ||
      (key === 'courses' && (path === '/courses' || path.startsWith('/courses/'))) ||
      (key === 'start' && path === '/start') ||
      (key === 'history' && path === '/history') ||
      (key === 'leaderboard' && path === '/leaderboard')
    ) ? 'active' : '';
    return `<a href="#${href}" data-nav="${key}" class="nav-link ${active}">${label}</a>`;
  }

  if (user) {
    linksEl.innerHTML = `
      ${navLink('/', 'dashboard', 'Dashboard')}
      ${navLink('/courses', 'courses', 'Courses')}
      ${navLink('/start', 'start', 'Practice')}
      ${navLink('/history', 'history', 'History')}
      ${navLink('/leaderboard', 'leaderboard', 'Leaderboard')}
    `;
    authEl.innerHTML = `
      <span class="nav-user">${escHtml(user.name)}</span>
      <button class="btn btn-ghost btn-sm" id="logout-btn">Log Out</button>
    `;
    document.getElementById('logout-btn').addEventListener('click', () => {
      clearAuth();
      navigate('/login');
    });
  } else {
    linksEl.innerHTML = '';
    authEl.innerHTML = `
      <a href="#/login" class="btn btn-ghost btn-sm">Log In</a>
      <a href="#/register" class="btn btn-primary btn-sm">Sign Up</a>
    `;
  }
}

// ── TOAST ─────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'default') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3500);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function initials(name) {
  return String(name || '').split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}

function avatar(name, size) {
  return `<div class="avatar${size ? ' ' + size : ''}">${initials(name)}</div>`;
}

function difficultyBadge(d) {
  const cls = { Easy: 'badge-easy', Medium: 'badge-medium', Hard: 'badge-hard' }[d] || 'badge-medium';
  return `<span class="badge ${cls}">${escHtml(d)}</span>`;
}

function outcomePill(o) {
  if (!o) return '<span class="text-muted">—</span>';
  return `<span class="outcome-pill outcome-${o}">${escHtml(o)}</span>`;
}

function scoreColor(s) {
  if (s >= 75) return 'var(--success)';
  if (s >= 50) return 'var(--warning)';
  return 'var(--error)';
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function formatDuration(s) {
  if (s == null) return '—';
  const m = Math.floor(s / 60), sec = s % 60;
  return m ? `${m}m ${sec}s` : `${sec}s`;
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────

function renderLogin() {
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-brand">FreshUp<span> AI</span></div>
        <h2>Welcome back</h2>
        <p class="subtitle">Sign in to your account</p>
        <form id="login-form">
          <div class="form-group">
            <label for="login-email">Email</label>
            <input type="email" id="login-email" placeholder="you@dealership.com" required autocomplete="email" />
          </div>
          <div class="form-group">
            <label for="login-password">Password</label>
            <input type="password" id="login-password" placeholder="••••••••" required autocomplete="current-password" />
          </div>
          <div id="auth-error" class="auth-error" style="display:none"></div>
          <button type="submit" class="btn btn-primary btn-full" id="login-btn">Sign In</button>
        </form>
        <p class="auth-switch">Don't have an account? <a href="#/register" class="link">Sign Up</a></p>
      </div>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const errEl = document.getElementById('auth-error');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    errEl.style.display = 'none';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: document.getElementById('login-email').value.trim(),
          password: document.getElementById('login-password').value,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }
      const data = await res.json();
      setAuth(data.token, data.user);
      navigate('/');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });
}

// ── REGISTER ──────────────────────────────────────────────────────────────────

function renderRegister() {
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-brand">FreshUp<span> AI</span></div>
        <h2>Create account</h2>
        <p class="subtitle">Start your sales training journey</p>
        <form id="register-form">
          <div class="form-group">
            <label for="reg-name">Full Name</label>
            <input type="text" id="reg-name" placeholder="Alex Johnson" required autocomplete="name" />
          </div>
          <div class="form-group">
            <label for="reg-email">Email</label>
            <input type="email" id="reg-email" placeholder="you@dealership.com" required autocomplete="email" />
          </div>
          <div class="form-group">
            <label for="reg-password">Password</label>
            <input type="password" id="reg-password" placeholder="At least 6 characters" required minlength="6" autocomplete="new-password" />
          </div>
          <div id="auth-error" class="auth-error" style="display:none"></div>
          <button type="submit" class="btn btn-primary btn-full" id="register-btn">Create Account</button>
        </form>
        <p class="auth-switch">Already have an account? <a href="#/login" class="link">Sign In</a></p>
      </div>
    </div>
  `;

  document.getElementById('register-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('register-btn');
    const errEl = document.getElementById('auth-error');
    btn.disabled = true;
    btn.textContent = 'Creating account…';
    errEl.style.display = 'none';

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('reg-name').value.trim(),
          email: document.getElementById('reg-email').value.trim(),
          password: document.getElementById('reg-password').value,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }
      const data = await res.json();
      setAuth(data.token, data.user);
      navigate('/');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  });
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────

async function renderDashboard() {
  app.innerHTML = '<div class="loading">Loading…</div>';
  const user = getUser();
  let history = [], progress = [];
  try { history = await api('/api/call/history'); } catch (e) { /* empty */ }
  try { progress = await api('/api/courses/progress'); } catch (e) { /* empty */ }

  const total = history.length;
  const scored = history.filter(c => c.score && c.score.overallScore != null);
  const avgScore = scored.length
    ? Math.round(scored.reduce((s, c) => s + c.score.overallScore, 0) / scored.length)
    : null;
  const bestScore = scored.length
    ? Math.max(...scored.map(c => c.score.overallScore))
    : null;
  const modulesCompleted = progress.length;
  const recent = history.slice(0, 8);

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Dashboard</h1>
        <p class="subtitle">Welcome back, ${escHtml(user ? user.name.split(' ')[0] : '')}!</p>
      </div>
      <a class="btn btn-primary" href="#/start">+ Start Call</a>
    </div>

    <div class="stats-strip">
      <div class="stat-card">
        <div class="stat-val">${total}</div>
        <div class="stat-lbl">Total Calls</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${avgScore != null ? avgScore : '—'}</div>
        <div class="stat-lbl">Avg Score</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${bestScore != null ? bestScore : '—'}</div>
        <div class="stat-lbl">Best Score</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${modulesCompleted}</div>
        <div class="stat-lbl">Modules Done</div>
      </div>
    </div>

    <div class="section-header">
      <h2>Recent Calls</h2>
      ${total > 8 ? '<a href="#/history" class="link-sm">View all →</a>' : ''}
    </div>

    ${recent.length === 0
      ? '<div class="empty-state">No calls yet. <a class="link" href="#/start">Start your first training call →</a></div>'
      : `<div class="table-wrap"><table>
          <thead><tr>
            <th>Persona</th><th>Outcome</th><th>Score</th><th>Duration</th><th>Date</th><th></th>
          </tr></thead>
          <tbody>${recent.map(callRow).join('')}</tbody>
        </table></div>`
    }
  `;
}

function callRow(c) {
  const scoreVal = c.score && c.score.overallScore != null ? c.score.overallScore : null;
  const scoreHtml = scoreVal != null
    ? `<span class="score-num" style="color:${scoreColor(scoreVal)}">${scoreVal}</span>`
    : '<span class="text-muted">—</span>';
  return `<tr>
    <td>
      <div class="cell-with-avatar">
        ${avatar(c.personaName)}
        <strong>${escHtml(c.personaName || '—')}</strong>
      </div>
    </td>
    <td>${outcomePill(c.outcome)}</td>
    <td>${scoreHtml}</td>
    <td class="text-muted">${formatDuration(c.duration)}</td>
    <td class="text-subtle text-sm">${formatDate(c.timestamp)}</td>
    <td><a href="#/call/${c.callSid}" class="btn btn-secondary btn-sm">View</a></td>
  </tr>`;
}

// ── START CALL ────────────────────────────────────────────────────────────────

let selectedPersonaId = null;

async function renderStart() {
  app.innerHTML = '<div class="loading">Loading personas…</div>';
  let personas = [];
  try { personas = await api('/api/personas'); } catch (e) {
    app.innerHTML = '<div class="empty-state">Failed to load personas.</div>';
    return;
  }

  const preselectId = sessionStorage.getItem('preselect_persona');
  selectedPersonaId = preselectId || null;
  if (preselectId) sessionStorage.removeItem('preselect_persona');

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Practice Call</h1>
        <p class="subtitle">Select a persona and enter your phone number to begin.</p>
      </div>
    </div>

    <h2 class="section-label">Select Persona</h2>
    <div class="persona-grid" id="persona-grid">
      ${personas.map(p => personaSelectCard(p, p.id === selectedPersonaId)).join('')}
    </div>

    <div class="card call-form-card">
      <div class="form-group">
        <label for="phone">Your Phone Number</label>
        <p class="input-hint">You will receive the call at this number</p>
        <input type="tel" id="phone" placeholder="+1 555 000 0000" autocomplete="tel" />
      </div>
      <button class="btn btn-primary btn-full" id="start-btn" disabled>Start Call</button>
    </div>
  `;

  document.getElementById('persona-grid').addEventListener('click', e => {
    const card = e.target.closest('.persona-card');
    if (!card) return;
    document.querySelectorAll('.persona-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedPersonaId = card.dataset.id;
    updateStartBtn();
  });

  document.getElementById('phone').addEventListener('input', updateStartBtn);

  if (selectedPersonaId) {
    const card = document.querySelector(`.persona-card[data-id="${selectedPersonaId}"]`);
    if (card) card.classList.add('selected');
    updateStartBtn();
  }

  document.getElementById('start-btn').addEventListener('click', async () => {
    const phone = document.getElementById('phone').value.trim();
    if (!phone || !selectedPersonaId) return;
    const btn = document.getElementById('start-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Dialing…';

    try {
      const data = await api('/api/call/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone, personaId: selectedPersonaId }),
      });
      showToast(`Calling you now! Persona: ${data.persona.name}`, 'success');
      setTimeout(() => navigate(`/call/${data.callSid}`), 800);
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Start Call';
      updateStartBtn();
    }
  });
}

function updateStartBtn() {
  const phone = (document.getElementById('phone') || {}).value || '';
  const btn = document.getElementById('start-btn');
  if (btn) btn.disabled = !phone.trim() || !selectedPersonaId;
}

function personaSelectCard(p, selected) {
  return `
    <button class="persona-card${selected ? ' selected' : ''}" data-id="${p.id}">
      <div class="persona-card-top">
        ${avatar(p.name)}
        ${difficultyBadge(p.difficulty)}
      </div>
      <h3>${escHtml(p.name)}</h3>
      <div class="persona-occupation">${escHtml(p.occupation)}</div>
      <div class="persona-mood">${escHtml(p.mood)}</div>
      <div class="intent-bar-wrap">
        <div class="intent-label"><span>Intent</span><span>${p.intentScore}/10</span></div>
        <div class="intent-bar"><div class="intent-fill" style="width:${p.intentScore * 10}%"></div></div>
      </div>
    </button>
  `;
}

// ── HISTORY ───────────────────────────────────────────────────────────────────

async function renderHistory() {
  app.innerHTML = '<div class="loading">Loading…</div>';
  let history = [];
  try { history = await api('/api/call/history'); } catch (e) {
    app.innerHTML = '<div class="empty-state">Failed to load history.</div>';
    return;
  }

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Call History</h1>
        <p class="subtitle">${history.length} call${history.length !== 1 ? 's' : ''} recorded</p>
      </div>
      <a class="btn btn-primary" href="#/start">+ Start Call</a>
    </div>
    ${history.length === 0
      ? '<div class="empty-state">No calls yet. <a class="link" href="#/start">Start your first training call →</a></div>'
      : `<div class="table-wrap"><table>
          <thead><tr><th>Persona</th><th>Outcome</th><th>Score</th><th>Duration</th><th>Date</th><th></th></tr></thead>
          <tbody>${history.map(callRow).join('')}</tbody>
        </table></div>`
    }
  `;
}

// ── CALL RESULTS ──────────────────────────────────────────────────────────────

function renderCallResult(callSid) {
  app.innerHTML = `
    <a href="#/history" class="back-link">← Back to history</a>
    <div id="result-content"><div class="loading">Loading call results…</div></div>
  `;
  pollResults(callSid);
}

let pollTimer = null;

function pollResults(callSid) {
  clearTimeout(pollTimer);
  api(`/webhook/results/${callSid}`).then(data => {
    renderResultData(data, callSid);
    if (!data.score) {
      pollTimer = setTimeout(() => pollResults(callSid), 3000);
    } else {
      checkPendingModule(data, callSid);
    }
  }).catch(() => {
    const el = document.getElementById('result-content');
    if (el) el.innerHTML = '<div class="empty-state">Call not found or still in progress.</div>';
  });
}

async function checkPendingModule(data, callSid) {
  const pending = sessionStorage.getItem('pendingModule');
  if (!pending || !data.score) return;
  sessionStorage.removeItem('pendingModule');

  let mod;
  try { mod = JSON.parse(pending); } catch { return; }

  const overallScore = data.score.overallScore;
  if (overallScore == null || overallScore < mod.minScore) return;

  try {
    await api(`/api/courses/${mod.courseId}/modules/${mod.moduleId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callSid, score: overallScore, passed: true }),
    });

    const el = document.getElementById('result-content');
    if (el) {
      const banner = document.createElement('div');
      banner.className = 'module-passed-banner';
      banner.innerHTML = `
        <div class="banner-check">✓</div>
        <div>
          <strong>Module Passed!</strong>
          <div>Score ${overallScore} met the ${mod.minScore} required. <a href="#/courses/${mod.courseId}" class="link">Back to course →</a></div>
        </div>
      `;
      el.prepend(banner);
    }
  } catch (err) {
    console.error('[checkPendingModule] error:', err);
  }
}

function renderResultData(data, callSid) {
  const el = document.getElementById('result-content');
  if (!el) return;

  const score = data.score;
  const history = data.history || [];

  el.innerHTML = `
    <div class="result-header">
      ${avatar(data.personaName, 'avatar-lg')}
      <div>
        <h1>${escHtml(data.personaName || 'Unknown Persona')}</h1>
        <p class="subtitle">${outcomePill(data.outcome)}&nbsp;·&nbsp;${formatDate(data.startTime)}</p>
      </div>
    </div>

    ${score ? `
      <div class="overall-score-wrap">
        <div class="score-big">${score.overallScore}</div>
        <div class="score-big-lbl">Overall Score</div>
      </div>

      <h2 class="section-label">Dimension Scores</h2>
      <div class="score-grid">
        ${['rapport', 'discovery', 'objections', 'closing'].map(dim => `
          <div class="score-item">
            <div class="score-item-header">
              <span>${dim.charAt(0).toUpperCase() + dim.slice(1)}</span>
              <span class="score-num" style="color:${scoreColor(score[dim])}">${score[dim]}</span>
            </div>
            <div class="score-bar">
              <div class="score-fill" style="width:${score[dim]}%;background:${scoreColor(score[dim])}"></div>
            </div>
          </div>
        `).join('')}
      </div>

      <h2 class="section-label">Feedback</h2>
      <div class="feedback-box">${escHtml(score.feedback || '—')}</div>
    ` : `
      <div class="analyzing-card">
        <span class="spinner"></span>
        <span>Analyzing call… results will appear shortly.</span>
      </div>
    `}

    ${history.length > 0 ? `
      <h2 class="section-label">Transcript</h2>
      <div class="transcript">
        ${history.map(msg => `
          <div class="msg ${msg.role === 'user' ? 'rep' : 'customer'}">
            <div class="msg-who">${msg.role === 'user' ? 'Sales Rep' : 'Customer'}</div>
            <div class="msg-text">${escHtml(msg.content.replace(/\[HANG_UP\]/g, '').replace(/\[APPOINTMENT_SET\]/g, '').trim())}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
}

// ── PERSONAS ──────────────────────────────────────────────────────────────────

async function renderPersonas() {
  app.innerHTML = '<div class="loading">Loading personas…</div>';
  let personas = [];
  try { personas = await api('/api/personas'); } catch (e) {
    app.innerHTML = '<div class="empty-state">Failed to load personas.</div>';
    return;
  }

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Personas</h1>
        <p class="subtitle">${personas.length} customer profiles available</p>
      </div>
      <a href="#/start" class="btn btn-primary">+ Start Call</a>
    </div>
    <div class="persona-grid">
      ${personas.map(personaDetailCard).join('')}
    </div>
  `;
}

function personaDetailCard(p) {
  const traits = (p.personalityTraits || []).slice(0, 4);
  return `
    <div class="card persona-detail-card">
      <div class="persona-detail-top">
        ${avatar(p.name, 'avatar-lg')}
        ${difficultyBadge(p.difficulty)}
      </div>
      <h3 class="persona-detail-name">${escHtml(p.name)}</h3>
      <div class="persona-detail-occ">${escHtml(p.occupation)}${p.age ? ', ' + p.age : ''}</div>
      <div class="persona-detail-mood">${escHtml(p.mood)}</div>
      <div class="intent-bar-wrap">
        <div class="intent-label"><span>Purchase Intent</span><span>${p.intentScore}/10</span></div>
        <div class="intent-bar"><div class="intent-fill" style="width:${p.intentScore * 10}%"></div></div>
      </div>
      ${traits.length ? `<div class="trait-chips">${traits.map(t => `<span class="trait-chip">${escHtml(t)}</span>`).join('')}</div>` : ''}
      ${p.background ? `<p class="persona-bg">${escHtml(p.background)}</p>` : ''}
      <div class="persona-detail-action">
        <button class="btn btn-secondary btn-sm" onclick="preselectAndStart('${p.id}')">Train with ${escHtml(p.name.split(' ')[0])}</button>
      </div>
    </div>
  `;
}

function preselectAndStart(personaId) {
  sessionStorage.setItem('preselect_persona', personaId);
  navigate('/start');
}

// ── COURSES ───────────────────────────────────────────────────────────────────

async function renderCourses() {
  app.innerHTML = '<div class="loading">Loading courses…</div>';
  let courses = [], progress = [];
  try {
    [courses, progress] = await Promise.all([
      api('/api/courses'),
      getToken() ? api('/api/courses/progress').catch(() => []) : Promise.resolve([]),
    ]);
  } catch (e) {
    app.innerHTML = '<div class="empty-state">Failed to load courses.</div>';
    return;
  }

  const progressSet = new Set(progress);

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Training Courses</h1>
        <p class="subtitle">Master dealership sales with structured training</p>
      </div>
    </div>
    <div class="courses-grid">
      ${courses.map(c => courseCard(c, progressSet)).join('')}
    </div>
  `;
}

function courseCard(c, progressSet) {
  const total = c.modules ? c.modules.length : 0;
  const done = c.modules ? c.modules.filter(m => progressSet.has(m.id)).length : 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const levelClass = { Beginner: 'level-beginner', Intermediate: 'level-intermediate', Advanced: 'level-advanced' }[c.level] || 'level-beginner';

  return `
    <a href="#/courses/${c.id}" class="course-card" style="--course-color:${c.color || '#3b82f6'}">
      <div class="course-card-header">
        <span class="course-level ${levelClass}">${escHtml(c.level)}</span>
        <span class="course-progress-label">${done}/${total}</span>
      </div>
      <h3 class="course-title">${escHtml(c.title)}</h3>
      <p class="course-desc">${escHtml(c.description)}</p>
      <div class="course-progress-bar">
        <div class="course-progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="course-footer">
        <span>${total} modules</span>
        <span class="course-cta">View Course →</span>
      </div>
    </a>
  `;
}

// ── COURSE DETAIL ─────────────────────────────────────────────────────────────

async function renderCourse(courseId) {
  app.innerHTML = '<div class="loading">Loading course…</div>';
  let course, progress = [];
  try {
    [course, progress] = await Promise.all([
      api(`/api/courses/${courseId}`),
      getToken() ? api('/api/courses/progress').catch(() => []) : Promise.resolve([]),
    ]);
  } catch (e) {
    app.innerHTML = '<div class="empty-state">Course not found.</div>';
    return;
  }

  const progressSet = new Set(progress);
  const total = course.modules.length;
  const done = course.modules.filter(m => progressSet.has(m.id)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  app.innerHTML = `
    <a href="#/courses" class="back-link">← All Courses</a>
    <div class="course-detail-header" style="--course-color:${course.color || '#3b82f6'}">
      <div class="course-detail-meta">
        <span class="course-level level-${(course.level || '').toLowerCase()}">${escHtml(course.level)}</span>
        <span class="course-progress-label">${done}/${total} modules complete</span>
      </div>
      <h1>${escHtml(course.title)}</h1>
      <p class="subtitle">${escHtml(course.description)}</p>
      <div class="course-progress-bar wide">
        <div class="course-progress-fill" style="width:${pct}%"></div>
      </div>
    </div>

    <div class="module-list">
      ${course.modules.map((m, i) => {
        const passed = progressSet.has(m.id);
        const unlocked = i === 0 || progressSet.has(course.modules[i - 1].id);
        return moduleListItem(m, i + 1, passed, unlocked, courseId);
      }).join('')}
    </div>
  `;
}

function moduleListItem(m, num, passed, unlocked, courseId) {
  const statusIcon = passed ? '✓' : unlocked ? String(num) : '🔒';
  const statusClass = passed ? 'mod-passed' : unlocked ? 'mod-unlocked' : 'mod-locked';
  const href = unlocked ? `#/courses/${courseId}/${m.id}` : '#';

  return `
    <a href="${href}" class="module-item ${statusClass}" ${!unlocked ? 'onclick="return false"' : ''}>
      <div class="mod-num ${passed ? 'mod-num-passed' : ''}">${statusIcon}</div>
      <div class="mod-info">
        <div class="mod-title">${escHtml(m.title)}</div>
        <div class="mod-objective">${escHtml(m.objective)}</div>
      </div>
      <div class="mod-status">
        ${m.challenge ? `<span class="challenge-badge">${escHtml(m.challenge.label || 'Challenge')}</span>` : ''}
        ${passed ? '<span class="passed-label">Passed</span>' : ''}
      </div>
    </a>
  `;
}

// ── MODULE ────────────────────────────────────────────────────────────────────

async function renderModule(courseId, moduleId) {
  app.innerHTML = '<div class="loading">Loading module…</div>';
  let course;
  try { course = await api(`/api/courses/${courseId}`); } catch (e) {
    app.innerHTML = '<div class="empty-state">Module not found.</div>';
    return;
  }

  const mod = course.modules.find(m => m.id === moduleId);
  if (!mod) {
    app.innerHTML = '<div class="empty-state">Module not found.</div>';
    return;
  }

  app.innerHTML = `
    <a href="#/courses/${courseId}" class="back-link">← ${escHtml(course.title)}</a>
    <div class="module-header">
      <h1>${escHtml(mod.title)}</h1>
      <p class="subtitle">${escHtml(mod.objective)}</p>
    </div>

    <div class="lesson-card card">
      ${mod.lesson || '<p>No lesson content available.</p>'}
    </div>

    ${mod.challenge ? `
      <div class="challenge-card card">
        <h3>Challenge: ${escHtml(mod.challenge.label || 'Practice Call')}</h3>
        <p>Score <strong>${mod.challenge.minScore}+</strong> to complete this module.</p>
        <button class="btn btn-primary" onclick="startChallenge('${escHtml(courseId)}', '${escHtml(moduleId)}', '${escHtml(mod.challenge.personaId)}', ${mod.challenge.minScore})">
          Take Challenge →
        </button>
      </div>
    ` : ''}
  `;
}

function startChallenge(courseId, moduleId, personaId, minScore) {
  sessionStorage.setItem('pendingModule', JSON.stringify({ courseId, moduleId, minScore }));
  sessionStorage.setItem('preselect_persona', personaId);
  navigate('/start');
}

// ── LEADERBOARD ───────────────────────────────────────────────────────────────

async function renderLeaderboard() {
  app.innerHTML = '<div class="loading">Loading leaderboard…</div>';
  let rows = [];
  try { rows = await api('/api/courses/leaderboard/top'); } catch (e) {
    app.innerHTML = '<div class="empty-state">Failed to load leaderboard.</div>';
    return;
  }

  const user = getUser();

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Leaderboard</h1>
        <p class="subtitle">Top performers across all training calls</p>
      </div>
    </div>
    <div class="table-wrap">
      <table class="leaderboard-table">
        <thead><tr>
          <th>Rank</th><th>Name</th><th>Avg Score</th><th>Best Score</th><th>Total Calls</th><th>Modules</th>
        </tr></thead>
        <tbody>
          ${rows.length === 0
            ? '<tr><td colspan="6" class="empty-row">No data yet — start training!</td></tr>'
            : rows.map(r => leaderboardRow(r, user)).join('')
          }
        </tbody>
      </table>
    </div>
  `;
}

function leaderboardRow(r, user) {
  const isMe = user && user.id === r.id;
  const rankDisplay = r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank;
  const avgDisplay = r.avgScore != null ? r.avgScore : '—';
  const bestDisplay = r.bestScore != null ? r.bestScore : '—';

  return `
    <tr class="${isMe ? 'leaderboard-me' : ''}">
      <td class="rank-cell">${rankDisplay}</td>
      <td>
        <div class="cell-with-avatar">
          ${avatar(r.name)}
          <span>${escHtml(r.name)}${isMe ? ' <span class="you-badge">You</span>' : ''}</span>
        </div>
      </td>
      <td class="score-num" style="color:${r.avgScore ? scoreColor(r.avgScore) : 'var(--text-muted)'}">${avgDisplay}</td>
      <td class="score-num" style="color:${r.bestScore ? scoreColor(r.bestScore) : 'var(--text-muted)'}">${bestDisplay}</td>
      <td>${r.totalCalls}</td>
      <td>${r.modulesCompleted}</td>
    </tr>
  `;
}
