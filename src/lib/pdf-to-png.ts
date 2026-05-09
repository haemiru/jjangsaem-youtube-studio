import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * 서버 사이드 PDF → 페이지별 PNG 변환.
 * pdf-to-img는 동적 import로 로드 (Next.js 빌드 시 SSR 분석에서 빠지도록).
 */
export interface PdfToPngOptions {
  pdfPath: string;
  outDir: string;
  scale?: number; // 1 = 기본, 2 = 2x 해상도
  filenamePrefix?: string; // default: 'slide'
}

export interface PdfToPngResult {
  pageCount: number;
  outputs: { index: number; pngPath: string; relUrl: string }[];
}

export async function convertPdfToPngs(opts: PdfToPngOptions): Promise<PdfToPngResult> {
  const { pdfPath, outDir, scale = 2, filenamePrefix = 'slide' } = opts;
  await mkdir(outDir, { recursive: true });

  const { pdf } = await import('pdf-to-img');

  const document = await pdf(pdfPath, { scale });
  const outputs: PdfToPngResult['outputs'] = [];

  let i = 1;
  for await (const png of document) {
    const fileName = `${filenamePrefix}-${String(i).padStart(3, '0')}.png`;
    const fullPath = path.join(outDir, fileName);
    await writeFile(fullPath, png);
    outputs.push({
      index: i - 1,
      pngPath: fullPath,
      relUrl: '', // 호출 측에서 채움
    });
    i += 1;
  }

  return {
    pageCount: outputs.length,
    outputs,
  };
}
