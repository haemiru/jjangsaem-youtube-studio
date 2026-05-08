'use client';

import { Player } from '@remotion/player';
import { SlideShow, calcTotalFrames } from '../../remotion/SlideShow';
import { theme } from '../../remotion/theme';
import type { Deck } from '../../remotion/types';

interface Props {
  deck: Deck;
}

export function SlidePlayer({ deck }: Props) {
  const totalFrames = calcTotalFrames(deck);
  if (totalFrames <= 0 || deck.slides.length === 0) {
    return (
      <div className="rounded border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center text-sm text-zinc-500">
        슬라이드 플랜이 비어있습니다. 위에서 "슬라이드 생성" 또는 직접 JSON 입력.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded border border-zinc-200 dark:border-zinc-800 bg-black">
      <Player
        component={SlideShow as unknown as React.ComponentType<Record<string, unknown>>}
        inputProps={{ deck } as unknown as Record<string, unknown>}
        durationInFrames={totalFrames}
        compositionWidth={theme.width}
        compositionHeight={theme.height}
        fps={theme.fps}
        controls
        loop
        style={{ width: '100%', aspectRatio: '16 / 9' }}
      />
    </div>
  );
}
