import type { NextRequest } from 'next/server';
import { generate } from '@/lib/anthropic';
import {
  buildUploadMetaPrompt,
  parseUploadMetaJSON,
  applyChannelLinksPostProcess,
} from '@/lib/upload-meta-prompts';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface Body {
  topic?: string;
  lectureScripts?: Record<string, string>;
  research?: string;
  audience?: string;
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

  const audience =
    typeof body.audience === 'string' && body.audience.trim()
      ? body.audience.trim()
      : undefined;

  const { system, user } = buildUploadMetaPrompt({
    topic,
    lectureScripts,
    research,
    audience,
  });

  try {
    const raw = await generate({ system, user, maxTokens: 8000 });
    const parsed = parseUploadMetaJSON(raw);
    if (!parsed?.title?.text || !parsed?.description?.text || !Array.isArray(parsed?.tags?.list)) {
      throw new Error('JSON 구조 검증 실패 (title.text / description.text / tags.list 필요)');
    }
    const finalMeta = applyChannelLinksPostProcess(parsed);
    return Response.json({ meta: finalMeta, raw });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'generate_failed', message }, { status: 500 });
  }
}
