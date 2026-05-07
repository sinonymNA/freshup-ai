'use strict';

// ── THEME ─────────────────────────────────────────────────────────────────────

const THEMES = ['light', 'dark', 'gridiron', 'midnight'];

function applyTheme(t) {
  if (!THEMES.includes(t)) t = 'light';
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('freshup_theme', t);
}

applyTheme(localStorage.getItem('freshup_theme') || 'light');

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
  delete document.body.dataset.page;
  const path = getRoute();
  const token = getToken();

  // Root: show landing page for guests, dashboard for logged-in users
  if (path === '/') {
    updateNav(path);
    return token ? renderDashboard() : renderLanding();
  }

  const needsAuth = path === '/start' || path === '/history' || path === '/team'
    || path === '/settings' || path === '/learn'
    || path.startsWith('/call/') || path.startsWith('/team/') || path.startsWith('/learn/');
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
  if (path === '/settings') return renderSettings();
  if (path === '/learn') return renderLearn();
  if (path === '/learn/framework') return renderFramework();
  if (path === '/learn/gauntlet') return renderGauntlet();
  if (path === '/learn/playbook') return renderPlaybook();
  if (path.startsWith('/call/')) return renderCallResult(path.slice('/call/'.length));
  if (path.startsWith('/team/rep/')) return renderRepDetail(path.slice('/team/rep/'.length));

  // /learn/courses routes — same renderers as /courses
  const learnCourseModuleMatch = path.match(/^\/learn\/courses\/([^/]+)\/([^/]+)$/);
  if (learnCourseModuleMatch) return renderModule(learnCourseModuleMatch[1], learnCourseModuleMatch[2]);
  const learnCourseMatch = path.match(/^\/learn\/courses\/([^/]+)$/);
  if (learnCourseMatch) return renderCourse(learnCourseMatch[1]);

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
      (key === 'start' && path === '/start') ||
      (key === 'learn' && (path === '/learn' || path.startsWith('/learn/') || path === '/courses' || path.startsWith('/courses/'))) ||
      (key === 'history' && path === '/history') ||
      (key === 'leaderboard' && path === '/leaderboard') ||
      (key === 'team' && (path === '/team' || path.startsWith('/team/'))) ||
      (key === 'settings' && path === '/settings')
    ) ? 'active' : '';
    return `<a href="#${href}" data-nav="${key}" class="nav-link ${active}">${label}</a>`;
  }

  const drawer = document.getElementById('nav-drawer');

  if (user) {
    const isManager = user.role === 'manager';
    const links = `
      ${navLink('/', 'dashboard', 'Dashboard')}
      ${navLink('/start', 'start', 'Call Arena')}
      ${navLink('/learn', 'learn', 'Learn')}
      ${isManager ? navLink('/team', 'team', 'My Team') : navLink('/history', 'history', 'History')}
      ${navLink('/leaderboard', 'leaderboard', 'Leaderboard')}
      ${navLink('/settings', 'settings', 'Settings')}
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
      <a href="#/register" class="btn btn-primary btn-sm">Join Now</a>
    `;
    if (drawer) {
      drawer.innerHTML = `
        <a href="#/login" class="nav-link">Log In</a>
        <a href="#/register" class="nav-link">Join Now</a>
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
  const labels = { Appointment: 'Set Appointment', HangUp: 'Lost Caller' };
  return `<span class="outcome-pill outcome-${o}">${labels[o] || escHtml(o)}</span>`;
}

function timeAgo(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Auto-format phone input as (555) 123-4567 while typing
function initPhoneInput(el) {
  if (!el) return;
  el.addEventListener('input', () => {
    const digits = el.value.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3)      el.value = digits;
    else if (digits.length <= 6) el.value = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    else                         el.value = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  });
}

function weakestDimPill(score) {
  if (!score) return '';
  const dimLabels = { opening: 'Opening', rapport: 'Rapport', infoCapture: 'Lead Capture', objectionHandling: 'Objection Handling', appointment: 'Close' };
  const keys = ['opening', 'rapport', 'infoCapture', 'objectionHandling', 'appointment'];
  let worst = null, worstVal = Infinity;
  for (const k of keys) {
    const v = score[k];
    if (v != null && v < worstVal) { worstVal = v; worst = k; }
  }
  if (!worst) return '';
  const colorClass = worstVal >= 15 ? 'wdp-green' : worstVal >= 10 ? 'wdp-yellow' : 'wdp-red';
  return `<span class="weakest-dim-pill ${colorClass}">${dimLabels[worst]}</span>`;
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

// ── SCROLL REVEAL + COUNTER ANIMATION ─────────────────────────────────────────

function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      el.classList.add('revealed');
      el.querySelectorAll('[data-delay]').forEach(child => {
        child.style.transitionDelay = child.dataset.delay + 'ms';
      });
      // Animate count-up elements inside this revealed element
      el.querySelectorAll('.count-up[data-target]').forEach(counter => {
        animateCounter(counter, parseInt(counter.dataset.target, 10));
      });
      // If this IS a count-up element
      if (el.classList.contains('count-up') && el.dataset.target) {
        animateCounter(el, parseInt(el.dataset.target, 10));
      }
      observer.unobserve(el);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach(el => observer.observe(el));
  // Also observe standalone count-up elements not inside reveal wrappers
  document.querySelectorAll('.count-up[data-target]').forEach(el => {
    if (!el.closest('.reveal, .reveal-left, .reveal-right')) {
      observer.observe(el);
    }
  });
  return observer;
}

function animateCounter(el, target, duration = 1400, from = 0) {
  if (!el || isNaN(target)) return;
  const startTime = performance.now();
  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    // ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + eased * (target - from));
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target;
  }
  requestAnimationFrame(step);
}

// ── CHALLENGE BLOCK STATE MACHINE ─────────────────────────────────────────────

let _challengeCallSid = null;
let _challengeToken   = null;
let _challengePollTimer = null;

const CHALLENGE_DIM_LABELS = {
  opening: 'Opening', rapport: 'Rapport', infoCapture: 'Lead Capture',
  objectionHandling: 'Objection Handling', appointment: 'Close',
};

function bindChallengeBlock() {
  // Scenario chips
  document.getElementById('scenario-chips')?.addEventListener('click', e => {
    const chip = e.target.closest('.scenario-chip');
    if (!chip) return;
    document.querySelectorAll('.scenario-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const preview = document.getElementById('scenario-preview-text');
    if (preview) preview.textContent = chip.dataset.preview;
  });

  // Phone auto-format
  initPhoneInput(document.getElementById('challenge-phone'));

  // Start call
  document.getElementById('challenge-start-btn')?.addEventListener('click', startChallengeCall);

  // Retry
  document.getElementById('challenge-retry-btn')?.addEventListener('click', () => {
    clearTimeout(_challengePollTimer);
    _challengeCallSid = _challengeToken = null;
    setChallengeState('idle');
    const phoneEl = document.getElementById('challenge-phone');
    if (phoneEl) { phoneEl.value = ''; initPhoneInput(phoneEl); }
  });
}

async function startChallengeCall() {
  const phoneRaw = (document.getElementById('challenge-phone')?.value || '').trim();
  const activeChip = document.querySelector('.scenario-chip.active');
  const scenarioType = activeChip?.dataset.scenario || 'trade-in';
  const errEl = document.getElementById('challenge-error');

  if (!phoneRaw) {
    errEl.textContent = 'Enter your cell number to receive the call.';
    errEl.style.display = 'block'; return;
  }
  errEl.style.display = 'none';

  const btn = document.getElementById('challenge-start-btn');
  btn.disabled = true; btn.textContent = 'Calling…';

  try {
    const res = await fetch('/api/call/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phoneRaw, scenarioType }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start call');

    _challengeCallSid = data.callSid;
    _challengeToken   = data.challengeToken;

    const nameEl = document.getElementById('challenge-persona-name');
    if (nameEl) nameEl.textContent = data.persona?.name || 'your buyer';

    const badgeEl = document.getElementById('challenge-difficulty-badge');
    if (badgeEl && data.persona) {
      badgeEl.textContent = `${data.persona.difficulty} · ${data.persona.mood}`;
    }

    setChallengeState('calling');
    challengePoll();
  } catch (err) {
    btn.disabled = false; btn.textContent = 'Start the Call →';
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
}

function challengePoll() {
  if (!_challengeCallSid || !_challengeToken) return;
  fetch(`/api/call/challenge-results/${_challengeCallSid}?challengeToken=${encodeURIComponent(_challengeToken)}`)
    .then(r => r.json())
    .then(data => {
      if (data.pending) {
        _challengePollTimer = setTimeout(challengePoll, 3000);
      } else {
        setChallengeState('done', data);
      }
    })
    .catch(() => {
      _challengePollTimer = setTimeout(challengePoll, 4000);
    });
}

function setChallengeState(state, data) {
  const idle    = document.getElementById('challenge-idle');
  const calling = document.getElementById('challenge-calling');
  const done    = document.getElementById('challenge-done');
  if (!idle || !calling || !done) return;

  idle.style.display    = state === 'idle'    ? '' : 'none';
  calling.style.display = state === 'calling' ? '' : 'none';
  done.style.display    = state === 'done'    ? '' : 'none';

  if (state === 'done' && data) {
    renderChallengeResults(data);
    // Bind claim button
    document.getElementById('challenge-claim-btn')?.addEventListener('click', claimChallengeAccount);
  }
}

function renderChallengeResults(data) {
  const score = data.score || {};
  const outcome = data.outcome;

  // Score number
  const scoreEl = document.getElementById('challenge-score-num');
  if (scoreEl) scoreEl.textContent = score.overallScore != null ? score.overallScore : '—';

  // Outcome badge
  const outEl = document.getElementById('challenge-outcome-badge');
  if (outEl) {
    if (outcome === 'Appointment') {
      outEl.textContent = 'Appointment Set';
      outEl.className = 'challenge-outcome-badge cob-win';
    } else if (outcome === 'HangUp') {
      outEl.textContent = 'Caller Hung Up';
      outEl.className = 'challenge-outcome-badge cob-loss';
    }
  }

  // Coaching callout
  const dimKeys = ['opening', 'rapport', 'infoCapture', 'objectionHandling', 'appointment'];
  const sortedByScore = dimKeys.slice().sort((a, b) => (score[a] ?? 0) - (score[b] ?? 0));
  const worstKey  = sortedByScore[0];
  const worstVal  = score[worstKey] ?? 0;
  const headlineEl = document.getElementById('ccc-headline');
  const textEl     = document.getElementById('ccc-text');
  if (headlineEl) {
    headlineEl.textContent = outcome === 'Appointment'
      ? "Here's what you did right:"
      : `You struggled on ${CHALLENGE_DIM_LABELS[worstKey] || worstKey} (${worstVal}/20).`;
  }
  if (textEl) textEl.textContent = score.feedback || '';

  // Dimension bars
  const barsEl = document.getElementById('challenge-dim-bars');
  if (barsEl) {
    barsEl.innerHTML = dimKeys.map(k => {
      const val = score[k] ?? 0;
      const pct = Math.round(val / 20 * 100);
      const color = val >= 15 ? 'sb-green' : val >= 10 ? 'sb-yellow' : 'sb-red';
      return `<div class="skill-bar-row${k === worstKey ? ' sb-weakest' : ''}">
        <div class="sb-label">${CHALLENGE_DIM_LABELS[k]}</div>
        <div class="sb-track"><div class="sb-fill ${color}" style="width:${pct}%"></div></div>
        <div class="sb-val">${val}/20</div>
      </div>`;
    }).join('');
  }
}

async function claimChallengeAccount() {
  const name     = document.getElementById('claim-name')?.value.trim() || '';
  const email    = document.getElementById('claim-email')?.value.trim() || '';
  const password = document.getElementById('claim-password')?.value || '';
  const errEl    = document.getElementById('challenge-claim-error');

  if (!name || !email || !password) {
    errEl.textContent = 'All fields are required.';
    errEl.style.display = 'block'; return;
  }
  errEl.style.display = 'none';

  const btn = document.getElementById('challenge-claim-btn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    const res = await fetch('/api/auth/claim-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password, callSid: _challengeCallSid, challengeToken: _challengeToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Account creation failed');

    setAuth(data.token, data.user);
    navigate('/');
  } catch (err) {
    btn.disabled = false; btn.textContent = 'Save My Results →';
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
}

// ── LANDING PAGE ──────────────────────────────────────────────────────────────

function renderLanding() {
  document.body.dataset.page = 'landing';
  app.innerHTML = `
    <div class="landing-v2">

      <!-- ── HERO ─────────────────────────────────────────────────────────── -->
      <section class="hero-section-v3">
        <div class="hero-bg-minimal"></div>
        <div class="hero-content-v3">
          <h1 class="hero-h1 reveal" data-delay="0">
            Train like it's real.
            <br/>
            <span class="hero-h1-accent">Close like it counts.</span>
          </h1>
          <p class="hero-p reveal" data-delay="120">Your reps practice on AI buyers that push back, object, and hang up—on their actual phone. Real pressure. Real scoring. Real improvement.</p>
          <div class="hero-buttons reveal" data-delay="240">
            <button class="btn-cta-primary" id="hero-request-info">Request Info</button>
            <button class="btn-cta-secondary" id="hero-try-call">Try a Call</button>
          </div>
          <p class="hero-footer reveal" data-delay="300">No credit card · No commitment · Setup in 2 minutes</p>
        </div>
        <div class="hero-accent-circles"></div>
      </section>

      <!-- ── STATS ─────────────────────────────────────────────────────────── -->
      <section class="stats-bar-section">
        <div class="stats-bar-inner">
          <div class="stat-pill reveal" data-delay="0"><span class="stat-num">∞</span><span class="stat-lbl">Customers</span></div>
          <div class="stat-pill-divider"></div>
          <div class="stat-pill reveal" data-delay="80"><span class="count-up stat-num" data-target="35">0</span><span class="stat-lbl">Training Modules</span></div>
          <div class="stat-pill-divider"></div>
          <div class="stat-pill reveal" data-delay="160"><span class="count-up stat-num" data-target="5">0</span><span class="stat-lbl">Scored Dimensions</span></div>
          <div class="stat-pill-divider"></div>
          <div class="stat-pill reveal" data-delay="240"><span class="stat-num">∞</span><span class="stat-lbl">Training Calls</span></div>
        </div>
      </section>

      <!-- ── CHALLENGE BLOCK ──────────────────────────────────────────────── -->
      <section class="challenge-section" id="challenge-section">
        <div class="challenge-bg-lights"></div>
        <div class="challenge-container">
          <div class="challenge-eyebrow">LIVE CHALLENGE</div>
          <h2 class="challenge-headline">Think you can close this deal?</h2>
          <p class="challenge-sub">This is exactly what your reps face every day. Let's see how you handle it.</p>

          <div class="challenge-card" id="challenge-card">

            <!-- ── IDLE STATE ── -->
            <div id="challenge-idle">
              <div class="scenario-label">The situation:</div>
              <div class="scenario-preview" id="scenario-preview-text">A customer is calling about a trade-in and thinks your price is too high.</div>
              <div class="scenario-chips-label">Pick your challenge:</div>
              <div class="scenario-chips" id="scenario-chips">
                <button class="scenario-chip active" data-scenario="trade-in" data-preview="A customer is calling about a trade-in and thinks your price is too high.">Trade-In Objection</button>
                <button class="scenario-chip" data-scenario="price" data-preview="Shopper has visited two other dealers and is pushing hard on your number.">Price Too High</button>
                <button class="scenario-chip" data-scenario="not-ready" data-preview="First-time buyer is nervous about monthly payments and says they need more time.">Just Looking</button>
                <button class="scenario-chip" data-scenario="competitor" data-preview="Experienced buyer who&apos;s shopped around and thinks they already know the best deal.">Shopped Around</button>
              </div>
              <div class="challenge-phone-row">
                <input type="tel" id="challenge-phone" class="challenge-phone-input" placeholder="(555) 123-4567" autocomplete="tel" />
              </div>
              <div id="challenge-error" class="challenge-error" style="display:none"></div>
              <button class="challenge-cta" id="challenge-start-btn">Start the Call →</button>
              <p class="challenge-no-signup">No signup. Real call. Instant feedback.</p>
            </div>

            <!-- ── CALLING STATE ── -->
            <div id="challenge-calling" style="display:none" class="challenge-calling-state">
              <div class="challenge-ring-wrap">
                <div class="challenge-ring challenge-ring-3"></div>
                <div class="challenge-ring challenge-ring-2"></div>
                <div class="challenge-ring challenge-ring-1"></div>
                <div class="challenge-ring-icon">📞</div>
              </div>
              <div class="challenge-calling-title">Your phone is ringing.</div>
              <div class="challenge-calling-sub">Answer now — <span id="challenge-persona-name">your buyer</span> is on the line.</div>
              <div class="challenge-calling-badge" id="challenge-difficulty-badge"></div>
              <div class="challenge-calling-progress">
                <span class="challenge-dot"></span>
                <span class="challenge-dot"></span>
                <span class="challenge-dot"></span>
                <span class="challenge-progress-text">Waiting for call to end…</span>
              </div>
            </div>

            <!-- ── DONE STATE ── -->
            <div id="challenge-done" style="display:none" class="challenge-done-state">
              <div class="challenge-result-top">
                <div class="challenge-score-wrap">
                  <div class="challenge-score-big" id="challenge-score-num">—</div>
                  <div class="challenge-score-label">/ 100</div>
                </div>
                <div id="challenge-outcome-badge" class="challenge-outcome-badge"></div>
              </div>
              <div class="challenge-coaching-card" id="challenge-coaching-card">
                <div class="ccc-icon">💬</div>
                <div class="ccc-body">
                  <div class="ccc-headline" id="ccc-headline">Here's what to work on:</div>
                  <div class="ccc-text" id="ccc-text"></div>
                </div>
              </div>
              <div class="challenge-dim-bars" id="challenge-dim-bars"></div>
              <div class="challenge-claim-section">
                <div class="challenge-claim-headline">See your full breakdown + try more scenarios</div>
                <div class="challenge-claim-form">
                  <input type="text"  id="claim-name"     placeholder="Your name" class="challenge-input" />
                  <input type="email" id="claim-email"    placeholder="Email address" class="challenge-input" />
                  <input type="password" id="claim-password" placeholder="Create a password (6+ chars)" class="challenge-input" />
                  <div id="challenge-claim-error" class="challenge-error" style="display:none"></div>
                  <button class="challenge-cta" id="challenge-claim-btn">Save My Results →</button>
                </div>
                <button class="challenge-retry-link" id="challenge-retry-btn">Take another challenge →</button>
              </div>
            </div>

          </div>
        </div>
      </section>

      <!-- ── HOW IT WORKS ───────────────────────────────────────────────────── -->
      <section class="how-section">
        <div class="section-inner">
          <div class="section-eyebrow reveal">How It Works</div>
          <h2 class="section-headline reveal" data-delay="60">From first call to elite closer.</h2>
          <div class="steps-grid">
            <div class="step-card glass reveal" data-delay="0">
              <div class="step-num-badge">01</div>
              <div class="step-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0112 0v2"/></svg>
              </div>
              <h3>Take a Call</h3>
              <p>Head to the Call Arena, pick a difficulty, and press Take a Call. A real buyer dials your phone — no scripts, no shortcuts.</p>
            </div>
            <div class="step-card glass reveal" data-delay="100">
              <div class="step-num-badge">02</div>
              <div class="step-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81 19.79 19.79 0 01.14 2.18 2 2 0 012.11 0h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 14.92v2z"/></svg>
              </div>
              <h3>Your Phone Rings</h3>
              <p>A live AI call comes in on your actual phone. Unscripted. Pressure-filled. Indistinguishable from a real buyer — because it's built to be.</p>
            </div>
            <div class="step-card glass reveal" data-delay="200">
              <div class="step-num-badge">03</div>
              <div class="step-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </div>
              <h3>Get Scored Instantly</h3>
              <p>AI coaching grades your opening, rapport, info capture, objection handling, and appointment close — with specific feedback you can act on today.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ── KORA FRAMEWORK ─────────────────────────────────────────────────── -->
      <section class="kora-section">
        <div class="section-inner">
          <div class="kora-grid">
            <div class="kora-content reveal-left">
              <div class="section-eyebrow">The FreshUp Method</div>
              <h2 class="section-headline">AI buyers that behave like real people.</h2>
              <p class="kora-body">Most AI roleplay tools are easy to hack — say the right keywords and the bot folds. FreshUp trains each buyer simulation with behavioral anchors, internal emotional states, randomized call contexts, and authentic speech patterns. Your reps can't script their way through it.</p>
              <ul class="kora-pillars">
                <li><span class="kora-pill">Behavioral Anchors</span>Verbatim dialogue examples of how each buyer speaks</li>
                <li><span class="kora-pill">Internal State</span>Hidden emotional context driving every response</li>
                <li><span class="kora-pill">Scenario Variants</span>Randomized call-opening context each session</li>
                <li><span class="kora-pill">Speech Patterns</span>Authentic vocabulary, pacing, and energy calibration</li>
                <li><span class="kora-pill">Knowledge Profile</span>Each buyer knows exactly what they'd actually know</li>
              </ul>
            </div>
            <div class="kora-visual reveal-right" data-delay="80">
              <div class="glass kora-demo-card">
                <div class="kora-demo-header">
                  <div class="kora-demo-avatar">M</div>
                  <div>
                    <div class="kora-demo-name">Marcus Webb</div>
                    <div class="kora-demo-meta">Accountant · Atlanta · Difficulty: Hard</div>
                  </div>
                  <div class="kora-demo-tag">FreshUp Active</div>
                </div>
                <div class="kora-exchange">
                  <div class="kora-line kora-rep">Rep: "Thanks for calling — what brought you in today?"</div>
                  <div class="kora-line kora-buyer">"Yeah, I saw the Silverado online. What's the out-the-door price?"</div>
                  <div class="kora-exchange-gap"></div>
                  <div class="kora-line kora-rep">Rep: "Great question — before I pull that number, what are you currently driving?"</div>
                  <div class="kora-line kora-buyer">"Look, I just need the price. Can you give me that or not?"</div>
                </div>
                <div class="kora-anchor-label">Example Exchange</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── FEATURES ───────────────────────────────────────────────────────── -->
      <section class="features-section">
        <div class="section-inner">
          <div class="section-eyebrow reveal">Built for Dealers</div>
          <h2 class="section-headline reveal" data-delay="60">Everything a dealer needs to build an elite phone team.</h2>
          <div class="features-grid">
            <div class="feature-card glass reveal" data-delay="0">
              <div class="feature-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              </div>
              <h3>Team Dashboard</h3>
              <p>See every rep's call volume, scores, and training progress in one view. No more guessing who's putting in the reps.</p>
            </div>
            <div class="feature-card glass reveal" data-delay="80">
              <div class="feature-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              </div>
              <h3>Live Leaderboard</h3>
              <p>Friendly competition drives daily practice. Reps track their rank in real time and compete for the top spot.</p>
            </div>
            <div class="feature-card glass reveal" data-delay="160">
              <div class="feature-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
              </div>
              <h3>Structured Curriculum</h3>
              <p>From phone basics to elite closing — the FreshUp Framework, Objection Gauntlet, Call Arena, and guided courses cover every skill your team needs to win on the phone.</p>
            </div>
            <div class="feature-card glass reveal" data-delay="240">
              <div class="feature-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <h3>Instant AI Coaching</h3>
              <p>Every call scored in seconds on 5 dimensions with specific, actionable coaching feedback your reps can use on the very next call.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ── LEAD CAPTURE ───────────────────────────────────────────────────── -->
      <section class="lead-capture-section" id="contact-section">
        <div class="lc-inner">
          <div class="section-eyebrow">GET CUSTOM PRICING</div>
          <h2 class="section-headline">Built for your dealership.</h2>
          <p class="lc-sub">Tell us about your store and we'll reach out with a custom demo and pricing for your team size.</p>
          <form class="lead-form" id="lead-form">
            <div class="lf-row">
              <input type="text"   name="contactName"    placeholder="Your name"           class="lf-input" required />
              <input type="text"   name="dealershipName" placeholder="Dealership name"      class="lf-input" required />
            </div>
            <div class="lf-row">
              <input type="tel"    name="phone"          placeholder="(555) 123-4567"       class="lf-input" required />
              <input type="email"  name="email"          placeholder="Email address"         class="lf-input" required />
            </div>
            <div class="lf-row">
              <input type="text"   name="zip"            placeholder="Zip code"             class="lf-input" />
              <input type="number" name="repCount"       placeholder="Estimated # of reps"  class="lf-input" min="1" />
            </div>
            <textarea name="message" placeholder="Anything else you'd like us to know?" class="lf-input lf-textarea"></textarea>
            <div id="lead-form-msg" class="lead-form-msg" style="display:none"></div>
            <button type="submit" class="btn-shimmer lf-submit">Request a Demo →</button>
          </form>
        </div>
      </section>

    </div>
  `;

  document.getElementById('hero-request-info')?.addEventListener('click', () => {
    document.getElementById('contact-section')?.scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('hero-try-call')?.addEventListener('click', () => {
    document.getElementById('challenge-section')?.scrollIntoView({ behavior: 'smooth' });
  });

  bindChallengeBlock();
  initScrollReveal();

  const leadForm = document.getElementById('lead-form');
  if (leadForm) {
    leadForm.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = leadForm.querySelector('.lf-submit');
      const msgEl = document.getElementById('lead-form-msg');
      btn.disabled = true;
      btn.textContent = 'Sending…';
      msgEl.style.display = 'none';
      const body = Object.fromEntries(new FormData(leadForm));
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          leadForm.reset();
          msgEl.textContent = "Thanks! We'll be in touch within 1 business day.";
          msgEl.className = 'lead-form-msg lf-success';
          msgEl.style.display = 'block';
          btn.textContent = 'Sent ✓';
        } else {
          const d = await res.json().catch(() => ({}));
          msgEl.textContent = d.error || 'Something went wrong. Please try again.';
          msgEl.className = 'lead-form-msg lf-error';
          msgEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Request a Demo →';
        }
      } catch {
        msgEl.textContent = 'Network error. Please try again.';
        msgEl.className = 'lead-form-msg lf-error';
        msgEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Request a Demo →';
      }
    });
  }
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
        <p class="auth-switch">First time here? <a href="#/register" class="link">Join Now</a></p>
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
          <button type="button" class="role-btn${defaultRole === 'rep' ? ' active' : ''}" data-role="rep">Rep</button>
          <button type="button" class="role-btn${defaultRole === 'manager' ? ' active' : ''}" data-role="manager">Manager</button>
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
              <label for="reg-team">Dealership Name</label>
              <input type="text" id="reg-team" placeholder="Metro Ford" autocomplete="organization" />
            </div>
            <div class="form-group">
              <label for="reg-access-code">Manager Access Code</label>
              <input type="text" id="reg-access-code" placeholder="Enter your access code" autocomplete="off" style="text-transform:uppercase" />
              <p class="input-hint">Contact FreshUp to get your dealership access code.</p>
            </div>
          </div>

          <div id="rep-fields" style="display:${defaultRole === 'rep' ? 'block' : 'none'}">
            <div class="form-group">
              <label for="reg-invite">Team Invite Code <span style="color:var(--error)">*</span></label>
              <input type="text" id="reg-invite" placeholder="Enter code from your manager" autocomplete="off" style="text-transform:uppercase" />
              <p class="input-hint">Your manager will send you a unique invite code when you join their team.</p>
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
    // Only mark invite code required when rep tab is active — hidden required fields block submission
    document.getElementById('reg-invite').required = currentRole === 'rep';
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
      body.access_code = document.getElementById('reg-access-code').value.trim();
    } else {
      body.invite_code = document.getElementById('reg-invite').value.trim();
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
  foundations: [
    'phone-open-1','phone-open-2','phone-open-3','phone-open-4','phone-open-5',
    'phone-discovery-1','phone-discovery-2','phone-discovery-3','phone-discovery-4','phone-discovery-5',
  ],
  expert: [
    'phone-price-1','phone-price-2','phone-price-3','phone-price-4','phone-price-5',
    'phone-objections-1','phone-objections-2','phone-objections-3','phone-objections-4','phone-objections-5',
  ],
  elite: [
    'phone-close-1','phone-close-2','phone-close-3','phone-close-4','phone-close-5',
    'phone-elite-1','phone-elite-2','phone-elite-3','phone-elite-4','phone-elite-5',
  ],
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
  app.innerHTML = '<div class="page-skeleton"><div class="skel skel-title"></div><div class="skel skel-text"></div><div class="skel skel-text skel-short"></div></div>';
  const user = getUser();
  let history = [], progress = [], courses = [];
  try { history = await api('/api/call/history'); } catch (e) { /* empty */ }
  try { progress = await api('/api/courses/progress'); } catch (e) { /* empty */ }
  try { courses = await api('/api/courses'); } catch (e) { /* empty */ }

  const total = history.length;
  const scored = history.filter(c => c.score && c.score.overallScore != null);
  const modulesCompleted = progress.length;
  const recent = history.slice(0, 8);

  // Certifications
  const progressSet = new Set(progress);
  const certs = {
    foundations: CERT_IDS.foundations.every(id => progressSet.has(id)),
    expert:      CERT_IDS.expert.every(id => progressSet.has(id)),
    elite:       CERT_IDS.elite.every(id => progressSet.has(id)),
  };
  const allCertified = certs.foundations && certs.expert && certs.elite;

  // Continue learning
  let nextModule = null;
  for (const course of courses) {
    if (!course.modules) continue;
    const firstIncomplete = course.modules.find(m => !progressSet.has(m.id));
    if (firstIncomplete) { nextModule = { course, module: firstIncomplete }; break; }
  }

  // Score trend: last 5 vs previous 5
  let trend = null;
  if (scored.length >= 10) {
    const last5avg = scored.slice(0, 5).reduce((s, c) => s + c.score.overallScore, 0) / 5;
    const prev5avg = scored.slice(5, 10).reduce((s, c) => s + c.score.overallScore, 0) / 5;
    trend = Math.round(last5avg - prev5avg);
  }

  const streak = calcStreak(history);

  // Appointment set rate
  const completedCalls = history.filter(c => c.outcome === 'Appointment' || c.outcome === 'HangUp');
  const apptCalls = history.filter(c => c.outcome === 'Appointment');
  const apptRate = completedCalls.length > 0 ? Math.round(apptCalls.length / completedCalls.length * 100) : null;

  // Dimension averages (last 20 scored calls)
  const dimKeys = ['opening', 'rapport', 'infoCapture', 'objectionHandling', 'appointment'];
  const dimLabels = { opening: 'Opening', rapport: 'Rapport', infoCapture: 'Lead Capture', objectionHandling: 'Objection Handling', appointment: 'Close' };
  const recent20 = scored.slice(0, 20);
  const dimAvgs = {};
  for (const k of dimKeys) {
    const vals = recent20.map(c => c.score[k]).filter(v => v != null);
    dimAvgs[k] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  }
  const sortedDims = scored.length > 0 ? dimKeys.slice().sort((a, b) => dimAvgs[a] - dimAvgs[b]) : [];
  const weakestDim = sortedDims[0] || null;
  const strongestDim = sortedDims[sortedDims.length - 1] || null;

  // Performance headline
  let headline = '', headlineSub = '';
  if (total === 0) {
    headline = `Welcome, ${escHtml(user ? user.name.split(' ')[0] : '')}`;
    headlineSub = 'Your first training call is 30 seconds away.';
  } else if (total < 5) {
    headline = 'Building your baseline';
    headlineSub = `Take ${5 - total} more call${5 - total !== 1 ? 's' : ''} to unlock full performance insights.`;
  } else if (trend !== null && trend >= 3) {
    headline = "You're improving";
    headlineSub = `Avg score up ${trend} points in your last 5 calls. Keep it going.`;
  } else if (trend !== null && trend <= -3) {
    headline = 'Focus time';
    headlineSub = `Avg score down ${Math.abs(trend)} points recently. ${weakestDim ? `Work on your ${dimLabels[weakestDim]}.` : 'Get some reps in.'}`;
  } else {
    headline = "Here's your performance";
    headlineSub = streak >= 2 ? `${streak}-day training streak — keep the momentum.` : 'Keep taking calls to build consistency.';
  }

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${headline}</h1>
        <p class="subtitle">${headlineSub}</p>
      </div>
      <a class="btn btn-primary" href="#/start">+ Take a Call</a>
    </div>

    ${total === 0 ? `
      <div class="quickstart-card">
        <div class="qs-icon">📞</div>
        <div class="qs-body">
          <h3>You're 30 seconds from your first call</h3>
          <p>Enter your number and a simulated buyer will call you right now.</p>
          <div class="qs-form">
            <input type="tel" id="qs-phone" class="qs-phone-input"
              placeholder="(555) 123-4567"
              value="${escHtml((user && user.phone_number) ? user.phone_number : '')}"
              autocomplete="tel" />
            <button class="btn btn-primary" id="qs-call-btn">Call Me Now</button>
          </div>
          <div id="qs-msg" class="settings-msg" style="display:none"></div>
        </div>
      </div>
    ` : `
      <div class="kpi-strip">
        <div class="kpi-card">
          <div class="kpi-val ${apptRate !== null ? (apptRate >= 30 ? 'kpi-green' : apptRate >= 20 ? 'kpi-yellow' : 'kpi-red') : ''}">${apptRate !== null ? apptRate + '%' : '—'}</div>
          <div class="kpi-lbl">Appt Set Rate</div>
          <div class="kpi-sub">your last ${completedCalls.length} call${completedCalls.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-val" style="${strongestDim ? 'color:var(--success)' : ''}">${strongestDim ? dimAvgs[strongestDim] + '/20' : '—'}</div>
          <div class="kpi-lbl">Top Skill</div>
          <div class="kpi-sub">${strongestDim ? dimLabels[strongestDim] : 'Take more calls'}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-val" style="${weakestDim && dimAvgs[weakestDim] < 12 ? 'color:var(--warning)' : ''}">${weakestDim ? dimAvgs[weakestDim] + '/20' : '—'}</div>
          <div class="kpi-lbl">Focus Area</div>
          <div class="kpi-sub">${weakestDim ? dimLabels[weakestDim] : 'Take more calls'}</div>
        </div>
      </div>
      ${streak >= 2 ? `<div class="streak-badge"><span class="streak-fire">🔥</span><strong>${streak}-day streak</strong><span class="streak-sub">Train again today to keep it going</span></div>` : ''}
    `}

    ${scored.length >= 3 ? `
    <div class="card skills-card">
      <div class="skills-header">
        <h3>Your Skills</h3>
        ${weakestDim ? `<span class="skills-gap-label">Focus: <strong>${dimLabels[weakestDim]}</strong></span>` : ''}
      </div>
      <div class="skill-bars">
        ${dimKeys.map(k => {
          const val = dimAvgs[k] || 0;
          const pct = Math.round(val / 20 * 100);
          const colorClass = val >= 15 ? 'sb-green' : val >= 10 ? 'sb-yellow' : 'sb-red';
          return `<div class="skill-bar-row${k === weakestDim ? ' sb-weakest' : ''}">
              <div class="sb-label">${dimLabels[k]}</div>
              <div class="sb-track"><div class="sb-fill ${colorClass}" style="width:${pct}%"></div></div>
              <div class="sb-val">${val}/20</div>
            </div>`;
        }).join('')}
      </div>
      ${weakestDim ? `<div class="skills-cta"><a href="#/start" class="btn btn-primary btn-sm">Work on ${dimLabels[weakestDim]} →</a></div>` : ''}
    </div>
    ` : ''}

    <div class="cert-strip">
      ${certBadge('phone-open', 'FreshUp Ready', certs.foundations)}
      ${certBadge('phone-price', 'FreshUp Expert', certs.expert)}
      ${certBadge('phone-close', 'FreshUp Elite', certs.elite)}
    </div>

    ${allCertified ? `
      <div class="all-cert-banner">
        <span class="all-cert-star">★</span>
        <div>
          <strong>FreshUp Elite Certified</strong>
          <div>You've mastered all 35 modules — you're a top-tier phone-up professional.</div>
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

    ${total > 0 ? `
      <div class="section-header" style="margin-top:24px">
        <h2>Recent Calls</h2>
        ${total > 8 ? '<a href="#/history" class="link-sm">View all →</a>' : ''}
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th>Caller</th><th>Result</th><th>Score</th><th>Duration</th><th>Date</th><th></th>
        </tr></thead>
        <tbody>${recent.map(callRow).join('')}</tbody>
      </table></div>
    ` : ''}
  `;

  // Wire phone formatter for quick-start field
  initPhoneInput(document.getElementById('qs-phone'));

  // Quick-start "Call Me Now" handler
  document.getElementById('qs-call-btn')?.addEventListener('click', async () => {
    const phoneInput = document.getElementById('qs-phone');
    const msgEl = document.getElementById('qs-msg');
    const phone = phoneInput?.value.trim() || '';
    if (!phone) {
      msgEl.textContent = 'Enter your cell number to receive the call.';
      msgEl.className = 'settings-msg error'; msgEl.style.display = 'block'; return;
    }
    const btn = document.getElementById('qs-call-btn');
    btn.disabled = true; btn.textContent = 'Calling…';
    try {
      if (!user?.phone_number || user.phone_number !== phone) {
        const profileRes = await api('/api/auth/profile', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone_number: phone }),
        });
        setAuth(profileRes.token, profileRes.user);
      }
      const callRes = await api('/api/call/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone, difficulty: 'Easy' }),
      });
      navigate(`/call/${callRes.callSid}`);
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Call Me Now';
      msgEl.textContent = err.message;
      msgEl.className = 'settings-msg error'; msgEl.style.display = 'block';
    }
  });
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

function historyCallRow(c) {
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
    <td>${weakestDimPill(c.score)}</td>
    <td class="text-muted">${formatDuration(c.duration)}</td>
    <td class="text-subtle text-sm">${formatDate(c.timestamp)}</td>
    <td><a href="#/call/${c.callSid}" class="btn btn-secondary btn-sm">View</a></td>
  </tr>`;
}

// ── START CALL / CALL ARENA ───────────────────────────────────────────────────

let selectedPersonaId = null; // used only for module challenges
let gaugeDisplayedScore = 0;  // tracks current displayed value for count-up animation

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
  return [
    ['Opening', 'opening'],
    ['Rapport', 'rapport'],
    ['Info Capture', 'infoCapture'],
    ['Objection Hdl', 'objectionHandling'],
    ['Appointment', 'appointment'],
  ].map(([label, key]) => `
      <div class="gauge-dim">
        <div class="gauge-dim-header">
          <span>${label}</span>
          <span class="gauge-dim-val" id="${prefix}dim-${key}">—</span>
        </div>
        <div class="gauge-dim-bar">
          <div class="gauge-dim-fill" id="${prefix}dimbar-${key}" style="width:0%"></div>
        </div>
      </div>`).join('');
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
              <input type="tel" id="phone" placeholder="(555) 123-4567" autocomplete="tel"/>
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

  // Pre-fill phone number from saved profile
  const savedPhone = (getUser() || {}).phone_number || '';
  const phoneInput = document.getElementById('phone');
  if (phoneInput && savedPhone) {
    phoneInput.value = savedPhone;
    updateStartBtn();
  }
  initPhoneInput(phoneInput);

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
  app.innerHTML = '<div class="page-skeleton"><div class="skel skel-title"></div><div class="skel skel-text"></div><div class="skel skel-text skel-short"></div></div>';
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
      ? `<div class="empty-state">
          <div class="empty-icon">📋</div>
          <h3>No calls yet</h3>
          <p>Your call history will appear here after your first training call.</p>
          <a href="#/start" class="btn btn-primary">Take Your First Call</a>
        </div>`
      : `<div class="table-wrap"><table>
          <thead><tr><th>Caller</th><th>Result</th><th>Score</th><th>Focus Area</th><th>Duration</th><th>Date</th><th></th></tr></thead>
          <tbody>${history.map(historyCallRow).join('')}</tbody>
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
          <div id="score-context-wrap"></div>
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
  gaugeDisplayedScore = 0;
  const token = getToken();
  const src = new EventSource(`/api/call/${callSid}/stream?token=${encodeURIComponent(token || '')}`);
  let currentAssistantBubble = null;

  function showTypingIndicator() {
    const container = document.getElementById('lt-messages');
    if (!container || document.getElementById('typing-indicator')) return;
    const empty = document.getElementById('lt-empty');
    if (empty) empty.remove();
    const div = document.createElement('div');
    div.id = 'typing-indicator';
    div.className = 'tb tb-assistant';
    div.innerHTML = '<div class="tb-who">Caller</div>' +
      '<div class="tb-text tb-dots">' +
        '<span class="typing-dot"></span>' +
        '<span class="typing-dot"></span>' +
        '<span class="typing-dot"></span>' +
      '</div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function removeTypingIndicator() {
    document.getElementById('typing-indicator')?.remove();
  }

  src.onmessage = (e) => {
    let event;
    try { event = JSON.parse(e.data); } catch { return; }

    switch (event.type) {
      case 'user_message':
        currentAssistantBubble = null;
        addTranscriptBubble('user', event.content);
        showTypingIndicator();
        break;
      case 'assistant_message':
        removeTypingIndicator();
        if (currentAssistantBubble) {
          currentAssistantBubble.querySelector('.tb-text').textContent = event.content;
          currentAssistantBubble.classList.remove('tb-streaming');
        } else {
          addTranscriptBubble('assistant', event.content);
        }
        currentAssistantBubble = null;
        break;
      case 'assistant_delta':
        removeTypingIndicator();
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
        removeTypingIndicator();
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
    if (num) {
      animateCounter(num, overall, 700, gaugeDisplayedScore);
      gaugeDisplayedScore = overall;
    }
  }
  ['opening', 'rapport', 'infoCapture', 'objectionHandling', 'appointment'].forEach(dim => {
    const val = score[dim];
    if (val == null) return;
    // Each dimension is scored 0-20; scale to percentage for bar (0-20 → 0-100%)
    const pct = Math.max(0, Math.min(100, val * 5));
    const el = document.getElementById(`live-dim-${dim}`);
    const bar = document.getElementById(`live-dimbar-${dim}`);
    if (el) el.textContent = String(val);
    if (bar) { bar.style.width = `${pct}%`; bar.style.background = scoreColor(pct); }
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
  const outcomeTitle = data.outcome === 'Appointment' ? 'Appointment Set'
    : data.outcome === 'HangUp' ? 'Caller Hung Up'
    : 'Call Complete';
  if (title) title.textContent = outcomeTitle;

  if (data.outcome) showLiveOutcome(data.outcome);

  // Contact reveal in left pane (with Reveal / Quiz Me toggle)
  if (data.contactInfo) {
    const cr = document.getElementById('live-contact-reveal');
    if (cr) {
      const ci = data.contactInfo;
      cr.innerHTML = `
        <div class="contact-reveal">
          <div class="contact-reveal-header">
            <span class="contact-reveal-icon">📋</span>
            <div>
              <strong>Caller Info</strong>
              <div class="contact-reveal-sub">Did you capture it?</div>
            </div>
            <div class="quiz-toggle-btns">
              <button class="quiz-toggle-btn active" id="btn-reveal">Reveal</button>
              <button class="quiz-toggle-btn" id="btn-quiz">Quiz Me</button>
            </div>
          </div>
          <div id="contact-reveal-panel">
            <div class="contact-grid">
              <div class="contact-field"><span class="cf-lbl">Name</span><span class="cf-val">${escHtml(ci.name)}</span></div>
              <div class="contact-field"><span class="cf-lbl">Phone</span><span class="cf-val">${escHtml(ci.phone)}</span></div>
              <div class="contact-field"><span class="cf-lbl">Email</span><span class="cf-val">${escHtml(ci.email)}</span></div>
              <div class="contact-field"><span class="cf-lbl">Vehicle</span><span class="cf-val">${escHtml(ci.car)}</span></div>
            </div>
          </div>
          <div id="contact-quiz-panel" style="display:none">
            <div class="quiz-inputs">
              <div class="form-group"><label>Name</label><input type="text" class="quiz-input" data-field="name" placeholder="Caller's name" /></div>
              <div class="form-group"><label>Phone</label><input type="text" class="quiz-input" data-field="phone" placeholder="Callback number" /></div>
              <div class="form-group"><label>Email</label><input type="text" class="quiz-input" data-field="email" placeholder="Email address" /></div>
              <div class="form-group"><label>Vehicle</label><input type="text" class="quiz-input" data-field="car" placeholder="Vehicle of interest" /></div>
            </div>
            <button class="btn btn-primary btn-full btn-sm" id="quiz-submit-btn">Grade My Notes</button>
            <div id="quiz-results"></div>
          </div>
        </div>`;

      document.getElementById('btn-reveal').addEventListener('click', () => {
        document.getElementById('btn-reveal').classList.add('active');
        document.getElementById('btn-quiz').classList.remove('active');
        document.getElementById('contact-reveal-panel').style.display = '';
        document.getElementById('contact-quiz-panel').style.display = 'none';
      });
      document.getElementById('btn-quiz').addEventListener('click', () => {
        document.getElementById('btn-quiz').classList.add('active');
        document.getElementById('btn-reveal').classList.remove('active');
        document.getElementById('contact-reveal-panel').style.display = 'none';
        document.getElementById('contact-quiz-panel').style.display = '';
      });
      document.getElementById('quiz-submit-btn').addEventListener('click', () => {
        const fields = ['name', 'phone', 'email', 'car'];
        const answers = {};
        document.querySelectorAll('.quiz-input').forEach(inp => {
          answers[inp.dataset.field] = inp.value.trim().toLowerCase();
        });
        let correct = 0;
        const results = fields.map(f => {
          const expected = (ci[f] || '').toLowerCase().trim();
          const actual = answers[f] || '';
          const ok = actual.length > 0 && (actual === expected || expected.includes(actual) || actual.includes(expected));
          if (ok) correct++;
          return `<div class="quiz-result-row ${ok ? 'quiz-ok' : 'quiz-miss'}">
            <span class="quiz-result-icon">${ok ? '✓' : '✗'}</span>
            <span class="quiz-result-lbl">${f === 'car' ? 'Vehicle' : f.charAt(0).toUpperCase() + f.slice(1)}</span>
            <span class="quiz-result-val">${escHtml(ci[f])}</span>
          </div>`;
        });
        const pct = Math.round(correct / fields.length * 100);

        // Bonus points: +2.5 per correct field, max +10, cap total at 100
        const bonus = correct * 2.5;
        if (bonus > 0 && data.score) {
          const newScore = Math.min(100, (data.score.overallScore || 0) + bonus);
          updateGauge({ ...data.score, overallScore: newScore });
          const gaugeEl = document.getElementById('gauge-score-live');
          if (gaugeEl) {
            const start = data.score.overallScore || 0;
            const end = newScore;
            let cur = start;
            const step = (end - start) / 20;
            const tick = setInterval(() => {
              cur = Math.min(end, cur + step);
              gaugeEl.textContent = Math.round(cur);
              if (cur >= end) clearInterval(tick);
            }, 30);
          }
        }

        document.getElementById('quiz-results').innerHTML = `
          <div class="quiz-score-banner" style="color:${scoreColor(pct)}">
            ${correct}/${fields.length} captured correctly (${pct}%)
            ${bonus > 0 ? `<span class="quiz-bonus">+${bonus} bonus pts!</span>` : ''}
          </div>
          ${results.join('')}`;
        document.getElementById('quiz-submit-btn').style.display = 'none';
      });
    }
  }

  // Final gauge + feedback in right pane
  if (data.score) {
    updateGauge(data.score);

    // Personal average comparison
    const thisScore = data.score.overallScore;
    if (thisScore != null) {
      const ctxWrap = document.getElementById('score-context-wrap');
      if (ctxWrap) {
        api('/api/call/history').then(history => {
          const others = history.filter(c => c.callSid !== callSid && c.score?.overallScore != null);
          if (others.length >= 1) {
            const avg = Math.round(others.reduce((a, c) => a + c.score.overallScore, 0) / others.length);
            const diff = thisScore - avg;
            const text = diff > 0 ? `↑ ${diff} above your average (${avg})`
                       : diff < 0 ? `↓ ${Math.abs(diff)} below your average (${avg})`
                       : `= Matches your average (${avg})`;
            const cls = diff > 0 ? 'score-ctx-good' : diff < 0 ? 'score-ctx-low' : 'score-ctx-neutral';
            ctxWrap.innerHTML = `<div class="score-context ${cls}">${text}</div>`;
          }
        }).catch(() => {});
      }
    }

    if (data.score.feedback) {
      const fw = document.getElementById('live-feedback-wrap');
      if (fw) {
        const feedbackHeader = data.outcome === 'Appointment'
          ? "Here's what you did right:"
          : data.outcome === 'HangUp'
          ? "Here's what to work on:"
          : 'Coaching feedback:';
        fw.innerHTML = `<div class="live-feedback-header">${feedbackHeader}</div><div class="live-feedback">${escHtml(data.score.feedback)}</div>`;
      }
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
  app.innerHTML = '<div class="page-skeleton"><div class="skel skel-title"></div><div class="skel skel-text"></div><div class="skel skel-text skel-short"></div></div>';
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
  app.innerHTML = '<div class="page-skeleton"><div class="skel skel-title"></div><div class="skel skel-text"></div><div class="skel skel-text skel-short"></div></div>';
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
  app.innerHTML = '<div class="page-skeleton"><div class="skel skel-title"></div><div class="skel skel-text"></div><div class="skel skel-text skel-short"></div></div>';
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
  app.innerHTML = '<div class="page-skeleton"><div class="skel skel-title"></div><div class="skel skel-text"></div><div class="skel skel-text skel-short"></div></div>';
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
  app.innerHTML = '<div class="page-skeleton"><div class="skel skel-title"></div><div class="skel skel-text"></div><div class="skel skel-text skel-short"></div></div>';

  const user = getUser();
  let allRows = [], teamRows = [];

  try { allRows = await api('/api/courses/leaderboard/top'); } catch { /* fall through */ }

  const userHasTeam = user && user.teamId;
  if (userHasTeam) {
    try { teamRows = await api('/api/courses/leaderboard/top?scope=team'); } catch { /* fall through */ }
  }

  let activeTab = 'all';

  function buildTable(rows) {
    if (rows.length === 0) return '<tr><td colspan="6" class="empty-row">No data yet — start training!</td></tr>';
    return rows.map(r => leaderboardRow(r, user)).join('');
  }

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Leaderboard</h1>
        <p class="subtitle">Composite score: 70% calls · 25% gauntlet · 5% courses</p>
      </div>
    </div>
    ${userHasTeam ? `
    <div class="lb-tabs">
      <button class="lb-tab active" data-tab="all">All of FreshUp</button>
      <button class="lb-tab" data-tab="team">My Dealership</button>
    </div>` : ''}
    <div class="table-wrap">
      <table class="leaderboard-table">
        <thead><tr>
          <th>Rank</th><th>Name</th><th>Composite</th><th>Calls</th><th>Call Avg</th><th>Gauntlet Avg</th><th>Courses</th>
        </tr></thead>
        <tbody id="lb-tbody">
          ${buildTable(allRows)}
        </tbody>
      </table>
    </div>
  `;

  if (userHasTeam) {
    app.querySelectorAll('.lb-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        app.querySelectorAll('.lb-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeTab = btn.dataset.tab;
        document.getElementById('lb-tbody').innerHTML = buildTable(activeTab === 'team' ? teamRows : allRows);
      });
    });
  }
}

