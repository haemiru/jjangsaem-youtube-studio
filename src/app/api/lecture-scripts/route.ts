import type { NextRequest } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { generate, generateWithImages, type SlideImage } from '@/lib/anthropic';
import { parseScript } from '@/lib/script-parser';
import {
  buildLecturePrompt,
  buildLectureCritiquePrompt,
  parseLectureScript,
} from '@/lib/lecture-prompts';

export const runtime = 'nodejs';
export const maxDuration = 600;

interface LectureScriptsBody {
  topic: string;
  script: string; // 기존 TTS 대본 (## 슬라이드 N 헤더 포함)
  scriptMode?: 'dialogue' | 'solo';
  research?: string;
  /** {slideIdx: imageUrl} — 5번 섹션의 slideImages map 그대로 */
  slideImages?: Record<string, string>;
}

const SCRIPT_LIMIT = 30_000;
const RESEARCH_LIMIT = 10_000;

function urlToFsPath(url: string): string | null {
  if (!url.startsWith('/slides/')) return null;
  const clean = url.split('?')[0];
  if (clean.includes('..')) return null;
  return path.join(process.cwd(), 'public', clean.replace(/\//g, path.sep));
}

function detectMediaType(p: string): SlideImage['mediaType'] {
  const lower = p.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

async function loadSlideImages(
  slideImages: Record<string, string> | undefined,
  slideCount: number
): Promise<SlideImage[]> {
  if (!slideImages) return [];
  const out: SlideImage[] = [];
  for (let i = 0; i < slideCount; i++) {
    const url = slideImages[String(i)] ?? slideImages[i as unknown as string];
    if (!url) continue;
    const fsPath = urlToFsPath(url);
    if (!fsPath) continue;
    try {
      const data = await readFile(fsPath);
      out.push({ idx: i, data, mediaType: detectMediaType(fsPath) });
    } catch {
      // 파일 없으면 건너뜀 — 모델이 컨텍스트 없이 진행
    }
  }
  return out;
}

export async function POST(request: NextRequest) {
  let body: LectureScriptsBody;
  try {
    body = (await request.json()) as LectureScriptsBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const topic = (body.topic ?? '').trim();
  const script = (body.script ?? '').trim().slice(0, SCRIPT_LIMIT);
  const scriptMode = body.scriptMode === 'solo' ? 'solo' : 'dialogue';
  const research =
    typeof body.research === 'string' && body.research.trim()
      ? body.research.slice(0, RESEARCH_LIMIT)
      : undefined;

  if (!topic) return Response.json({ error: '주제(topic) 필수' }, { status: 400 });
  if (!script) return Response.json({ error: '대본(script) 필수' }, { status: 400 });

  const parsed = parseScript(script, scriptMode);
  if (parsed.slideCount === 0) {
    return Response.json(
      { error: '대본에서 슬라이드를 찾을 수 없습니다. ## 슬라이드 N 헤더를 확인하세요.' },
      { status: 400 }
    );
  }

  // 슬라이드 이미지 로드 (있으면 vision으로, 없으면 텍스트만)
  const slides = await loadSlideImages(body.slideImages, parsed.slideCount);
  const useVision = slides.length > 0;

  try {
    // 1차 — 강의 대본 생성
    const { system: system1, user: user1 } = buildLecturePrompt({
      topic,
      parsed,
      research,
    });
    const draft = useVision
      ? await generateWithImages({
          system: system1,
          user: user1,
          slides,
          maxTokens: 8000,
        })
      : await generate({ system: system1, user: user1, maxTokens: 8000 });

    // 2차 — 자체 검토·수정 (호칭 남발 / AI 티 / 슬라이드 정합 / 어려운 용어)
    const { system: system2, user: user2 } = buildLectureCritiquePrompt({
      topic,
      parsed,
      draft,
    });
    const revised = useVision
      ? await generateWithImages({
          system: system2,
          user: user2,
          slides,
          maxTokens: 8000,
        })
      : await generate({ system: system2, user: user2, maxTokens: 8000 });

    const byIdx = parseLectureScript(revised);
    const filled: Record<number, string> = {};
    for (let i = 0; i < parsed.slideCount; i++) {
      filled[i] = byIdx[i] ?? '';
    }
    return Response.json({
      slideCount: parsed.slideCount,
      scripts: filled,
      usedVision: useVision,
      slideImagesLoaded: slides.length,
      draft,
      revised,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'generate_failed', message }, { status: 500 });
  }
}
