# freshup-ai

A Node.js application using Express, Twilio, ElevenLabs, and Claude AI.

## Setup

1. Copy `.env.example` to `.env` and fill in credentials.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```

## Required environment variables

- `ANTHROPIC_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `ELEVENLABS_API_KEY`
- `BASE_URL` (public URL that Twilio can reach)
- `APP_API_KEY` (required in `NODE_ENV=production`)

Optional:
- `DB_PATH` (defaults to `./calls.db`; use `/tmp/calls.db` on ephemeral hosts)
- `PORT` (defaults to `3000`)

## API auth

Protected endpoints now require `x-api-key: <APP_API_KEY>`:
- `POST /api/call/start`
- `GET /api/call/history`
- `GET /webhook/results/:callSid`

The frontend reads the key from either:
- `localStorage['freshup_api_key']`, or
- `window.FRESHUP_API_KEY`.

Example in browser console:

```js
localStorage.setItem('freshup_api_key', 'your-app-api-key')
```

## Project Structure

```
server/
  index.js          # Express app entry point
  routes/
    call.js         # Call-related routes
    webhook.js      # Webhook routes
  services/
    claude.js       # Anthropic Claude client
    elevenlabs.js   # ElevenLabs TTS service
    twilio.js       # Twilio client
  personas/
    index.js        # Persona loader
    data/           # Persona JSON definitions
  middleware/       # Auth and rate limit middleware
  utils/            # Utility helpers
  public/           # Frontend SPA assets
```
