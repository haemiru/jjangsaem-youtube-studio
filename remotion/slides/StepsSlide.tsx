import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { theme } from '../theme';

interface Props {
  title: string;
  steps: { label: string; description?: string }[];
}

export const StepsSlide = ({ title, steps }: Props) => {
  const frame = useCurrentFrame();
  const titleOpacity = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: theme.bgGradient,
        padding: '100px 160px',
        fontFamily: theme.fontTitle,
      }}
    >
      <h1
        style={{
          color: theme.text,
          fontSize: 72,
          fontWeight: 800,
          lineHeight: 1.2,
          margin: 0,
          letterSpacing: -1.5,
          opacity: titleOpacity,
        }}
      >
        {title}
      </h1>
      <div
        style={{
          marginTop: 60,
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        {steps.map((s, i) => {
          const start = 12 + i * 10;
          const opacity = interpolate(frame, [start, start + 18], [0, 1], {
            extrapolateRight: 'clamp',
          });
          const slide = interpolate(frame, [start, start + 22], [-30, 0], {
            extrapolateRight: 'clamp',
          });
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 32,
                opacity,
                transform: `translateX(${slide}px)`,
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  background: theme.accent,
                  color: theme.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 40,
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>
              <div style={{ paddingTop: 8 }}>
                <div
                  style={{
                    color: theme.text,
                    fontSize: 42,
                    fontWeight: 700,
                    lineHeight: 1.3,
                  }}
                >
                  {s.label}
                </div>
                {s.description && (
                  <div
                    style={{
                      color: theme.textMuted,
                      fontSize: 28,
                      fontWeight: 400,
                      lineHeight: 1.5,
                      marginTop: 8,
                    }}
                  >
                    {s.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
