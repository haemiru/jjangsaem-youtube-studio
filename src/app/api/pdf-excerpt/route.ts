import type { NextRequest } from 'next/server';
import { summarizeForTopic } from '@/lib/pdf-summarize';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface Body {
  pdfText?: string;
  topic?: string;
  maxChars?: number;
}

const PDF_LIMIT = 25_000;

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const topic = (body.topic ?? '').trim();
  const pdfText =
    typeof body.pdfText === 'string' && body.pdfText.trim()
      ? body.pdfText.slice(0, PDF_LIMIT)
      : '';
  const maxChars = typeof body.maxChars === 'number' ? body.maxChars : 3_000;

  if (!topic) return Response.json({ error: '주제(topic) 필수' }, { status: 400 });
  if (!pdfText) return Response.json({ error: 'pdfText 필수' }, { status: 400 });

  try {
    const excerpt = await summarizeForTopic({ pdfText, topic, maxChars });
    return Response.json({ excerpt });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'summarize_failed', message }, { status: 500 });
  }
}
