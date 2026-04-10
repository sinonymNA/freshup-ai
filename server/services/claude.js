'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function analyzeCall(transcript, persona) {
  if (!persona || !persona.name) {
    throw new Error('Persona is required to analyze call');
  }
  const prompt =
    `You are a car dealership phone-up coach. The sales rep RECEIVED an inbound call from ${persona.name}. ` +
    `Score the rep 0-20 on each of five phone-up skills:\n` +
    `opening: warm greeting, gave name + dealership, got caller's name in first 15 sec\n` +
    `infoCapture: secured callback phone number before giving any pricing info\n` +
    `discovery: asked about vehicle needs, timeline, trade-in\n` +
    `objectionHandling: bridged price/availability questions toward an in-person visit\n` +
    `appointment: asked for a specific day + time and confirmed it\n` +
    `overallScore: 0-100 weighted total. feedback: 2-3 sentences of specific coaching.\n` +
    `Respond ONLY in this exact JSON format with no other text: ` +
    `{ "opening": number, "infoCapture": number, "discovery": number, "objectionHandling": number, "appointment": number, "overallScore": number, "feedback": string }\n\n` +
    `Transcript:\n${transcript}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].text.trim();

  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // fall through
      }
    }
    return {
      opening: 0,
      infoCapture: 0,
      discovery: 0,
      objectionHandling: 0,
      appointment: 0,
      overallScore: 0,
      feedback: 'Call analysis could not be parsed. Raw response: ' + raw,
    };
  }
}

async function gradeGauntlet(challenge, response) {
  const prompt =
    `You are a car dealership phone-up coach grading a single response in a training drill.\n\n` +
    `Scenario: ${challenge.context}\n` +
    `Customer said: "${challenge.challenge}"\n` +
    `Sales rep responded: "${response}"\n\n` +
    `Score 0-100. Consider: did they avoid giving price before getting contact info? ` +
    `Did they redirect toward an appointment? Did they maintain rapport? ` +
    `Respond ONLY in JSON: { "score": number, "whatWorked": string, "whatMissed": string, "strongerLine": string }`;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = msg.content[0].text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // fall through
      }
    }
    return { score: 0, whatWorked: '', whatMissed: 'Could not parse response', strongerLine: '' };
  }
}

module.exports = { analyzeCall, gradeGauntlet };
