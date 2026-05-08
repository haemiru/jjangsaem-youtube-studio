import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { theme } from '../theme';

interface Props {
  quote: string;
  attribution?: string;
}

export const QuoteSlide = ({ quote, attribution }: Props) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 22], [0, 1], { extrapolateRight: 'clamp' });
  const lift = interpolate(frame, [0, 28], [24, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: theme.bgGradient,
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 200px',
        fontFamily: theme.fontTitle,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          color: theme.accent,
          fontSize: 200,
          lineHeight: 1,
          fontWeight: 900,
          marginBottom: -40,
          opacity,
        }}
      >
        “
      </div>
      <p
        style={{
          color: theme.text,
          fontSize: 72,
          fontWeight: 600,
          lineHeight: 1.4,
          margin: 0,
          opacity,
          transform: `translateY(${lift}px)`,
          maxWidth: 1500,
        }}
      >
        {quote}
      </p>
      {attribution && (
        <div
          style={{
            color: theme.textMuted,
            fontSize: 32,
            fontWeight: 500,
            marginTop: 56,
            letterSpacing: 1,
            opacity,
          }}
        >
          — {attribution}
        </div>
      )}
    </AbsoluteFill>
  );
};
