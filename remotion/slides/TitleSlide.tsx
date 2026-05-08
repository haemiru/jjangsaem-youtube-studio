import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { theme } from '../theme';

interface Props {
  title: string;
  subtitle?: string;
}

export const TitleSlide = ({ title, subtitle }: Props) => {
  const frame = useCurrentFrame();
  const titleOpacity = interpolate(frame, [0, 24], [0, 1], { extrapolateRight: 'clamp' });
  const titleLift = interpolate(frame, [0, 28], [40, 0], { extrapolateRight: 'clamp' });
  const subOpacity = interpolate(frame, [16, 36], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: theme.bgGradient,
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 160px',
        fontFamily: theme.fontTitle,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 120,
          height: 6,
          background: theme.accent,
          marginBottom: 56,
          opacity: titleOpacity,
        }}
      />
      <h1
        style={{
          color: theme.text,
          fontSize: 120,
          fontWeight: 900,
          lineHeight: 1.15,
          margin: 0,
          letterSpacing: -3,
          opacity: titleOpacity,
          transform: `translateY(${titleLift}px)`,
          maxWidth: 1500,
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          style={{
            color: theme.textMuted,
            fontSize: 44,
            fontWeight: 500,
            marginTop: 48,
            lineHeight: 1.5,
            opacity: subOpacity,
            maxWidth: 1300,
          }}
        >
          {subtitle}
        </p>
      )}
    </AbsoluteFill>
  );
};
