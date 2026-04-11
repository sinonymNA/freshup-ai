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
  const dimLabels = { opening: 'Opening', infoCapture: 'Lead Capture', discovery: 'Discovery', objectionHandling: 'Objection Handling', appointment: 'Close' };
  const keys = ['opening', 'infoCapture', 'discovery', 'objectionHandling', 'appointment'];
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
  opening: 'Opening', infoCapture: 'Lead Capture',
  discovery: 'Discovery', objectionHandling: 'Objection Handling', appointment: 'Close',
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
  const dimKeys = ['opening', 'infoCapture', 'discovery', 'objectionHandling', 'appointment'];
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
      <section class="hero-section">
        <div class="hero-bg"></div>
        <div class="hero-grid-overlay"></div>
        <div class="hero-inner">
          <div class="hero-content">
            <div class="hero-badge reveal">KORA-Powered AI Training</div>
            <h1 class="hero-headline">
              <span class="hero-line1 reveal" data-delay="60">Train Like It's Real.</span>
              <span class="hero-line2 gradient-text reveal" data-delay="160">Close Like It Counts.</span>
            </h1>
            <p class="hero-sub reveal" data-delay="260">Your reps practice on AI buyers that push back, object, and hang up — powered by the KORA framework. Every call scored. Every rep improving.</p>
            <div class="hero-ctas reveal" data-delay="360">
              <a href="#/register" class="btn-shimmer">Start Free Trial</a>
              <a href="#/register?role=manager" class="btn-ghost-hero" id="gm-cta">I'm a Sales Manager →</a>
            </div>
            <p class="hero-note reveal" data-delay="420">No credit card required · Setup in 2 minutes</p>
          </div>
          <div class="hero-phone-wrap">
            <div class="phone-mockup reveal-right" data-delay="100">
              <div class="phone-notch"></div>
              <div class="phone-screen">
                <div class="phone-call-header">
                  <div class="phone-call-dot"></div>
                  <span>Live Call</span>
                </div>
                <div class="phone-persona">
                  <div class="phone-avatar">A</div>
                  <div class="phone-persona-info">
                    <div class="phone-persona-name">Ashley Thompson</div>
                    <div class="phone-persona-role">Stay-at-Home Parent · Easy</div>
                  </div>
                </div>
                <div class="phone-score-section">
                  <div class="phone-score-label">Call Score</div>
                  <div class="phone-score-num count-up" data-target="87">0</div>
                  <div class="phone-score-bar"><div class="phone-score-fill" style="width:87%"></div></div>
                </div>
                <div class="phone-feedback">"Strong opening. Excellent info capture. Work on appointment close."</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── STATS ─────────────────────────────────────────────────────────── -->
      <section class="stats-bar-section">
        <div class="stats-bar-inner">
          <div class="stat-pill reveal" data-delay="0"><span class="count-up stat-num" data-target="12">0</span><span class="stat-lbl">Buyer Personas</span></div>
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
              <h3>Pick a Persona</h3>
              <p>Choose from 12 KORA-trained AI buyer types — each with unique behavioral anchors, internal emotional states, and authentic speech patterns.</p>
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
              <p>AI coaching grades your opening, info capture, discovery, objection handling, and appointment close — with specific feedback you can act on today.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ── KORA FRAMEWORK ─────────────────────────────────────────────────── -->
      <section class="kora-section">
        <div class="section-inner">
          <div class="kora-grid">
            <div class="kora-content reveal-left">
              <div class="section-eyebrow">The KORA Framework</div>
              <h2 class="section-headline">AI buyers that behave like real people.</h2>
              <p class="kora-body">Most AI roleplay tools are easy to hack — say the right keywords and the bot folds. KORA trains each persona with behavioral anchors, internal emotional states, randomized call contexts, and authentic speech patterns. Your reps can't script their way through it.</p>
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
                  <div class="kora-demo-tag">KORA Active</div>
                </div>
                <div class="kora-exchange">
                  <div class="kora-line kora-rep">Rep: "What brought you to call today?"</div>
                  <div class="kora-line kora-buyer">"Saw an ad. Just checking what you've got."</div>
                  <div class="kora-exchange-gap"></div>
                  <div class="kora-line kora-rep">Rep: "What are you currently driving?"</div>
                  <div class="kora-line kora-buyer">"A Camry. It's fine."</div>
                </div>
                <div class="kora-anchor-label">Behavioral Anchor Exchange</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── FEATURES ───────────────────────────────────────────────────────── -->
      <section class="features-section">
        <div class="section-inner">
          <div class="section-eyebrow reveal">Built for Dealerships</div>
          <h2 class="section-headline reveal" data-delay="60">Everything a GM needs to build an elite phone team.</h2>
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
              <p>7 progressive courses take reps from phone basics to elite-level closing, with real lessons before every challenge call.</p>
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

      <!-- ── TESTIMONIALS ────────────────────────────────────────────────────── -->
      <section class="testimonials-section">
        <div class="section-inner">
          <div class="section-eyebrow reveal">What GMs Say</div>
          <h2 class="section-headline reveal" data-delay="60">The difference shows up on the board.</h2>
          <div class="testimonials-grid">
            <div class="testimonial-card reveal" data-delay="0">
              <div class="testimonial-stars">★★★★★</div>
              <div class="testimonial-quote">"Within three weeks our phone-up appointment rate jumped 22%. The reps who practiced daily were the ones making the difference."</div>
              <div class="testimonial-author">
                <div class="testimonial-avatar">S</div>
                <div><div class="testimonial-name">Sarah Mitchell</div><div class="testimonial-role">GM · Westfield Toyota, Columbus OH</div></div>
              </div>
            </div>
            <div class="testimonial-card reveal" data-delay="120">
              <div class="testimonial-stars">★★★★★</div>
              <div class="testimonial-quote">"I've tried every training tool out there. Nothing creates pressure like FreshUp. The KORA AI actually pushes back — you can't script your way through it."</div>
              <div class="testimonial-author">
                <div class="testimonial-avatar">D</div>
                <div><div class="testimonial-name">Darius King</div><div class="testimonial-role">Sales Director · Prestige Auto Group, Atlanta GA</div></div>
              </div>
            </div>
            <div class="testimonial-card reveal" data-delay="240">
              <div class="testimonial-stars">★★★★★</div>
              <div class="testimonial-quote">"My BDC team uses it every morning. The leaderboard keeps them competing. I haven't had to remind anyone to practice in two months."</div>
              <div class="testimonial-author">
                <div class="testimonial-avatar">L</div>
                <div><div class="testimonial-name">Lisa Navarro</div><div class="testimonial-role">BDC Manager · Summit Honda, Phoenix AZ</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── FINAL CTA ───────────────────────────────────────────────────────── -->
      <section class="final-cta-section">
        <div class="final-cta-glow"></div>
        <div class="final-cta-inner reveal">
          <h2 class="final-cta-headline">Ready to build an elite phone team?</h2>
          <p class="final-cta-sub">Start training your reps on AI buyers that push back. Free trial, no credit card required.</p>
          <div class="hero-ctas">
            <a href="#/register" class="btn-shimmer">Start Free Trial</a>
            <a href="#/login" class="btn-ghost-hero">Sign In</a>
          </div>
        </div>
      </section>

    </div>
  `;

  document.getElementById('gm-cta')?.addEventListener('click', e => {
    e.preventDefault();
    sessionStorage.setItem('register_role', 'manager');
    navigate('/register');
  });

  bindChallengeBlock();
  initScrollReveal();
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
  foundations: [
    'phone-open-1','phone-open-2','phone-open-3','phone-open-4','phone-open-5',
    'phone-capture-1','phone-capture-2','phone-capture-3','phone-capture-4','phone-capture-5',
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
  const dimKeys = ['opening', 'infoCapture', 'discovery', 'objectionHandling', 'appointment'];
  const dimLabels = { opening: 'Opening', infoCapture: 'Lead Capture', discovery: 'Discovery', objectionHandling: 'Objection Handling', appointment: 'Close' };
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
      ${certBadge('phone-open', 'PHONUP Ready', certs.foundations)}
      ${certBadge('phone-price', 'PHONUP Expert', certs.expert)}
      ${certBadge('phone-close', 'PHONUP Elite', certs.elite)}
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
    ['Info Capture', 'infoCapture'],
    ['Discovery', 'discovery'],
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
  ['opening', 'infoCapture', 'discovery', 'objectionHandling', 'appointment'].forEach(dim => {
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
          // Partial match: either exact or expected contains answer (or vice versa)
          const ok = actual.length > 0 && (actual === expected || expected.includes(actual) || actual.includes(expected));
          if (ok) correct++;
          return `<div class="quiz-result-row ${ok ? 'quiz-ok' : 'quiz-miss'}">
            <span class="quiz-result-icon">${ok ? '✓' : '✗'}</span>
            <span class="quiz-result-lbl">${f === 'car' ? 'Vehicle' : f.charAt(0).toUpperCase() + f.slice(1)}</span>
            <span class="quiz-result-val">${escHtml(ci[f])}</span>
          </div>`;
        });
        const pct = Math.round(correct / fields.length * 100);
        document.getElementById('quiz-results').innerHTML = `
          <div class="quiz-score-banner" style="color:${scoreColor(pct)}">
            ${correct}/${fields.length} captured correctly (${pct}%)
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

  const dimLabels = { opening: 'Opening', infoCapture: 'Lead Capture', discovery: 'Discovery', objectionHandling: 'Objection Handling', appointment: 'Close' };
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
  const dimLabels = { opening: 'Opening', infoCapture: 'Lead Capture', discovery: 'Discovery', objectionHandling: 'Objection Handling', appointment: 'Close' };
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
      ${certBadge('phone-open', 'PHONUP Ready', certs.foundations)}
      ${certBadge('phone-price', 'PHONUP Expert', certs.expert)}
      ${certBadge('phone-close', 'PHONUP Elite', certs.elite)}
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
        <h3 class="settings-section-title">Team Invite Code</h3>
        <p class="settings-section-desc">Share this with reps so they can join your team when registering.</p>
        <button class="btn btn-secondary" id="copy-invite-btn">Copy Invite Link</button>
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

  // Copy invite
  document.getElementById('copy-invite-btn')?.addEventListener('click', async () => {
    try {
      const inv = await api('/api/team/invite');
      await navigator.clipboard.writeText(inv.invite_url);
      showToast('Invite link copied!', 'success');
    } catch { showToast('Could not copy link.', 'error'); }
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
          <h3>PHONUP Framework</h3>
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

// ── PHONUP FRAMEWORK ──────────────────────────────────────────────────────────

function renderFramework() {
  const steps = [
    {
      letter: 'P', color: '#3b82f6',
      title: 'Pick Up with Confidence',
      desc: 'The first 5 words set the tone for the entire call. A warm, clear greeting with your name and dealership signals professionalism and makes the caller feel they reached the right person.',
      doThis: 'Smile before you answer. Say your name + dealership clearly. End with an open question.',
      notThis: 'Answer with "Yeah?" or mumble the dealership name. Never answer distracted.',
      example: '"Good afternoon, this is Marcus at Riverside Toyota — thanks for calling in, how can I help you today?"',
    },
    {
      letter: 'H', color: '#8b5cf6',
      title: 'Hold Their Attention',
      desc: 'Get their name within 20 seconds. Use reciprocity — give your name first, and they will naturally give theirs. Once you have their name, use it to deepen connection throughout the call.',
      doThis: 'Give your name, then ask theirs. Use their name 2-3 times naturally in conversation.',
      notThis: 'Dive into their question without introducing yourself. Overuse their name until it feels robotic.',
      example: '"I\'m Marcus, by the way — and who do I have the pleasure of speaking with today?"',
    },
    {
      letter: 'O', color: '#06b6d4',
      title: 'Open the Discovery',
      desc: 'Before answering their question, ask yours. Use the four question types — situational, problem, implication, vision — to understand what they really need and why they really need it.',
      doThis: 'Ask needs questions before answering price/availability questions. Use the Rule of 3.',
      notThis: 'Answer their first question without asking anything. Skip discovery because the vehicle seems obvious.',
      example: '"Before I look that up — are you replacing a current vehicle, or adding to the family fleet?"',
    },
    {
      letter: 'N', color: '#f59e0b',
      title: 'Number Exchange',
      desc: 'Secure their callback phone number before giving any substantial pricing or availability information. Frame it as follow-up, not data collection. This is the most important capture of the call.',
      doThis: 'Ask for the number after rapport but before pricing. Frame as "in case we get disconnected."',
      notThis: 'Give price before getting their number. Ask for number as the first thing — it kills trust.',
      example: '"I want to pull up the exact availability on that — just in case we get cut off, what\'s the best number to reach you at?"',
    },
    {
      letter: 'U', color: '#ef4444',
      title: 'Uncover Objections Early',
      desc: 'Surface objections before they derail the close. Use the Acknowledge-Explore-Respond framework: hear the objection fully, ask what\'s really behind it, and address the actual concern.',
      doThis: 'Welcome objections as signals of interest. Use the dig-down question to find the real concern.',
      notThis: 'Argue with objections. Use "I understand, but..." which signals you don\'t actually understand.',
      example: '"Totally fair — can I ask, is it more about the timing, the vehicle itself, or something around the numbers?"',
    },
    {
      letter: 'P', color: '#10b981',
      title: 'Push for the Appointment',
      desc: 'The only goal of the call is the appointment. Use the tie-down to confirm interest, then the assumptive close to make the appointment feel like the obvious next step.',
      doThis: 'Tie down interest first. Use assumptive close (Tuesday or Saturday?) not yes/no question.',
      notThis: '"Would you like to come in?" — too easy to say no. Never ask for a yes/no appointment.',
      example: '"Based on what you\'ve told me, it sounds like the Camry could be a strong fit — I\'ve got tomorrow afternoon or Saturday morning. Which works better for you?"',
    },
    {
      letter: '!', color: '#1e293b',
      title: 'UP — Confirm & Follow Through',
      desc: 'A verbal yes is worth nothing without a confirmed appointment. Lock it in with the five-point confirmation: day/time, their name, what you\'ll prepare, your direct number, and your name.',
      doThis: 'Repeat day + time. Use their name. Create anticipation. Give your direct number.',
      notThis: 'End the call without a confirmed time. Assume they\'ll show up without a confirmation.',
      example: '"Perfect — so we\'ve got you for Saturday at 11, [Name]. I\'ll have a couple of options pulled that match exactly what you described. Just ask for Marcus when you arrive."',
    },
  ];

  app.innerHTML = `
    <a href="#/learn" class="back-link">← Learn</a>
    <div class="page-header">
      <div>
        <h1>The PHONUP Framework™</h1>
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
    { id: 'warmup', label: 'Warm-up' },
    { id: 'price', label: 'Price' },
    { id: 'availability', label: 'Availability' },
    { id: 'commitment', label: 'Commitment' },
    { id: 'info', label: 'Info' },
    { id: 'competitor', label: 'Competitor' },
  ];
  const diffs = [
    { id: 'all', label: 'All' },
    { id: 'easy', label: 'Easy' },
    { id: 'medium', label: 'Medium' },
    { id: 'hard', label: 'Hard' },
  ];

  app.innerHTML = `
    <a href="#/learn" class="back-link">← Learn</a>
    <div class="page-header">
      <div>
        <h1>Objection Gauntlet</h1>
        <p class="subtitle">One objection. One response. Instant AI coaching.</p>
      </div>
    </div>
    <div class="gauntlet-wrap">
      <div class="gauntlet-filters">
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
      <div class="gauntlet-count">${filtered.length} challenge${filtered.length !== 1 ? 's' : ''} available</div>
      <button class="btn btn-primary btn-lg" id="gauntlet-start-btn" ${filtered.length === 0 ? 'disabled' : ''}>
        ⚡ Start Random Challenge
      </button>
    </div>
  `;

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

  app.innerHTML = `
    <a href="#/learn" class="back-link">← Learn</a>
    <div class="page-header">
      <div>
        <h1>Objection Gauntlet</h1>
        <p class="subtitle"><span class="badge" style="background:${diffColors[c.difficulty] || '#888'};color:#fff">${c.difficulty}</span> &nbsp;${c.category}</p>
      </div>
    </div>
    <div class="gauntlet-challenge-wrap">
      <div class="challenge-context card">${escHtml(c.context)}</div>
      <div class="challenge-bubble">
        <div class="challenge-bubble-avatar">👤</div>
        <div class="challenge-bubble-text">"${escHtml(c.challenge)}"</div>
      </div>
      <div class="gauntlet-hint"><strong>Hint:</strong> ${escHtml(c.hint)}</div>
      <div class="form-group">
        <label for="gauntlet-response">Your Response</label>
        <textarea id="gauntlet-response" rows="4" placeholder="Type exactly what you would say on the phone…" class="gauntlet-textarea"></textarea>
      </div>
      <button class="btn btn-primary btn-lg" id="gauntlet-submit-btn">
        📞 Respond &amp; End Call
      </button>
    </div>
  `;

  document.getElementById('gauntlet-submit-btn').addEventListener('click', async () => {
    const response = document.getElementById('gauntlet-response').value.trim();
    if (!response) { showToast('Type your response first.', 'error'); return; }

    // Hang-up animation
    const btn = document.getElementById('gauntlet-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="hangup-anim">📞</span> Scoring…';

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
      btn.innerHTML = '📞 Respond &amp; End Call';
    }
  });
}

function renderGauntletResult(challenge, userResponse, result) {
  const score = result.score || 0;
  const color = scoreColor(score);
  const canSave = score >= 70;

  app.innerHTML = `
    <a href="#/learn" class="back-link">← Learn</a>
    <div class="page-header">
      <div><h1>Gauntlet Result</h1></div>
    </div>
    <div class="gauntlet-result-wrap">
      <div class="result-score-circle" style="--score-color:${color}">
        <div class="rsc-inner">
          <div class="rsc-num" style="color:${color}">${score}</div>
          <div class="rsc-lbl">/ 100</div>
        </div>
      </div>

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
        <button class="btn btn-primary" id="next-challenge-btn">⚡ Next Challenge</button>
      </div>

      <div id="playbook-save-msg" style="display:none" class="settings-msg success">Saved to your playbook!</div>
    </div>
  `;

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
