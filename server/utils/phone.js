'use strict';

function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Strip formatting: spaces, dashes, parens, dots
  let s = trimmed.replace(/[\s().-]/g, '').replace(/(?!^)\+/g, '');

  // Auto-prefix US numbers:
  // 10 digits (no country code) → +1XXXXXXXXXX
  if (/^\d{10}$/.test(s)) return '+1' + s;
  // 11 digits starting with 1 (e.g. 15551234567) → +15551234567
  if (/^1\d{10}$/.test(s)) return '+' + s;

  return s;
}

function isE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

function parseAndValidatePhone(input) {
  const normalized = normalizePhone(input);
  if (!normalized || !isE164(normalized)) {
    return { ok: false, error: 'Enter a valid US phone number, e.g. (555) 123-4567' };
  }
  return { ok: true, phoneNumber: normalized };
}

module.exports = { normalizePhone, isE164, parseAndValidatePhone };
