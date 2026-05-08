import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { theme } from '../theme';

interface Props {
  title: string;
  bullets: string[];
}

export const TitleBulletsSlide = ({ title, bullets }: Props) => {
  const frame = useCurrentFrame();
  const titleOpacity = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: 'clamp' });
  const titleLift = interpolate(frame, [0, 18], [16, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: theme.bgGradient,
        padding: '120px 160px',
        fontFamily: theme.fontTitle,
      }}
    >
      <div
        style={{
          width: 80,
          height: 6,
          background: theme.accent,
          marginBottom: 32,
          opacity: titleOpacity,
        }}
      />
      <h1
        style={{
          color: theme.text,
          fontSize: 84,
          fontWeight: 800,
          lineHeight: 1.2,
          margin: 0,
          letterSpacing: -2,
          opacity: titleOpacity,
          transform: `translateY(${titleLift}px)`,
        }}
      >
        {title}
      </h1>

      <ul style={{ listStyle: 'none', padding: 0, marginTop: 72 }}>
        {bullets.map((b, i) => {
          const start = 14 + i * 8;
          const opacity = interpolate(frame, [start, start + 16], [0, 1], {
            extrapolateRight: 'clamp',
          });
          const lift = interpolate(frame, [start, start + 20], [24, 0], {
            extrapolateRight: 'clamp',
          });
          return (
            <li
              key={i}
              style={{
                color: theme.text,
                fontSize: 48,
                fontWeight: 500,
                lineHeight: 1.5,
                marginBottom: 28,
                paddingLeft: 56,
                position: 'relative',
                opacity,
                transform: `translateY(${lift}px)`,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  top: '0.55em',
                  width: 24,
                  height: 4,
                  background: theme.accent,
                }}
              />
              {b}
            </li>
          );
        })}
      </ul>
    </AbsoluteFill>
  );
};
