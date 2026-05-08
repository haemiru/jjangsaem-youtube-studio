export const theme = {
  bg: '#1A1530',
  bgGradient: 'linear-gradient(135deg, #1A1530 0%, #2A1F3D 100%)',
  surface: '#2A1F3D',
  text: '#F8F4FF',
  textMuted: 'rgba(248, 244, 255, 0.7)',
  accent: '#FFB5A7',
  accentDeep: '#E89B7E',
  secondary: '#A8E6CF',
  highlight: '#9B89B3',

  fontTitle: '"Noto Sans KR", "Pretendard", sans-serif',
  fontBody: '"Noto Sans KR", "Pretendard", sans-serif',

  fps: 30,
  width: 1920,
  height: 1080,

  defaultSlideDurationSec: 5,
} as const;

export type Theme = typeof theme;
