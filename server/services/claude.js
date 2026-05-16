'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function analyzeCall(transcript, persona) {
  if (!persona || !persona.name) {
    throw new Error('Persona is required to analyze call');
  }
  const prompt =
    `You are a car dealership phone-up coach grading a training call. The sales rep RECEIVED an inbound call from ${persona.name}.\n\n` +
    `CALIBRATION — grade like a fair, experienced coach, not a harsh critic:\n` +
    `• 15–20/20 = Excellent: Rep clearly excelled at this skill\n` +
    `• 10–14/20 = Competent: Rep demonstrated this skill; some room to improve\n` +
    `• 5–9/20   = Developing: Rep attempted this skill but fell noticeably short\n` +
    `• 0–4/20   = Missed: Rep clearly failed to demonstrate this skill at all\n\n` +
    `IMPORTANT BASELINE: A rep who gives a reasonably warm greeting, makes an effort to build rapport, and attempts to collect contact info — even if they don't set an appointment — should score 35–55 overall. Not every call is a 70. Not every call is a 15. Grade what actually happened.\n\n` +
    `SCORE GUIDELINES (apply thoughtfully, not mechanically):\n` +
    `• If the rep did NOT set an appointment → overallScore should generally be ≤ 72\n` +
    `• If the rep got name + only one of (phone OR email) AND did set appointment → overallScore should generally be ≤ 85\n` +
    `• If the rep got name + phone + email + appointment → score 70–100 based on overall quality\n` +
    `• Do NOT penalize for the ORDER information was collected — grade holistically\n\n` +
    `POSITIVE factors (raise score): strong positive greeting, compliment/validate the customer's reason for calling, reassure vehicle availability, ask if open to other options, verify wants and needs, offer personalized walk-around video, collect first+last name (with spelling), collect phone number, collect email, set specific appointment type (Test Drive/Trade Appraisal/Finance App/Purchase), confirm specific day+time, offer reminder text+email, handle/bypass objections.\n\n` +
    `NEGATIVE factors (reduce score): pushy language, weak confidence, negative tone, defensive phrases ("I understand, but..."), lazy one-word responses, lack of ownership, conversation killers, interrupting the customer.\n\n` +
    `Score each dimension 0–20 using the calibration scale above:\n` +
    `opening (0–20): Greeting warmth, gave name+dealership, complimented or validated caller's reason for calling. A decent greeting with name and dealership = at least 10.\n` +
    `rapport (0–20): Discovered wants/needs, asked about vehicle, offered walk-around video, reassured availability, asked if open to options. Making genuine discovery effort = at least 10.\n` +
    `infoCapture (0–20): Secured first+last name (with spelling), callback phone number, and email — order does not matter. Getting 2 of 3 info items = at least 10.\n` +
    `objectionHandling (0–20): Bridged objections, avoided pushy/defensive/lazy language, owned the conversation, no interruptions. Handling even one objection reasonably = at least 10.\n` +
    `appointment (0–20): Asked for specific appointment type, specific day+time, offered reminder via text+email. Asking for any appointment = at least 8.\n\n` +
    `overallScore (0–100): Holistic score reflecting the rep's actual performance. Apply the guidelines, but trust your calibrated judgment — not every competent call ends in 0s. feedback: 2–3 sentences of specific, actionable coaching covering what they did well AND what to improve.\n\n` +
    `Respond ONLY in this exact JSON format with no other text: ` +
    `{ "opening": number, "rapport": number, "infoCapture": number, "objectionHandling": number, "appointment": number, "overallScore": number, "feedback": string }\n\n` +
    `Transcript:\n${transcript}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
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
    model: 'claude-sonnet-4-6',
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
