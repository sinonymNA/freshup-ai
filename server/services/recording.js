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

const GRADE_PROMPT = `You are an expert car dealership phone sales coach. Grade the following call transcript using this rubric:

1. Greeting and first impression (10 points): Did the rep answer professionally, give their name, and make the caller feel welcome?
2. Needs discovery (25 points): Did the rep ask qualifying questions about budget, timeline, trade-in, and vehicle preferences before pitching?
3. Product knowledge (20 points): Did the rep speak confidently and accurately about the vehicle being discussed?
4. Objection handling (20 points): Did the rep acknowledge objections and respond with value rather than pressure?
5. Appointment push (15 points): Did the rep attempt to set an in-person appointment or next step?
6. Professionalism and tone (10 points): Was the rep patient, positive, and not pushy?

CALIBRATION: Grade fairly. A rep who gives a warm greeting, asks a few qualifying questions, and attempts to set an appointment should score 50–65 overall even with imperfections. Reserve 80+ for genuinely strong performances.

Transcript:
{TRANSCRIPT}

Respond ONLY with raw JSON — no markdown fences, no extra text:
{
  "greeting": <0-10>,
  "needsDiscovery": <0-25>,
  "productKnowledge": <0-20>,
  "objectionHandling": <0-20>,
  "appointmentPush": <0-15>,
  "professionalism": <0-10>,
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
    grade.overallScore = (grade.greeting || 0) + (grade.needsDiscovery || 0) +
      (grade.productKnowledge || 0) + (grade.objectionHandling || 0) +
      (grade.appointmentPush || 0) + (grade.professionalism || 0);
  }

  return grade;
}

module.exports = { downloadAndTranscribe, gradeRecordedCall };
