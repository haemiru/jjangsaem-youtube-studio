import type { NextRequest } from 'next/server';
import { generate } from '@/lib/anthropic';
import { parseScript } from '@/lib/script-parser';
import { buildLecturePrompt, parseLectureScript } from '@/lib/lecture-prompts';

export const runtime = 'nodejs';
export const maxDuration = 180;

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
    const { system, user } = buildLecturePrompt({
      topic,
      parsed,
      research,
    });
    const raw = await generate({ system, user, maxTokens: 8000, temperature: 0.7 });
    const byIdx = parseLectureScript(raw);
    const filled: Record<number, string> = {};
    for (let i = 0; i < parsed.slideCount; i++) {
      filled[i] = byIdx[i] ?? '';
    }
    return Response.json({
      slideCount: parsed.slideCount,
      scripts: filled,
      raw,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'generate_failed', message }, { status: 500 });
  }
}
