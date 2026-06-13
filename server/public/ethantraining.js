'use strict';

// ── Ethan Training Center (hidden cold-call practice tool) ─────────────────
// Reachable only via #/ethantraining — no nav link, lazy-loaded by app.js.

const ET_DIMENSIONS = [
  ['Gatekeeper Penetration', 'gatekeeperPenetration'],
  ['Hook Strength', 'hookStrength'],
  ['Objection Handling', 'objectionHandling'],
  ['Value Prop Clarity', 'valuePropClarity'],
  ['Next Step Secured', 'nextStepSecured'],
];

let etPollTimer = null;

function etOutcomePill(o) {
  if (!o) return '<span class="text-muted">—</span>';
  const cls = {
    'Appointment Set': 'outcome-Appointment',
    'Hung Up': 'outcome-HangUp',
    'Never Transferred': 'outcome-HangUp',
    'Completed': 'outcome-Completed',
  }[o] || 'outcome-Completed';
  return `<span class="outcome-pill ${cls}">${escHtml(o)}</span>`;
}

function etDimensionBars() {
  return ET_DIMENSIONS.map(([label, key]) => `
    <div class="gauge-dim">
      <div class="gauge-dim-header">
        <span>${label}</span>
        <span class="gauge-dim-val" id="et-dim-${key}">—</span>
      </div>
      <div class="gauge-dim-bar">
        <div class="gauge-dim-fill" id="et-dimbar-${key}" style="width:0%"></div>
      </div>
    </div>`).join('');
}

