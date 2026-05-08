import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { AudioLine } from './types';
import { theme } from './theme';

interface Props {
  lines: AudioLine[];
}

export const SubtitleOverlay = ({ lines }: Props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let cursor = 0;
  let active: { line: AudioLine; localFrame: number; lineFrames: number } | null = null;
  for (const line of lines) {
    const lineFrames = Math.max(1, Math.round(line.audioLengthSec * fps));
    if (frame >= cursor && frame < cursor + lineFrames) {
      active = { line, localFrame: frame - cursor, lineFrames };
      break;
    }
    cursor += lineFrames;
  }
  if (!active) return null;

  const { line, localFrame, lineFrames } = active;
  const fadeIn = interpolate(localFrame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(
    localFrame,
    [Math.max(0, lineFrames - 6), lineFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const opacity = Math.min(fadeIn, fadeOut);

  const isJjang = line.speaker === 'jjangsaem';
  const accentColor = isJjang ? theme.accent : theme.secondary;
  const speakerLabel = isJjang ? '짱샘' : '부모';

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 80,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        opacity,
      }}
    >
      <div
        style={{
          maxWidth: 1500,
          padding: '24px 48px',
          background: 'rgba(10, 6, 24, 0.78)',
          borderLeft: `8px solid ${accentColor}`,
          borderRadius: 8,
          fontFamily: theme.fontBody,
        }}
      >
        <div
          style={{
            color: accentColor,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2,
            marginBottom: 6,
            textTransform: 'uppercase',
          }}
        >
          {speakerLabel}
        </div>
        <div
          style={{
            color: theme.text,
            fontSize: 38,
            fontWeight: 500,
            lineHeight: 1.45,
          }}
        >
          {line.text}
        </div>
      </div>
    </div>
  );
};
