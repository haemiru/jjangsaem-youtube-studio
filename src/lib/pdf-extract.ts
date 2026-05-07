const MAX_PAGES = 50;
const MAX_CHARS = 20_000;

let workerInitialized = false;

export interface PdfExtractResult {
  text: string;
  totalPages: number;
  extractedPages: number;
  truncated: boolean;
}

// pdfjs-dist는 브라우저 전용 객체(DOMMatrix 등)를 모듈 평가 시점에 참조하므로
// SSR에서 import하면 빌드가 깨진다. 함수 내부에서 동적 import로 로드한다.
export async function extractPdfText(file: File): Promise<PdfExtractResult> {
  if (typeof window === 'undefined') {
    throw new Error('extractPdfText는 브라우저에서만 호출할 수 있습니다');
  }

  const pdfjsLib = await import('pdfjs-dist');

  if (!workerInitialized) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    workerInitialized = true;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const totalPages = pdf.numPages;
  const extractedPages = Math.min(totalPages, MAX_PAGES);

  let fullText = '';
  for (let i = 1; i <= extractedPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    fullText += pageText + '\n';
    if (fullText.length >= MAX_CHARS) break;
  }

  const truncated = fullText.length > MAX_CHARS || totalPages > MAX_PAGES;
  const text = fullText.slice(0, MAX_CHARS).trim();

  return { text, totalPages, extractedPages, truncated };
}
