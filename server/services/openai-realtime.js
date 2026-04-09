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
  let instructions = persona.systemPrompt +
    '\n\nYou are on a real phone call right now. This is a live, unscripted conversation — speak exactly as a real buyer would on the phone:' +
    '\n• Use natural back-channeling and filler words ("mm-hm", "right", "yeah", "uh-huh", "okay", "I see", "hm")' +
    '\n• Jump back in naturally if the rep pauses mid-thought or trails off — real buyers don\'t wait politely' +
    '\n• Keep most responses SHORT — 1 to 2 punchy sentences, like a real phone call' +
    '\n• React in real time — surprise, mild impatience, skepticism — whatever fits your character' +
    '\n• Vary your pace and energy. Some moments quick and clipped, others slower and more measured' +
    '\n• NEVER use bracketed markers like [HANG_UP] or [APPOINTMENT_SET]. Use the end_call function instead.';

  if (contactInfo) {
    instructions +=
      `\n\nYour personal details for this call (share these ONLY when the rep asks):` +
      `\n• Your name: ${contactInfo.name} — say your first name when you introduce yourself, full name if they ask` +
      `\n• Your callback number: ${contactInfo.phone} — give this if they ask how to reach you or request a callback number` +
      `\n• Your email: ${contactInfo.email} — give this only if they specifically ask for an email address` +
      `\n• You\'re calling about: ${contactInfo.car} — mention this when discussing what vehicle you\'re looking for` +
      `\nDo NOT volunteer all this at once. Share each piece of info naturally, only when the rep asks or it comes up in conversation.`;
  }

  return instructions;
}

function handleMediaStream(twilioWs, rawUrl) {
  // NOTE: query params (callSid, personaId) may be stripped by the hosting proxy.
  // We defer persona lookup until the Twilio 'start' message arrives, which always
  // includes callSid in msg.start.callSid — no proxy strips message-body values.

  let callSid = null;
  let streamSid = null;
  let persona = null;
  let openAiWs = null;
  const history = [];
  let currentAiTranscript = '';
  let aiTurnCount = 0;
  let partialScoringInProgress = false;

  function emit(event) {
    if (callSid) callEmitter.emit(`call:${callSid}`, event);
  }

  // ── Start OpenAI session (called once we have persona from 'start' message) ──
  function startOpenAiSession(storedCall) {
    openAiWs = new WebSocket(
      'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2025-06-03',
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      }
    );

    openAiWs.on('open', () => {
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

      // Seed conversation so the AI speaks first
      openAiWs.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Hello?' }],
        },
      }));
      openAiWs.send(JSON.stringify({ type: 'response.create' }));
    });

    openAiWs.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.type) {
          case 'response.audio.delta':
            if (streamSid && msg.delta) {
              twilioWs.send(JSON.stringify({
                event: 'media',
                streamSid,
                media: { payload: msg.delta },
              }));
            }
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
            console.error('[openai-realtime] OpenAI error:', msg.error);
            break;
        }
      } catch (err) {
        console.error('[openai-realtime] OpenAI message handler error:', err);
      }
    });

    openAiWs.on('error', (err) => console.error('[openai-realtime] OpenAI WS error:', err));
    openAiWs.on('close', () => console.log('[openai-realtime] OpenAI WS closed'));
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

  twilioWs.on('close', () => {
    console.log('[openai-realtime] Twilio WS closed');
    if (openAiWs && openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
  });

  twilioWs.on('error', (err) => console.error('[openai-realtime] Twilio WS error:', err));
}

module.exports = { handleMediaStream };
