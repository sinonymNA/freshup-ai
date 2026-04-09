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

// ── MOBILE NAV DRAWER ────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('nav-toggle');
  const drawer = document.getElementById('nav-drawer');
  if (!toggle || !drawer) return;

  toggle.addEventListener('click', () => {
    const open = drawer.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });

  // Close drawer when clicking a link inside it or outside the nav
  drawer.addEventListener('click', e => {
    if (e.target.closest('a, button')) drawer.classList.remove('open');
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#nav') && !e.target.closest('#nav-drawer')) {
      drawer.classList.remove('open');
    }
  });
});

function render() {
  const path = getRoute();
  const token = getToken();

  // Root: show landing page for guests, dashboard for logged-in users
  if (path === '/') {
    updateNav(path);
    return token ? renderDashboard() : renderLanding();
  }

  const needsAuth = path === '/start' || path === '/history' || path === '/team'
    || path.startsWith('/call/') || path.startsWith('/team/');
  if (needsAuth && !token) {
    navigate('/login');
    return;
  }

  updateNav(path);

  if (path === '/login') return renderLogin();
  if (path === '/register') return renderRegister();
  if (path === '/start') return renderStart();
  if (path === '/history') return renderHistory();
  if (path === '/personas') return renderPersonas();
  if (path === '/courses') return renderCourses();
  if (path === '/leaderboard') return renderLeaderboard();
  if (path === '/team') return renderTeam();
  if (path.startsWith('/call/')) return renderCallResult(path.slice('/call/'.length));
  if (path.startsWith('/team/rep/')) return renderRepDetail(path.slice('/team/rep/'.length));

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
      (key === 'leaderboard' && path === '/leaderboard') ||
      (key === 'team' && (path === '/team' || path.startsWith('/team/')))
    ) ? 'active' : '';
    return `<a href="#${href}" data-nav="${key}" class="nav-link ${active}">${label}</a>`;
  }

  const drawer = document.getElementById('nav-drawer');

  if (user) {
    const isManager = user.role === 'manager';
    const links = `
      ${navLink('/', 'dashboard', 'Dashboard')}
      ${navLink('/start', 'start', 'Call Arena')}
      ${isManager ? navLink('/team', 'team', 'My Team') : navLink('/history', 'history', 'History')}
      ${navLink('/leaderboard', 'leaderboard', 'Leaderboard')}
      ${navLink('/courses', 'courses', 'Courses')}
    `;
    linksEl.innerHTML = links;
    authEl.innerHTML = `
      <span class="nav-user">${escHtml(user.name)}</span>
      <button class="btn btn-ghost btn-sm" id="logout-btn">Log Out</button>
    `;
    document.getElementById('logout-btn').addEventListener('click', () => {
      clearAuth();
      navigate('/login');
    });
    if (drawer) {
      drawer.innerHTML = links + `
        <span class="nav-user">${escHtml(user.name)}</span>
        <button class="btn btn-ghost btn-sm" id="drawer-logout-btn">Log Out</button>
      `;
      drawer.querySelector('#drawer-logout-btn')?.addEventListener('click', () => {
        clearAuth();
        navigate('/login');
        drawer.classList.remove('open');
      });
    }
  } else {
    linksEl.innerHTML = '';
    authEl.innerHTML = `
      <a href="#/login" class="btn btn-ghost btn-sm">Log In</a>
      <a href="#/register" class="btn btn-primary btn-sm">Sign Up</a>
    `;
    if (drawer) {
      drawer.innerHTML = `
        <a href="#/login" class="nav-link">Log In</a>
        <a href="#/register" class="nav-link">Sign Up</a>
      `;
    }
  }
  // Close drawer on every nav update (page change)
  drawer?.classList.remove('open');
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

// ── LANDING PAGE ──────────────────────────────────────────────────────────────

