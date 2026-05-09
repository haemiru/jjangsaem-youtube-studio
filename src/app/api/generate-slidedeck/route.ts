import type { NextRequest } from 'next/server';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  createSlideDeck,
  downloadSlideDeck,
  NotebookLMError,
} from '@/lib/notebooklm';
import { convertPdfToPngs } from '@/lib/pdf-to-png';

export const runtime = 'nodejs';
export const maxDuration = 600; // 슬라이드 생성 + 다운로드 + 변환

const SAFE_JOB_ID = /^[A-Za-z0-9_-]+$/;
const SAFE_NOTEBOOK_ID = /^[0-9a-fA-F-]{20,}$/;

interface GenerateSlideDeckBody {
  notebookId: string;
  jobId: string;
  focus?: string;
  length?: 'short' | 'default';
  language?: string;
  // 'create' false면 다운로드만 (이전에 생성된 덱이 있을 때)
  create?: boolean;
}

export async function POST(request: NextRequest) {
  let body: GenerateSlideDeckBody;
  try {
    body = (await request.json()) as GenerateSlideDeckBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const notebookId = (body.notebookId ?? '').trim();
  const jobId = (body.jobId ?? '').trim();
  const focus = body.focus?.trim() || undefined;
  const length = body.length;
  const language = body.language ?? 'ko';
  const create = body.create !== false;

  if (!notebookId || !SAFE_NOTEBOOK_ID.test(notebookId)) {
    return Response.json({ error: 'invalid notebookId' }, { status: 400 });
  }
  if (!jobId || !SAFE_JOB_ID.test(jobId)) {
    return Response.json({ error: 'invalid jobId' }, { status: 400 });
  }

  const slidesDir = path.join(process.cwd(), 'public', 'slides', jobId);
  const pdfPath = path.join(slidesDir, 'deck.pdf');

  try {
    await mkdir(slidesDir, { recursive: true });

    if (create) {
      // 1. NotebookLM에서 슬라이드 덱 생성 (서버 측에서 비동기 작업이 끝날 때까지 대기)
      await createSlideDeck(notebookId, {
        format: 'detailed_deck',
        length,
        language,
        focus,
        timeoutSec: 360,
      });
    }

    // 2. PDF로 다운로드
    await downloadSlideDeck(notebookId, pdfPath, { format: 'pdf', timeoutSec: 180 });

    // 3. 페이지별 PNG로 변환
    const result = await convertPdfToPngs({
      pdfPath,
      outDir: slidesDir,
      scale: 2,
      filenamePrefix: 'slide',
    });

    // 4. 응답에는 브라우저에서 접근 가능한 상대 URL로 변환
    const slides = result.outputs.map((o) => ({
      index: o.index,
      url: `/slides/${jobId}/${path.basename(o.pngPath)}`,
    }));

    // PDF는 더 이상 필요 없으니 삭제 (실패해도 무시)
    try {
      await unlink(pdfPath);
    } catch {
      // ignore
    }

    return Response.json({
      jobId,
      notebookId,
      pageCount: result.pageCount,
      slides,
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
