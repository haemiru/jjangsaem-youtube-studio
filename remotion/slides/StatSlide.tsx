import { AbsoluteFill, interpolate, useCurrentFrame, spring, useVideoConfig } from 'remotion';
import { theme } from '../theme';

interface Props {
  number: string;
  label: string;
  caption?: string;
}

export const StatSlide = ({ number, label, caption }: Props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 12, stiffness: 100 } });
  const labelOpacity = interpolate(frame, [12, 28], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: theme.bgGradient,
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: theme.fontTitle,
        textAlign: 'center',
        padding: '0 160px',
      }}
    >
      <div
        style={{
          color: theme.accent,
          fontSize: 280,
          fontWeight: 900,
          lineHeight: 1,
          letterSpacing: -8,
          transform: `scale(${scale})`,
        }}
      >
        {number}
      </div>
      <div
        style={{
          color: theme.text,
          fontSize: 56,
          fontWeight: 700,
          marginTop: 32,
          opacity: labelOpacity,
        }}
      >
        {label}
      </div>
      {caption && (
        <div
          style={{
            color: theme.textMuted,
            fontSize: 32,
            fontWeight: 400,
            marginTop: 24,
            maxWidth: 1400,
            lineHeight: 1.5,
            opacity: labelOpacity,
          }}
        >
          {caption}
        </div>
      )}
    </AbsoluteFill>
  );
};
