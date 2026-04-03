# FreshUp AI — Manual Test Checklist

Run the server with `node server/index.js` (requires a valid `.env`).
All requests below assume `BASE_URL=http://localhost:3000`.

---

## 1. Health Check

**No credentials required.**

```
GET /health
```

Expected response `200 OK`:
```json
{ "status": "ok", "timestamp": 1712345678901 }
```

---

## 2. List Personas

**No credentials required.**

```
GET /api/personas
```

Expected response `200 OK` — array of 6 objects, each with these fields and **no** `systemPrompt`:
```json
[
  {
    "id": "marcus-webb",
    "name": "Marcus Webb",
    "age": 34,
    "race": "Black",
    "background": "...",
    "occupation": "Accountant",
    "mood": "Skeptical",
    "intentScore": 3,
    "difficulty": "Hard",
    "voiceId": "MARCUS_VOICE_ID",
    "objections": [...],
    "hangUpTriggers": [...],
    "personalityTraits": [...]
  },
  ...
]
```

Verify: exactly 6 entries, no `systemPrompt` field on any of them.

---

## 3. Test a Persona (Claude only — no Twilio or ElevenLabs credits used)

**Requires `ANTHROPIC_API_KEY`.**

```
GET /api/test/persona/marcus-webb
```

Expected response `200 OK`:
```json
{
  "persona": "Marcus Webb",
  "openingLine": "Yeah, what's this about."
}
```

The `openingLine` will vary — verify it sounds like Marcus (short, guarded, clipped).

Try each persona ID:
- [ ] `marcus-webb` — short, skeptical
- [ ] `rosa-delgado` — warm but direct
- [ ] `tyler-kowalski` — hesitant, uses "um"
- [ ] `priya-chandrasekaran` — precise, analytical
- [ ] `james-okafor` — formal, warm
- [ ] `brittany-walsh` — fast, impatient

Test a bad ID:

```
GET /api/test/persona/does-not-exist
```

Expected `404`:
```json
{ "error": "Persona not found" }
```

---

## 4. Call History (empty)

**No credentials required.**

```
GET /api/call/history
```

Expected response `200 OK` before any calls have been placed:
```json
[]
```

---

## 5. Start a Call

**Requires all env vars. Only run this when ready to use real Twilio/ElevenLabs credits.**

```
POST /api/call/start
Content-Type: application/json

{ "phoneNumber": "+1XXXXXXXXXX", "personaId": "tyler-kowalski" }
```

Expected response `200 OK`:
```json
{
  "success": true,
  "callSid": "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "persona": {
    "name": "Tyler Kowalski",
    "difficulty": "Easy",
    "mood": "Nervous and unsure",
    "intentScore": 7
  }
}
```

Test missing phone number:

```
POST /api/call/start
Content-Type: application/json

{}
```

Expected `400`:
```json
{ "error": "phoneNumber is required" }
```

Test random persona (omit `personaId`):

```
POST /api/call/start
Content-Type: application/json

{ "phoneNumber": "+1XXXXXXXXXX" }
```

Expected `200` with a random persona in the response.

---

## 6. Call History (after a call)

```
GET /api/call/history
```

Expected response — array with one entry per call, up to 20:
```json
[
  {
    "callSid": "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "personaName": "Tyler Kowalski",
    "outcome": null,
    "score": null,
    "duration": null,
    "timestamp": 1712345678901
  }
]
```

Once the call ends, `outcome` will be `"HangUp"`, `"Appointment"`, or `"Completed"`, `score` will be the analysis object, and `duration` will be seconds.

---

## 7. Get Call Results

```
GET /webhook/results/:callSid
```

Replace `:callSid` with a real SID from step 5.

Expected response `200 OK` after call completes:
```json
{
  "personaId": "tyler-kowalski",
  "persona": { ... },
  "history": [
    { "role": "assistant", "content": "Um, hello?" },
    { "role": "user", "content": "Hi, is this Tyler?" },
    ...
  ],
  "startTime": 1712345678901,
  "endTime": 1712345750000,
  "outcome": "Appointment",
  "score": {
    "rapport": 72,
    "discovery": 68,
    "objections": 55,
    "closing": 80,
    "overallScore": 69,
    "feedback": "The rep built decent rapport early but missed two objection opportunities..."
  }
}
```

Test a bad SID:

```
GET /webhook/results/CA000000
```

Expected `404`:
```json
{ "error": "Call not found" }
```

---

## 8. Webhook — Voice Entry (Twilio simulation)

**This is called automatically by Twilio. You can simulate it locally with curl.**

```
POST /webhook/voice?personaId=rosa-delgado
Content-Type: application/x-www-form-urlencoded

CallSid=CAtest1234
```

Expected response `200 OK` with `Content-Type: text/xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>http://localhost:3000/audio/CAtest1234.mp3</Play>
  <Gather input="speech" timeout="5" speechTimeout="auto" action="http://localhost:3000/webhook/respond">
    <Say>...</Say>
  </Gather>
</Response>
```

Also verify the audio file was written: `ls /tmp/CAtest1234.mp3`

---

## 9. Webhook — Respond (Twilio simulation)

```
POST /webhook/respond
Content-Type: application/x-www-form-urlencoded

CallSid=CAtest1234&SpeechResult=Hi+Rosa+my+name+is+Jake+calling+from+AutoNation
```

Expected `200 OK` with `Content-Type: text/xml` — either a `<Gather>` loop or `<Hangup>` depending on persona reaction.

Test empty SpeechResult (no speech detected):

```
POST /webhook/respond
Content-Type: application/x-www-form-urlencoded

CallSid=CAtest1234&SpeechResult=
```

Expected: TwiML that replays the last audio and re-gathers.

---

## 10. Webhook — Status Callback

```
POST /webhook/status
Content-Type: application/x-www-form-urlencoded

CallSid=CAtest1234&CallStatus=completed
```

Expected `204 No Content`. Check server logs for the analysis output.

---

## Audio File Serving

After running step 8 above, verify Express serves the file:

```
GET /audio/CAtest1234.mp3
```

Expected: `200 OK` with `Content-Type: audio/mpeg` and binary MP3 data.
