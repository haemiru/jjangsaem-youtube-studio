import type { NextRequest } from 'next/server';
import { generate } from '@/lib/anthropic';
import { buildThumbnailPrompt, parseThumbnailResult } from '@/lib/thumbnail-prompts';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface Body {
  topic?: string;
  lectureScripts?: Record<string, string>;
  research?: string;
}

const RESEARCH_LIMIT = 10_000;

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const topic = (body.topic ?? '').trim();
  if (!topic) return Response.json({ error: '주제(topic) 필수' }, { status: 400 });

  const rawScripts = body.lectureScripts ?? {};
  const lectureScripts: Record<number, string> = {};
  let hasContent = false;
  for (const [k, v] of Object.entries(rawScripts)) {
    const idx = Number(k);
    if (Number.isFinite(idx) && typeof v === 'string' && v.trim()) {
      lectureScripts[idx] = v.trim();
      hasContent = true;
    }
  }
  if (!hasContent) {
    return Response.json(
      { error: '강의 대본이 비어 있습니다. 6번을 먼저 생성하세요.' },
      { status: 400 }
    );
  }

  const research =
    typeof body.research === 'string' && body.research.trim()
      ? body.research.slice(0, RESEARCH_LIMIT)
      : undefined;

  const { system, user } = buildThumbnailPrompt({
    topic,
    lectureScripts,
    research,
  });

  try {
    // 5개 이미지 프롬프트(~500자) + 5개 헤드라인 → 넉넉히 6000 토큰
    const raw = await generate({ system, user, maxTokens: 6000 });
    const result = parseThumbnailResult(raw);
    if (
      result.visuals.length === 0 &&
      result.infographics.length === 0 &&
      result.headlines.length === 0
    ) {
      return Response.json(
        { error: 'parse_failed', message: '응답을 JSON으로 파싱하지 못했습니다.', raw },
        { status: 500 }
      );
    }
    return Response.json({ ...result, raw });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'generate_failed', message }, { status: 500 });
  }
}