function leaderboardRow(r, user) {
  const isMe = user && user.id === r.id;
  const rankDisplay = r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank;
  const composite = r.compositeScore != null ? r.compositeScore : '—';
  const callAvg = r.avgCallScore != null ? r.avgCallScore : '—';
  const gauntletAvg = r.avgGauntletScore != null ? r.avgGauntletScore : '—';

  return `
    <tr class="${isMe ? 'leaderboard-me' : ''}">
      <td class="rank-cell">${rankDisplay}</td>
      <td>
        <div class="cell-with-avatar">
          ${avatar(r.name)}
          <span>${escHtml(r.name)}${isMe ? ' <span class="you-badge">You</span>' : ''}</span>
        </div>
      </td>
      <td class="score-num" style="color:${r.compositeScore ? scoreColor(r.compositeScore) : 'var(--text-muted)'}">${composite}</td>
      <td>${r.totalCalls}</td>
      <td class="score-num" style="color:${r.avgCallScore ? scoreColor(r.avgCallScore) : 'var(--text-muted)'}">${callAvg}</td>
      <td class="score-num" style="color:${r.avgGauntletScore ? scoreColor(r.avgGauntletScore) : 'var(--text-muted)'}">${gauntletAvg}</td>
      <td>${r.modulesCompleted}</td>
    </tr>
  `;
}