function renderLanding() {
  app.innerHTML = `
    <div class="landing">

      <div class="landing-hero">
        <div class="landing-hero-inner">
          <div class="landing-badge">Phone Sales Training for Car Dealerships</div>
          <h1 class="landing-headline">Train on Real Customers.<br>Close More Real Deals.</h1>
          <p class="landing-sub">Your sales reps practice on simulated buyers that push back, object, and hang up — just like real phone-ups. Every call is scored. Every rep improves.</p>
          <div class="landing-ctas">
            <a href="#/register" class="btn btn-primary btn-lg">Start Free Trial</a>
            <a href="#/register?role=manager" class="btn btn-secondary btn-lg" id="gm-cta">I'm a Sales Manager →</a>
          </div>
          <p class="landing-note">No credit card required · Setup in 2 minutes</p>
        </div>
      </div>

      <div class="landing-stats">
        <div class="landing-stat"><div class="ls-val">12</div><div class="ls-lbl">Buyer Personas</div></div>
        <div class="landing-stat"><div class="ls-val">15</div><div class="ls-lbl">Training Modules</div></div>
        <div class="landing-stat"><div class="ls-val">4</div><div class="ls-lbl">Scored Dimensions</div></div>
        <div class="landing-stat"><div class="ls-val">∞</div><div class="ls-lbl">Training Calls</div></div>
      </div>

      <div class="landing-section">
        <h2 class="landing-section-title">How It Works</h2>
        <div class="landing-steps">
          <div class="landing-step">
            <div class="step-num">1</div>
            <h3>Pick a Persona</h3>
            <p>Choose from 12 buyer types — nervous first-timers, analytical skeptics, ultra-busy professionals, and more.</p>
          </div>
          <div class="landing-step">
            <div class="step-num">2</div>
            <h3>Get a Real Phone Call</h3>
            <p>Your phone rings. A simulated buyer picks up. The conversation is live, unscripted, and pressure-filled — just like a real phone-up.</p>
          </div>
          <div class="landing-step">
            <div class="step-num">3</div>
            <h3>See Your Score</h3>
            <p>Instant coaching grades every call on rapport, discovery, objection handling, and closing. You get specific, actionable feedback.</p>
          </div>
        </div>
      </div>

      <div class="landing-section landing-section-alt">
        <h2 class="landing-section-title">Built for Dealership GMs</h2>
        <div class="landing-features">
          <div class="landing-feature">
            <div class="lf-icon">📊</div>
            <h3>Team Dashboard</h3>
            <p>See every rep's call volume, scores, and training progress — all in one place. No more guessing who's practicing.</p>
          </div>
          <div class="landing-feature">
            <div class="lf-icon">🏆</div>
            <h3>Live Leaderboard</h3>
            <p>Friendly competition drives engagement. Reps can see how they rank across the team, motivating daily practice.</p>
          </div>
          <div class="landing-feature">
            <div class="lf-icon">🎓</div>
            <h3>Structured Curriculum</h3>
            <p>Three progressive courses take reps from basics to elite-level closing — with real lesson content before each challenge call.</p>
          </div>
          <div class="landing-feature">
            <div class="lf-icon">📞</div>
            <h3>Real Phone Calls</h3>
            <p>Not roleplay exercises. Actual phone calls that ring your rep's cell. The pressure is real — so the training sticks.</p>
          </div>
        </div>
      </div>

      <div class="landing-cta-footer">
        <h2>Ready to close more deals?</h2>
        <p>Get your team trained on simulated buyers that push back.</p>
        <div class="landing-ctas">
          <a href="#/register" class="btn btn-primary btn-lg">Create Free Account</a>
          <a href="#/login" class="btn btn-ghost btn-lg">Sign In</a>
        </div>
      </div>

    </div>
  `;

  // Pre-fill role=manager if CTA clicked
  document.getElementById('gm-cta')?.addEventListener('click', e => {
    e.preventDefault();
    sessionStorage.setItem('register_role', 'manager');
    navigate('/register');
  });
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
  const defaultRole = sessionStorage.getItem('register_role') || 'rep';
  sessionStorage.removeItem('register_role');

  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card auth-card-wide">
        <div class="auth-brand">FreshUp<span> AI</span></div>
        <h2>Create account</h2>

        <div class="role-toggle" id="role-toggle">
          <button type="button" class="role-btn${defaultRole === 'rep' ? ' active' : ''}" data-role="rep">Sales Rep</button>
          <button type="button" class="role-btn${defaultRole === 'manager' ? ' active' : ''}" data-role="manager">Sales Manager / GM</button>
        </div>

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

          <div id="manager-fields" style="display:${defaultRole === 'manager' ? 'block' : 'none'}">
            <div class="form-group">
              <label for="reg-team">Team / Dealership Name</label>
              <input type="text" id="reg-team" placeholder="Metro Ford Sales Team" autocomplete="organization" />
            </div>
          </div>

          <div id="rep-fields" style="display:${defaultRole === 'rep' ? 'block' : 'none'}">
            <div class="form-group">
              <label for="reg-invite">Team Invite Code <span class="label-optional">(optional)</span></label>
              <input type="text" id="reg-invite" placeholder="Enter code from your manager" autocomplete="off" style="text-transform:uppercase" />
              <p class="input-hint">Ask your manager for your team's invite code to join their dashboard.</p>
            </div>
          </div>

          <div id="auth-error" class="auth-error" style="display:none"></div>
          <button type="submit" class="btn btn-primary btn-full" id="register-btn">Create Account</button>
        </form>
        <p class="auth-switch">Already have an account? <a href="#/login" class="link">Sign In</a></p>
      </div>
    </div>
  `;

  let currentRole = defaultRole;

  document.getElementById('role-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.role-btn');
    if (!btn) return;
    currentRole = btn.dataset.role;
    document.querySelectorAll('.role-btn').forEach(b => b.classList.toggle('active', b.dataset.role === currentRole));
    document.getElementById('manager-fields').style.display = currentRole === 'manager' ? 'block' : 'none';
    document.getElementById('rep-fields').style.display = currentRole === 'rep' ? 'block' : 'none';
  });

  document.getElementById('register-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('register-btn');
    const errEl = document.getElementById('auth-error');
    btn.disabled = true;
    btn.textContent = 'Creating account…';
    errEl.style.display = 'none';

    const body = {
      name: document.getElementById('reg-name').value.trim(),
      email: document.getElementById('reg-email').value.trim(),
      password: document.getElementById('reg-password').value,
      role: currentRole,
    };
    if (currentRole === 'manager') {
      body.team_name = document.getElementById('reg-team').value.trim();
    } else {
      const code = document.getElementById('reg-invite').value.trim();
      if (code) body.invite_code = code;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

// Certification module ID sets
const CERT_IDS = {
  foundations:  ['foundations-1','foundations-2','foundations-3','foundations-4','foundations-5'],
  breakthrough: ['breakthrough-1','breakthrough-2','breakthrough-3','breakthrough-4','breakthrough-5'],
  elite:        ['elite-1','elite-2','elite-3','elite-4','elite-5'],
};

function calcStreak(calls) {
  if (!calls.length) return 0;
  const callDays = new Set(calls.map(c => {
    const d = new Date(c.startTime || c.timestamp || 0);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let streak = 0, day = today.getTime();
  // Count from today backward; if today is empty try from yesterday
  if (!callDays.has(day)) day -= 86400000;
  while (callDays.has(day)) { streak++; day -= 86400000; }
  return streak;
}

async function renderDashboard() {
  app.innerHTML = '<div class="loading">Loading…</div>';
  const user = getUser();
  let history = [], progress = [], courses = [];
  try { history = await api('/api/call/history'); } catch (e) { /* empty */ }
  try { progress = await api('/api/courses/progress'); } catch (e) { /* empty */ }
  try { courses = await api('/api/courses'); } catch (e) { /* empty */ }

  const total = history.length;
  const scored = history.filter(c => c.score && c.score.overallScore != null);
  const avgScore = scored.length
    ? Math.round(scored.reduce((s, c) => s + c.score.overallScore, 0) / scored.length)
    : null;
  const bestScore = scored.length ? Math.max(...scored.map(c => c.score.overallScore)) : null;
  const modulesCompleted = progress.length;
  const recent = history.slice(0, 8);

  // Certifications
  const progressSet = new Set(progress);
  const certs = {
    foundations:  CERT_IDS.foundations.every(id => progressSet.has(id)),
    breakthrough: CERT_IDS.breakthrough.every(id => progressSet.has(id)),
    elite:        CERT_IDS.elite.every(id => progressSet.has(id)),
  };
  const allCertified = certs.foundations && certs.breakthrough && certs.elite;

  // Continue learning: first incomplete module in first incomplete course
  let nextModule = null;
  for (const course of courses) {
    if (!course.modules) continue;
    const firstIncomplete = course.modules.find(m => !progressSet.has(m.id));
    if (firstIncomplete) {
      nextModule = { course, module: firstIncomplete };
      break;
    }
  }

  // Score trend: last 5 vs previous 5
  let trend = null;
  if (scored.length >= 5) {
    const last5avg = scored.slice(0, 5).reduce((s, c) => s + c.score.overallScore, 0) / 5;
    if (scored.length >= 10) {
      const prev5avg = scored.slice(5, 10).reduce((s, c) => s + c.score.overallScore, 0) / 5;
      trend = Math.round(last5avg - prev5avg);
    }
  }

  // Streak
  const streak = calcStreak(history);

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Dashboard</h1>
        <p class="subtitle">Welcome back, ${escHtml(user ? user.name.split(' ')[0] : '')}!${streak >= 2 ? ` &nbsp;🔥 ${streak}-day streak` : ''}</p>
      </div>
      <a class="btn btn-primary" href="#/start">+ Take a Call</a>
    </div>

    <div class="stats-strip">
      <div class="stat-card">
        <div class="stat-val">${total}</div>
        <div class="stat-lbl">Total Calls</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${avgScore != null ? avgScore : '—'}${trend != null ? `<span class="trend ${trend >= 0 ? 'trend-up' : 'trend-down'}">${trend >= 0 ? '↑' : '↓'}${Math.abs(trend)}</span>` : ''}</div>
        <div class="stat-lbl">Avg Score</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${bestScore != null ? bestScore : '—'}</div>
        <div class="stat-lbl">Best Score</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${modulesCompleted}<span class="stat-denom">/15</span></div>
        <div class="stat-lbl">Modules Done</div>
      </div>
    </div>

    <div class="cert-strip">
      ${certBadge('foundations', 'Foundations', certs.foundations)}
      ${certBadge('breakthrough', 'Breakthrough', certs.breakthrough)}
      ${certBadge('elite', 'Elite Closer', certs.elite)}
    </div>

    ${allCertified ? `
      <div class="all-cert-banner">
        <span class="all-cert-star">★</span>
        <div>
          <strong>FreshUp Elite Certified</strong>
          <div>You've mastered all 15 modules — you're in the top tier of dealership sales reps.</div>
        </div>
      </div>
    ` : nextModule ? `
      <a href="#/courses/${nextModule.course.id}/${nextModule.module.id}" class="continue-card" style="--course-color:${nextModule.course.color || '#3b82f6'}">
        <div class="continue-label">Continue Learning</div>
        <div class="continue-title">${escHtml(nextModule.module.title)}</div>
        <div class="continue-course">${escHtml(nextModule.course.title)}</div>
        <span class="continue-arrow">→</span>
      </a>
    ` : ''}

    <div class="section-header" style="margin-top:24px">
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

function certBadge(courseId, label, earned) {
  return `
    <a href="#/courses/${courseId}" class="cert-badge ${earned ? 'cert-earned' : 'cert-locked'}">
      <span class="cert-icon">${earned ? '✓' : '○'}</span>
      <span class="cert-label">${label}</span>
    </a>
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

// ── START CALL / CALL ARENA ───────────────────────────────────────────────────

let selectedPersonaId = null; // used only for module challenges

function arenaGaugeSvg(id = '') {
  const arcId = id ? `gauge-arc-${id}` : 'gauge-arc';
  const numId = id ? `gauge-score-${id}` : 'gauge-score';
  return `
    <svg class="score-gauge" viewBox="0 0 200 130">
      <path class="gauge-track" d="M 20 110 A 80 80 0 0 1 180 110"
            fill="none" stroke="var(--border)" stroke-width="18" stroke-linecap="round"/>
      <path class="gauge-fill" id="${arcId}"
            d="M 20 110 A 80 80 0 0 1 180 110"
            fill="none" stroke="var(--accent)" stroke-width="18" stroke-linecap="round"
            stroke-dasharray="251.3" stroke-dashoffset="251.3"/>
      <text class="gauge-num" id="${numId}" x="100" y="90" text-anchor="middle">—</text>
      <text class="gauge-lbl" x="100" y="113" text-anchor="middle">Score</text>
      <text class="gauge-mark" x="14" y="127" text-anchor="middle">0</text>
      <text class="gauge-mark" x="186" y="127" text-anchor="middle">100</text>
    </svg>`;
}

function arenaDimensions(prefix = '') {
  return ['Rapport','Discovery','Objections','Closing'].map(d => {
    const key = d.toLowerCase();
    return `
      <div class="gauge-dim">
        <div class="gauge-dim-header">
          <span>${d}</span>
          <span class="gauge-dim-val" id="${prefix}dim-${key}">—</span>
        </div>
        <div class="gauge-dim-bar">
          <div class="gauge-dim-fill" id="${prefix}dimbar-${key}" style="width:0%"></div>
        </div>
      </div>`;
  }).join('');
}

async function renderStart() {
  // Module challenge path — a specific persona was pre-selected from a course module
  const preselectId = sessionStorage.getItem('preselect_persona');
  selectedPersonaId = preselectId || null;
  if (preselectId) sessionStorage.removeItem('preselect_persona');

  let challengePersona = null;
  if (selectedPersonaId) {
    try {
      const all = await api('/api/personas');
      challengePersona = all.find(p => p.id === selectedPersonaId) || null;
    } catch { /* ignore */ }
  }

  app.innerHTML = `
    <div class="arena-wrap">

      <!-- LEFT: phone-style difficulty / challenge selector -->
      <div class="arena-left">
        <div class="phone-card">
          <div class="phone-card-head">
            <div class="phone-ring-icon" id="phone-ring-icon">📱</div>
            <h2>${challengePersona ? 'Module Challenge' : 'Call Arena'}</h2>
            <p class="phone-card-sub">${challengePersona
              ? `Challenge: ${escHtml(challengePersona.name)}`
              : 'Every caller is different — just like real phone-ups.'}</p>
          </div>

          ${challengePersona ? `
            <div class="challenge-persona-banner">
              ${avatar(challengePersona.name, 'avatar-sm')}
              <div>
                <div class="cpb-name">${escHtml(challengePersona.name)}</div>
                <div class="cpb-diff">${difficultyBadge(challengePersona.difficulty)}</div>
              </div>
            </div>
          ` : `
            <div class="diff-selector" id="diff-selector">
              <button class="diff-opt diff-easy active" data-diff="easy">
                <div class="diff-color easy"></div>
                <div class="diff-text">
                  <span class="diff-name">Easy</span>
                  <span class="diff-desc">Friendly · High interest · Wants to buy</span>
                </div>
              </button>
              <button class="diff-opt diff-medium" data-diff="medium">
                <div class="diff-color medium"></div>
                <div class="diff-text">
                  <span class="diff-name">Medium</span>
                  <span class="diff-desc">Cautious · Has objections · Needs convincing</span>
                </div>
              </button>
              <button class="diff-opt diff-hard" data-diff="hard">
                <div class="diff-color hard"></div>
                <div class="diff-text">
                  <span class="diff-name">Hard</span>
                  <span class="diff-desc">Skeptical · Tough to close · Will hang up</span>
                </div>
              </button>
            </div>
          `}

          <div class="phone-input-wrap">
            <div class="form-group">
              <label for="phone">Your Cell Number</label>
              <p class="input-hint">Answer when it rings — caller info is randomized</p>
              <input type="tel" id="phone" placeholder="+1 555 000 0000" autocomplete="tel"/>
            </div>
            <button class="btn btn-primary btn-full btn-arena" id="start-btn" disabled>
              📞&nbsp; Take a Call
            </button>
          </div>
          <p class="arena-note">✏️ Have a pen ready — capture their name, number, and email.</p>
        </div>
      </div>

      <!-- MIDDLE: transcript preview -->
      <div class="arena-middle">
        <div class="live-transcript-card">
          <div class="lt-header">
            <span class="lt-title">Live Transcript</span>
            <span class="lt-badge" id="lt-status-pre">Waiting</span>
          </div>
          <div class="lt-preview-empty">
            <div class="lt-preview-icon">💬</div>
            <p>Your conversation will appear here in real time once the call starts.</p>
            <p class="lt-preview-sub">The caller speaks first — work the call and try to set an appointment.</p>
          </div>
        </div>
      </div>

      <!-- RIGHT: score gauge preview -->
      <div class="arena-right">
        <div class="live-score-card">
          <div class="ls-header">Live Score</div>
          <div class="gauge-wrap">${arenaGaugeSvg('pre')}</div>
          <div class="gauge-dims">${arenaDimensions('pre-')}</div>
          <p class="gauge-hint">Score updates every few exchanges as you speak.</p>
        </div>
      </div>

    </div>
  `;

  let selectedDifficulty = 'easy';

  // Difficulty selector interaction
  const diffSel = document.getElementById('diff-selector');
  if (diffSel) {
    diffSel.addEventListener('click', e => {
      const btn = e.target.closest('.diff-opt');
      if (!btn) return;
      diffSel.querySelectorAll('.diff-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDifficulty = btn.dataset.diff;
    });
  }

  document.getElementById('phone').addEventListener('input', () => {
    const phone = document.getElementById('phone').value.trim();
    const btn = document.getElementById('start-btn');
    if (btn) btn.disabled = !phone;
  });

  document.getElementById('start-btn').addEventListener('click', async () => {
    const phone = document.getElementById('phone').value.trim();
    if (!phone) return;
    const btn = document.getElementById('start-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Dialing…';

    const body = { phoneNumber: phone };
    if (selectedPersonaId) {
      body.personaId = selectedPersonaId;
    } else {
      body.difficulty = selectedDifficulty;
    }

    try {
      const data = await api('/api/call/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      showToast('Calling you now — answer when your phone rings!', 'success');
      setTimeout(() => navigate(`/call/${data.callSid}`), 600);
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '📞&nbsp; Take a Call';
    }
  });

  // Animate phone icon ring
  const ringIcon = document.getElementById('phone-ring-icon');
  if (ringIcon) {
    setInterval(() => {
      ringIcon.classList.add('ringing');
      setTimeout(() => ringIcon.classList.remove('ringing'), 600);
    }, 4000);
  }
}

function updateStartBtn() {
  const phone = (document.getElementById('phone') || {}).value || '';
  const btn = document.getElementById('start-btn');
  if (btn) btn.disabled = !phone.trim();
}

// Kept for module challenge backward-compat
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
      <a class="btn btn-primary" href="#/start">+ Take a Call</a>
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
    <div class="arena-wrap">
      <div class="arena-left">
        <div class="phone-card">
          <div class="phone-card-head">
            <span class="live-status-dot" id="live-dot"></span>
            <h2 id="call-status-title">Live Call</h2>
            <p class="phone-card-sub" id="call-status-sub">Call in progress…</p>
          </div>
          <div id="live-outcome-wrap"></div>
          <div id="live-contact-reveal"></div>
          <a href="#/history" class="btn btn-ghost btn-full" style="margin-top:auto">← History</a>
        </div>
      </div>
      <div class="arena-middle">
        <div class="live-transcript-card">
          <div class="lt-header">
            <span class="lt-title">Live Transcript</span>
            <span class="lt-badge" id="lt-status">Live</span>
          </div>
          <div class="lt-messages" id="lt-messages">
            <div class="lt-preview-empty" id="lt-empty">
              <div class="lt-preview-icon">🎙️</div>
              <p>Waiting for the call to connect…</p>
            </div>
          </div>
        </div>
      </div>
      <div class="arena-right">
        <div class="live-score-card">
          <div class="ls-header">Live Score</div>
          <div class="gauge-wrap">${arenaGaugeSvg('live')}</div>
          <div class="gauge-dims">${arenaDimensions('live-')}</div>
          <div id="live-feedback-wrap"></div>
        </div>
      </div>
    </div>
  `;
  connectCallStream(callSid);
  // Fallback: if SSE yields nothing after 5s (call may already be done), poll once
  setTimeout(() => {
    const msgs = document.getElementById('lt-messages');
    if (msgs && msgs.querySelectorAll('.tb').length === 0) {
      api(`/webhook/results/${callSid}`)
        .then(d => { if (d.score) showCallAnalysis(d, callSid); })
        .catch(() => {});
    }
  }, 5000);
}

let pollTimer = null;

function pollResults(callSid) {
  clearTimeout(pollTimer);
  api(`/webhook/results/${callSid}`).then(data => {
    showCallAnalysis(data, callSid);
    if (!data.score) {
      pollTimer = setTimeout(() => pollResults(callSid), 3000);
    }
  }).catch(() => {
    const el = document.getElementById('call-status-sub');
    if (el) el.textContent = 'Call not found or still in progress.';
  });
}

function connectCallStream(callSid) {
  const token = getToken();
  const src = new EventSource(`/api/call/${callSid}/stream?token=${encodeURIComponent(token || '')}`);
  let currentAssistantBubble = null;

  src.onmessage = (e) => {
    let event;
    try { event = JSON.parse(e.data); } catch { return; }

    switch (event.type) {
      case 'user_message':
        currentAssistantBubble = null;
        addTranscriptBubble('user', event.content);
        break;
      case 'assistant_message':
        if (currentAssistantBubble) {
          currentAssistantBubble.querySelector('.tb-text').textContent = event.content;
          currentAssistantBubble.classList.remove('tb-streaming');
        } else {
          addTranscriptBubble('assistant', event.content);
        }
        currentAssistantBubble = null;
        break;
      case 'assistant_delta':
        if (!currentAssistantBubble) {
          currentAssistantBubble = addTranscriptBubble('assistant', event.delta, true);
        } else {
          const txt = currentAssistantBubble.querySelector('.tb-text');
          if (txt) txt.textContent += event.delta;
          const msgs = document.getElementById('lt-messages');
          if (msgs) msgs.scrollTop = msgs.scrollHeight;
        }
        break;
      case 'outcome':
        showLiveOutcome(event.outcome);
        break;
      case 'partial_score':
        updateGauge(event.score);
        break;
      case 'score':
        updateGauge(event.score);
        { const dot = document.getElementById('live-dot');
          const badge = document.getElementById('lt-status');
          const title = document.getElementById('call-status-title');
          if (dot) dot.className = 'live-status-dot done';
          if (badge) { badge.textContent = 'Done'; badge.className = 'lt-badge done'; }
          if (title) title.textContent = 'Call Complete'; }
        break;
      case 'done':
        src.close();
        api(`/webhook/results/${callSid}`)
          .then(d => showCallAnalysis(d, callSid))
          .catch(() => {});
        break;
    }
  };

  src.onerror = () => {
    src.close();
    // Fall back to polling if stream fails
    pollResults(callSid);
  };
}

function addTranscriptBubble(role, content, streaming) {
  const container = document.getElementById('lt-messages');
  if (!container) return null;
  const empty = document.getElementById('lt-empty');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.className = `tb tb-${role}${streaming ? ' tb-streaming' : ''}`;
  div.innerHTML = `<div class="tb-who">${role === 'user' ? 'You (Rep)' : 'Caller'}</div>` +
    `<div class="tb-text">${escHtml(content)}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function updateGauge(score) {
  if (!score) return;
  const overall = score.overallScore;
  if (overall != null) {
    const arc = document.getElementById('gauge-arc-live');
    const num = document.getElementById('gauge-score-live');
    if (arc) {
      const pct = Math.max(0, Math.min(100, overall)) / 100;
      arc.style.strokeDashoffset = String(251.3 * (1 - pct));
      arc.style.stroke = scoreColor(overall);
    }
    if (num) num.textContent = String(overall);
  }
  ['rapport', 'discovery', 'objections', 'closing'].forEach(dim => {
    const val = score[dim];
    if (val == null) return;
    const el = document.getElementById(`live-dim-${dim}`);
    const bar = document.getElementById(`live-dimbar-${dim}`);
    if (el) el.textContent = String(val);
    if (bar) { bar.style.width = `${val}%`; bar.style.background = scoreColor(val); }
  });
}

function showLiveOutcome(outcome) {
  const wrap = document.getElementById('live-outcome-wrap');
  if (wrap) wrap.innerHTML = `<div class="outcome-live">${outcomePill(outcome)}</div>`;
  const sub = document.getElementById('call-status-sub');
  if (sub) sub.textContent = outcome === 'Appointment' ? '🎉 Appointment set!' : 'Call ended';
}

function showCallAnalysis(data, callSid) {
  // Update status
  const dot = document.getElementById('live-dot');
  const badge = document.getElementById('lt-status');
  const title = document.getElementById('call-status-title');
  if (dot) dot.className = 'live-status-dot done';
  if (badge) { badge.textContent = 'Done'; badge.className = 'lt-badge done'; }
  if (title) title.textContent = 'Call Complete';

  if (data.outcome) showLiveOutcome(data.outcome);

  // Contact reveal in left pane
  if (data.contactInfo) {
    const cr = document.getElementById('live-contact-reveal');
    if (cr) cr.innerHTML = `
      <div class="contact-reveal">
        <div class="contact-reveal-header">
          <span class="contact-reveal-icon">📋</span>
          <div>
            <strong>Caller Info</strong>
            <div class="contact-reveal-sub">Did you capture it?</div>
          </div>
        </div>
        <div class="contact-grid">
          <div class="contact-field"><span class="cf-lbl">Name</span><span class="cf-val">${escHtml(data.contactInfo.name)}</span></div>
          <div class="contact-field"><span class="cf-lbl">Phone</span><span class="cf-val">${escHtml(data.contactInfo.phone)}</span></div>
          <div class="contact-field"><span class="cf-lbl">Email</span><span class="cf-val">${escHtml(data.contactInfo.email)}</span></div>
          <div class="contact-field"><span class="cf-lbl">Interested In</span><span class="cf-val">${escHtml(data.contactInfo.car)}</span></div>
        </div>
      </div>`;
  }

  // Final gauge + feedback in right pane
  if (data.score) {
    updateGauge(data.score);
    if (data.score.feedback) {
      const fw = document.getElementById('live-feedback-wrap');
      if (fw) fw.innerHTML = `<div class="live-feedback">${escHtml(data.score.feedback)}</div>`;
    }
  } else {
    // Score not ready yet — keep polling
    clearTimeout(pollTimer);
    pollTimer = setTimeout(() => pollResults(callSid), 3000);
  }

  checkPendingModule(data, callSid);
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

    // Show banner in the transcript pane (live layout) or wherever is available
    const target = document.getElementById('lt-messages') || document.getElementById('result-content');
    if (target) {
      const banner = document.createElement('div');
      banner.className = 'module-passed-banner';
      banner.innerHTML = `
        <div class="banner-check">✓</div>
        <div>
          <strong>Module Passed!</strong>
          <div>Score ${overallScore} met the ${mod.minScore} required. <a href="#/courses/${mod.courseId}" class="link">Back to course →</a></div>
        </div>
      `;
      target.prepend(banner);
    }
  } catch (err) {
    console.error('[checkPendingModule] error:', err);
  }
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

// ── TEAM DASHBOARD (Manager only) ─────────────────────────────────────────────

async function renderTeam() {
  app.innerHTML = '<div class="loading">Loading team…</div>';
  let data;
  try { data = await api('/api/team'); } catch (e) {
    app.innerHTML = `<div class="empty-state">${escHtml(e.message)}</div>`;
    return;
  }

  const { team, members } = data;
  const now = Date.now();
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const MONTH = 30 * 24 * 60 * 60 * 1000;

  const teamAvg = members.length
    ? Math.round(members.filter(m => m.avgScore).reduce((s, m) => s + m.avgScore, 0) / members.filter(m => m.avgScore).length) || '—'
    : '—';
  const activeThisWeek = members.filter(m => m.lastActive && now - m.lastActive < WEEK).length;
  const totalCerts = members.reduce((s, m) => s + (m.modulesCompleted >= 15 ? 1 : 0), 0);

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${escHtml(team.name)}</h1>
        <p class="subtitle">${members.length} rep${members.length !== 1 ? 's' : ''}</p>
      </div>
      <button class="btn btn-secondary" id="invite-btn">Copy Invite Link</button>
    </div>

    <div class="stats-strip">
      <div class="stat-card"><div class="stat-val">${members.length}</div><div class="stat-lbl">Total Reps</div></div>
      <div class="stat-card"><div class="stat-val">${activeThisWeek}</div><div class="stat-lbl">Active This Week</div></div>
      <div class="stat-card"><div class="stat-val">${teamAvg}</div><div class="stat-lbl">Team Avg Score</div></div>
      <div class="stat-card"><div class="stat-val">${totalCerts}</div><div class="stat-lbl">Certified Reps</div></div>
    </div>

    ${members.length === 0 ? `
      <div class="empty-state">
        No reps on your team yet. Share your invite link so reps can join when they sign up.
      </div>
    ` : `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Rep</th><th>Last Active</th><th>Calls</th><th>Avg Score</th><th>Best Score</th><th>Modules</th><th></th>
          </tr></thead>
          <tbody>${members.map(m => teamRepRow(m, now, WEEK, MONTH)).join('')}</tbody>
        </table>
      </div>
    `}
  `;

  document.getElementById('invite-btn')?.addEventListener('click', async () => {
    try {
      const inv = await api('/api/team/invite');
      await navigator.clipboard.writeText(inv.invite_url);
      showToast('Invite link copied to clipboard!', 'success');
    } catch {
      showToast('Could not copy link. Check browser permissions.', 'error');
    }
  });
}

function teamRepRow(m, now, WEEK, MONTH) {
  const activeClass = !m.lastActive ? 'rep-inactive'
    : now - m.lastActive < WEEK ? 'rep-active'
    : now - m.lastActive < MONTH ? 'rep-recent'
    : 'rep-inactive';
  const lastActiveText = m.lastActive ? formatDate(m.lastActive) : 'Never';
  const avgDisplay = m.avgScore != null ? `<span style="color:${scoreColor(m.avgScore)}">${m.avgScore}</span>` : '—';
  const bestDisplay = m.bestScore != null ? `<span style="color:${scoreColor(m.bestScore)}">${m.bestScore}</span>` : '—';
  const modProgress = `${m.modulesCompleted}/15`;

  return `
    <tr class="${activeClass}">
      <td>
        <div class="cell-with-avatar">
          ${avatar(m.name)}
          <span>${escHtml(m.name)}</span>
        </div>
      </td>
      <td class="text-muted text-sm">${lastActiveText}</td>
      <td>${m.totalCalls}</td>
      <td class="score-num">${avgDisplay}</td>
      <td class="score-num">${bestDisplay}</td>
      <td>
        <div class="rep-modules">
          <span>${modProgress}</span>
          <div class="rep-module-bar"><div class="rep-module-fill" style="width:${Math.round(m.modulesCompleted / 15 * 100)}%"></div></div>
        </div>
      </td>
      <td><a href="#/team/rep/${m.id}" class="btn btn-secondary btn-sm">View</a></td>
    </tr>
  `;
}

async function renderRepDetail(userId) {
  app.innerHTML = '<div class="loading">Loading…</div>';
  let data;
  try { data = await api(`/api/team/rep/${userId}`); } catch (e) {
    app.innerHTML = `<div class="empty-state">${escHtml(e.message)}</div>`;
    return;
  }

  const { rep, calls, progress } = data;
  const scored = calls.filter(c => c.score && c.score.overallScore != null);
  const avgScore = scored.length
    ? Math.round(scored.reduce((s, c) => s + c.score.overallScore, 0) / scored.length) : null;
  const bestScore = scored.length ? Math.max(...scored.map(c => c.score.overallScore)) : null;
  const progressSet = new Set(progress);
  const certs = {
    foundations:  CERT_IDS.foundations.every(id => progressSet.has(id)),
    breakthrough: CERT_IDS.breakthrough.every(id => progressSet.has(id)),
    elite:        CERT_IDS.elite.every(id => progressSet.has(id)),
  };

  app.innerHTML = `
    <a href="#/team" class="back-link">← Team Dashboard</a>
    <div class="result-header">
      ${avatar(rep.name, 'avatar-lg')}
      <div>
        <h1>${escHtml(rep.name)}</h1>
        <p class="subtitle">${escHtml(rep.email)}</p>
      </div>
    </div>

    <div class="stats-strip">
      <div class="stat-card"><div class="stat-val">${calls.length}</div><div class="stat-lbl">Total Calls</div></div>
      <div class="stat-card"><div class="stat-val">${avgScore ?? '—'}</div><div class="stat-lbl">Avg Score</div></div>
      <div class="stat-card"><div class="stat-val">${bestScore ?? '—'}</div><div class="stat-lbl">Best Score</div></div>
      <div class="stat-card"><div class="stat-val">${progress.length}<span class="stat-denom">/15</span></div><div class="stat-lbl">Modules Done</div></div>
    </div>

    <div class="cert-strip">
      ${certBadge('foundations', 'Foundations', certs.foundations)}
      ${certBadge('breakthrough', 'Breakthrough', certs.breakthrough)}
      ${certBadge('elite', 'Elite Closer', certs.elite)}
    </div>

    <div class="section-header" style="margin-top:24px"><h2>Call History</h2></div>
    ${calls.length === 0
      ? '<div class="empty-state">No calls yet.</div>'
      : `<div class="table-wrap"><table>
          <thead><tr><th>Persona</th><th>Outcome</th><th>Score</th><th>Duration</th><th>Date</th></tr></thead>
          <tbody>${calls.map(c => {
            const sv = c.score?.overallScore;
            return `<tr>
              <td><div class="cell-with-avatar">${avatar(c.personaName)}<strong>${escHtml(c.personaName||'—')}</strong></div></td>
              <td>${outcomePill(c.outcome)}</td>
              <td>${sv != null ? `<span class="score-num" style="color:${scoreColor(sv)}">${sv}</span>` : '—'}</td>
              <td class="text-muted">${formatDuration(c.duration)}</td>
              <td class="text-subtle text-sm">${formatDate(c.startTime)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>`
    }
  `;
}
