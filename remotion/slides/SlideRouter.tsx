import type { SlidePlan } from '../types';
import { TitleSlide } from './TitleSlide';
import { TitleBulletsSlide } from './TitleBulletsSlide';
import { SplitSlide } from './SplitSlide';
import { StatSlide } from './StatSlide';
import { QuoteSlide } from './QuoteSlide';
import { StepsSlide } from './StepsSlide';

export const SlideRouter = ({ slide }: { slide: SlidePlan }) => {
  switch (slide.type) {
    case 'title':
      return <TitleSlide title={slide.title} subtitle={slide.subtitle} />;
    case 'title-bullets':
      return <TitleBulletsSlide title={slide.title} bullets={slide.bullets} />;
    case 'split':
      return (
        <SplitSlide
          title={slide.title}
          bullets={slide.bullets}
          imagePrompt={slide.imagePrompt}
        />
      );
    case 'stat':
      return <StatSlide number={slide.number} label={slide.label} caption={slide.caption} />;
    case 'quote':
      return <QuoteSlide quote={slide.quote} attribution={slide.attribution} />;
    case 'steps':
      return <StepsSlide title={slide.title} steps={slide.steps} />;
  }
};
