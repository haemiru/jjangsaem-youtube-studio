import type { NextRequest } from 'next/server';
import { generate } from '@/lib/anthropic';
import { buildThumbnailPrompt } from '@/lib/thumbnail-prompts';

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
    const prompt = await generate({ system, user, maxTokens: 2000 });
    return Response.json({ prompt: prompt.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'generate_failed', message }, { status: 500 });
  }
}
