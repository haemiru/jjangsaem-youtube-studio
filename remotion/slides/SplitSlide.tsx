import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { theme } from '../theme';

interface Props {
  title: string;
  bullets: string[];
  imagePrompt?: string;
}

export const SplitSlide = ({ title, bullets, imagePrompt }: Props) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: theme.bgGradient,
        flexDirection: 'row',
        fontFamily: theme.fontTitle,
        opacity,
      }}
    >
      <div
        style={{
          flex: 1,
          padding: '120px 80px 120px 160px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: 80, height: 6, background: theme.accent, marginBottom: 28 }} />
        <h1
          style={{
            color: theme.text,
            fontSize: 68,
            fontWeight: 800,
            lineHeight: 1.2,
            margin: 0,
            letterSpacing: -1.5,
          }}
        >
          {title}
        </h1>
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 48 }}>
          {bullets.map((b, i) => {
            const start = 16 + i * 6;
            const itemOpacity = interpolate(frame, [start, start + 14], [0, 1], {
              extrapolateRight: 'clamp',
            });
            return (
              <li
                key={i}
                style={{
                  color: theme.text,
                  fontSize: 36,
                  fontWeight: 500,
                  lineHeight: 1.5,
                  marginBottom: 20,
                  paddingLeft: 40,
                  position: 'relative',
                  opacity: itemOpacity,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: '0.6em',
                    width: 18,
                    height: 4,
                    background: theme.secondary,
                  }}
                />
                {b}
              </li>
            );
          })}
        </ul>
      </div>

      <div
        style={{
          flex: 1,
          background: theme.surface,
          margin: '120px 160px 120px 80px',
          borderRadius: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 60,
          textAlign: 'center',
        }}
      >
        <span
          style={{
            color: theme.textMuted,
            fontSize: 28,
            fontStyle: 'italic',
            lineHeight: 1.6,
          }}
        >
          {imagePrompt ? `🎨 ${imagePrompt}` : '이미지 슬롯'}
        </span>
      </div>
    </AbsoluteFill>
  );
};
