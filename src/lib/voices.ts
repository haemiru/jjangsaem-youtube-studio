export const VOICE_IDS = {
  jjangsaem: '195e1922033a6168f0c90f',
  parent_mom: '289a055b782b3072b7cd11',
  parent_dad: '838617ea6b672b84de0813',
} as const;

export type VoiceKey = keyof typeof VOICE_IDS;

export type Speaker = 'jjangsaem' | 'parent';

export function resolveVoiceId(speaker: Speaker, parentGender: 'mom' | 'dad'): string {
  if (speaker === 'jjangsaem') return VOICE_IDS.jjangsaem;
  return parentGender === 'mom' ? VOICE_IDS.parent_mom : VOICE_IDS.parent_dad;
}
