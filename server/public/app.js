'use strict';

// ── ROUTER ─────────────────────────────────────────────────────────────────

const app = document.getElementById('app');

function getRoute() {
  const hash = location.hash || '#/';
  const path = hash.slice(1) || '/';
  return path;
}

function navigate(path) {
  location.hash = '#' + path;
}

window.addEventListener('hashchange', render);
window.addEventListener('load', render);

// Scroll listener — adds shadow to nav when page scrolls
window.addEventListener('scroll', () => {
  document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 4);
}, { passive: true });

function render() {
  const path = getRoute();
  updateNav(path);

  if (path === '/') return renderDashboard();
  if (path === '/start') return renderStart();
  if (path === '/history') return renderHistory();
  if (path === '/personas') return renderPersonas();
  if (path.startsWith('/call/')) return renderCallResult(path.split('/call/')[1]);
  app.innerHTML = '<div class="empty">Page not found.</div>';
}

function updateNav(path) {
  document.querySelectorAll('[data-nav]').forEach(a => {
    a.classList.remove('active');
    const target = a.getAttribute('data-nav');
    if (
      (target === 'dashboard' && path === '/') ||
      (target === 'start' && path === '/start') ||
      (target === 'history' && path === '/history') ||
      (target === 'personas' && path === '/personas')
    ) a.classList.add('active');
  });
}

// ── TOAST ──────────────────────────────────────────────────────────────────

function showToast(msg, type = 'default') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3500);
}

// ── API HELPERS ─────────────────────────────────────────────────────────────

function getApiKey() {
  return localStorage.getItem('freshup_api_key') || window.FRESHUP_API_KEY || '';
}

async function api(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  const apiKey = getApiKey();
  if (apiKey) headers.set('x-api-key', apiKey);

  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 401) {
      throw new Error('Unauthorized: invalid API key');
    }
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ── HELPERS ─────────────────────────────────────────────────────────────────

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}

function avatar(name, size = '') {
  return `<div class="avatar${size ? ' ' + size : ''}">${initials(name)}</div>`;
}

function difficultyBadge(d = '') {
  const cls = { Easy: 'badge-easy', Medium: 'badge-medium', Hard: 'badge-hard' }[d] || 'badge-medium';
  return `<span class="badge ${cls}">${d}</span>`;
}

function outcomePill(o) {
  if (!o) return '<span style="color:var(--text-subtle)">—</span>';
  return `<span class="outcome-pill outcome-${o}">${o}</span>`;
}

