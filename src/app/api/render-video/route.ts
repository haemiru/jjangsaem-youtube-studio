import type { NextRequest } from 'next/server';
import path from 'node:path';
import { startRenderJob, getJob } from '@/lib/render-jobs';
import type { RenderInputSlide } from '@/lib/ffmpeg-render';

export const runtime = 'nodejs';
export const maxDuration = 600;

const SAFE_JOB_ID = /^[A-Za-z0-9_-]+$/;

interface SlidePayload {
  slideIdx: number;
  imageUrl: string; // /slides/<jobId>/slide-NNN.png 또는 사용자 업로드 파일
  audioUrls: string[]; // /audio/<jobId>/line-NNN.mp3 (또는 .wav)
}

interface RenderRequestBody {
  jobId: string;
  slides: SlidePayload[];
}

function urlToFsPath(url: string): string | null {
  // 보안: /slides/ 또는 /audio/ 또는 /videos/ 로 시작하고 .. 미포함만 허용
  if (!url.startsWith('/slides/') && !url.startsWith('/audio/')) return null;
  // 쿼리 스트링 제거 (캐시버스터)
  const clean = url.split('?')[0];
  if (clean.includes('..')) return null;
  return path.join(process.cwd(), 'public', clean.replace(/\//g, path.sep));
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
  if (!Array.isArray(body.slides) || body.slides.length === 0) {
    return Response.json({ error: 'slides 배열 필수 (최소 1개)' }, { status: 400 });
  }

  const slides: RenderInputSlide[] = [];
  for (const s of body.slides) {
    if (
      typeof s.slideIdx !== 'number' ||
      !Number.isInteger(s.slideIdx) ||
      s.slideIdx < 0
    ) {
      return Response.json(
        { error: `invalid slideIdx: ${s.slideIdx}` },
        { status: 400 }
      );
    }
    const imagePath = urlToFsPath(s.imageUrl);
    if (!imagePath) {
      return Response.json(
        { error: `invalid imageUrl for slide ${s.slideIdx + 1}` },
        { status: 400 }
      );
    }
    if (!Array.isArray(s.audioUrls) || s.audioUrls.length === 0) {
      return Response.json(
        { error: `슬라이드 ${s.slideIdx + 1}의 audioUrls 비어있음` },
        { status: 400 }
      );
    }
    const audioPaths: string[] = [];
    for (const a of s.audioUrls) {
      const p = urlToFsPath(a);
      if (!p) {
        return Response.json(
          { error: `invalid audioUrl: ${a}` },
          { status: 400 }
        );
      }
      audioPaths.push(p);
    }
    slides.push({ slideIdx: s.slideIdx, imagePath, audioPaths });
  }

  const job = startRenderJob(body.jobId, slides);
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
