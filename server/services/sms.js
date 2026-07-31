'use strict';

const twilio = require('twilio');

let client = null;
function getClient() {
  if (client) return client;
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
  client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client;
}

// Low-level SMS send. Returns { sent: true } or { skipped: true, reason } — never throws.
async function sendSMS(to, body) {
  const c = getClient();
  const from = process.env.TWILIO_SMS_NUMBER || process.env.TWILIO_PHONE_NUMBER;
  if (!c || !from) {
    console.warn('[sms] Skipped — Twilio not configured');
    return { skipped: true, reason: 'not_configured' };
  }
  if (!to) return { skipped: true, reason: 'no_recipient' };
  try {
    const msg = await c.messages.create({ from, to, body });
    console.log(`[sms] Sent to ${to} sid=${msg.sid}`);
    return { sent: true, sid: msg.sid };
  } catch (err) {
    console.error(`[sms] Failed to ${to}: ${err.message}`);
    return { skipped: true, reason: err.message };
  }
}

// Rep gets a confirmation when they set an appointment in training.
async function sendRepAppointmentSMS({ repPhone, personaName, score }) {
  if (!repPhone) return { skipped: true, reason: 'no_phone' };
  const scoreText = score != null ? ` Score: ${score}/100.` : '';
  return sendSMS(
    repPhone,
    `🎉 FreshUp AI: Appointment set with ${personaName}!${scoreText} Keep the streak going.`
  );
}

// GM gets alerted when a high-intent inbound call is detected.
async function sendManagerAlert({ gmPhone, callerFrom, teamName, snippet }) {
  if (!gmPhone) return { skipped: true, reason: 'no_phone' };
  const caller = callerFrom ? ` from ${callerFrom}` : '';
  const detail = snippet ? ` — "${snippet}"` : '';
  return sendSMS(
    gmPhone,
    `🔥 FreshUp AI: Hot lead${caller} on the line at ${teamName || 'your dealership'}${detail}. Check the live dashboard.`
  );
}

module.exports = { sendSMS, sendRepAppointmentSMS, sendManagerAlert };
