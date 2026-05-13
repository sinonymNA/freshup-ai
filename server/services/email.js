'use strict';

let _sg = null;

function getSg() {
  if (_sg) return _sg;
  if (!process.env.SENDGRID_API_KEY) return null;
  try {
    _sg = require('@sendgrid/mail');
    _sg.setApiKey(process.env.SENDGRID_API_KEY);
    return _sg;
  } catch {
    console.warn('[email] @sendgrid/mail not available — install it and set SENDGRID_API_KEY to enable emails');
    return null;
  }
}

function scoreColor(score) {
  if (score >= 70) return '#16a34a';
  if (score >= 50) return '#d97706';
  return '#dc2626';
}

async function sendGradeReport({ repName, score, callDate, summary, dashboardUrl, gmEmail }) {
  const sg = getSg();
  if (!sg || !gmEmail) {
    console.log(`[email] Grade report skipped (SendGrid not configured). Would send to: ${gmEmail || 'no address set'}`);
    return { skipped: true };
  }

  const dateStr = new Date(callDate).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });

  const subject = `FreshUp AI Call Report — ${repName} scored ${score}/100`;
  const color = scoreColor(score);

  const html = `
<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
  <div style="background:#1e3a5f;padding:24px 32px;border-radius:12px 12px 0 0">
    <span style="color:#fff;font-size:20px;font-weight:800">FreshUp <span style="color:#3b82f6">AI</span></span>
  </div>
  <div style="background:#f8fafc;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
    <h2 style="margin:0 0 4px;font-size:22px">Call Report</h2>
    <p style="color:#64748b;margin:0 0 24px;font-size:14px">${dateStr}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr>
        <td style="padding:10px 0;color:#64748b;width:130px;font-size:14px">Rep</td>
        <td style="font-weight:600;font-size:15px">${repName}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:#64748b;font-size:14px">Score</td>
        <td style="font-size:28px;font-weight:800;color:${color}">${score}<span style="font-size:14px;color:#64748b;font-weight:400">/100</span></td>
      </tr>
    </table>
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:0 0 24px;font-size:14px;line-height:1.6;color:#334155">${summary}</div>
    <a href="${dashboardUrl}" style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View Full Report →</a>
    <p style="margin-top:24px;font-size:12px;color:#94a3b8">This report was generated automatically by FreshUp AI after a recorded sales call.</p>
  </div>
</div>`;

  const text = `FreshUp AI Call Report\n\nRep: ${repName}\nDate: ${dateStr}\nScore: ${score}/100\n\n${summary}\n\nView full report: ${dashboardUrl}`;

  await sg.send({
    to: gmEmail,
    from: process.env.SENDGRID_FROM_EMAIL || 'reports@freshup.ai',
    subject,
    text,
    html,
  });

  console.log(`[email] Grade report sent to ${gmEmail} — ${repName} scored ${score}/100`);
  return { sent: true };
}

module.exports = { sendGradeReport };
