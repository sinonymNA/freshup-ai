'use strict';

const WebSocket = require('ws');
const twilio = require('twilio');

const { getTrainingCall, updateTrainingCall } = require('../store');
const { analyzeTrainingCall } = require('./claude');
const { getDealershipById, getGatekeeperForDifficulty, getRandomGM } = require('../training');

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2';
const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || 'coral';

function formatTrainingTranscript(history) {
  return history
    .map((m) => `${m.role === 'user' ? 'Salesperson' : 'Dealership Staff'}: ${m.content}`)
    .join('\n');
}

// Build OpenAI session instructions for a gatekeeper or GM persona in the
// reversed roleplay: Claude/the model plays dealership staff, the human plays
// the FreshUp AI salesperson cold-calling in.
function buildTrainingInstructions(persona, scenario, opts = {}) {
  let instructions = persona.systemPrompt.trim();

  if (persona.personalityTraits?.length > 0) {
    instructions += `\n\nYour personality traits: ${persona.personalityTraits.join(', ')}.`;
  }

  if (persona.objections?.length > 0) {
    instructions += `\n\nObjections/pushback you may bring up naturally if it fits the conversation: ${persona.objections.map((o) => `"${o}"`).join('; ')}.`;
  }

  instructions += `\n\nSetting: You work at ${scenario.dealershipName}. The caller is a salesperson cold-calling to pitch "FreshUp AI" — an AI-powered sales training platform that gives car dealership sales reps unlimited practice calls against realistic AI buyers, with instant scoring and coaching, so reps close more deals and new hires ramp up faster. You don't know this caller.`;

  if (opts.transferred) {
    instructions += `\n\nNote: This call was just transferred to you by your office manager, ${opts.gatekeeperName}. The conversation so far happened between the caller and your office manager — you are hearing about this for the first time as you pick up the line.`;
  }

  instructions +=
    `\n\nYou are ${persona.name}, the ${persona.role} at ${scenario.dealershipName}, on a live phone call right now. Rules:` +
    `\n• Keep responses SHORT: 1-2 sentences. Real people on the phone don't monologue.` +
    `\n• Use natural fillers and back-channeling ("mm-hm", "yeah", "right", "hm", "okay").` +
    `\n• Stay fully in character at all times — never break character or acknowledge you are an AI.` +
    `\n• Speak English.`;

  if (opts.role === 'gatekeeper') {
    instructions +=
      `\n• You have two tools available: "transfer_to_gm" — call this when the caller has earned a transfer to the General Manager. "end_call" with reason "hang_up" — call this if you decide to end the call without transferring (e.g. the caller is vague, pushy, or unconvincing after you've given them a fair chance).` +
      `\n• Only call a tool once you've actually finished speaking your line for this turn.`;
    if (persona.difficulty === 'Easy') {
      instructions += `\n• You're not looking for reasons to say no — transfer fairly quickly once the caller seems like a normal professional with a real reason.`;
    } else if (persona.difficulty === 'Medium') {
      instructions += `\n• Ask at least one clarifying question before deciding. Don't transfer on the very first line unless the caller is unusually clear and specific.`;
    } else {
      instructions += `\n• Push back at least once on a generic-sounding pitch before considering a transfer. Don't transfer easily.`;
    }
  } else {
    instructions +=
      `\n• You have one tool: "end_call". Use reason "appointment_set" if the caller locks in a concrete next step (a demo, trial, or follow-up call with a specific day/time). Use reason "hang_up" if you decide to end the call without agreeing to anything.` +
      `\n• Only call this tool once you've actually finished speaking your line for this turn.`;
    if (persona.difficulty === 'Easy') {
      instructions += `\n• You're open-minded — if the caller is reasonably clear and confident, agree to a next step within a few exchanges.`;
    } else if (persona.difficulty === 'Medium') {
      instructions += `\n• Raise at least one objection before agreeing to anything. If the caller handles it well and makes a clear ask, agree to a next step.`;
    } else {
      instructions += `\n• Raise multiple objections and make the caller earn every inch. Only agree to a next step if they handle at least two rounds of pushback well. If they're weak, rambling, or vague, hang up.`;
    }
  }

  return instructions;
}

