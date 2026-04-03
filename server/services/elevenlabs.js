'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// NOTE: Twilio fetches audio files via a public URL. Express must serve the /tmp
// directory as a static route so generated .mp3 files are accessible. Add this
// to server/index.js:
//
//   app.use('/audio', express.static('/tmp'));
//
// Then pass Twilio a URL like: `${process.env.BASE_URL}/audio/{filename}.mp3`

async function textToSpeech(text, voiceId) {
  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    },
    {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
    }
  );

  return Buffer.from(response.data);
}

function saveAudioFile(buffer, filename) {
  const filePath = path.join('/tmp', `${filename}.mp3`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

module.exports = { textToSpeech, saveAudioFile };
