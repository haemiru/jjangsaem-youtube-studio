import type { NextRequest } from 'next/server';
import { generate } from '@/lib/anthropic';
import { parseScript } from '@/lib/script-parser';
import {
  buildLecturePrompt,
  buildLectureCritiquePrompt,
  parseLectureScript,
} from '@/lib/lecture-prompts';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface LectureScriptsBody {
  topic: string;
  script: string; // 기존 TTS 대본 (## 슬라이드 N 헤더 포함)
  scriptMode?: 'dialogue' | 'solo';
  research?: string;
}

const SCRIPT_LIMIT = 30_000;
const RESEARCH_LIMIT = 10_000;

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

  try {
    // 1차 — 강의 대본 생성
    const { system: system1, user: user1 } = buildLecturePrompt({
      topic,
      parsed,
      research,
    });
    const draft = await generate({
      system: system1,
      user: user1,
      maxTokens: 8000,
    });

    // 2차 — 자체 검토·수정 (호칭 남발 / AI 티 / 슬라이드 정합 / 어려운 용어)
    const { system: system2, user: user2 } = buildLectureCritiquePrompt({
      topic,
      parsed,
      draft,
    });
    const revised = await generate({
      system: system2,
      user: user2,
      maxTokens: 8000,
    });

    const byIdx = parseLectureScript(revised);
    const filled: Record<number, string> = {};
    for (let i = 0; i < parsed.slideCount; i++) {
      filled[i] = byIdx[i] ?? '';
    }
    return Response.json({
      slideCount: parsed.slideCount,
      scripts: filled,
      // 디버깅용 — 1차 초안도 같이 반환 (UI에선 안 보여줌)
      draft,
      revised,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'generate_failed', message }, { status: 500 });
  }
}
