import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import type { AudioLine, Deck } from './types';
import { SlideRouter } from './slides/SlideRouter';
import { SubtitleOverlay } from './SubtitleOverlay';
import { theme } from './theme';

interface Props {
  deck: Deck;
}

const TAIL_PADDING_SEC = 0.3;

function audioForSlide(deck: Deck, slideIdx: number): AudioLine[] {
  return (deck.audio ?? []).filter((a) => a.slideIdx === slideIdx);
}

function slideDurationFrames(deck: Deck, slideIdx: number, fps: number): number {
  const audioLines = audioForSlide(deck, slideIdx);
  if (audioLines.length > 0) {
    const audioFrames = audioLines.reduce(
      (sum, a) => sum + Math.max(1, Math.round(a.audioLengthSec * fps)),
      0
    );
    return audioFrames + Math.round(TAIL_PADDING_SEC * fps);
  }
  const explicit = deck.durationsSec?.[slideIdx];
  const sec = explicit && explicit > 0 ? explicit : theme.defaultSlideDurationSec;
  return Math.max(1, Math.round(sec * fps));
}

function resolveAudioSrc(audioUrl: string): string {
  if (/^https?:\/\//.test(audioUrl)) return audioUrl;
  return staticFile(audioUrl.replace(/^\//, ''));
}

export const SlideShow = ({ deck }: Props) => {
  const fps = theme.fps;
  let cursor = 0;

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {deck.slides.map((slide, i) => {
        const slideFrames = slideDurationFrames(deck, i, fps);
        const audioLines = audioForSlide(deck, i);
        const from = cursor;
        cursor += slideFrames;

        let audioCursor = 0;
        return (
          <Sequence key={i} from={from} durationInFrames={slideFrames} layout="none">
            <SlideRouter slide={slide} />
            {audioLines.map((a, j) => {
              const lineFrames = Math.max(1, Math.round(a.audioLengthSec * fps));
              const lineFrom = audioCursor;
              audioCursor += lineFrames;
              return (
                <Sequence
                  key={`audio-${j}`}
                  from={lineFrom}
                  durationInFrames={lineFrames}
                  layout="none"
                >
                  <Audio src={resolveAudioSrc(a.audioUrl)} />
                </Sequence>
              );
            })}
            {audioLines.length > 0 && <SubtitleOverlay lines={audioLines} />}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export function calcTotalFrames(deck: Deck): number {
  const fps = theme.fps;
  return deck.slides.reduce((acc, _, i) => acc + slideDurationFrames(deck, i, fps), 0);
}
