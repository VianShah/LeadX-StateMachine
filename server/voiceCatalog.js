// The three LeadX agent personas offered on the voice-selection screen.
//
// `profile` is what makes the choice matter: it feeds the state machine's
// intent matching (server/lib/stateMachine.js). A persona whose `languages`
// include the lead's preferred language gets a small boost to high intent,
// and `intentBias` shifts the high/medium/low mix for its overall style.
//
// `sampleText` is spoken in-browser (Web Speech API). When real recordings
// exist, drop them in public/audio/ and set `sampleAudio` — the carousel
// prefers a recording over TTS automatically.
module.exports = [
  {
    id: 'maya', name: 'Maya', gender: 'Female',
    lang: 'Hinglish', ttsLang: 'hi-IN', pastel: '#ff9eb5',
    meta: 'Hinglish · Warm, consultative · Female',
    languages: ['Hinglish', 'Hindi', 'English'],
    profile: { connectRate: 0.84, intentBias: { high: 0.0, medium: 0.08, low: -0.08 } },
    sampleText: 'Namaste! Main Maya bol rahi hoon, LeadX ki taraf se. Aapke liye ek khaas offer hai.',
    sampleAudio: null,
  },
  {
    id: 'ria', name: 'Ria', gender: 'Female',
    lang: 'English', ttsLang: 'en-IN', pastel: '#8ecbff',
    meta: 'English · Crisp, energetic · Female',
    languages: ['English', 'Hinglish'],
    profile: { connectRate: 0.8, intentBias: { high: 0.06, medium: 0.0, low: -0.06 } },
    sampleText: 'Hi, this is Ria from LeadX. I have a pre-approved offer I think you will like.',
    sampleAudio: null,
  },
  {
    id: 'vijay', name: 'Vijay', gender: 'Male',
    lang: 'Hindi / Marathi', ttsLang: 'hi-IN', pastel: '#8ef0c4',
    meta: 'Hindi/Marathi · Authoritative, clear · Male',
    languages: ['Hindi', 'Marathi'],
    profile: { connectRate: 0.78, intentBias: { high: 0.02, medium: -0.02, low: 0.0 } },
    sampleText: 'Namaskar, main Vijay bol raha hoon, LeadX kadun. Tumchyasathi ek vishesh offer aahe.',
    sampleAudio: null,
  },
];
