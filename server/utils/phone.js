'use strict';

function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // keep leading +, strip spaces, dashes, parens and dots.
  const normalized = trimmed
    .replace(/[\s().-]/g, '')
    .replace(/(?!^)\+/g, '');

  return normalized;
}

function isE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

function parseAndValidatePhone(input) {
  const normalized = normalizePhone(input);
  if (!normalized || !isE164(normalized)) {
    return { ok: false, error: 'phoneNumber must be valid E.164 format (e.g. +15551234567)' };
  }
  return { ok: true, phoneNumber: normalized };
}

module.exports = { normalizePhone, isE164, parseAndValidatePhone };
