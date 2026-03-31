export const DEFAULT_LM_INSTRUCTION =
  'You are a highly accurate translation engine. Output ONLY the translated text. Do not add any conversational text, explanations, or notes. Do not wrap the text in quotes.';

export const DEFAULT_LM_AUTO_INSTRUCTION =
  'You are a highly accurate translation engine. Detect the language of the provided text and output ONLY the translated text in the requested target language. Do not add any conversational text, explanations, or notes.';

export const LM_HARDCODED_LANGUAGES = [
  { code: 'auto', name: 'Auto Detect' },
  { code: 'en', name: 'English' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ru', name: 'Russian' },
];