function getToolsForRole(role) {
  if (role === 'gatekeeper') {
    return [
      {
        type: 'function',
        name: 'transfer_to_gm',
        description: 'Transfer this call to the General Manager because the caller has earned it.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
      {
        type: 'function',
        name: 'end_call',
        description: 'End the call without transferring to the GM.',
        parameters: {
          type: 'object',
          properties: { reason: { type: 'string', enum: ['hang_up'] } },
          required: ['reason'],
        },
      },
    ];
  }
  return [
    {
      type: 'function',
      name: 'end_call',
      description: 'End the phone call. Use reason "appointment_set" if a concrete next step was agreed, or "hang_up" otherwise.',
      parameters: {
        type: 'object',
        properties: { reason: { type: 'string', enum: ['appointment_set', 'hang_up'] } },
        required: ['reason'],
      },
    },
  ];
}

function handleTrainingMediaStream(twilioWs, rawUrl) {
  console.log(`[TRAINING] ── Twilio WS connected url=${rawUrl}`);

  let callSid = null;
  let streamSid = null;
  let openAiWs = null;
  const history = [];
  let currentAiTranscript = '';
  let sessionSeeded = false;
  let sessionReady = false;
  let greetingDone = false;
  let closed = false;
  let pendingAction = null;

  let currentPersona = null;
  let currentRole = 'gatekeeper'; // 'gatekeeper' | 'gm'
  let difficulty = 'Medium';
  let scenario = null; // { dealershipName, difficulty, gatekeeperName, gmName, phase }

  const pendingTwilioAudio = [];
  const MAX_PENDING_PACKETS = 250;

  function sendSessionUpdate(opts = {}) {
    const instructions = buildTrainingInstructions(currentPersona, scenario, {
      role: currentRole,
      transferred: opts.transferred,
      gatekeeperName: scenario.gatekeeperName,
    });
    const selectedVoice = currentPersona.voice || REALTIME_VOICE;

    const sessionPayload = {
      type: 'session.update',
      session: {
        type: 'realtime',
        model: REALTIME_MODEL,
        output_modalities: ['audio'],
        instructions,
        audio: {
          input: {
            format: { type: 'audio/pcmu' },
            transcription: { model: 'gpt-4o-transcribe' },
            turn_detection: {
              type: 'semantic_vad',
              eagerness: 'high',
              create_response: true,
              interrupt_response: true,
            },
          },
          output: {
            format: { type: 'audio/pcmu' },
            voice: selectedVoice,
          },
        },
        tools: getToolsForRole(currentRole),
        tool_choice: 'auto',
        max_output_tokens: 1024,
      },
    };
    console.log(`[TRAINING] ── Sending session.update role=${currentRole} persona=${currentPersona.id} voice=${selectedVoice} callSid=${callSid}`);
    openAiWs.send(JSON.stringify(sessionPayload));
  }

  function startOpenAiSession() {
    console.log(`[TRAINING] ── Opening OpenAI WS callSid=${callSid} model=${REALTIME_MODEL}`);

    openAiWs = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`,
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );

    openAiWs.on('open', () => {
      console.log(`[TRAINING] ── OpenAI WS opened callSid=${callSid}`);
      sendSessionUpdate();
    });

    openAiWs.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        const t = msg.type;

        if (t !== 'response.output_audio.delta' && t !== 'response.output_audio_transcript.delta' && t !== 'response.audio_transcript.delta' && t !== 'input_audio_buffer.speech_stopped') {
          console.log(`[TRAINING] ── OpenAI event=${t} callSid=${callSid}`);
        }

        switch (t) {
          case 'session.updated':
            sessionReady = true;
            while (pendingTwilioAudio.length > 0 && openAiWs.readyState === WebSocket.OPEN) {
              openAiWs.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: pendingTwilioAudio.shift() }));
            }
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
              console.log(`[TRAINING] ── response.create sent callSid=${callSid} role=${currentRole}`);
            }
            break;

          case 'response.output_audio.delta': {
            if (!msg.delta) break;
            if (!streamSid || twilioWs.readyState !== WebSocket.OPEN) break;
            twilioWs.send(JSON.stringify({
              event: 'media',
              streamSid,
              media: { payload: msg.delta },
            }));
            break;
          }

          case 'response.done': {
            greetingDone = true;
            if (pendingAction) {
              const action = pendingAction;
              pendingAction = null;
              handlePendingAction(action);
            }
            break;
          }

          case 'response.cancelled':
            greetingDone = true;
            break;

          case 'response.output_audio_transcript.delta':
          case 'response.audio_transcript.delta':
            currentAiTranscript += msg.delta || '';
            break;

          case 'response.output_audio_transcript.done':
          case 'response.audio_transcript.done': {
            const content = currentAiTranscript.trim();
            if (content) {
              history.push({ role: 'assistant', content });
              if (callSid) updateTrainingCall(callSid, { history: [...history] });
            }
            currentAiTranscript = '';
            break;
          }

          case 'conversation.item.input_audio_transcription.completed':
            if (msg.transcript && msg.transcript.trim()) {
              const content = msg.transcript.trim();
              history.push({ role: 'user', content });
              if (callSid) updateTrainingCall(callSid, { history: [...history] });
            }
            break;

          case 'input_audio_buffer.speech_started':
            if (greetingDone) {
              if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                openAiWs.send(JSON.stringify({ type: 'response.cancel' }));
              }
              if (streamSid) {
                twilioWs.send(JSON.stringify({ event: 'clear', streamSid }));
              }
            }
            break;

          case 'response.function_call_arguments.done': {
            const fnName = msg.name;
            const fnArgs = JSON.parse(msg.arguments || '{}');
            console.log(`[TRAINING] ── function_call name=${fnName} args=${JSON.stringify(fnArgs)} callSid=${callSid}`);

            if (fnName === 'transfer_to_gm' && currentRole === 'gatekeeper') {
              pendingAction = { type: 'transfer' };
            } else if (fnName === 'end_call') {
              pendingAction = { type: 'end_call', reason: fnArgs.reason || 'hang_up' };
            }
            break;
          }

          case 'error':
            console.error(`[TRAINING] ── OpenAI ERROR callSid=${callSid}:`, JSON.stringify(msg.error));
            break;
        }
      } catch (err) {
        console.error('[TRAINING] OpenAI message handler error:', err);
      }
    });

    openAiWs.on('error', (err) => {
      console.error(`[TRAINING] ── OpenAI WS ERROR callSid=${callSid}: ${err.message}`);
    });
    openAiWs.on('close', (code, reason) => {
      console.log(`[TRAINING] ── OpenAI WS CLOSED callSid=${callSid} code=${code} reason=${reason}`);
      if (!closed) {
        closed = true;
        if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
      }
    });
  }

  function handlePendingAction(action) {
    if (action.type === 'transfer') {
      const gm = getRandomGM(difficulty);
      currentPersona = gm;
      currentRole = 'gm';
      scenario.gmName = gm.name;
      scenario.phase = 'gm';
      updateTrainingCall(callSid, { phase: 'gm', gmPersonaId: gm.id, gmPersonaName: gm.name });
      sessionSeeded = false;
      if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
        sendSessionUpdate({ transferred: true });
      }
      return;
    }

    if (action.type === 'end_call') {
      const outcome = currentRole === 'gatekeeper'
        ? 'Never Transferred'
        : (action.reason === 'appointment_set' ? 'Appointment Set' : 'Hung Up');

      if (callSid) {
        updateTrainingCall(callSid, { outcome, endTime: Date.now() });

        analyzeTrainingCall(formatTrainingTranscript(history), scenario)
          .then((score) => updateTrainingCall(callSid, { score }))
          .catch((err) => console.error('[TRAINING] analyzeTrainingCall error:', err));
      }

      setTimeout(() => {
        try {
          const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
          client.calls(callSid).update({ status: 'completed' })
            .then(() => console.log(`[TRAINING] ── Twilio call ended callSid=${callSid}`))
            .catch((err) => console.error(`[TRAINING] ── Twilio hangup error callSid=${callSid}:`, err.message));
        } catch (err) {
          console.error('[TRAINING] ── Twilio hangup setup error:', err.message);
        }
      }, 2500);
    }
  }

  twilioWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.event) {
        case 'connected':
          break;

        case 'start': {
          streamSid = msg.start.streamSid;
          callSid = msg.start.callSid;
          console.log(`[TRAINING] ── Twilio start callSid=${callSid} streamSid=${streamSid}`);

          const trainingCall = getTrainingCall(callSid);
          if (!trainingCall) {
            console.error(`[TRAINING] ── FATAL: training call not found callSid=${callSid}`);
            twilioWs.close(1008, 'Training call not found');
            return;
          }

          difficulty = trainingCall.difficulty || 'Medium';
          const dealership = getDealershipById(trainingCall.dealershipId);
          const gatekeeper = getGatekeeperForDifficulty(difficulty);

          currentPersona = gatekeeper;
          currentRole = 'gatekeeper';
          scenario = {
            dealershipName: trainingCall.dealershipName || dealership?.name || 'the dealership',
            difficulty,
            gatekeeperName: gatekeeper.name,
            gmName: null,
            phase: 'gatekeeper',
          };

          updateTrainingCall(callSid, { phase: 'gatekeeper', gatekeeperPersonaId: gatekeeper.id });

          startOpenAiSession();
          break;
        }

        case 'media':
          if (!sessionReady || !openAiWs || openAiWs.readyState !== WebSocket.OPEN) {
            pendingTwilioAudio.push(msg.media.payload);
            while (pendingTwilioAudio.length > MAX_PENDING_PACKETS) pendingTwilioAudio.shift();
          } else {
            openAiWs.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: msg.media.payload,
            }));
          }
          break;

        case 'stop':
          console.log(`[TRAINING] ── Twilio stream stopped callSid=${callSid}`);
          if (openAiWs && openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
          break;

        default:
          break;
      }
    } catch (err) {
      console.error('[TRAINING] Twilio message handler error:', err);
    }
  });

  twilioWs.on('close', (code, reason) => {
    console.log(`[TRAINING] ── Twilio WS closed callSid=${callSid} code=${code} reason=${reason}`);
    if (!closed) {
      closed = true;
      if (openAiWs && openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
    }
  });

  twilioWs.on('error', (err) => console.error(`[TRAINING] Twilio WS error callSid=${callSid}: ${err.message}`));
}

module.exports = { handleTrainingMediaStream, formatTrainingTranscript };