async function renderEthanTraining() {
  app.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Ethan Training Center</h1>
        <p class="subtitle">Cold-call practice — you're the FreshUp AI sales rep, the AI plays the dealership.</p>
      </div>
    </div>

    <div class="arena-wrap">
      <div class="arena-left">
        <div class="phone-card">
          <div class="phone-card-head">
            <div class="phone-ring-icon" id="et-ring-icon">📞</div>
            <h2>Start a Cold Call</h2>
            <p class="phone-card-sub">Pick a difficulty — the AI dealership will call your phone.</p>
          </div>
          <div class="diff-selector" id="et-diff-selector">
            <button class="diff-opt diff-easy active" data-diff="easy">
              <div class="diff-color easy"></div>
              <div class="diff-text">
                <span class="diff-name">Easy</span>
                <span class="diff-desc">Simple directory · Warm gatekeeper · Friendly GM</span>
              </div>
            </button>
            <button class="diff-opt diff-medium" data-diff="medium">
              <div class="diff-color medium"></div>
              <div class="diff-text">
                <span class="diff-name">Medium</span>
                <span class="diff-desc">Trickier directory · Screens calls · Skeptical GM</span>
              </div>
            </button>
            <button class="diff-opt diff-hard" data-diff="hard">
              <div class="diff-color hard"></div>
              <div class="diff-text">
                <span class="diff-name">Hard</span>
                <span class="diff-desc">Confusing directory · Protective gatekeeper · Hostile GM</span>
              </div>
            </button>
          </div>
          <div class="phone-input-wrap">
            <div class="form-group">
              <label for="et-phone">Your Cell Number</label>
              <p class="input-hint">The AI dealership will call this number</p>
              <input type="tel" id="et-phone" placeholder="(555) 123-4567" autocomplete="tel"/>
            </div>
            <button class="btn btn-primary btn-full btn-arena" id="et-start-btn" disabled>
              📞&nbsp; Start Cold Call
            </button>
          </div>
          <p class="arena-note">🎯 Get past the front desk, then pitch the GM on FreshUp AI.</p>
        </div>
      </div>

      <div class="arena-middle">
        <div class="live-transcript-card">
          <div class="lt-header">
            <span class="lt-title">Call Status</span>
            <span class="lt-badge" id="et-status-badge">Waiting</span>
          </div>
          <div class="lt-preview-empty" id="et-status-body">
            <div class="lt-preview-icon">🏢</div>
            <p>Navigate the dealership's phone menu, win over the gatekeeper, then pitch the GM.</p>
            <p class="lt-preview-sub">Easy difficulty starts with a simple directory and a friendly front desk.</p>
          </div>
        </div>
      </div>

      <div class="arena-right">
        <div class="live-score-card">
          <div class="ls-header">Scorecard</div>
          <div id="et-outcome-wrap"></div>
          <div id="et-overall-wrap"></div>
          <div class="gauge-dims">${etDimensionBars()}</div>
          <div id="et-feedback-wrap"></div>
        </div>
      </div>
    </div>

    ${etEducationHtml()}
  `;

  const phoneInput = document.getElementById('et-phone');
  const savedPhone = (getUser() || {}).phone_number || '';
  if (phoneInput && savedPhone) phoneInput.value = savedPhone;
  initPhoneInput(phoneInput);

  let selectedDifficulty = 'easy';
  const diffSel = document.getElementById('et-diff-selector');
  diffSel.addEventListener('click', (e) => {
    const btn = e.target.closest('.diff-opt');
    if (!btn) return;
    diffSel.querySelectorAll('.diff-opt').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDifficulty = btn.dataset.diff;
  });

  const startBtn = document.getElementById('et-start-btn');
  const updateStartDisabled = () => { startBtn.disabled = !phoneInput.value.trim(); };
  phoneInput.addEventListener('input', updateStartDisabled);
  updateStartDisabled();

  startBtn.addEventListener('click', async () => {
    const phone = phoneInput.value.trim();
    if (!phone) return;
    startBtn.disabled = true;
    startBtn.innerHTML = '<span class="spinner"></span> Dialing…';

    try {
      const data = await api('/api/training/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone, difficulty: selectedDifficulty }),
      });
      showToast('Calling you now — answer when your phone rings!', 'success');
      const badge = document.getElementById('et-status-badge');
      if (badge) badge.textContent = 'In Progress';
      const body = document.getElementById('et-status-body');
      if (body) body.innerHTML = '<div class="lt-preview-icon">📞</div><p>Call in progress — answer your phone and work the front desk!</p>';
      document.getElementById('et-outcome-wrap').innerHTML = '';
      document.getElementById('et-overall-wrap').innerHTML = '';
      document.getElementById('et-feedback-wrap').innerHTML = '';
      etPollResults(data.callSid);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      startBtn.disabled = false;
      startBtn.innerHTML = '📞&nbsp; Start Cold Call';
    }
  });

  const ringIcon = document.getElementById('et-ring-icon');
  if (ringIcon) {
    setInterval(() => {
      ringIcon.classList.add('ringing');
      setTimeout(() => ringIcon.classList.remove('ringing'), 600);
    }, 4000);
  }
}

function etPollResults(callSid) {
  clearTimeout(etPollTimer);
  api(`/training-webhook/results/${callSid}`).then((data) => {
    etShowResult(data);
    if (!data.outcome || !data.score) {
      etPollTimer = setTimeout(() => etPollResults(callSid), 3000);
    }
  }).catch(() => {
    etPollTimer = setTimeout(() => etPollResults(callSid), 4000);
  });
}

function etShowResult(data) {
  if (data.outcome) {
    const badge = document.getElementById('et-status-badge');
    if (badge) { badge.textContent = 'Done'; badge.className = 'lt-badge done'; }
    const body = document.getElementById('et-status-body');
    if (body) body.innerHTML = '<div class="lt-preview-icon">📋</div><p>Call complete — check your scorecard.</p>';
    const wrap = document.getElementById('et-outcome-wrap');
    if (wrap) wrap.innerHTML = `<div class="outcome-live">${etOutcomePill(data.outcome)}</div>`;
  }

  if (data.score) {
    const overall = data.score.overallScore;
    const overallWrap = document.getElementById('et-overall-wrap');
    if (overallWrap && overall != null) {
      overallWrap.innerHTML = `<div style="text-align:center;font-size:36px;font-weight:800;color:${scoreColor(overall)};margin:8px 0">${overall}<span style="font-size:13px;font-weight:600;color:var(--text-muted)"> / 100</span></div>`;
    }
    ET_DIMENSIONS.forEach(([, key]) => {
      const val = data.score[key];
      if (val == null) return;
      const pct = Math.max(0, Math.min(100, val));
      const elVal = document.getElementById(`et-dim-${key}`);
      const elBar = document.getElementById(`et-dimbar-${key}`);
      if (elVal) elVal.textContent = String(val);
      if (elBar) { elBar.style.width = `${pct}%`; elBar.style.background = scoreColor(pct); }
    });
    if (data.score.feedback) {
      const fw = document.getElementById('et-feedback-wrap');
      if (fw) fw.innerHTML = `<div class="live-feedback-header">Coaching feedback:</div><div class="live-feedback">${escHtml(data.score.feedback)}</div>`;
    }
  }
}

// ── EDUCATIONAL CONTENT ──────────────────────────────────────────────────────

function etFrameworkStep(num, color, title, desc, doThis, notThis, example) {
  return `
    <div class="framework-step" style="--step-color:${color}">
      <div class="framework-step-badge">${num}</div>
      <div class="framework-step-body">
        <h3 class="framework-step-title">${escHtml(title)}</h3>
        <p class="framework-step-desc">${escHtml(desc)}</p>
        <div class="framework-do-dont">
          <div class="framework-do"><div class="fdd-label">✓ Do This</div><div class="fdd-text">${escHtml(doThis)}</div></div>
          <div class="framework-dont"><div class="fdd-label">✗ Not This</div><div class="fdd-text">${escHtml(notThis)}</div></div>
        </div>
        <div class="framework-example">"${escHtml(example)}"</div>
      </div>
    </div>`;
}

function etObjectionCard(objection, rebuttal) {
  return `
    <div class="card">
      <div class="fdd-label" style="margin-bottom:6px">"${escHtml(objection)}"</div>
      <p style="color:var(--text-muted);margin:0;font-size:0.875rem;line-height:1.5">${escHtml(rebuttal)}</p>
    </div>`;
}

function etEducationHtml() {
  const frameworkSteps = [
    etFrameworkStep(1, '#3b82f6', 'Open with a Pattern Interrupt',
      "State your name, your company, and a quick, human reason for calling — something that doesn't sound like a script. The first 5 seconds decide whether you get a real conversation or a brush-off.",
      'Be brief, confident, and specific about why you\'re calling this dealership today.',
      'Ask for "whoever handles your phone systems" — vague, sounds like a script, easy to deflect.',
      "Hey, it's Ethan with FreshUp AI — quick question for whoever handles missed calls at the dealership, is that the GM or someone else?"),
    etFrameworkStep(2, '#8b5cf6', 'Earn the Transfer',
      "The gatekeeper's job is to filter sales calls. Give them a specific, credible reason the GM would want this — not \"I have something to sell you.\" Be friendly and matter-of-fact.",
      'Name a concrete pain point ("missed calls after hours") and ask who owns that.',
      'Ask vaguely for "whoever\'s in charge," or get pushy when screened.',
      "We help dealerships stop losing leads when calls go to voicemail after hours — is that something the GM would want to hear about, or is there someone else who owns that?"),
    etFrameworkStep(3, '#06b6d4', 'Hook the GM',
      'Once transferred, you have one shot at a hook. Lead with the dealership\'s pain, not your product. Make it about a problem they already have.',
      'Open with a specific, relatable pain point (overflow calls, after-hours leads, slow follow-up) before naming FreshUp AI.',
      'Launch into a feature list or company pitch before establishing relevance.',
      "Quick question — when a call comes in after you close, or all your lines are busy, what happens to that lead today?"),
    etFrameworkStep(4, '#f59e0b', 'Handle Objections',
      'Every objection is a sign of engagement, not rejection. Acknowledge it, reframe it, bridge to the value, then ask a question to keep the conversation moving.',
      'Acknowledge → Reframe → Bridge to value → Ask a forward-moving question.',
      'Argue, get defensive, or immediately drop your price/pitch.',
      "Totally fair — a lot of the GMs I talk to feel the same way at first. Can I ask what you're using today for after-hours calls?"),
    etFrameworkStep(5, '#10b981', 'Close with a Specific Ask',
      'Never end a good conversation without a concrete next step. Propose specific times, not "let\'s set something up."',
      'Offer two specific times for a short walkthrough or trial.',
      '"I\'ll send some info over and follow up" — easy to ignore, no commitment.',
      "I can show you exactly how this would work for your store in 15 minutes — does Tuesday at 2 or Thursday morning work better?"),
  ].join('');

  const gatekeeperTips = [
    'Sound confident and brief — gatekeepers screen out anything that feels like a script.',
    'Give a specific reason for your call — never "can I speak to the GM," always tied to a real pain point.',
    'Ask for names — "Who handles that?" feels collaborative, not like a cold pitch.',
    'React naturally to what they say instead of plowing through a script.',
    "If declined, don't burn the bridge — ask for a callback time, a direct line, or the GM's name for next time.",
  ];

  const objections = [
    ['We already use something for this.',
      "Acknowledge they have a solution, then ask what's working (or not) with it. Most tools don't cover after-hours or overflow calls — that's the gap FreshUp AI fills without replacing anything."],
    ["We don't have budget for another tool.",
      "Reframe it: this isn't a new line item, it's recovered revenue from leads they're already paying for and currently losing. Offer a free trial so there's no budget conversation needed yet."],
    ["I'm too busy for this — get to the point.",
      'Respect it. Give the one-sentence version immediately ("we make sure no phone-up ever goes unanswered, even after hours") and ask for 10 minutes at a better time.'],
    ['How is this different from the five other AI things people pitch me?',
      "Be specific: FreshUp AI is a phone-based AI receptionist with structured follow-up and call grading/coaching built in — not a generic chatbot. Offer to show it live on a real call."],
    ["I don't trust AI talking to my customers.",
      'Agree it\'s a fair concern, then explain FreshUp AI sounds natural, follows scripts the dealership approves, and every call is recorded and graded so they can review quality themselves.'],
    ["My team won't adopt another piece of software.",
      'FreshUp AI runs in the background on the phone lines they already use — nothing new for staff to log into. It catches what their team misses, it doesn\'t add to their workload.'],
    ['Just send me an email.',
      'Acknowledge, then ask one quick qualifying question first so the email is actually relevant: "Happy to — quick one first: roughly how many calls do you think go to voicemail after hours?"'],
  ];

  const valueProps = [
    'Never miss a lead — FreshUp AI answers and engages every call, 24/7, even after the dealership closes.',
    'Consistent, on-brand follow-up — every lead gets the same high-quality first response, every time.',
    'Frees up staff — your team spends less time on phone triage and more time with customers on the lot.',
    'Drop-in integration — works with the phone lines the dealership already has; nothing new for staff to learn.',
    'Call-level data and coaching — every call is recorded, transcribed, and scored (the same pipeline grading this practice call).',
  ];

  const bookingTips = [
    'Always propose two specific times, not "whenever works."',
    'Confirm the best contact info before you hang up — name, number, email.',
    'Send a confirmation (text or email) immediately after the call while it\'s fresh.',
  ];

  const usingTool = [
    'Start on Easy to get comfortable with the flow, then move to Medium and Hard as you improve.',
    'Review your scorecard after every call — outcome, dimension scores, and feedback.',
    'Pick one dimension to focus on per rep (e.g. Hook Strength) instead of trying to fix everything at once.',
    "The goal isn't a perfect score — it's getting comfortable handling pushback so real calls feel easier.",
  ];

  return `
    <div class="card" style="margin-top:8px">
      <h3 style="margin:0 0 8px">How This Call Works</h3>
      <p style="color:var(--text-muted);margin:0;font-size:0.875rem;line-height:1.6">
        Your phone will ring with a fake dealership. First you'll navigate a phone-tree directory
        (press digits, just like a real dealership switchboard) to reach the front desk.
        Phase 1 is the <strong>gatekeeper</strong> — the office manager who screens calls before
        the GM. Get past them with a real, specific reason for your call. Phase 2 is the
        <strong>GM</strong> — a randomized personality (friendly, skeptical, or hostile depending
        on difficulty) with real objections. Your goal: get a concrete next step booked.
      </p>
    </div>

    <div class="section-header"><h2>📚 Cold-Call Framework</h2></div>
    <div class="framework-steps">${frameworkSteps}</div>

    <div class="section-header"><h2>🚪 Gatekeeper Navigation Tactics</h2></div>
    <div class="card">
      <ul style="margin:0;padding-left:20px;line-height:1.8;color:var(--text-muted);font-size:0.875rem">
        ${gatekeeperTips.map((t) => `<li>${escHtml(t)}</li>`).join('')}
      </ul>
    </div>

    <div class="section-header"><h2>💬 Objection Rebuttals</h2></div>
    <div class="score-grid">${objections.map(([o, r]) => etObjectionCard(o, r)).join('')}</div>

    <div class="section-header"><h2>🚀 FreshUp AI Value Propositions</h2></div>
    <div class="card">
      <ul style="margin:0;padding-left:20px;line-height:1.8;color:var(--text-muted);font-size:0.875rem">
        ${valueProps.map((t) => `<li>${escHtml(t)}</li>`).join('')}
      </ul>
    </div>

    <div class="section-header"><h2>📅 Booking the Next Step</h2></div>
    <div class="card">
      <ul style="margin:0;padding-left:20px;line-height:1.8;color:var(--text-muted);font-size:0.875rem">
        ${bookingTips.map((t) => `<li>${escHtml(t)}</li>`).join('')}
      </ul>
    </div>

    <div class="section-header"><h2>🎯 Using This Training Tool</h2></div>
    <div class="card">
      <ul style="margin:0;padding-left:20px;line-height:1.8;color:var(--text-muted);font-size:0.875rem">
        ${usingTool.map((t) => `<li>${escHtml(t)}</li>`).join('')}
      </ul>
    </div>
  `;
}
