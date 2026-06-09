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
  let aiResponseActive = false;
  let greetingDone = false;
  let mediaPacketsReceived = 0;
  let audioPacketsSent = 0;

  function emit(event) {
    if (callSid) callEmitter.emit(`call:${callSid}`, event);
  }

  function startOpenAiSession(storedCall) {
    const model = 'gpt-4o-realtime-preview-2025-06-03';
    console.log(`[DIAG] ── Opening OpenAI WS callSid=${callSid} persona=${persona.id} model=${model}`);

    openAiWs = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${model}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      }
    );

    openAiWs.on('open', () => {
      console.log(`[DIAG] ── OpenAI WS opened callSid=${callSid}`);
      const contactInfo = storedCall && storedCall.contactInfo;
      const instructions = buildInstructions(persona, contactInfo);
      const voice = persona.voice || 'alloy';

      const sessionPayload = {
        type: 'session.update',
        session: {
          modalities: ['audio', 'text'],
          instructions,
          voice,
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
              description: 'End the phone call. Use reason "appointment_set" if the rep booked an appointment, or "hang_up" if you are hanging up.',
              parameters: {
                type: 'object',
                properties: { reason: { type: 'string', enum: ['appointment_set', 'hang_up'] } },
                required: ['reason'],
              },
            },
          ],
          tool_choice: 'auto',
        },
      };
      console.log(`[DIAG] ── Sending session.update voice=${voice} callSid=${callSid}`);
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
            console.log(`[DIAG] ── session.updated — seeding conversation callSid=${callSid}`);
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

          case 'response.done':
          case 'response.cancelled':
            console.log(`[DIAG] ── ${t} audioPacketsSent=${audioPacketsSent} callSid=${callSid}`);
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
              if (streamSid) {
                twilioWs.send(JSON.stringify({ event: 'clear', streamSid }));
              }
            }
            break;

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
    });
  }

  // ── Handle messages from Twilio ──────────────────────────────────────────────
  twilioWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.event) {
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
          if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
            openAiWs.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: msg.media.payload,
            }));
          } else if (mediaPacketsReceived === 1) {
            console.log(`[DIAG] ── Media arrived but OpenAI WS not ready (state=${openAiWs?.readyState}) callSid=${callSid}`);
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
    if (openAiWs && openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
  });

  twilioWs.on('error', (err) => console.error(`[DIAG] Twilio WS error callSid=${callSid}: ${err.message}`));
}

module.exports = { handleMediaStream };
