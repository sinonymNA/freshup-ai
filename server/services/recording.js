'use strict';

const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Download a Twilio recording and transcribe it with Whisper-1.
// Twilio recordings require basic auth; returns the transcript string.
async function downloadAndTranscribe(recordingUrl) {
  const url = recordingUrl.endsWith('.mp3') ? recordingUrl : `${recordingUrl}.mp3`;
  const auth = Buffer.from(
    `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
  ).toString('base64');

  const response = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!response.ok) throw new Error(`Recording download failed: ${response.status} ${response.statusText}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const { toFile } = require('openai');
  const file = await toFile(buffer, 'recording.mp3', { type: 'audio/mpeg' });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'text',
  });

  return typeof transcription === 'string' ? transcription : (transcription.text || '');
}

const GRADE_PROMPT = `You are an expert car dealership phone sales coach. Grade the following call transcript using this rubric. Score each dimension 0–20:

1. opening (0–20): Did the rep answer professionally, give their name and dealership, and validate the caller's reason for calling?
2. rapport (0–20): Did the rep make the caller feel genuinely heard and build warmth?
3. needsDiscovery (0–20): Did the rep ask qualifying questions about budget, timeline, trade-in, and vehicle preferences before pitching?
4. productKnowledge (0–20): Did the rep speak confidently and accurately about the vehicle or financing options discussed?
5. infoCapture (0–20): Did the rep capture the caller's name, phone number, and email? (Order doesn't matter — getting any two = at least 10)
6. professionalism (0–20): Was the rep patient, positive, and not pushy or defensive throughout the call?
7. appointment (0–20): Did the rep attempt to set a specific in-person appointment with a day and time?
8. objectionHandling (0–20): Did the rep acknowledge objections and respond with value rather than pressure?

CALIBRATION: Grade fairly. A rep who gives a warm greeting, asks qualifying questions, and makes a real appointment attempt should score 50–65 overall even with imperfections. Reserve 80+ for genuinely strong performances.

Transcript:
{TRANSCRIPT}

Respond ONLY with raw JSON — no markdown fences, no extra text:
{
  "opening": <0-20>,
  "rapport": <0-20>,
  "needsDiscovery": <0-20>,
  "productKnowledge": <0-20>,
  "infoCapture": <0-20>,
  "professionalism": <0-20>,
  "appointment": <0-20>,
  "objectionHandling": <0-20>,
  "overallScore": <0-100>,
  "strengths": "<1-2 sentences of specific strengths>",
  "improvements": "<1-2 sentences of biggest areas to improve>",
  "coachingTips": ["<specific tip 1>", "<specific tip 2>", "<specific tip 3>"]
}`;

// Grade a call transcript using the 6-dimension dealership rubric.
// Returns the parsed grade object.
async function gradeRecordedCall(transcript) {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: GRADE_PROMPT.replace('{TRANSCRIPT}', transcript),
    }],
  });

  const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in Claude response');

  const grade = JSON.parse(match[0]);

  // Fallback: compute overallScore from components if missing or explicitly null/undefined
  if (grade.overallScore == null) {
    grade.overallScore = (grade.opening || 0) + (grade.rapport || 0) +
      (grade.needsDiscovery || 0) + (grade.productKnowledge || 0) +
      (grade.infoCapture || 0) + (grade.professionalism || 0) +
      (grade.appointment || 0) + (grade.objectionHandling || 0);
  }

  return grade;
}

module.exports = { downloadAndTranscribe, gradeRecordedCall };
