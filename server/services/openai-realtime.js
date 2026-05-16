'use strict';

const WebSocket = require('ws');
const twilio = require('twilio');

const { getCall, updateCall } = require('../store');
const { analyzeCall } = require('./claude');
const { getPersonaById } = require('../personas');
const callEmitter = require('./callEvents');

function formatTranscript(history) {
  return history
    .map((m) => `${m.role === 'user' ? 'Sales Rep' : 'Customer'}: ${m.content}`)
    .join('\n');
}

// Build the OpenAI session instructions from a persona + stored contact info
function buildInstructions(persona, contactInfo) {
  // Start with the core persona system prompt
  let instructions = persona.systemPrompt.trim();

  // Behavioral anchors — real examples of how this persona speaks
  if (persona.anchorExchanges?.length > 0) {
    instructions += `\n\nExamples of exactly how ${persona.name} speaks (model these):`;
    for (const anchor of persona.anchorExchanges) {
      instructions += `\n${anchor.setup}\n${persona.name}: "${anchor.response}"`;
    }
  }

  // Internal state
  if (persona.internalState) {
    instructions += `\n\nYour mood/state right now: ${persona.internalState}`;
  }

  // Scenario variant — pick one randomly
  if (persona.scenarioVariants?.length > 0) {
    const variant = persona.scenarioVariants[Math.floor(Math.random() * persona.scenarioVariants.length)];
    instructions += `\n\nContext for this call: ${variant}`;
  }

  // Speech patterns
  if (persona.speechPatterns) {
    const sp = persona.speechPatterns;
    const parts = [];
    if (sp.fillers?.length > 0) parts.push(`Fillers: ${sp.fillers.join(', ')}`);
    if (sp.vocabulary) parts.push(`Vocabulary: ${sp.vocabulary}`);
    if (sp.pacing) parts.push(`Pacing: ${sp.pacing}`);
    if (sp.energy) parts.push(`Energy: ${sp.energy}`);
    if (parts.length > 0) instructions += `\n\nVoice: ${parts.join(' | ')}`;
  }

  // Knowledge limits
  if (persona.knowledgeProfile) {
    const kp = persona.knowledgeProfile;
    const parts = [];
    if (kp.carKnowledge) parts.push(`Cars: ${kp.carKnowledge}`);
    if (kp.financingKnowledge) parts.push(`Financing: ${kp.financingKnowledge}`);
    if (kp.techFeatures) parts.push(`Tech: ${kp.techFeatures}`);
    if (kp.dealershipExperience) parts.push(`Dealership experience: ${kp.dealershipExperience}`);
    if (parts.length > 0) {
      instructions += `\n\nKnowledge limits — ${parts.join(' | ')}. If asked something you wouldn't know, admit it and ask for a simple explanation.`;
    }
  }

  // Core realism rules — concise and direct for the model
  instructions +=
    `\n\nYou are ${persona.name} on a live phone call right now. Rules:` +
    `\n• Every response must sound like ${persona.name} specifically — their words, their rhythm, their personality.` +
    `\n• Keep answers SHORT: 1–2 sentences. Real people on the phone don't monologue.` +
    `\n• Use natural fillers and back-channeling ("mm-hm", "yeah", "right", "hm", "okay").` +
    `\n• React authentically — interrupt, push back, get impatient when it fits.` +
    `\n• NEVER use [HANG_UP] or [APPOINTMENT_SET] markers. Use the end_call function only.`;

  // Hang-up rules by difficulty
  if (persona.difficulty === 'Medium') {
    instructions += `\n• Hang up only if the rep is rude at least twice with no recovery attempt.`;
  } else if (persona.difficulty === 'Hard') {
    instructions += `\n• Almost never hang up. Only if rep is aggressively rude or ignores the same question twice. Make them earn it.`;
  }

  instructions += `\n• Speak English. Occasional Spanish word is fine if it fits your character naturally.`;

  // Contact info — only revealed on request
  if (contactInfo) {
    instructions +=
      `\n\nYour contact info — share each piece ONLY when the rep specifically asks:` +
      `\n• Phone: ${contactInfo.phone}` +
      `\n• Email: ${contactInfo.email}` +
      `\n• Vehicle: ${contactInfo.car}` +
      `\nNever volunteer all three at once.`;
  }

  return instructions;
}

