export type SlidePlan =
  | { type: 'title'; title: string; subtitle?: string }
  | { type: 'title-bullets'; title: string; bullets: string[] }
  | { type: 'split'; title: string; bullets: string[]; imagePrompt?: string }
  | { type: 'stat'; number: string; label: string; caption?: string }
  | { type: 'quote'; quote: string; attribution?: string }
  | { type: 'steps'; title: string; steps: { label: string; description?: string }[] };

export type SlideType = SlidePlan['type'];

export type SubtitleSpeaker = 'jjangsaem' | 'parent';

export interface AudioLine {
  slideIdx: number;
  speaker: SubtitleSpeaker;
  text: string;
  audioUrl: string;
  audioLengthSec: number;
}

export interface Deck {
  topic: string;
  slides: SlidePlan[];
  durationsSec?: number[];
  audio?: AudioLine[];
}
