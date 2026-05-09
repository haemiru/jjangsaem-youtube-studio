import type { NextRequest } from 'next/server';
import { generate } from '@/lib/anthropic';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface SlideImagePromptBody {
  topic: string;
  slideText: string; // 이 슬라이드의 대본 라인들 합본
  slideIdx: number;
  totalSlides: number;
}

export async function POST(request: NextRequest) {
  let body: SlideImagePromptBody;
  try {
    body = (await request.json()) as SlideImagePromptBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const topic = (body.topic ?? '').trim();
  const slideText = (body.slideText ?? '').trim();
  const slideIdx = body.slideIdx ?? 0;
  const totalSlides = body.totalSlides ?? 0;

  if (!topic) return Response.json({ error: 'topic 필수' }, { status: 400 });
  if (!slideText) return Response.json({ error: 'slideText 필수' }, { status: 400 });

  const system = [
    '당신은 짱샘(아동 재활치료사) 유튜브 영상의 인포그래픽 슬라이드 디자이너입니다.',
    '대본의 한 슬라이드 내용을 받아서, 그것을 시각화할 인포그래픽 이미지 생성 프롬프트를 작성합니다.',
    '',
    '프롬프트 규칙:',
    '- 한국어 + 영어 키워드 혼용 가능 (이미지 모델이 양쪽 다 이해)',
    '- 16:9 가로 비율, 1920×1080 해상도 가정',
    '- 짱샘 영상 톤: 따뜻한 파스텔 (라벤더 #9B89B3, 코랄 #FFB5A7, 민트 #A8E6CF), 깨끗한 화이트 배경 또는 딥 오버진 #1A1530',
    '- 한국 부모 대상 — 한국 아동·가정 분위기',
    '- 인포그래픽 스타일: flat illustration, 친근하고 부드러운 라인, 작은 아이콘·숫자·라벨 활용',
    '- 한 슬라이드의 핵심 메시지 1개를 명확히 전달',
    '- 텍스트 오버레이는 최소화 (메인 카피 1줄까지만)',
    '',
    '출력 형식: 프롬프트 텍스트만 출력. 제목·설명·코드펜스 금지.',
  ].join('\n');

  const user = [
    `영상 주제: ${topic}`,
    `슬라이드 ${slideIdx + 1}/${totalSlides}`,
    '',
    '이 슬라이드의 대본:',
    '```',
    slideText,
    '```',
    '',
    '위 슬라이드를 시각화하는 인포그래픽 이미지 프롬프트를 한 단락으로 작성하세요.',
  ].join('\n');

  try {
    const prompt = await generate({ system, user, maxTokens: 800, temperature: 0.6 });
    return Response.json({ prompt: prompt.trim(), slideIdx });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'generate_failed', message }, { status: 500 });
  }
}
