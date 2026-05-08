import type { NextRequest } from 'next/server';
import { startRenderJob, getJob } from '@/lib/render-jobs';
import type { Deck } from '../../../../remotion/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const SAFE_JOB_ID = /^[A-Za-z0-9_-]+$/;

interface RenderRequestBody {
  jobId: string;
  deck: Deck;
}

function validateDeck(deck: unknown): deck is Deck {
  if (!deck || typeof deck !== 'object') return false;
  const d = deck as Record<string, unknown>;
  if (typeof d.topic !== 'string') return false;
  if (!Array.isArray(d.slides) || d.slides.length === 0) return false;
  return true;
}

export async function POST(request: NextRequest) {
  let body: RenderRequestBody;
  try {
    body = (await request.json()) as RenderRequestBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (typeof body.jobId !== 'string' || !SAFE_JOB_ID.test(body.jobId)) {
    return Response.json({ error: 'invalid jobId' }, { status: 400 });
  }
  if (!validateDeck(body.deck)) {
    return Response.json({ error: 'invalid deck' }, { status: 400 });
  }

  const job = startRenderJob(body.jobId, body.deck);
  return Response.json({ job });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  if (!jobId || !SAFE_JOB_ID.test(jobId)) {
    return Response.json({ error: 'invalid jobId' }, { status: 400 });
  }
  const job = getJob(jobId);
  if (!job) {
    return Response.json({ error: 'job not found' }, { status: 404 });
  }
  return Response.json({ job });
}
