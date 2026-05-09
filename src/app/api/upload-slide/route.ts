import type { NextRequest } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SAFE_JOB_ID = /^[A-Za-z0-9_-]+$/;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 20 * 1024 * 1024; // 20MB

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const jobId = String(form.get('jobId') ?? '').trim();
  const slideIdxStr = String(form.get('slideIdx') ?? '').trim();
  const file = form.get('file') as File | null;

  if (!jobId || !SAFE_JOB_ID.test(jobId)) {
    return Response.json({ error: 'invalid jobId' }, { status: 400 });
  }
  const slideIdx = Number(slideIdxStr);
  if (!Number.isInteger(slideIdx) || slideIdx < 0 || slideIdx > 999) {
    return Response.json({ error: 'invalid slideIdx' }, { status: 400 });
  }
  if (!file) {
    return Response.json({ error: 'file 필수' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json(
      { error: `허용되지 않은 파일 형식: ${file.type}` },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `파일 크기 초과: ${file.size} > ${MAX_BYTES}` },
      { status: 400 }
    );
  }

  const dir = path.join(process.cwd(), 'public', 'slides', jobId);
  await mkdir(dir, { recursive: true });

  // 항상 png로 통일 저장 (브라우저에서 미리 변환되지 않은 경우 그대로 유지)
  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png';
  const fileName = `slide-${String(slideIdx + 1).padStart(3, '0')}-custom.${ext}`;
  const fullPath = path.join(dir, fileName);
  const arrayBuffer = await file.arrayBuffer();
  await writeFile(fullPath, Buffer.from(arrayBuffer));

  return Response.json({
    jobId,
    slideIdx,
    url: `/slides/${jobId}/${fileName}`,
    sizeBytes: file.size,
    contentType: file.type,
  });
}