// ── TEAM DASHBOARD (Manager only) ─────────────────────────────────────────────

async function renderTeam() {
  app.innerHTML = '<div class="page-skeleton"><div class="skel skel-title"></div><div class="skel skel-text"></div><div class="skel skel-text skel-short"></div></div>';

  let teamData, analytics;
  try { teamData = await api('/api/team'); } catch (e) {
    app.innerHTML = `<div class="empty-state">${escHtml(e.message)}</div>`;
    return;
  }
  try { analytics = await api('/api/team/analytics'); } catch (e) { analytics = null; }

  const { team, members } = teamData;
  const now = Date.now();
  const WEEK = 7 * 24 * 60 * 60 * 1000;

  const config = analytics?.config ?? {};
  const apptRate = analytics ? Math.round((analytics.appointmentRate || 0) * 100) : null;
  const callsThisWeek = analytics?.callsThisWeek ?? '—';
  const callsLastWeek = analytics?.callsLastWeek ?? 0;
  const teamAvgScore = analytics?.teamAvgScore || null;
  const activeRepsThisWeek = analytics?.activeRepsThisWeek ?? '—';
  const dims = analytics?.dimensionAverages ?? null;
  const repStats = analytics?.repStats ?? [];
  const recentCalls = analytics?.recentCalls ?? [];
  const avgDealValue = config.avgDealValue ? Number(config.avgDealValue) : null;
  const weekDelta = typeof callsThisWeek === 'number' && typeof callsLastWeek === 'number'
    ? callsThisWeek - callsLastWeek : 0;
  const monthlyCallsEst = typeof callsThisWeek === 'number' ? callsThisWeek * 4 : 0;
  const monthlyApptsEst = Math.round((analytics?.appointmentRate || 0) * monthlyCallsEst);

  const dimLabels = { opening: 'Opening', rapport: 'Rapport', infoCapture: 'Lead Capture', objectionHandling: 'Objection Handling', appointment: 'Close' };
  let weakestDimKey = null, weakestDimVal = Infinity;
  if (dims) {
    for (const [k, v] of Object.entries(dims)) {
      if (v < weakestDimVal) { weakestDimVal = v; weakestDimKey = k; }
    }
  }

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${escHtml(team.name)}</h1>
        <p class="subtitle">Performance Center — ${members.length} rep${members.length !== 1 ? 's' : ''}</p>
      </div>
      <button class="btn btn-secondary" id="invite-btn">Copy Invite Link</button>
    </div>

    <div class="kpi-strip">
      <div class="kpi-card">
        <div class="kpi-val ${apptRate !== null ? (apptRate >= 30 ? 'kpi-green' : apptRate >= 20 ? 'kpi-yellow' : 'kpi-red') : ''}">${apptRate !== null ? apptRate + '%' : '—'}</div>
        <div class="kpi-lbl">Appointment Set Rate</div>
        <div class="kpi-sub">this month</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">${teamAvgScore ? teamAvgScore + '/100' : '—'}</div>
        <div class="kpi-lbl">Team Avg Score</div>
        <div class="kpi-sub">scored calls</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">${callsThisWeek}${weekDelta !== 0 ? `<span class="kpi-delta ${weekDelta > 0 ? 'kpi-delta-up' : 'kpi-delta-down'}">${weekDelta > 0 ? '+' : ''}${weekDelta}</span>` : ''}</div>
        <div class="kpi-lbl">Calls This Week</div>
        <div class="kpi-sub">vs last week</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val">${activeRepsThisWeek}<span class="kpi-denom">/${members.length}</span></div>
        <div class="kpi-lbl">Active Reps</div>
        <div class="kpi-sub">trained this week</div>
      </div>
    </div>

    ${avgDealValue ? `
    <div class="revenue-impact-card">
      <div class="ric-icon">$</div>
      <div class="ric-body">
        <div class="ric-title">Estimated Revenue Impact — This Month</div>
        <div class="ric-calc">
          <span class="ric-num">${monthlyApptsEst}</span> appointments ×
          <span class="ric-num">25%</span> close rate ×
          <span class="ric-num">$${avgDealValue.toLocaleString()}</span> avg deal =
          <strong class="ric-total">$${Math.round(monthlyApptsEst * 0.25 * avgDealValue).toLocaleString()} pipeline</strong>
        </div>
        <div class="ric-note">Your team's ${apptRate !== null ? apptRate + '%' : '—'} appt rate vs. 22% industry baseline${apptRate !== null && apptRate > 22 ? ' — above average' : ''}</div>
      </div>
    </div>
    ` : `
    <div class="revenue-impact-card ric-empty">
      <div class="ric-icon">$</div>
      <div class="ric-body">
        <div class="ric-title">Unlock Revenue Impact Estimates</div>
        <div class="ric-note">Set your average deal value to see how your team's appointment rate translates to pipeline.</div>
      </div>
      <a href="#/settings" class="btn btn-secondary btn-sm" style="flex-shrink:0">Set Deal Value →</a>
    </div>
    `}

    ${dims ? `
    <div class="card skills-card">
      <div class="skills-header">
        <h3>Team Skill Breakdown</h3>
        ${weakestDimKey ? `<span class="skills-gap-label">Biggest gap: <strong>${dimLabels[weakestDimKey]}</strong> (avg ${weakestDimVal}/20)</span>` : ''}
      </div>
      <div class="skill-bars">
        ${Object.entries(dimLabels).map(([k, label]) => {
          const val = dims[k] || 0;
          const pct = Math.round(val / 20 * 100);
          const colorClass = val >= 15 ? 'sb-green' : val >= 10 ? 'sb-yellow' : 'sb-red';
          return `<div class="skill-bar-row${k === weakestDimKey ? ' sb-weakest' : ''}">
              <div class="sb-label">${label}</div>
              <div class="sb-track"><div class="sb-fill ${colorClass}" style="width:${pct}%"></div></div>
              <div class="sb-val">${val}/20</div>
            </div>`;
        }).join('')}
      </div>
    </div>
    ` : ''}

    <div class="section-header" style="margin-top:28px"><h2>Rep Performance</h2></div>
    ${members.length === 0
      ? '<div class="empty-state">No reps on your team yet. Share your invite link so reps can join when they sign up.</div>'
      : `<div class="rep-grid">${(repStats.length ? repStats : members.map(m => ({
          id: m.id, name: m.name, email: m.email, lastActive: m.lastActive,
          totalCalls: m.totalCalls, avgScore: m.avgScore,
          appointmentRate: 0, weakestDim: null, trend: 'flat',
        }))).map(r => repCard(r, now, WEEK)).join('')}</div>`
    }

    ${recentCalls.length ? `
    <div class="section-header" style="margin-top:28px"><h2>Recent Activity</h2></div>
    <div class="activity-feed">
      ${recentCalls.map(c => `
        <div class="activity-row">
          <div class="activity-rep">${avatar(c.repName)}</div>
          <div class="activity-info">
            <span class="activity-name">${escHtml(c.repName)}</span>
            <span class="activity-sep">·</span>
            <span class="activity-persona">${escHtml(c.personaName || '—')}</span>
          </div>
          <div class="activity-outcome">${outcomePill(c.outcome)}</div>
          <div class="activity-score">${c.score?.overallScore != null ? `<span style="color:${scoreColor(c.score.overallScore)}">${c.score.overallScore}</span>` : '—'}</div>
          <div class="activity-time text-subtle text-sm">${timeAgo(c.startTime)}</div>
        </div>`).join('')}
    </div>
    ` : ''}
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

function repCard(rep, now, WEEK) {
  const daysSince = rep.lastActive ? Math.floor((now - rep.lastActive) / (24 * 60 * 60 * 1000)) : null;
  const isActive = rep.lastActive && (now - rep.lastActive) < WEEK;
  const apptPct = Math.round((rep.appointmentRate || 0) * 100);
  const trendIcon = rep.trend === 'up' ? '↑' : rep.trend === 'down' ? '↓' : '→';
  const trendClass = rep.trend === 'up' ? 'rc-trend-up' : rep.trend === 'down' ? 'rc-trend-down' : 'rc-trend-flat';
  const dimLabels = { opening: 'Opening', rapport: 'Rapport', infoCapture: 'Lead Capture', objectionHandling: 'Objection Handling', appointment: 'Close' };
  const weakestLabel = rep.weakestDim ? dimLabels[rep.weakestDim.key] : null;

  return `
    <a href="#/team/rep/${rep.id}" class="rep-card">
      <div class="rc-head">
        ${avatar(rep.name)}
        <div class="rc-identity">
          <div class="rc-name">${escHtml(rep.name)}</div>
          <div class="rc-status ${isActive ? 'rc-active' : 'rc-inactive'}">${isActive ? 'Active' : daysSince !== null ? `${daysSince}d ago` : 'Never'}</div>
        </div>
        <div class="rc-trend ${trendClass}">${trendIcon}</div>
      </div>
      ${daysSince !== null && daysSince > 7 ? `<div class="rc-alert">Hasn't trained in ${daysSince} days</div>` : ''}
      <div class="rc-stats">
        <div class="rc-stat">
          <div class="rc-stat-val ${apptPct >= 30 ? 'stat-green' : apptPct >= 20 ? 'stat-yellow' : rep.totalCalls > 0 ? 'stat-red' : ''}">${rep.totalCalls > 0 ? apptPct + '%' : '—'}</div>
          <div class="rc-stat-lbl">Appt Rate</div>
        </div>
        <div class="rc-stat">
          <div class="rc-stat-val" style="${rep.avgScore ? `color:${scoreColor(rep.avgScore)}` : ''}">${rep.avgScore || '—'}</div>
          <div class="rc-stat-lbl">Avg Score</div>
        </div>
        <div class="rc-stat">
          <div class="rc-stat-val">${rep.totalCalls}</div>
          <div class="rc-stat-lbl">Calls</div>
        </div>
      </div>
      ${weakestLabel ? `<div class="rc-weakness">Focus: ${weakestLabel} (${rep.weakestDim.value}/20)</div>` : ''}
    </a>
  `;
}

async function renderRepDetail(userId) {
  app.innerHTML = '<div class="page-skeleton"><div class="skel skel-title"></div><div class="skel skel-text"></div><div class="skel skel-text skel-short"></div></div>';
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
    foundations: CERT_IDS.foundations.every(id => progressSet.has(id)),
    expert:      CERT_IDS.expert.every(id => progressSet.has(id)),
    elite:       CERT_IDS.elite.every(id => progressSet.has(id)),
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
      ${certBadge('phone-open', 'FreshUp Ready', certs.foundations)}
      ${certBadge('phone-price', 'FreshUp Expert', certs.expert)}
      ${certBadge('phone-close', 'FreshUp Elite', certs.elite)}
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

// ── SETTINGS ──────────────────────────────────────────────────────────────────

async function renderSettings() {
  const user = getUser();
  let teamConfig = {};
  if (user && user.role === 'manager') {
    try {
      const a = await api('/api/team/analytics');
      teamConfig = a.config || {};
    } catch (e) { /* non-critical */ }
  }

  const CAR_BRANDS = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'Dodge', 'Ram', 'Jeep', 'GMC', 'Nissan', 'Hyundai', 'Kia', 'Subaru', 'Mazda', 'BMW', 'Mercedes-Benz', 'Audi', 'Lexus', 'Cadillac', 'Lincoln', 'Volkswagen', 'Volvo', 'Tesla', 'Other'];

  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Settings</h1>
        <p class="subtitle">Manage your account, phone number, and preferences</p>
      </div>
    </div>

    <div class="settings-wrap">

      <div class="settings-section card">
        <h3 class="settings-section-title">Account</h3>
        <div class="form-group">
          <label for="settings-name">Display Name</label>
          <input type="text" id="settings-name" value="${escHtml(user ? user.name : '')}" />
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" value="${escHtml(user ? user.email : '')}" disabled class="input-disabled" />
        </div>
        <div id="settings-account-msg" class="settings-msg" style="display:none"></div>
        <button class="btn btn-primary" id="save-account-btn">Save Changes</button>
      </div>

      <div class="settings-section card">
        <h3 class="settings-section-title">My Phone Number</h3>
        <p class="settings-section-desc">Saved here so you don't have to retype it every time you take a call.</p>
        <div class="form-group">
          <label for="settings-phone">Cell Number</label>
          <input type="tel" id="settings-phone" placeholder="(555) 123-4567" value="${escHtml((user && user.phone_number) ? user.phone_number : '')}" autocomplete="tel" />
        </div>
        <div id="settings-phone-msg" class="settings-msg" style="display:none"></div>
        <button class="btn btn-primary" id="save-phone-btn">Save Number</button>
      </div>

      <div class="settings-section card">
        <h3 class="settings-section-title">Theme</h3>
        <p class="settings-section-desc">Choose a look that keeps you in the zone.</p>
        <div class="theme-picker">
          ${[
            { id: 'light',    label: 'Light',    preview: '#ffffff' },
            { id: 'dark',     label: 'Dark',     preview: '#0f172a' },
            { id: 'gridiron', label: 'Gridiron', preview: '#0a1a08' },
            { id: 'midnight', label: 'Midnight', preview: '#07071a' },
          ].map(t => {
            const active = (localStorage.getItem('freshup_theme') || 'light') === t.id ? 'theme-btn-active' : '';
            return `<button class="theme-btn ${active}" data-theme="${t.id}">
              <div class="theme-preview" style="background:${t.preview}"></div>
              <span>${t.label}</span>
            </button>`;
          }).join('')}
        </div>
      </div>

      ${user && user.role === 'manager' ? `
      <div class="settings-section card">
        <h3 class="settings-section-title">Your Dealership</h3>
        <p class="settings-section-desc">Used to calculate revenue impact estimates on your team dashboard.</p>
        <div class="form-group">
          <label for="settings-deal-value">Average Deal Value ($)</label>
          <input type="number" id="settings-deal-value" placeholder="35000" min="0" step="500"
            value="${escHtml(teamConfig.avgDealValue ? String(teamConfig.avgDealValue) : '')}" />
        </div>
        <div class="form-group">
          <label for="settings-brand">Primary Brand</label>
          <select id="settings-brand">
            <option value="">Select brand…</option>
            ${CAR_BRANDS.map(b => `<option value="${escHtml(b)}" ${teamConfig.brand === b ? 'selected' : ''}>${escHtml(b)}</option>`).join('')}
          </select>
        </div>
        <div id="settings-dealer-msg" class="settings-msg" style="display:none"></div>
        <button class="btn btn-primary" id="save-dealer-btn">Save Dealership Info</button>
      </div>

      <div class="settings-section card">
        <h3 class="settings-section-title">Team Code for Reps</h3>
        <p class="settings-section-desc">Share this code with your reps — they enter it when signing up to join your team.</p>
        <div class="team-code-display" id="team-code-display">
          <span class="team-code-value" id="team-code-value">Loading…</span>
          <button class="btn btn-secondary btn-sm" id="copy-invite-btn">Copy Code</button>
        </div>
      </div>
      ` : ''}

    </div>
  `;

  // Wire phone formatters
  initPhoneInput(document.getElementById('settings-phone'));

  // Account save
  document.getElementById('save-account-btn').addEventListener('click', async () => {
    const name = document.getElementById('settings-name').value.trim();
    const msgEl = document.getElementById('settings-account-msg');
    if (!name) { msgEl.textContent = 'Name cannot be empty.'; msgEl.className = 'settings-msg error'; msgEl.style.display = 'block'; return; }
    try {
      const res = await api('/api/auth/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      setAuth(res.token, res.user);
      msgEl.textContent = 'Name updated!';
      msgEl.className = 'settings-msg success';
      msgEl.style.display = 'block';
      updateNav(getRoute());
      setTimeout(() => { msgEl.style.display = 'none'; }, 3000);
    } catch (err) {
      msgEl.textContent = err.message;
      msgEl.className = 'settings-msg error';
      msgEl.style.display = 'block';
    }
  });

  // Phone save
  document.getElementById('save-phone-btn').addEventListener('click', async () => {
    const phone_number = document.getElementById('settings-phone').value.trim();
    const msgEl = document.getElementById('settings-phone-msg');
    try {
      const res = await api('/api/auth/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone_number }) });
      setAuth(res.token, res.user);
      msgEl.textContent = phone_number ? 'Phone number saved!' : 'Phone number cleared.';
      msgEl.className = 'settings-msg success';
      msgEl.style.display = 'block';
      setTimeout(() => { msgEl.style.display = 'none'; }, 3000);
    } catch (err) {
      msgEl.textContent = err.message;
      msgEl.className = 'settings-msg error';
      msgEl.style.display = 'block';
    }
  });

  // Theme picker
  document.querySelector('.theme-picker').addEventListener('click', e => {
    const btn = e.target.closest('.theme-btn');
    if (!btn) return;
    const t = btn.dataset.theme;
    applyTheme(t);
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('theme-btn-active', b.dataset.theme === t));
  });

  // Dealership save
  document.getElementById('save-dealer-btn')?.addEventListener('click', async () => {
    const dealValue = document.getElementById('settings-deal-value')?.value.trim();
    const brand = document.getElementById('settings-brand')?.value;
    const msgEl = document.getElementById('settings-dealer-msg');
    const payload = {};
    if (dealValue) payload.avgDealValue = Number(dealValue);
    if (brand) payload.brand = brand;
    try {
      await api('/api/team/config', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      msgEl.textContent = 'Dealership info saved!';
      msgEl.className = 'settings-msg success'; msgEl.style.display = 'block';
      setTimeout(() => { msgEl.style.display = 'none'; }, 3000);
    } catch (err) {
      msgEl.textContent = err.message;
      msgEl.className = 'settings-msg error'; msgEl.style.display = 'block';
    }
  });

  // Load and display team code for managers
  if (user && user.role === 'manager') {
    api('/api/auth/team-code').then(data => {
      const el = document.getElementById('team-code-value');
      if (el) el.textContent = data.teamCode || '—';
    }).catch(() => {
      const el = document.getElementById('team-code-value');
      if (el) el.textContent = 'Error loading code';
    });
  }

  document.getElementById('copy-invite-btn')?.addEventListener('click', async () => {
    const codeEl = document.getElementById('team-code-value');
    const code = codeEl ? codeEl.textContent : '';
    if (!code || code === '—' || code.startsWith('Error')) {
      showToast('Code not available.', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      showToast('Team code copied!', 'success');
    } catch { showToast('Could not copy code.', 'error'); }
  });
}

// ── LEARN HUB ─────────────────────────────────────────────────────────────────

function renderLearn() {
  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Learn</h1>
        <p class="subtitle">Everything you need to master the phone up</p>
      </div>
    </div>
    <div class="learn-hub-grid">
      <a href="#/learn/framework" class="learn-hub-card" style="--hub-color:#3b82f6">
        <div class="lhc-icon">🏗️</div>
        <div class="lhc-body">
          <h3>FreshUp Framework</h3>
          <p>The 7-step proprietary system behind every great phone up. Learn the method, master the methodology.</p>
        </div>
        <span class="lhc-arrow">→</span>
      </a>
      <a href="#/courses" class="learn-hub-card" style="--hub-color:#8b5cf6">
        <div class="lhc-icon">📚</div>
        <div class="lhc-body">
          <h3>Courses</h3>
          <p>7 structured courses from first hello to elite appointment close. Lessons + real phone challenges.</p>
        </div>
        <span class="lhc-arrow">→</span>
      </a>
      <a href="#/learn/gauntlet" class="learn-hub-card" style="--hub-color:#ef4444">
        <div class="lhc-icon">⚡</div>
        <div class="lhc-body">
          <h3>Objection Gauntlet</h3>
          <p>One objection. One response. Instant AI coaching. Train your reactions until they're automatic.</p>
        </div>
        <span class="lhc-arrow">→</span>
      </a>
      <a href="#/learn/playbook" class="learn-hub-card" style="--hub-color:#10b981">
        <div class="lhc-icon">📖</div>
        <div class="lhc-body">
          <h3>My Playbook</h3>
          <p>Your personal library of best responses, built from your highest-scoring gauntlet attempts.</p>
        </div>
        <span class="lhc-arrow">→</span>
      </a>
    </div>
  `;
}

// ── FRESHUP FRAMEWORK ─────────────────────────────────────────────────────────

function renderFramework() {
  const steps = [
    {
      letter: 'F', color: '#3b82f6',
      title: 'First Things First',
      desc: 'The first 5 words set the tone for the entire call. A warm, clear greeting with your name and dealership signals professionalism and makes the caller feel they reached the right person.',
      doThis: 'Smile before you answer. Say your name + dealership clearly. End with an open question.',
      notThis: 'Answer with "Yeah?" or mumble the dealership name. Never answer distracted.',
      example: '"Good afternoon, this is Marcus at Riverside Toyota — thanks for calling in, how can I help you today?"',
    },
    {
      letter: 'R', color: '#8b5cf6',
      title: 'Reassure and Validate',
      desc: 'After greeting, let the customer share why they\'re calling. Then validate and compliment their reason — make them feel genuinely heard before asking anything. This builds trust and opens the conversation.',
      doThis: 'Let them talk first. Compliment their interest or reason. Use their words back to them.',
      notThis: 'Immediately pivot to your script. Jump to discovery questions before they feel heard.',
      example: '"That\'s a great choice — the Silverado is one of our most popular trucks right now. I\'m glad you called."',
    },
    {
      letter: 'E', color: '#06b6d4',
      title: 'Evaluate Needs and Wants',
      desc: 'Before answering their question, ask yours. Understand what they really need and why they need it. Are they replacing a vehicle? Adding to a fleet? What matters most — features, price, timeline?',
      doThis: 'Ask needs questions before answering price/availability questions. Use the Rule of 3.',
      notThis: 'Answer their first question without asking anything. Assume you know what they want.',
      example: '"Before I look that up — are you replacing a current vehicle, or is this an addition? And what matters most to you in the switch?"',
    },
    {
      letter: 'S', color: '#f59e0b',
      title: 'Send a Video',
      desc: 'Offer to shoot a personalized walk-around video of the vehicle and text it to them. This separates you from every other dealer, creates a reason to exchange contact info naturally, and keeps the conversation alive.',
      doThis: 'Offer the video early and enthusiastically. Frame it as exclusive, personal, and easy.',
      notThis: 'Skip the offer because you think they just want price. Every customer appreciates effort.',
      example: '"I\'d love to shoot you a quick walk-around video of it — would that be helpful? I can text it right to your phone."',
    },
    {
      letter: 'H', color: '#ef4444',
      title: 'Harvest Contact Info',
      desc: 'Capture their name, phone, and email at the right moment — when it feels natural, not forced. This might be early, middle, or late in the call. The video offer is a great natural opening. Grade is holistic — order doesn\'t matter.',
      doThis: 'Collect name (with spelling), phone, and email. Let the flow of the call guide when.',
      notThis: 'Demand info at the start before any rapport is built. Rush through info capture.',
      example: '"Let me grab your info so I can send that video over — what\'s the best number, and what name should I put on it?"',
    },
    {
      letter: 'U', color: '#10b981',
      title: 'Unlock the Appointment',
      desc: 'The only goal of the call is the appointment. Use an assumptive close — make the appointment feel like the obvious next step. Offer a specific time choice, confirm the type, and send a reminder.',
      doThis: 'Use assumptive close (Tuesday or Saturday?). Confirm appointment type. Offer reminder text + email.',
      notThis: '"Would you like to come in?" — too easy to say no. Never ask for a yes/no appointment.',
      example: '"Based on what you\'ve shared, I think the F-150 XLT is worth a look in person — I\'ve got tomorrow at 2 or Saturday at 10. Which works better?"',
    },
    {
      letter: 'P', color: '#f97316',
      title: 'Punch Through Objections',
      desc: 'This step isn\'t just at the end — it runs through the entire call. Every objection is a signal of interest. Use the Acknowledge-Explore-Respond method: hear it fully, find the real concern, and bridge to the next step.',
      doThis: 'Welcome objections. Use the dig-down question to find the root concern. Stay calm and confident.',
      notThis: 'Argue or fold at the first pushback. Use "I understand, but..." which signals defensiveness.',
      example: '"Totally fair — can I ask, is it more about the timing, the numbers, or something about the vehicle itself?"',
    },
  ];

  app.innerHTML = `
    <a href="#/learn" class="back-link">← Learn</a>
    <div class="page-header">
      <div>
        <h1>The FreshUp Framework™</h1>
        <p class="subtitle">FreshUp's proprietary 7-step methodology for mastering the inbound dealership phone call</p>
      </div>
    </div>
    <div class="framework-steps">
      ${steps.map((s, i) => `
        <div class="framework-step" style="--step-color:${s.color}">
          <div class="framework-step-badge">${s.letter}</div>
          <div class="framework-step-body">
            <h3 class="framework-step-title">${escHtml(s.title)}</h3>
            <p class="framework-step-desc">${escHtml(s.desc)}</p>
            <div class="framework-do-dont">
              <div class="framework-do">
                <div class="fdd-label">✓ Do This</div>
                <div class="fdd-text">${escHtml(s.doThis)}</div>
              </div>
              <div class="framework-dont">
                <div class="fdd-label">✗ Not This</div>
                <div class="fdd-text">${escHtml(s.notThis)}</div>
              </div>
            </div>
            <div class="framework-example">"${escHtml(s.example)}"</div>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="framework-footer card">
      <h3>Practice the Framework</h3>
      <p>Head to the Gauntlet to drill each step individually, or take a full call in the Call Arena to practice the complete sequence.</p>
      <div class="framework-footer-btns">
        <a href="#/learn/gauntlet" class="btn btn-primary">Try the Gauntlet →</a>
        <a href="#/start" class="btn btn-secondary">Take a Full Call →</a>
      </div>
    </div>
  `;
}

// ── OBJECTION GAUNTLET ────────────────────────────────────────────────────────

let gauntletState = { mode: 'idle', challenges: [], filtered: [], current: null, categoryFilter: 'all', difficultyFilter: 'all' };

async function renderGauntlet() {
  if (!gauntletState.challenges.length) {
    try {
      gauntletState.challenges = await api('/api/gauntlet/challenges');
    } catch (e) {
      app.innerHTML = '<div class="empty-state">Failed to load challenges.</div>';
      return;
    }
  }
  renderGauntletIdle();
}

function getFilteredChallenges() {
  return gauntletState.challenges.filter(c => {
    const catOk = gauntletState.categoryFilter === 'all' || c.category === gauntletState.categoryFilter;
    const diffOk = gauntletState.difficultyFilter === 'all' || c.difficulty === gauntletState.difficultyFilter;
    return catOk && diffOk;
  });
}

function renderGauntletIdle() {
  const filtered = getFilteredChallenges();
  const cats = [
    { id: 'all', label: 'All' },
    { id: 'warmup', label: 'Warm-up', desc: 'Early-call hesitation before the customer is fully engaged' },
    { id: 'price', label: 'Price', desc: 'Payment questions, budget concerns, and "your price is too high"' },
    { id: 'availability', label: 'Availability', desc: 'Questions about stock, timing, and whether the vehicle is there' },
    { id: 'commitment', label: 'Commitment', desc: '"Just looking," "Not ready," "I need to think about it"' },
    { id: 'info', label: 'Info', desc: 'Customers who want all details before agreeing to anything' },
    { id: 'competitor', label: 'Competitor', desc: '"I\'m also looking at [other dealership]" situations' },
  ];
  const diffs = [
    { id: 'all', label: 'All' },
    { id: 'easy', label: 'Easy' },
    { id: 'medium', label: 'Medium' },
    { id: 'hard', label: 'Hard' },
  ];

  const streak = parseInt(sessionStorage.getItem('gauntlet_streak') || '0', 10);
  const best = sessionStorage.getItem('gauntlet_best') || null;

  // Build active filter tag text
  const activeCat = cats.find(c => c.id === gauntletState.categoryFilter && c.id !== 'all');
  const activeDiff = diffs.find(d => d.id === gauntletState.difficultyFilter && d.id !== 'all');
  const activeTag = [activeCat ? activeCat.label : null, activeDiff ? activeDiff.label : null].filter(Boolean).join(' \xb7 ');

  // Phone label for active filters
  const phoneLabel = [
    activeCat ? activeCat.label + ' Objection' : 'Any Category',
    activeDiff ? activeDiff.label : 'Any Difficulty',
  ].join(' \xb7 ');

  app.innerHTML = `
    <a href="#/learn" class="back-link" id="gauntlet-back-link">← Learn</a>
    <div class="gauntlet-arena">
      <div class="gauntlet-left">
        <span class="gauntlet-live-badge">LIVE TRAINING</span>
        <h1 class="gauntlet-arena-title">The Gauntlet</h1>
        <p class="gauntlet-arena-sub">One objection. No script. No mercy.</p>

        <div class="gauntlet-stats-row">
          <div class="gauntlet-stat">
            <span class="gauntlet-stat-val">${streak}</span>
            <span class="gauntlet-stat-lbl">Session Streak</span>
          </div>
          <div class="gauntlet-stat-divider"></div>
          <div class="gauntlet-stat">
            <span class="gauntlet-stat-val">${best !== null ? best : '—'}</span>
            <span class="gauntlet-stat-lbl">Best Score</span>
          </div>
        </div>

        <div class="gauntlet-prefs-wrap">
          <button class="gauntlet-prefs-btn" id="gauntlet-prefs-btn" type="button">
            Preferences ▾${activeTag ? `<span class="gauntlet-prefs-active-tag">\xb7 ${escHtml(activeTag)}</span>` : ''}
          </button>
          <div class="gauntlet-prefs-dropdown" id="gauntlet-prefs-dropdown" style="display:none">
            <div class="gauntlet-filter-group">
              <span class="gauntlet-filter-label">Category</span>
              <div class="gauntlet-filter-btns" id="cat-filter">
                ${cats.map(c => `<button class="gf-btn${gauntletState.categoryFilter === c.id ? ' active' : ''}" data-val="${c.id}">${c.label}</button>`).join('')}
              </div>
            </div>
            <div class="gauntlet-filter-group">
              <span class="gauntlet-filter-label">Difficulty</span>
              <div class="gauntlet-filter-btns" id="diff-filter">
                ${diffs.map(d => `<button class="gf-btn${gauntletState.difficultyFilter === d.id ? ' active' : ''}" data-val="${d.id}">${d.label}</button>`).join('')}
              </div>
            </div>
          </div>
        </div>

        <button class="btn-gauntlet-enter" id="gauntlet-start-btn" ${filtered.length === 0 ? 'disabled' : ''}>
          ENTER THE GAUNTLET
        </button>
      </div>

      <div class="gauntlet-phone-wrap">
        <div class="gauntlet-phone">
          <div class="gp-notch"></div>
          <div class="gp-screen">
            <div class="gp-incoming-badge">INCOMING CALL</div>
            <div class="gp-rings">
              <div class="gp-ring"></div>
              <div class="gp-ring"></div>
              <div class="gp-ring"></div>
              <div class="gp-icon">📞</div>
            </div>
            <div class="gp-caller">UNKNOWN CALLER</div>
            <div class="gp-category">${escHtml(phoneLabel)}</div>
            <div class="gp-answer-bar">ANSWER NOW →</div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('gauntlet-back-link').addEventListener('click', () => {
    sessionStorage.setItem('gauntlet_streak', '0');
  });

  const prefsBtn = document.getElementById('gauntlet-prefs-btn');
  const prefsDropdown = document.getElementById('gauntlet-prefs-dropdown');
  prefsBtn.addEventListener('click', () => {
    const open = prefsDropdown.style.display !== 'none';
    prefsDropdown.style.display = open ? 'none' : 'block';
    prefsBtn.classList.toggle('open', !open);
  });

  document.addEventListener('click', function closePrefs(e) {
    if (!document.getElementById('gauntlet-prefs-btn')) { document.removeEventListener('click', closePrefs); return; }
    if (!document.getElementById('gauntlet-prefs-btn').contains(e.target) && !prefsDropdown.contains(e.target)) {
      prefsDropdown.style.display = 'none';
      prefsBtn.classList.remove('open');
    }
  });

  document.getElementById('cat-filter').addEventListener('click', e => {
    const btn = e.target.closest('.gf-btn');
    if (!btn) return;
    gauntletState.categoryFilter = btn.dataset.val;
    renderGauntletIdle();
  });
  document.getElementById('diff-filter').addEventListener('click', e => {
    const btn = e.target.closest('.gf-btn');
    if (!btn) return;
    gauntletState.difficultyFilter = btn.dataset.val;
    renderGauntletIdle();
  });
  document.getElementById('gauntlet-start-btn')?.addEventListener('click', () => {
    const pool = getFilteredChallenges();
    if (!pool.length) return;
    gauntletState.current = pool[Math.floor(Math.random() * pool.length)];
    renderGauntletChallenge();
  });
}

function renderGauntletChallenge() {
  const c = gauntletState.current;
  if (!c) return renderGauntletIdle();
  const diffColors = { easy: '#10b981', medium: '#f59e0b', hard: '#ef4444' };
  const streak = parseInt(sessionStorage.getItem('gauntlet_streak') || '0', 10);

  app.innerHTML = `
    <a href="#/learn" class="back-link">← Learn</a>
    <div class="page-header">
      <div>
        <h1>Objection Gauntlet</h1>
        <p class="subtitle"><span class="badge" style="background:${diffColors[c.difficulty] || '#888'};color:#fff">${c.difficulty}</span> &nbsp;${c.category}</p>
      </div>
      ${streak > 0 ? `<span class="gauntlet-streak-badge">🔥 ${streak} in a row</span>` : ''}
    </div>
    <div class="gauntlet-challenge-wrap">
      <div class="challenge-context card">${escHtml(c.context)}</div>
      <div class="challenge-bubble">
        <div class="challenge-bubble-avatar">👤</div>
        <div class="challenge-bubble-text">"${escHtml(c.challenge)}"</div>
      </div>
      <div class="gauntlet-hint"><strong>Hint:</strong> ${escHtml(c.hint)}</div>
      <div class="gauntlet-abar-strip">
        <span class="abar-step" style="--abar-color:#3b82f6">Acknowledge</span>
        <span class="abar-arrow">→</span>
        <span class="abar-step" style="--abar-color:#8b5cf6">Bridge</span>
        <span class="abar-arrow">→</span>
        <span class="abar-step" style="--abar-color:#f59e0b">Answer</span>
        <span class="abar-arrow">→</span>
        <span class="abar-step" style="--abar-color:#10b981">Redirect</span>
      </div>
      <div class="form-group">
        <label for="gauntlet-response">Your Response</label>
        <textarea id="gauntlet-response" rows="4" placeholder="Type exactly what you would say on the phone…" class="gauntlet-textarea"></textarea>
      </div>
      <button class="btn btn-primary btn-lg" id="gauntlet-submit-btn">
        Submit Response
      </button>
    </div>
  `;

  document.getElementById('gauntlet-submit-btn').addEventListener('click', async () => {
    const response = document.getElementById('gauntlet-response').value.trim();
    if (!response) { showToast('Type your response first.', 'error'); return; }

    // Hang-up animation
    const btn = document.getElementById('gauntlet-submit-btn');
    btn.disabled = true;
    btn.innerHTML = 'Scoring…';

    try {
      const result = await api('/api/gauntlet/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: c.id, response }),
      });
      renderGauntletResult(c, response, result);
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = 'Submit Response';
    }
  });
}

function abarColor(v) {
  if (v >= 20) return 'var(--success)';
  if (v >= 12) return 'var(--warning)';
  return 'var(--error)';
}

function renderGauntletResult(challenge, userResponse, result) {
  const score = result.score || 0;
  const color = scoreColor(score);
  const canSave = score >= 70;

  // Update sessionStorage streak and best
  const prevStreak = parseInt(sessionStorage.getItem('gauntlet_streak') || '0', 10);
  const newStreak = prevStreak + 1;
  sessionStorage.setItem('gauntlet_streak', String(newStreak));
  const prevBest = parseInt(sessionStorage.getItem('gauntlet_best') || '0', 10);
  if (score > prevBest) sessionStorage.setItem('gauntlet_best', String(score));

  const abarItems = [
    { key: 'acknowledge', label: 'Acknowledge', color: '#3b82f6' },
    { key: 'bridge',      label: 'Bridge',      color: '#8b5cf6' },
    { key: 'answer',      label: 'Answer',       color: '#f59e0b' },
    { key: 'redirect',    label: 'Redirect',     color: '#10b981' },
  ];
  const hasAbar = result.acknowledge != null || result.bridge != null || result.answer != null || result.redirect != null;

  app.innerHTML = `
    <a href="#/learn" class="back-link" id="gauntlet-result-back">← Learn</a>
    <div class="page-header">
      <div><h1>Gauntlet Result</h1></div>
      <span class="gauntlet-streak-badge">🔥 ${newStreak} in a row</span>
    </div>
    <div class="gauntlet-result-wrap">
      <div class="result-score-circle" style="--score-color:${color}">
        <div class="rsc-inner">
          <div class="rsc-num" style="color:${color}">${score}</div>
          <div class="rsc-lbl">/ 100</div>
        </div>
      </div>

      ${hasAbar ? `
      <div class="abar-breakdown card">
        <div class="abar-breakdown-title">Framework Breakdown</div>
        ${abarItems.map(item => {
          const val = result[item.key] ?? 0;
          const pct = Math.round(val / 25 * 100);
          return `
          <div class="abar-bar-row">
            <span class="abar-label" style="color:${item.color}">${item.label}</span>
            <div class="abar-track"><div class="abar-fill" style="width:${pct}%;background:${item.color}"></div></div>
            <span class="abar-val">${val}/25</span>
          </div>`;
        }).join('')}
      </div>
      ` : ''}

      <div class="gauntlet-feedback card">
        <div class="gf-row gf-worked">
          <span class="gf-icon">✓</span>
          <div>
            <div class="gf-title">What Worked</div>
            <div class="gf-body">${escHtml(result.whatWorked || '—')}</div>
          </div>
        </div>
        <div class="gf-row gf-missed">
          <span class="gf-icon">✗</span>
          <div>
            <div class="gf-title">What Missed</div>
            <div class="gf-body">${escHtml(result.whatMissed || '—')}</div>
          </div>
        </div>
        <div class="gf-row gf-stronger">
          <span class="gf-icon">💡</span>
          <div>
            <div class="gf-title">Try This Instead</div>
            <div class="gf-body">"${escHtml(result.strongerLine || '—')}"</div>
          </div>
        </div>
      </div>

      <div class="gauntlet-result-actions">
        ${canSave ? `<button class="btn btn-secondary" id="save-playbook-btn">📖 Save to Playbook</button>` : ''}
        <button class="btn-gauntlet-enter" id="next-challenge-btn">NEXT CHALLENGE →</button>
      </div>

      <div id="playbook-save-msg" style="display:none" class="settings-msg success">Saved to your playbook!</div>
    </div>
  `;

  document.getElementById('gauntlet-result-back').addEventListener('click', () => {
    sessionStorage.setItem('gauntlet_streak', '0');
  });

  document.getElementById('next-challenge-btn').addEventListener('click', () => {
    const pool = getFilteredChallenges();
    if (!pool.length) { navigate('/learn/gauntlet'); return; }
    gauntletState.current = pool[Math.floor(Math.random() * pool.length)];
    renderGauntletChallenge();
  });

  document.getElementById('save-playbook-btn')?.addEventListener('click', () => {
    const playbook = JSON.parse(localStorage.getItem('freshup_playbook') || '[]');
    playbook.unshift({
      id: Date.now(),
      challengeId: challenge.id,
      category: challenge.category,
      difficulty: challenge.difficulty,
      challenge: challenge.challenge,
      response: userResponse,
      score,
      strongerLine: result.strongerLine || '',
      savedAt: Date.now(),
    });
    localStorage.setItem('freshup_playbook', JSON.stringify(playbook.slice(0, 100)));
    document.getElementById('save-playbook-btn').style.display = 'none';
    document.getElementById('playbook-save-msg').style.display = 'block';
  });
}

// ── PLAYBOOK ──────────────────────────────────────────────────────────────────

function renderPlaybook() {
  const playbook = JSON.parse(localStorage.getItem('freshup_playbook') || '[]');

  // Group by category
  const grouped = {};
  for (const entry of playbook) {
    if (!grouped[entry.category]) grouped[entry.category] = [];
    grouped[entry.category].push(entry);
  }

  const catLabels = {
    warmup: 'Warm-up', price: 'Price', availability: 'Availability',
    commitment: 'Commitment', info: 'Info Resistance', competitor: 'Competitor',
  };
  const diffColors = { easy: '#10b981', medium: '#f59e0b', hard: '#ef4444' };

  app.innerHTML = `
    <a href="#/learn" class="back-link">← Learn</a>
    <div class="page-header">
      <div>
        <h1>My Playbook</h1>
        <p class="subtitle">${playbook.length} saved response${playbook.length !== 1 ? 's' : ''}</p>
      </div>
      ${playbook.length > 0 ? '<button class="btn btn-ghost btn-sm" id="clear-playbook-btn">Clear All</button>' : ''}
    </div>
    ${playbook.length === 0
      ? `<div class="empty-state">
          <div class="empty-icon">📓</div>
          <h3>Your playbook is empty</h3>
          <p>When you complete Gauntlet challenges, save your best responses here for quick review.</p>
          <a href="#/learn/gauntlet" class="btn btn-primary">Go to Gauntlet</a>
        </div>`
      : Object.entries(grouped).map(([cat, entries]) => `
        <div class="playbook-category">
          <h3 class="playbook-cat-title">${escHtml(catLabels[cat] || cat)}</h3>
          ${entries.map(e => `
            <div class="playbook-entry card">
              <div class="playbook-entry-header">
                <span class="badge" style="background:${diffColors[e.difficulty] || '#888'};color:#fff">${e.difficulty}</span>
                <span class="playbook-score" style="color:${scoreColor(e.score)}">${e.score}/100</span>
                <span class="playbook-date text-muted text-sm">${formatDate(e.savedAt)}</span>
              </div>
              <div class="playbook-challenge">"${escHtml(e.challenge)}"</div>
              <div class="playbook-response">${escHtml(e.response)}</div>
              ${e.strongerLine ? `<div class="playbook-stronger"><span class="gf-icon">💡</span> "${escHtml(e.strongerLine)}"</div>` : ''}
            </div>
          `).join('')}
        </div>
      `).join('')
    }
  `;

  document.getElementById('clear-playbook-btn')?.addEventListener('click', () => {
    if (!confirm('Clear your entire playbook? This cannot be undone.')) return;
    localStorage.removeItem('freshup_playbook');
    renderPlaybook();
  });
}
