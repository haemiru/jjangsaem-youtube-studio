import type { NextRequest } from 'next/server';
import { generate } from '@/lib/anthropic';
import { buildPrompt, type ScriptMode, type ParentGender } from '@/lib/script-prompts';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface GenerateScriptBody {
  topic: string;
  mode: ScriptMode;
  parentGender?: ParentGender;
  targetMinutes?: number;
  pdfText?: string;
  research?: string;
}

const PDF_TEXT_LIMIT = 25_000;
const RESEARCH_TEXT_LIMIT = 15_000;

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
  const targetMinutes = body.targetMinutes ?? 6;
  const pdfText =
    typeof body.pdfText === 'string' && body.pdfText.trim()
      ? body.pdfText.slice(0, PDF_TEXT_LIMIT)
      : undefined;
  const research =
    typeof body.research === 'string' && body.research.trim()
      ? body.research.slice(0, RESEARCH_TEXT_LIMIT)
      : undefined;

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
  if (typeof targetMinutes !== 'number' || targetMinutes < 1 || targetMinutes > 30) {
    return Response.json({ error: 'targetMinutes는 1~30 사이' }, { status: 400 });
  }

  try {
    const { system, user } = buildPrompt({
      topic,
      mode,
      parentGender,
      targetMinutes,
      pdfText,
      research,
    });
    const script = await generate({ system, user, maxTokens: 4096, temperature: 0.9 });
    return Response.json({
      script,
      mode,
      targetMinutes,
      usedPdf: Boolean(pdfText),
      usedResearch: Boolean(research),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'generate_failed', message }, { status: 500 });
  }
}
