'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function analyzeCall(transcript, persona) {
  if (!persona || !persona.name) {
    throw new Error('Persona is required to analyze call');
  }
  const prompt =
    `You are a car dealership phone-up coach. The sales rep RECEIVED an inbound call from ${persona.name}.\n\n` +
    `HARD SCORING CAPS — apply these strictly before assigning overallScore:\n` +
    `• If the rep did NOT set an appointment → overallScore MUST be ≤ 69\n` +
    `• If the rep got name + only one of (phone OR email) AND did set an appointment → overallScore MUST be ≤ 85\n` +
    `• If the rep got name + phone + email + appointment → score freely 70–100 based on quality\n` +
    `• Do NOT penalize for the ORDER information was collected — grade holistically\n\n` +
    `POSITIVE factors (raise score): strong positive greeting, compliment/validate the customer's reason for calling, reassure vehicle availability, ask if open to other options, verify wants and needs, offer personalized walk-around video, collect first+last name (with spelling), collect phone number, collect email, set specific appointment type (Test Drive/Trade Appraisal/Finance App/Purchase), confirm specific day+time, offer reminder text+email, handle/bypass objections.\n\n` +
    `NEGATIVE factors (reduce score): pushy language, weak confidence, negative tone, defensive phrases ("I understand, but..."), lazy one-word responses, lack of ownership, conversation killers, interrupting the customer.\n\n` +
    `Score 0–20 on each dimension:\n` +
    `opening: greeting warmth, gave name+dealership, complimented or validated caller's reason for calling\n` +
    `rapport: discovered wants/needs, asked about vehicle, offered walk-around video, reassured availability, asked if open to options\n` +
    `infoCapture: secured first+last name (with spelling), callback phone number, and email — order does not matter, grade holistically\n` +
    `objectionHandling: bridged objections, avoided pushy/defensive/lazy language, owned the conversation, no interruptions\n` +
    `appointment: asked for specific appointment type, specific day+time, offered reminder via text+email\n\n` +
    `overallScore: 0–100, applying the hard caps above. feedback: 2–3 sentences of specific, actionable coaching.\n\n` +
    `Respond ONLY in this exact JSON format with no other text: ` +
    `{ "opening": number, "rapport": number, "infoCapture": number, "objectionHandling": number, "appointment": number, "overallScore": number, "feedback": string }\n\n` +
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
      rapport: 0,
      infoCapture: 0,
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
    `Grade using the Four-Part Response Framework. Score each part 0–25:\n` +
    `• acknowledge (0–25): Did they validate the concern without agreeing or folding?\n` +
    `• bridge (0–25): Did they shift conversation toward a solution without dismissing the concern?\n` +
    `• answer (0–25): Did they give a clear, confident response addressing the REAL concern beneath the objection?\n` +
    `• redirect (0–25): Did they guide the conversation back toward the appointment?\n\n` +
    `Penalize for: giving up at first pushback, matching resistance with pressure, answering only the surface objection, rushing to give price or payment, going silent or stopping at "I understand."\n\n` +
    `score: sum of all four parts (0–100).\n` +
    `whatWorked: 1 sentence on what they did right.\n` +
    `whatMissed: 1 sentence on what they missed or could improve.\n` +
    `strongerLine: one line they could have said instead, written in first person as the rep.\n\n` +
    `Respond ONLY in JSON: { "score": number, "acknowledge": number, "bridge": number, "answer": number, "redirect": number, "whatWorked": string, "whatMissed": string, "strongerLine": string }`;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 400,
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
    return { score: 0, acknowledge: 0, bridge: 0, answer: 0, redirect: 0, whatWorked: '', whatMissed: 'Could not parse response', strongerLine: '' };
  }
}

module.exports = { analyzeCall, gradeGauntlet };