function handleMediaStream(twilioWs, rawUrl) {
  // NOTE: query params (callSid, personaId) may be stripped by the hosting proxy.
  // We defer persona lookup until the Twilio 'start' message arrives, which always
  // includes callSid in msg.start.callSid — no proxy strips message-body values.
  console.log(`[media-stream] Twilio WebSocket connected url=${rawUrl}`);

  let callSid = null;
  let streamSid = null;
  let persona = null;
  let openAiWs = null;
  const history = [];
  let currentAiTranscript = '';
  let aiTurnCount = 0;
  let partialScoringInProgress = false;
  let sessionSeeded = false;   // prevent double-seeding on session.updated
  let aiResponseActive = false; // track whether AI audio is currently streaming

  function emit(event) {
    if (callSid) callEmitter.emit(`call:${callSid}`, event);
  }

  // ── Start OpenAI session (called once we have persona from 'start' message) ──
  function startOpenAiSession(storedCall) {
    console.log(`[media-stream] Opening OpenAI Realtime WS callSid=${callSid} persona=${persona.id}`);
    openAiWs = new WebSocket(
      'wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview',
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      }
    );

    openAiWs.on('open', () => {
      console.log(`[media-stream] OpenAI WS open callSid=${callSid} — sending session.update`);
      const contactInfo = storedCall && storedCall.contactInfo;
      const instructions = buildInstructions(persona, contactInfo);

      openAiWs.send(JSON.stringify({
        type: 'session.update',
        session: {
          modalities: ['audio', 'text'],
          instructions,
          voice: persona.voice || 'alloy',
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          input_audio_transcription: { model: 'whisper-1' },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.4,
            prefix_padding_ms: 150,
            silence_duration_ms: 600,
          },
          tools: [
            {
              type: 'function',
              name: 'end_call',
              description:
                'End the phone call. Use reason "appointment_set" if the rep successfully booked an appointment, or "hang_up" if you are hanging up on them.',
              parameters: {
                type: 'object',
                properties: {
                  reason: { type: 'string', enum: ['appointment_set', 'hang_up'] },
                },
                required: ['reason'],
              },
            },
          ],
          tool_choice: 'auto',
        },
      }));
      // Do NOT seed yet — wait for session.updated to confirm the audio format
      // is applied before generating the first response (prevents first-word screech)
      console.log(`[media-stream] session.update sent, waiting for session.updated callSid=${callSid}`);
    });

    openAiWs.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.type) {
          case 'session.updated':
            // Session is fully configured — safe to seed the conversation now
            if (!sessionSeeded) {
              sessionSeeded = true;
              openAiWs.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'message',
                  role: 'user',
                  content: [{ type: 'input_text', text: 'Hello?' }],
                },
              }));
              openAiWs.send(JSON.stringify({ type: 'response.create' }));
              console.log(`[media-stream] Session confirmed — conversation seeded callSid=${callSid}`);
            }
            break;

          case 'response.created':
            aiResponseActive = true;
            break;

          case 'response.audio.delta':
            // Only forward audio that belongs to an active response.
            // Stale deltas after speech_started are dropped to prevent screech.
            if (streamSid && msg.delta && aiResponseActive) {
              twilioWs.send(JSON.stringify({
                event: 'media',
                streamSid,
                media: { payload: msg.delta },
              }));
            }
            break;

          case 'response.done':
          case 'response.cancelled':
            aiResponseActive = false;
            break;

          case 'response.audio_transcript.delta':
            currentAiTranscript += msg.delta || '';
            emit({ type: 'assistant_delta', delta: msg.delta || '' });
            break;

          case 'response.audio_transcript.done': {
            const content = currentAiTranscript.trim();
            if (content) {
              history.push({ role: 'assistant', content });
              if (callSid) updateCall(callSid, { history: [...history] });
              emit({ type: 'assistant_message', content });
            }
            currentAiTranscript = '';
            aiTurnCount++;

            if (!partialScoringInProgress && aiTurnCount >= 2 && aiTurnCount % 3 === 0 && history.length >= 4) {
              partialScoringInProgress = true;
              analyzeCall(formatTranscript(history), persona)
                .then((partialScore) => emit({ type: 'partial_score', score: partialScore }))
                .catch(() => {})
                .finally(() => { partialScoringInProgress = false; });
            }
            break;
          }

          case 'conversation.item.input_audio_transcription.completed':
            if (msg.transcript && msg.transcript.trim()) {
              const content = msg.transcript.trim();
              history.push({ role: 'user', content });
              if (callSid) updateCall(callSid, { history: [...history] });
              emit({ type: 'user_message', content });
            }
            break;

          case 'input_audio_buffer.speech_started':
            // Drop the gate immediately so no further stale audio delta is forwarded
            aiResponseActive = false;
            if (streamSid) {
              twilioWs.send(JSON.stringify({ event: 'clear', streamSid }));
            }
            break;

          case 'response.function_call_arguments.done':
            if (msg.name === 'end_call') {
              try {
                const args = JSON.parse(msg.arguments || '{}');
                const outcome = args.reason === 'appointment_set' ? 'Appointment' : 'HangUp';

                if (callSid) {
                  updateCall(callSid, { outcome, endTime: Date.now() });
                  emit({ type: 'outcome', outcome });

                  if (history.length > 0) {
                    analyzeCall(formatTranscript(history), persona)
                      .then((score) => {
                        updateCall(callSid, { score });
                        emit({ type: 'score', score });
                      })
                      .catch((err) => console.error('[openai-realtime] analyzeCall error:', err));
                  }

                  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                  await client.calls(callSid).update({ status: 'completed' });
                }
              } catch (err) {
                console.error('[openai-realtime] end_call handler error:', err);
              }
            }
            break;

          case 'error':
            console.error('[openai-realtime] OpenAI error callSid=%s:', callSid, JSON.stringify(msg.error));
            break;
        }
      } catch (err) {
        console.error('[openai-realtime] OpenAI message handler error:', err);
      }
    });

    openAiWs.on('error', (err) => console.error('[openai-realtime] OpenAI WS error callSid=%s:', callSid, err.message));
    openAiWs.on('close', (code, reason) => console.log(`[openai-realtime] OpenAI WS closed callSid=${callSid} code=${code} reason=${reason}`));
  }

  // ── Handle messages from Twilio ──────────────────────────────────────────────
  twilioWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.event) {
        case 'start':
          streamSid = msg.start.streamSid;
          callSid = msg.start.callSid;
          console.log(`[openai-realtime] stream started callSid=${callSid} streamSid=${streamSid}`);

          // Look up persona from DB now that we have a real callSid
          {
            const storedCall = getCall(callSid);
            const personaId = storedCall && storedCall.personaId;
            persona = personaId ? getPersonaById(personaId) : null;

            if (!persona) {
              console.error(`[openai-realtime] Persona not found for callSid=${callSid} personaId=${personaId}`);
              twilioWs.close(1008, 'Persona not found');
              return;
            }

            startOpenAiSession(storedCall);
          }
          break;

        case 'media':
          if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
            openAiWs.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: msg.media.payload,
            }));
          }
          break;

        case 'stop':
          console.log('[openai-realtime] Twilio stream stopped');
          if (openAiWs && openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
          break;
      }
    } catch (err) {
      console.error('[openai-realtime] Twilio message handler error:', err);
    }
  });

  twilioWs.on('close', (code, reason) => {
    console.log(`[media-stream] Twilio WS closed callSid=${callSid} code=${code} reason=${reason}`);
    if (openAiWs && openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
  });

  twilioWs.on('error', (err) => console.error(`[media-stream] Twilio WS error callSid=${callSid}:`, err.message));
}

module.exports = { handleMediaStream };
