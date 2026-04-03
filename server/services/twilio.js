'use strict';

const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function initiateCall(toPhoneNumber, personaId) {
  const call = await client.calls.create({
    from: process.env.TWILIO_PHONE_NUMBER,
    to: toPhoneNumber,
    url: `${process.env.BASE_URL}/webhook/voice?personaId=${personaId}`,
    statusCallback: `${process.env.BASE_URL}/webhook/status`,
  });

  return call;
}

function generateTwiML(audioUrl, nextWebhook) {
  const response = new twilio.twiml.VoiceResponse();

  response.play(audioUrl);

  const gather = response.gather({
    input: 'speech',
    timeout: 5,
    speechTimeout: 'auto',
    action: nextWebhook,
  });

  gather.say('...');

  return response.toString();
}

function generateEndTwiML(audioUrl) {
  const response = new twilio.twiml.VoiceResponse();

  response.play(audioUrl);
  response.hangup();

  return response.toString();
}

module.exports = { initiateCall, generateTwiML, generateEndTwiML };
