# freshup-ai

A Node.js application using Express, Twilio, ElevenLabs, and Claude AI.

## Setup

1. Copy `.env.example` to `.env` and fill in your credentials.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   node server/index.js
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
client/             # Frontend assets
```
