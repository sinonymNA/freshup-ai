'use strict';

const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function initiateCall(toPhoneNumber, personaId, userId) {
  const base = (process.env.BASE_URL || '').replace(/\/$/, '');
  const call = await client.calls.create({
    from: process.env.TWILIO_PHONE_NUMBER,
    to: toPhoneNumber,
    url: `${base}/webhook/voice?personaId=${personaId}&userId=${userId || ''}`,
    statusCallback: `${base}/webhook/status`,
    record: true,
    recordingStatusCallback: `${base}/webhook/recording?type=bot`,
    recordingStatusCallbackEvent: ['completed'],
    recordingChannels: 'dual',
  });
  return call;
}

module.exports = { initiateCall };
