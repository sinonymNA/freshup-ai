'use strict';

const WebSocket = require('ws');
const twilio = require('twilio');

const { getCall, updateCall } = require('../store');
const { analyzeCall } = require('./claude');
const { getPersonaById } = require('../personas');
const callEmitter = require('./callEvents');

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2';
const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || 'coral';

function formatTranscript(history) {
  return history
    .map((m) => `${m.role === 'user' ? 'Sales Rep' : 'Customer'}: ${m.content}`)
    .join('\n');
}

// Build the OpenAI session instructions from a persona + stored contact info
function buildInstructions(persona, contactInfo) {
  let instructions = persona.systemPrompt.trim();

  if (persona.anchorExchanges?.length > 0) {
    instructions += `\n\nExamples of exactly how ${persona.name} speaks (model these):`;
    for (const anchor of persona.anchorExchanges) {
      instructions += `\n${anchor.setup}\n${persona.name}: "${anchor.response}"`;
    }
  }

  if (persona.internalState) {
    instructions += `\n\nYour mood/state right now: ${persona.internalState}`;
  }

  if (persona.scenarioVariants?.length > 0) {
    const variant = persona.scenarioVariants[Math.floor(Math.random() * persona.scenarioVariants.length)];
    instructions += `\n\nContext for this call: ${variant}`;
  }

  if (persona.speechPatterns) {
    const sp = persona.speechPatterns;
    const parts = [];
    if (sp.fillers?.length > 0) parts.push(`Fillers: ${sp.fillers.join(', ')}`);
    if (sp.vocabulary) parts.push(`Vocabulary: ${sp.vocabulary}`);
    if (sp.pacing) parts.push(`Pacing: ${sp.pacing}`);
    if (sp.energy) parts.push(`Energy: ${sp.energy}`);
    if (parts.length > 0) instructions += `\n\nVoice: ${parts.join(' | ')}`;
  }

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

  instructions +=
    `\n\nYou are ${persona.name} on a live phone call right now. Rules:` +
    `\n• Every response must sound like ${persona.name} specifically — their words, their rhythm, their personality.` +
    `\n• Keep answers SHORT: 1–2 sentences. Real people on the phone don't monologue.` +
    `\n• Use natural fillers and back-channeling ("mm-hm", "yeah", "right", "hm", "okay").` +
    `\n• React authentically — interrupt, push back, get impatient when it fits.` +
    `\n• NEVER use [HANG_UP] or [APPOINTMENT_SET] markers. Use the end_call function only.`;

  if (persona.difficulty === 'Medium') {
    instructions += `\n• Hang up only if the rep is rude at least twice with no recovery attempt.`;
  } else if (persona.difficulty === 'Hard') {
    instructions += `\n• Almost never hang up. Only if rep is aggressively rude or ignores the same question twice. Make them earn it.`;
  }

  instructions += `\n• Speak English. Occasional Spanish word is fine if it fits your character naturally.`;

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
  console.log(`[DIAG] ── Twilio WS connected url=${rawUrl}`);

  let callSid = null;
  let streamSid = null;
  let persona = null;
  let openAiWs = null;
  const history = [];
  let currentAiTranscript = '';
  let aiTurnCount = 0;
  let partialScoringInProgress = false;
  let sessionSeeded = false;
  let sessionReady = false;
  let aiResponseActive = false;
  let greetingDone = false;
  let mediaPacketsReceived = 0;
  let audioPacketsSent = 0;
  let closed = false;

  const pendingTwilioAudio = [];
  const MAX_PENDING_PACKETS = 250;

  function emit(event) {
    if (callSid) callEmitter.emit(`call:${callSid}`, event);
  }

  function startOpenAiSession(storedCall) {
    console.log(`[DIAG] ── Opening OpenAI WS callSid=${callSid} persona=${persona.id} model=${REALTIME_MODEL}`);

    openAiWs = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    openAiWs.on('open', () => {
      console.log(`[DIAG] ── OpenAI WS opened callSid=${callSid}`);
      const contactInfo = storedCall && storedCall.contactInfo;
      const instructions = buildInstructions(persona, contactInfo);

      const sessionPayload = {
        type: 'session.update',
        session: {
          type: 'realtime',
          output_modalities: ['audio', 'text'],
          instructions,
          voice: REALTIME_VOICE,
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          input_audio_transcription: { model: 'gpt-4o-transcribe' },
          turn_detection: {
            type: 'semantic_vad',
            eagerness: 'balanced',
            create_response: true,
            interrupt_response: true,
          },
          tools: [
            {
              type: 'function',
              name: 'end_call',
              description: 'End the phone call. Use reason "appointment_set" if the rep booked an appointment, or "hang_up" if you are hanging up.',
              parameters: {
                type: 'object',
                properties: { reason: { type: 'string', enum: ['appointment_set', 'hang_up'] } },
                required: ['reason'],
              },
            },
          ],
          tool_choice: 'auto',
          max_response_output_tokens: 500,
        },
      };
      console.log(`[DIAG] ── Sending session.update voice=${REALTIME_VOICE} model=${REALTIME_MODEL} callSid=${callSid}`);
      openAiWs.send(JSON.stringify(sessionPayload));
    });

    openAiWs.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        const t = msg.type;

        // Log every event type (skip high-volume audio deltas after first)
        if (t !== 'response.audio.delta' && t !== 'input_audio_buffer.speech_stopped') {
          console.log(`[DIAG] ── OpenAI event=${t} callSid=${callSid}`);
        }

        switch (t) {
          case 'session.created':
            console.log(`[DIAG] ── session.created model=${msg.session?.model} callSid=${callSid}`);
            break;

          case 'session.updated':
            sessionReady = true;
            console.log(`[DIAG] ── session.updated — flushing ${pendingTwilioAudio.length} buffered packets callSid=${callSid}`);
            // Flush buffered audio packets
            while (pendingTwilioAudio.length > 0 && openAiWs.readyState === WebSocket.OPEN) {
              openAiWs.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: pendingTwilioAudio.shift() }));
            }
            // Seed the conversation
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
              console.log(`[DIAG] ── response.create sent callSid=${callSid}`);
            }
            break;

          case 'response.created':
            aiResponseActive = true;
            console.log(`[DIAG] ── response.created — audio gate OPEN callSid=${callSid}`);
            break;

          case 'response.audio.delta':
            if (streamSid && msg.delta && aiResponseActive) {
              twilioWs.send(JSON.stringify({
                event: 'media',
                streamSid,
                media: { payload: msg.delta },
              }));
              audioPacketsSent++;
              if (audioPacketsSent === 1) {
                console.log(`[DIAG] ── First audio packet sent to Twilio callSid=${callSid}`);
              }
            } else if (!aiResponseActive) {
              // Log first drop only
              if (audioPacketsSent === 0) {
                console.log(`[DIAG] ── Audio delta DROPPED (gate closed) callSid=${callSid}`);
              }
            }
            break;

          case 'response.done': {
            aiResponseActive = false;
            greetingDone = true;
            const usage = msg.response?.usage;
            if (usage) {
              console.log(`[DIAG] ── usage callSid=${callSid} inputTokens=${usage.input_tokens} outputTokens=${usage.output_tokens} inputAudio=${usage.input_token_details?.audio_tokens || 0} outputAudio=${usage.output_token_details?.audio_tokens || 0}`);
            }
            console.log(`[DIAG] ── response.done audioPacketsSent=${audioPacketsSent} callSid=${callSid}`);
            break;
          }

          case 'response.cancelled':
            console.log(`[DIAG] ── response.cancelled audioPacketsSent=${audioPacketsSent} callSid=${callSid}`);
            aiResponseActive = false;
            greetingDone = true;
            break;

          case 'response.audio_transcript.delta':
            currentAiTranscript += msg.delta || '';
            emit({ type: 'assistant_delta', delta: msg.delta || '' });
            break;

          case 'response.audio_transcript.done': {
            const content = currentAiTranscript.trim();
            console.log(`[DIAG] ── assistant transcript="${content.slice(0, 80)}" callSid=${callSid}`);
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
              console.log(`[DIAG] ── user transcript="${content.slice(0, 80)}" callSid=${callSid}`);
              history.push({ role: 'user', content });
              if (callSid) updateCall(callSid, { history: [...history] });
              emit({ type: 'user_message', content });
            }
            break;

          case 'input_audio_buffer.speech_started':
            console.log(`[DIAG] ── speech_started greetingDone=${greetingDone} callSid=${callSid}`);
            if (greetingDone) {
              aiResponseActive = false;
              // Cancel active response at OpenAI
              if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                openAiWs.send(JSON.stringify({ type: 'response.cancel' }));
              }
              // Clear buffered audio at Twilio
              if (streamSid) {
                twilioWs.send(JSON.stringify({ event: 'clear', streamSid }));
              }
            }
            break;

          case 'response.function_call_arguments.done': {
            const fnName = msg.name;
            const fnArgs = JSON.parse(msg.arguments || '{}');
            console.log(`[DIAG] ── function_call name=${fnName} args=${JSON.stringify(fnArgs)} callSid=${callSid}`);

            if (fnName === 'end_call') {
              const reason = fnArgs.reason || 'hang_up';
              const outcome = reason === 'appointment_set' ? 'Appointment Set' : 'Hung Up';
              console.log(`[DIAG] ── end_call reason=${reason} outcome=${outcome} callSid=${callSid}`);

              if (callSid) {
                updateCall(callSid, { outcome, endTime: Date.now() });
                emit({ type: 'outcome', outcome });

                analyzeCall(formatTranscript(history), persona)
                  .then((score) => {
                    updateCall(callSid, { score });
                    emit({ type: 'score', score });
                  })
                  .catch((err) => console.error('[DIAG] analyzeCall error:', err));
              }

              // Hang up via Twilio REST after a short delay so the AI can finish speaking
              setTimeout(() => {
                try {
                  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                  client.calls(callSid).update({ status: 'completed' })
                    .then(() => console.log(`[DIAG] ── Twilio call ended callSid=${callSid}`))
                    .catch((err) => console.error(`[DIAG] ── Twilio hangup error callSid=${callSid}:`, err.message));
                } catch (err) {
                  console.error(`[DIAG] ── Twilio hangup setup error:`, err.message);
                }
              }, 2500);
            }
            break;
          }

          case 'error':
            console.error(`[DIAG] ── OpenAI ERROR callSid=${callSid}:`, JSON.stringify(msg.error));
            break;
        }
      } catch (err) {
        console.error('[DIAG] OpenAI message handler error:', err);
      }
    });

    openAiWs.on('error', (err) => {
      console.error(`[DIAG] ── OpenAI WS ERROR callSid=${callSid}: ${err.message}`);
    });
    openAiWs.on('close', (code, reason) => {
      console.log(`[DIAG] ── OpenAI WS CLOSED callSid=${callSid} code=${code} reason=${reason} audioPacketsSent=${audioPacketsSent}`);
      if (!closed) {
        closed = true;
        if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
      }
    });
  }

  // ── Handle messages from Twilio ──────────────────────────────────────────────
  twilioWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.event) {
        case 'connected':
          console.log(`[DIAG] ── Twilio connected event (pre-start)`);
          break;

        case 'start':
          streamSid = msg.start.streamSid;
          callSid = msg.start.callSid;
          console.log(`[DIAG] ── Twilio start callSid=${callSid} streamSid=${streamSid}`);

          {
            const storedCall = getCall(callSid);
            const personaId = storedCall && storedCall.personaId;
            persona = personaId ? getPersonaById(personaId) : null;

            console.log(`[DIAG] ── storedCall=${!!storedCall} personaId=${personaId} persona=${persona?.id || 'NOT FOUND'}`);

            if (!persona) {
              console.error(`[DIAG] ── FATAL: Persona not found callSid=${callSid} personaId=${personaId}`);
              twilioWs.close(1008, 'Persona not found');
              return;
            }

            startOpenAiSession(storedCall);
          }
          break;

        case 'media':
          mediaPacketsReceived++;
          if (mediaPacketsReceived === 1) {
            console.log(`[DIAG] ── First Twilio media packet received callSid=${callSid}`);
          }
          if (!sessionReady || !openAiWs || openAiWs.readyState !== WebSocket.OPEN) {
            pendingTwilioAudio.push(msg.media.payload);
            while (pendingTwilioAudio.length > MAX_PENDING_PACKETS) pendingTwilioAudio.shift();
            if (mediaPacketsReceived === 1) {
              console.log(`[DIAG] ── Media buffered (session not ready) callSid=${callSid}`);
            }
          } else {
            openAiWs.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: msg.media.payload,
            }));
          }
          break;

        case 'stop':
          console.log(`[DIAG] ── Twilio stream stopped callSid=${callSid} totalMedia=${mediaPacketsReceived} audioSent=${audioPacketsSent}`);
          if (openAiWs && openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
          break;

        default:
          console.log(`[DIAG] ── Unknown Twilio event=${msg.event} callSid=${callSid}`);
      }
    } catch (err) {
      console.error('[DIAG] Twilio message handler error:', err);
    }
  });

  twilioWs.on('close', (code, reason) => {
    console.log(`[DIAG] ── Twilio WS closed callSid=${callSid} code=${code} reason=${reason}`);
    if (!closed) {
      closed = true;
      if (openAiWs && openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
    }
  });

  twilioWs.on('error', (err) => console.error(`[DIAG] Twilio WS error callSid=${callSid}: ${err.message}`));
}

module.exports = { handleMediaStream };
