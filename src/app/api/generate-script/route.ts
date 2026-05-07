import type { NextRequest } from 'next/server';
import { generate } from '@/lib/anthropic';
import { buildPrompt, type ScriptMode, type ParentGender } from '@/lib/script-prompts';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface GenerateScriptBody {
  topic: string;
  mode: ScriptMode;
  parentGender?: ParentGender;
  slideCount?: number;
}

export async function POST(request: NextRequest) {
  let body: GenerateScriptBody;
  try {
    body = (await request.json()) as GenerateScriptBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const topic = (body.topic ?? '').trim();
  const mode = body.mode;
  const parentGender = body.parentGender;
  const slideCount = body.slideCount ?? 6;

  if (!topic) {
    return Response.json({ error: '주제(topic)가 비어있습니다' }, { status: 400 });
  }
  if (mode !== 'dialogue' && mode !== 'solo') {
    return Response.json({ error: 'mode는 dialogue 또는 solo' }, { status: 400 });
  }
  if (mode === 'dialogue' && parentGender !== 'mom' && parentGender !== 'dad') {
    return Response.json(
      { error: 'dialogue 모드에는 parentGender(mom|dad) 필수' },
      { status: 400 }
    );
  }
  if (typeof slideCount !== 'number' || slideCount < 1 || slideCount > 20) {
    return Response.json({ error: 'slideCount는 1~20 사이' }, { status: 400 });
  }

  try {
    const { system, user } = buildPrompt({ topic, mode, parentGender, slideCount });
    const script = await generate({ system, user, maxTokens: 4096, temperature: 0.9 });
    return Response.json({ script, mode, slideCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'generate_failed', message }, { status: 500 });
  }
}
