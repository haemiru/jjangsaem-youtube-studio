import type { NextRequest } from 'next/server';
import { queryNotebook, NotebookLMError } from '@/lib/notebooklm';

export const runtime = 'nodejs';
export const maxDuration = 180;

type ScriptMode = 'dialogue' | 'solo';

interface ResearchBody {
  topic: string;
  mode: ScriptMode;
  notebookId: string;
  slideCount?: number;
}

function buildResearchQuestion(topic: string, mode: ScriptMode, slideCount: number): string {
  const audience =
    mode === 'dialogue'
      ? '한국 부모를 위한 짱샘(25년차 아동 재활치료사) 유튜브 영상 — 부모 ↔ 짱샘 대화 형식'
      : '한국 부모를 위한 짱샘(25년차 아동 재활치료사) 유튜브 1인 설명 영상';

  return [
    `다음 영상을 만들 거야. 자료 안에서만 근거를 가져와줘.`,
    ``,
    `대상: ${audience}`,
    `주제: ${topic}`,
    `슬라이드 수: ${slideCount}개`,
    ``,
    `이 주제에 대해 자료에서 다음을 정리해줘:`,
    `1. 핵심 메시지 3~5개 (부모가 꼭 알아야 할 사실)`,
    `2. 부모가 흔히 하는 오해 또는 걱정 2~3개`,
    `3. 짱샘이 권하는 구체적 실천법 3~5개 (각 1~2문장)`,
    `4. 인용할 만한 표현·비유·짧은 사례 (자료의 어휘 그대로 살릴 것)`,
    `5. 자료에 명시적으로 나오지 않는 부분이 있으면 "자료에 없음" 으로 표시`,
    ``,
    `한국어로, 마크다운 헤딩(## 1. 핵심 메시지 ...)으로 정리.`,
    `자료에 없는 일반적인 의학·교육 상식은 절대 추가하지 말 것.`,
  ].join('\n');
}

export async function POST(request: NextRequest) {
  let body: ResearchBody;
  try {
    body = (await request.json()) as ResearchBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const topic = (body.topic ?? '').trim();
  const mode = body.mode;
  const notebookId = (body.notebookId ?? '').trim();
  const slideCount = body.slideCount ?? 6;

  if (!topic) {
    return Response.json({ error: '주제(topic)가 비어있습니다' }, { status: 400 });
  }
  if (mode !== 'dialogue' && mode !== 'solo') {
    return Response.json({ error: 'mode는 dialogue 또는 solo' }, { status: 400 });
  }
  if (!notebookId) {
    return Response.json({ error: 'notebookId 필수' }, { status: 400 });
  }

  const question = buildResearchQuestion(topic, mode, slideCount);

  try {
    const result = await queryNotebook(notebookId, question, { timeoutSec: 150 });
    return Response.json({
      findings: result.answer,
      citations: result.citations ?? null,
      notebookId,
      question,
    });
  } catch (err) {
    if (err instanceof NotebookLMError) {
      return Response.json(
        {
          error: err.code,
          message: err.message,
          stderr: err.stderr,
          stdout: err.stdout,
        },
        { status: err.code === 'auth_expired' ? 401 : 500 }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'unknown', message }, { status: 500 });
  }
}
