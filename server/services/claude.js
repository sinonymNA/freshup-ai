'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function analyzeCall(transcript, persona) {
  if (!persona || !persona.name) {
    throw new Error('Persona is required to analyze call');
  }

  const difficulty = persona.difficulty || 'Easy';
  const isHard = difficulty === 'Hard';
  const isMedium = difficulty === 'Medium';

  // Difficulty-aware baseline and score ceiling guidance
  const difficultyContext = isHard
    ? `PERSONA DIFFICULTY: Hard. ${persona.name} is a genuinely difficult customer — guarded, skeptical, and designed to resist. A rep who keeps them engaged, handles their objections with grace, and makes any real progress at all is performing well. Do not penalize the rep for the customer's deliberate resistance.\n` +
      `Hard-persona score benchmarks:\n` +
      `• 25–45 = Rep handled a difficult customer competently — solid for Hard\n` +
      `• 45–65 = Rep earned genuine trust despite real resistance — strong performance\n` +
      `• 65–80 = Rep was exceptional — broke through significant barriers\n` +
      `• 80+ = Near-perfect call against a hard persona — rare, award only for truly outstanding execution\n\n`
    : isMedium
    ? `PERSONA DIFFICULTY: Medium. ${persona.name} has real objections and a specific sticking point but is reachable. A rep who handles their main concern and moves toward an appointment is doing well.\n` +
      `Medium-persona score benchmarks:\n` +
      `• 35–55 = Rep handled a medium-difficulty customer adequately\n` +
      `• 55–75 = Rep navigated the objections well and made strong progress\n` +
      `• 75+ = Strong execution — set clear appointment or near-close\n\n`
    : `PERSONA DIFFICULTY: Easy. ${persona.name} is a high-intent buyer who responds well to warmth and knowledge. A rep who misses basics here should score lower.\n\n`;

  const prompt =
    `You are a car dealership phone-up coach grading a training call. The sales rep RECEIVED an inbound call from ${persona.name} (${difficulty} difficulty).\n\n` +
    difficultyContext +
    `CALIBRATION — grade like a fair, experienced coach:\n` +
    `• 15–20/20 = Excellent at this skill\n` +
    `• 10–14/20 = Competent; some room to grow\n` +
    `• 5–9/20   = Attempting but falling short\n` +
    `• 0–4/20   = Missed this skill entirely\n\n` +
    `IMPORTANT: Grade what actually happened on this specific call with this specific customer. The persona's designed resistance counts — don't penalize the rep for behaviors the customer was designed to exhibit.\n\n` +
    `SCORE GUIDELINES:\n` +
    `• Rep got name + phone + email + appointment → score toward the higher end of the difficulty range\n` +
    `• Rep did NOT get an appointment → stay within the lower half of the difficulty range\n` +
    `• Do NOT penalize for order of information collected — grade holistically\n\n` +
    `POSITIVE factors: strong greeting, validates caller's reason, asks needs/wants questions, handles objections with value (not pressure), captures contact info, attempts a specific appointment with day+time.\n` +
    `NEGATIVE factors: pushy language, defensive phrases, lazy one-word responses, interrupting, ignoring what the customer said.\n\n` +
    `Score each dimension 0–20:\n` +
    `opening (0–20): Greeting warmth, gave name+dealership, validated caller's reason. Decent greeting = at least 10.\n` +
    `rapport (0–20): Made caller feel heard, was warm and conversational. Genuine effort = at least 10.\n` +
    `needsDiscovery (0–20): Asked about budget, timeline, trade-in, and vehicle preferences before pitching. Any real discovery = at least 10.\n` +
    `productKnowledge (0–20): Spoke confidently and accurately about the vehicle or options discussed. Competent knowledge = at least 10.\n` +
    `infoCapture (0–20): Got name, phone, email — order doesn't matter. Two of three = at least 10.\n` +
    `professionalism (0–20): Patient, positive, not pushy or defensive. Solid tone throughout = at least 10.\n` +
    `appointment (0–20): Asked for specific appointment with day+time, offered reminder. Any real attempt = at least 8.\n` +
    `objectionHandling (0–20): Bridged objections, avoided pressure, owned the conversation. Handling even one objection = at least 10.\n\n` +
    `overallScore (0–100): Holistic score calibrated to difficulty level above. feedback: 2–3 sentences of specific, actionable coaching — what they did well AND what to work on next.\n\n` +
    `Respond ONLY in this exact JSON format with no other text:\n` +
    `{ "opening": number, "rapport": number, "needsDiscovery": number, "productKnowledge": number, "infoCapture": number, "professionalism": number, "appointment": number, "objectionHandling": number, "overallScore": number, "feedback": string }\n\n` +
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
      opening: 0, rapport: 0, needsDiscovery: 0, productKnowledge: 0,
      infoCapture: 0, professionalism: 0, appointment: 0, objectionHandling: 0,
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