function scoreColor(s) {
  if (s >= 75) return 'var(--green)';
  if (s >= 50) return 'var(--orange)';
  return 'var(--red)';
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

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── DASHBOARD ───────────────────────────────────────────────────────────────

async function renderDashboard() {
  app.innerHTML = '<div class="loading">Loading…</div>';
  let history = [];
  try { history = await api('/api/call/history'); } catch(e) {}

  const total = history.length;
  const appts = history.filter(c => c.outcome === 'Appointment').length;
  const scored = history.filter(c => c.score && c.score.overallScore != null);
  const avgScore = scored.length
    ? Math.round(scored.reduce((s, c) => s + c.score.overallScore, 0) / scored.length)
    : null;

  const recent = history.slice(0, 5);

  app.innerHTML = `
    <div class="flex-between">
      <div>
        <h1>Dashboard</h1>
        <p class="subtitle">Your sales training overview</p>
      </div>
      <a class="btn btn-primary" href="#/start">+ Start Call</a>
    </div>

    <div class="stats">
      <div class="stat"><div class="val">${total}</div><div class="lbl">Total Calls</div></div>
      <div class="stat"><div class="val">${appts}</div><div class="lbl">Appointments Set</div></div>
      <div class="stat"><div class="val">${avgScore != null ? avgScore : '—'}</div><div class="lbl">Avg Score</div></div>
    </div>

    <div class="flex-between">
      <h2>Recent Calls</h2>
      ${total > 5 ? '<a href="#/history" class="link" style="font-size:13px">View all →</a>' : ''}
    </div>

    ${recent.length === 0
      ? '<div class="empty">No calls yet. <a class="link" href="#/start">Start your first training call →</a></div>'
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
    ? `<span style="font-family:'Playfair Display',serif;font-weight:700;color:${scoreColor(scoreVal)}">${scoreVal}</span>`
    : '—';
  return `<tr>
    <td>
      <div style="display:flex;align-items:center;gap:10px">
        ${avatar(c.personaName)}
        <strong>${c.personaName || '—'}</strong>
      </div>
    </td>
    <td>${outcomePill(c.outcome)}</td>
    <td>${scoreHtml}</td>
    <td style="color:var(--text-muted)">${formatDuration(c.duration)}</td>
    <td style="font-size:12px;color:var(--text-subtle)">${formatDate(c.timestamp)}</td>
    <td><a href="#/call/${c.callSid}" class="btn btn-secondary btn-sm">View</a></td>
  </tr>`;
}

// ── START CALL ───────────────────────────────────────────────────────────────

let selectedPersonaId = null;

async function renderStart() {
  app.innerHTML = '<div class="loading">Loading personas…</div>';
  let personas = [];
  try { personas = await api('/api/personas'); } catch(e) {
    app.innerHTML = '<div class="empty">Failed to load personas.</div>';
    return;
  }

  selectedPersonaId = null;

  app.innerHTML = `
    <h1>Start a Training Call</h1>
    <p class="subtitle">Choose a customer persona and enter a phone number to begin.</p>

    <div class="section-title">Select Persona</div>
    <div class="persona-grid" id="persona-grid">
      ${personas.map(personaSelectCard).join('')}
    </div>

    <div class="card">
      <div class="form-group">
        <label for="phone">Your Phone Number (you will receive the call)</label>
        <input type="tel" id="phone" placeholder="+1 555 000 0000" />
      </div>
      <button class="btn btn-primary" id="start-btn" disabled>
        Start Call
      </button>
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

  document.getElementById('start-btn').addEventListener('click', async () => {
    const phone = document.getElementById('phone').value.trim();
    if (!phone) return;
    const btn = document.getElementById('start-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Dialing…';

    try {
      const data = await api('/api/call/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone, personaId: selectedPersonaId || undefined }),
      });
      showToast(`Call started! Persona: ${data.persona.name}`, 'success');
      setTimeout(() => navigate(`/call/${data.callSid}`), 800);
    } catch(err) {
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
  if (btn) btn.disabled = !phone.trim();
}

function personaSelectCard(p) {
  return `
    <button class="persona-card" data-id="${p.id}">
      <div class="persona-card-top">
        ${avatar(p.name)}
        ${difficultyBadge(p.difficulty)}
      </div>
      <h3>${p.name}</h3>
      <div class="occupation">${p.occupation}</div>
      <div class="mood">${p.mood}</div>
      <div class="intent-bar-wrap">
        <div class="intent-label"><span>Intent</span><span>${p.intentScore}/10</span></div>
        <div class="intent-bar"><div class="intent-fill" style="width:${p.intentScore * 10}%"></div></div>
      </div>
    </button>
  `;
}

// ── HISTORY ──────────────────────────────────────────────────────────────────

async function renderHistory() {
  app.innerHTML = '<div class="loading">Loading history…</div>';
  let history = [];
  try { history = await api('/api/call/history'); } catch(e) {
    app.innerHTML = '<div class="empty">Failed to load history.</div>';
    return;
  }

  app.innerHTML = `
    <div class="flex-between">
      <div><h1>Call History</h1><p class="subtitle">${history.length} call${history.length !== 1 ? 's' : ''} recorded</p></div>
      <a class="btn btn-primary" href="#/start">+ Start Call</a>
    </div>
    ${history.length === 0
      ? '<div class="empty">No calls yet. <a class="link" href="#/start">Start your first training call →</a></div>'
      : `<div class="table-wrap"><table>
          <thead><tr><th>Persona</th><th>Outcome</th><th>Score</th><th>Duration</th><th>Date</th><th></th></tr></thead>
          <tbody>${history.map(callRow).join('')}</tbody>
        </table></div>`
    }
  `;
}

// ── CALL RESULTS ─────────────────────────────────────────────────────────────

function renderCallResult(callSid) {
  app.innerHTML = `
    <a href="#/history" class="link" style="font-size:13px;display:inline-block;margin-bottom:20px">← Back to history</a>
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
    }
  }).catch(() => {
    const el = document.getElementById('result-content');
    if (el) el.innerHTML = '<div class="empty">Call not found or still in progress.</div>';
  });
}

function renderResultData(data, callSid) {
  const el = document.getElementById('result-content');
  if (!el) return;

  const score = data.score;
  const history = data.history || [];

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:4px">
      ${avatar(data.personaName, 'avatar-lg')}
      <div>
        <h1>${data.personaName || 'Unknown Persona'}</h1>
        <p class="subtitle" style="margin-bottom:0">${outcomePill(data.outcome)} &nbsp;·&nbsp; ${formatDate(data.startTime)}</p>
      </div>
    </div>

    ${score ? `
      <div class="overall-score" style="margin-top:24px">
        <div class="number">${score.overallScore}</div>
        <div class="label">Overall Performance</div>
      </div>

      <div class="section-title">Dimension Scores</div>
      <div class="score-grid">
        ${['rapport','discovery','objections','closing'].map(dim => `
          <div class="score-item">
            <label>${dim.charAt(0).toUpperCase()+dim.slice(1)} <span>${score[dim]}</span></label>
            <div class="score-bar">
              <div class="score-fill" style="width:${score[dim]}%;background:${scoreColor(score[dim])}"></div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="section-title">Feedback</div>
      <div class="feedback-box">${escHtml(score.feedback || '—')}</div>
    ` : `
      <div class="card" style="text-align:center;color:var(--text-muted);margin-top:24px">
        <span class="spinner"></span>&nbsp; Analyzing call… results will appear shortly.
      </div>
    `}

    ${history.length > 0 ? `
      <div class="section-title">Transcript</div>
      <div class="transcript">
        ${history.map(msg => `
          <div class="msg ${msg.role === 'user' ? 'rep' : 'customer'}">
            <div class="who">${msg.role === 'user' ? 'Sales Rep' : 'Customer'}</div>
            ${escHtml(msg.content.replace(/\[HANG_UP\]/g,'').replace(/\[APPOINTMENT_SET\]/g,'').trim())}
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
}

// ── PERSONAS ─────────────────────────────────────────────────────────────────

async function renderPersonas() {
  app.innerHTML = '<div class="loading">Loading personas…</div>';
  let personas = [];
  try { personas = await api('/api/personas'); } catch(e) {
    app.innerHTML = '<div class="empty">Failed to load personas.</div>';
    return;
  }

  app.innerHTML = `
    <div class="flex-between">
      <div><h1>Personas</h1><p class="subtitle">${personas.length} customer profiles available</p></div>
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
    <div class="card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
        ${avatar(p.name, 'avatar-lg')}
        ${difficultyBadge(p.difficulty)}
      </div>
      <h3 style="font-family:'Playfair Display',serif;font-size:17px;font-weight:700;margin-bottom:2px">${p.name}</h3>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">${p.occupation}${p.age ? ', ' + p.age : ''}</div>
      <div style="font-size:13px;color:var(--text-subtle);font-style:italic;margin-bottom:10px">${p.mood}</div>
      <div class="intent-bar-wrap" style="margin-bottom:12px">
        <div class="intent-label"><span>Purchase Intent</span><span>${p.intentScore}/10</span></div>
        <div class="intent-bar"><div class="intent-fill" style="width:${p.intentScore * 10}%"></div></div>
      </div>
      ${traits.length ? `<div class="trait-chips">${traits.map(t => `<span class="trait-chip">${t}</span>`).join('')}</div>` : ''}
      ${p.background ? `<p style="font-size:12px;color:var(--text-muted);line-height:1.6;margin-top:12px">${escHtml(p.background)}</p>` : ''}
      <div style="margin-top:14px">
        <a href="#/start" onclick="event.preventDefault();navigate('/start');setTimeout(()=>{const btn=document.querySelector('[data-id=\\'${p.id}\\']');if(btn){btn.click();}},300)" class="btn btn-secondary btn-sm">Train with ${p.name.split(' ')[0]}</a>
      </div>
    </div>
  `;
}
