import type { NextRequest } from 'next/server';
import { mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  createSlideDeck,
  downloadSlideDeck,
  listArtifacts,
  waitForSlideDeckReady,
  NotebookLMError,
} from '@/lib/notebooklm';
import { convertPdfToPngs } from '@/lib/pdf-to-png';

export const runtime = 'nodejs';
// 슬라이드 생성은 NotebookLM 측에서 10~15분까지도 걸린다.
// + PDF 다운로드 + PNG 변환 여유 포함.
// Vercel Pro 플랜 상한이 800초이므로 그 안에서 가능한 한 길게 잡는다.
export const maxDuration = 800;

const SAFE_JOB_ID = /^[A-Za-z0-9_-]+$/;
const SAFE_NOTEBOOK_ID = /^[0-9a-fA-F-]{20,}$/;
// NotebookLM slide-deck focus(custom_instructions)는 너무 길면 서버가 UserDisplayableError(code 8)로 거절한다.
// 실측상 500자도 거절될 때가 있어 300자로 더 보수적으로 잡는다.
const FOCUS_MAX_CHARS = 300;

interface GenerateSlideDeckBody {
  notebookId: string;
  jobId: string;
  focus?: string;
  length?: 'short' | 'default';
  language?: string;
  // 'create' false면 다운로드만 (이전에 생성된 덱이 있을 때)
  create?: boolean;
  // 'useExisting' true면 NotebookLM 호출 없이 디스크의 slide-*.png를 그대로 응답
  useExisting?: boolean;
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
  const rawFocus = body.focus?.trim() || '';
  const focusTruncated = rawFocus.length > FOCUS_MAX_CHARS;
  const focus = rawFocus
    ? focusTruncated
      ? rawFocus.slice(0, FOCUS_MAX_CHARS)
      : rawFocus
    : undefined;
  const length = body.length;
  const language = body.language ?? 'ko';
  const create = body.create !== false;
  const useExisting = body.useExisting === true;

  if (!jobId || !SAFE_JOB_ID.test(jobId)) {
    return Response.json({ error: 'invalid jobId' }, { status: 400 });
  }
  // useExisting 모드에서는 notebookId 없어도 OK (디스크만 본다)
  if (!useExisting && (!notebookId || !SAFE_NOTEBOOK_ID.test(notebookId))) {
    return Response.json({ error: 'invalid notebookId' }, { status: 400 });
  }

  const slidesDir = path.join(process.cwd(), 'public', 'slides', jobId);
  const pdfPath = path.join(slidesDir, 'deck.pdf');

  try {
    await mkdir(slidesDir, { recursive: true });

    if (useExisting) {
      const entries = await readdir(slidesDir).catch(() => [] as string[]);
      const pngs = entries
        .filter((f) => /^slide-\d+\.png$/i.test(f))
        .sort();
      if (pngs.length === 0) {
        return Response.json(
          { error: 'no_existing_slides', message: `${slidesDir} 에 slide-*.png 가 없습니다.` },
          { status: 404 }
        );
      }
      const slides = pngs.map((f, i) => ({
        index: i,
        url: `/slides/${jobId}/${f}`,
      }));
      return Response.json({
        jobId,
        notebookId: notebookId || null,
        pageCount: slides.length,
        slides,
        reused: true,
      });
    }

    if (create) {
      // 이미 in_progress 슬라이드 덱이 있으면 새로 만들지 않고 그걸 기다린다.
      const existing = await listArtifacts(notebookId).catch(() => []);
      const hasPending = existing.some(
        (a) =>
          a.type === 'slide_deck' &&
          !['ready', 'complete', 'completed', 'success', 'failed', 'error'].includes(
            a.status.toLowerCase()
          )
      );
      if (!hasPending) {
        // 1. NotebookLM 슬라이드 덱 생성 작업 시작 (CLI는 즉시 반환)
        await createSlideDeck(notebookId, {
          format: 'detailed_deck',
          length,
          language,
          focus,
          timeoutSec: 60,
        });
      }
    }

    // 2. 슬라이드 덱 artifact가 ready 상태가 될 때까지 폴링
    await waitForSlideDeckReady(notebookId, { timeoutSec: 780, pollIntervalMs: 5000 });

    // 3. PDF로 다운로드
    await downloadSlideDeck(notebookId, pdfPath, { format: 'pdf', timeoutSec: 180 });

    // 4. 페이지별 PNG로 변환
    const result = await convertPdfToPngs({
      pdfPath,
      outDir: slidesDir,
      scale: 2,
      filenamePrefix: 'slide',
    });

    // 5. 응답에는 브라우저에서 접근 가능한 상대 URL로 변환
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
      focusTruncated: focusTruncated
        ? { originalLength: rawFocus.length, truncatedTo: FOCUS_MAX_CHARS }
        : null,
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
