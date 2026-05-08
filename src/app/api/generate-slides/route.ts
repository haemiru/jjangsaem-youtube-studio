import type { NextRequest } from 'next/server';
import { generate } from '@/lib/anthropic';
import { buildSlidePrompt } from '@/lib/slide-prompts';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface GenerateSlidesBody {
  topic: string;
  script: string;
  research?: string;
}

const SCRIPT_LIMIT = 30_000;
const RESEARCH_LIMIT = 5_000;

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

export async function POST(request: NextRequest) {
  let body: GenerateSlidesBody;
  try {
    body = (await request.json()) as GenerateSlidesBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const topic = (body.topic ?? '').trim();
  const script = (body.script ?? '').trim().slice(0, SCRIPT_LIMIT);
  const research =
    typeof body.research === 'string' && body.research.trim()
      ? body.research.slice(0, RESEARCH_LIMIT)
      : undefined;

  if (!topic) {
    return Response.json({ error: '주제(topic) 필수' }, { status: 400 });
  }
  if (!script) {
    return Response.json({ error: '대본(script) 필수' }, { status: 400 });
  }

  try {
    const { system, user } = buildSlidePrompt({ topic, script, research });
    const raw = await generate({ system, user, maxTokens: 4096, temperature: 0.6 });
    const jsonText = extractJsonObject(raw);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseErr) {
      return Response.json(
        {
          error: 'parse_failed',
          message: parseErr instanceof Error ? parseErr.message : String(parseErr),
          raw: raw.slice(0, 1000),
        },
        { status: 500 }
      );
    }

    const obj = parsed as { topic?: string; slides?: unknown };
    if (!Array.isArray(obj.slides) || obj.slides.length === 0) {
      return Response.json(
        { error: 'invalid_shape', message: 'slides 배열이 비어있거나 누락', raw: jsonText.slice(0, 1000) },
        { status: 500 }
      );
    }

    return Response.json({
      deck: { topic: obj.topic ?? topic, slides: obj.slides },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'generate_failed', message }, { status: 500 });
  }
}
