// Gemini 2.5 TTS prebuilt voices (30개) — 공식 카탈로그
// 각 voice의 stylistic descriptor는 Google의 Speech Generation 문서 기준.

export interface GeminiVoice {
  name: string;
  style: string;
  // 한국어로 짱샘 영상에 어울릴 만한 추천 매핑 힌트
  suggestedFor?: ('jjangsaem' | 'mom' | 'dad')[];
}

export const GEMINI_VOICES: GeminiVoice[] = [
  { name: 'Zephyr', style: 'Bright', suggestedFor: ['mom'] },
  { name: 'Puck', style: 'Upbeat' },
  { name: 'Charon', style: 'Informative', suggestedFor: ['dad'] },
  { name: 'Kore', style: 'Firm' },
  { name: 'Fenrir', style: 'Excitable' },
  { name: 'Leda', style: 'Youthful', suggestedFor: ['mom'] },
  { name: 'Orus', style: 'Firm', suggestedFor: ['dad'] },
  { name: 'Aoede', style: 'Breezy', suggestedFor: ['jjangsaem'] },
  { name: 'Callirrhoe', style: 'Easy-going', suggestedFor: ['jjangsaem'] },
  { name: 'Autonoe', style: 'Bright' },
  { name: 'Enceladus', style: 'Breathy' },
  { name: 'Iapetus', style: 'Clear', suggestedFor: ['dad'] },
  { name: 'Umbriel', style: 'Easy-going' },
  { name: 'Algieba', style: 'Smooth' },
  { name: 'Despina', style: 'Smooth', suggestedFor: ['mom'] },
  { name: 'Erinome', style: 'Clear' },
  { name: 'Algenib', style: 'Gravelly', suggestedFor: ['dad'] },
  { name: 'Rasalgethi', style: 'Informative' },
  { name: 'Laomedeia', style: 'Upbeat' },
  { name: 'Achernar', style: 'Soft' },
  { name: 'Alnilam', style: 'Firm' },
  { name: 'Schedar', style: 'Even' },
  { name: 'Gacrux', style: 'Mature' },
  { name: 'Pulcherrima', style: 'Forward' },
  { name: 'Achird', style: 'Friendly', suggestedFor: ['mom'] },
  { name: 'Zubenelgenubi', style: 'Casual' },
  { name: 'Vindemiatrix', style: 'Gentle', suggestedFor: ['jjangsaem'] },
  { name: 'Sadachbia', style: 'Lively' },
  { name: 'Sadaltager', style: 'Knowledgeable' },
  { name: 'Sulafat', style: 'Warm', suggestedFor: ['jjangsaem'] },
];

export const GEMINI_DEFAULT_VOICE = {
  jjangsaem: 'Sulafat',
  mom: 'Leda',
  dad: 'Charon',
} as const;
