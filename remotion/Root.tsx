import { Composition } from 'remotion';
import { SlideShow, calcTotalFrames } from './SlideShow';
import { theme } from './theme';
import type { Deck } from './types';

const SAMPLE_DECK: Deck = {
  topic: '잠 못 드는 발달장애 아이의 밤',
  slides: [
    {
      type: 'title',
      title: '잠 못 드는 밤의 진짜 원인',
      subtitle: '훈육이 아니라 신경계 상태입니다',
    },
    {
      type: 'title-bullets',
      title: '아이가 못 자는 이유',
      bullets: [
        '낮 동안 신경계가 너무 켜져 있음',
        '코호흡이 안 돼서 산소가 부족',
        '몸을 충분히 못 느낌 (감각 통합 미성숙)',
      ],
    },
    {
      type: 'stat',
      number: '6주',
      label: '신경계가 다시 잡히는 시간',
      caption: '매일 같은 시간, 같은 순서로만 해도 됩니다',
    },
    {
      type: 'steps',
      title: '오늘 밤 시도할 3가지',
      steps: [
        { label: '취침 90분 전 조명 낮추기', description: '미주신경 진정 신호' },
        { label: '미지근한 물로 손·발 씻기', description: '체온 살짝 떨어뜨리기' },
        { label: '코로만 호흡하는 짧은 놀이', description: '5분이면 충분합니다' },
      ],
    },
    {
      type: 'quote',
      quote: '훈육이 아니라 신경계 상태예요. 어머님 잘하고 계세요.',
      attribution: '짱샘',
    },
  ],
};

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="SlideShow"
        component={SlideShow as unknown as React.ComponentType<Record<string, unknown>>}
        durationInFrames={calcTotalFrames(SAMPLE_DECK)}
        fps={theme.fps}
        width={theme.width}
        height={theme.height}
        defaultProps={{ deck: SAMPLE_DECK } as Record<string, unknown>}
        calculateMetadata={({ props }) => {
          const deck = (props as { deck: Deck }).deck;
          return {
            durationInFrames: calcTotalFrames(deck),
          };
        }}
      />
    </>
  );
};
