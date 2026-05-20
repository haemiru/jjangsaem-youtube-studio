import type { NextRequest } from 'next/server';
import {
  queryNotebook,
  createNotebook,
  addTextSource,
  startResearchAutoImport,
  NotebookLMError,
} from '@/lib/notebooklm';

export const runtime = 'nodejs';
// research start --auto-import (fast mode) ≈ 30~60s, query ≈ 60~120s.
// PDF chunks 업로드는 청크당 ~10초 × 최대 20개 → 여유롭게 8분.
export const maxDuration = 480;

type ScriptMode = 'dialogue' | 'solo';

interface ResearchBody {
  topic: string;
  mode: ScriptMode;
  notebookId?: string;
  targetMinutes?: number;
  pdfText?: string;
  pdfChunks?: { title: string; text: string }[];
  pdfFileName?: string;
}

const PDF_TEXT_LIMIT = 50_000;
const PDF_CHUNK_TEXT_LIMIT = 8_000;
const PDF_MAX_CHUNKS = 20;
// NotebookLM API rejects very long queries with INVALID_ARGUMENT.
// 안전 마진을 두고 topic을 자른다. (1500자면 한국어 기준 약 1~2분 분량)
const TOPIC_MAX_CHARS = 1500;
// `nlm research start`(웹 리서치) 엔드포인트는 query에 더 엄격한 길이 한도가 있다.
// 검색어 형태가 자연스러우려면 200~400자 권장.
const RESEARCH_START_QUERY_MAX_CHARS = 400;

function buildResearchQuestion(topic: string, mode: ScriptMode, targetMinutes: number): string {
  const audience =
    mode === 'dialogue'
      ? '한국 부모를 위한 짱샘(25년차 아동 재활치료사) 유튜브 영상 — 부모 ↔ 짱샘 대화 형식'
      : '한국 부모를 위한 짱샘(25년차 아동 재활치료사) 유튜브 1인 설명 영상';

  return [
    `다음 영상을 만들 거야. 자료 안에서만 근거를 가져와줘.`,
    ``,
    `대상: ${audience}`,
    `주제: ${topic}`,
    `목표 길이: 약 ${targetMinutes}분`,
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

function buildAutoNotebookTitle(topic: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // NotebookLM titles can be long but keep it readable
  const t = topic.length > 50 ? topic.slice(0, 50) + '…' : topic;
  return `[자동] ${t} (${date})`;
}

export async function POST(request: NextRequest) {
  let body: ResearchBody;
  try {
    body = (await request.json()) as ResearchBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const rawTopic = (body.topic ?? '').trim();
  const topicTruncated = rawTopic.length > TOPIC_MAX_CHARS;
  const topic = topicTruncated ? rawTopic.slice(0, TOPIC_MAX_CHARS) : rawTopic;
  const mode = body.mode;
  const notebookId = (body.notebookId ?? '').trim();
  const targetMinutes = body.targetMinutes ?? 6;
  const pdfText =
    typeof body.pdfText === 'string' && body.pdfText.trim()
      ? body.pdfText.slice(0, PDF_TEXT_LIMIT)
      : undefined;
  const pdfChunks = Array.isArray(body.pdfChunks)
    ? body.pdfChunks
        .filter(
          (c): c is { title: string; text: string } =>
            !!c &&
            typeof c.title === 'string' &&
            typeof c.text === 'string' &&
            c.text.trim().length > 0
        )
        .slice(0, PDF_MAX_CHUNKS)
        .map((c) => ({
          title: c.title.trim().slice(0, 200) || 'chunk',
          text: c.text.slice(0, PDF_CHUNK_TEXT_LIMIT),
        }))
    : undefined;
  const pdfFileName = (body.pdfFileName ?? '').trim() || undefined;

  if (!topic) {
    return Response.json({ error: '주제(topic)가 비어있습니다' }, { status: 400 });
  }

  if (mode !== 'dialogue' && mode !== 'solo') {
    return Response.json({ error: 'mode는 dialogue 또는 solo' }, { status: 400 });
  }

  const question = buildResearchQuestion(topic, mode, targetMinutes);

  try {
    let resolvedNotebookId = notebookId;
    let createdNotebook: { id: string; title: string; via: 'pdf' | 'research' } | null = null;

    if (!resolvedNotebookId) {
      const title = buildAutoNotebookTitle(topic);

      if (pdfChunks && pdfChunks.length > 0) {
        // Case 1.1 — PDF 청크로 분할된 경우: 청크당 1개 소스로 업로드 (NotebookLM 슬라이드 안정성↑)
        const newId = await createNotebook(title);
        const base = pdfFileName ?? 'PDF';
        for (const c of pdfChunks) {
          const srcTitle = `${base} ${c.title}`.slice(0, 240);
          await addTextSource(newId, c.text, srcTitle, { timeoutSec: 240 });
        }
        resolvedNotebookId = newId;
        createdNotebook = { id: newId, title, via: 'pdf' };
      } else if (pdfText) {
        // Case 1.2 — PDF 단일 텍스트 (구버전 호환) → 새 노트북 + 단일 소스
        const newId = await createNotebook(title);
        const sourceTitle = pdfFileName ? `${pdfFileName} (PDF 텍스트)` : 'PDF 텍스트';
        await addTextSource(newId, pdfText, sourceTitle, { timeoutSec: 240 });
        resolvedNotebookId = newId;
        createdNotebook = { id: newId, title, via: 'pdf' };
      } else {
        // Case 2.2 — 주제만 있고 노트북 미선택 → research start --auto-import
        // 웹 리서치 query는 검색어 형태여야 하므로 더 짧게 자른다.
        const researchQuery =
          topic.length > RESEARCH_START_QUERY_MAX_CHARS
            ? topic.slice(0, RESEARCH_START_QUERY_MAX_CHARS)
            : topic;
        const newId = await startResearchAutoImport(researchQuery, title, {
          mode: 'fast',
          timeoutSec: 240,
        });
        resolvedNotebookId = newId;
        createdNotebook = { id: newId, title, via: 'research' };
      }
    }

    const result = await queryNotebook(resolvedNotebookId, question, { timeoutSec: 150 });
    return Response.json({
      findings: result.answer,
      citations: result.citations ?? null,
      notebookId: resolvedNotebookId,
      createdNotebook,
      question,
      topicTruncated: topicTruncated
        ? { originalLength: rawTopic.length, truncatedTo: TOPIC_MAX_CHARS }
        : null,
    });
  } catch (err) {
    const topicTruncatedInfo = topicTruncated
      ? { originalLength: rawTopic.length, truncatedTo: TOPIC_MAX_CHARS }
      : null;
    if (err instanceof NotebookLMError) {
      return Response.json(
        {
          error: err.code,
          message: err.message,
          stderr: err.stderr,
          stdout: err.stdout,
          topicTruncated: topicTruncatedInfo,
        },
        { status: err.code === 'auth_expired' ? 401 : 500 }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: 'unknown', message, topicTruncated: topicTruncatedInfo },
      { status: 500 }
    );
  }
}
