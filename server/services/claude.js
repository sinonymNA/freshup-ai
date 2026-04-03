'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateCustomerResponse(conversationHistory, persona) {
  const systemPrompt =
    persona.systemPrompt +
    '\nKeep responses to 1-3 sentences. You are on a phone call. Speak like a real human, not a chatbot. React directly to what was just said to you.';

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 300,
    system: systemPrompt,
    messages: conversationHistory,
  });

  return message.content[0].text;
}

async function analyzeCall(transcript, persona) {
  const prompt =
    `You are a sales training coach. Analyze this car dealership phone call transcript. ` +
    `The sales rep was speaking with a customer named ${persona.name}. ` +
    `Score the rep 0-100 on four skills: rapport (did they build connection), ` +
    `discovery (did they ask good questions), objections (did they handle pushback well), ` +
    `closing (did they ask for the appointment). Also write 2-3 sentences of specific actionable feedback. ` +
    `Respond only in this exact JSON format with no other text: ` +
    `{ rapport: number, discovery: number, objections: number, closing: number, overallScore: number, feedback: string }\n\n` +
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
      rapport: 0,
      discovery: 0,
      objections: 0,
      closing: 0,
      overallScore: 0,
      feedback: 'Call analysis could not be parsed. Raw response: ' + raw,
    };
  }
}

module.exports = { generateCustomerResponse, analyzeCall };
