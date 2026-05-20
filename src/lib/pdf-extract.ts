const MAX_PAGES = 50;
const MAX_CHARS = 20_000;
const CHUNK_TARGET_CHARS = 3_000;

let workerInitialized = false;

export interface PdfChunk {
  title: string;
  text: string;
  pageStart: number;
  pageEnd: number;
}

export interface PdfExtractResult {
  text: string;
  chunks: PdfChunk[];
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
  const pageTexts: string[] = [];

  for (let i = 1; i <= extractedPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // 한국어 PDF는 글자가 1글자씩 별도 텍스트 item으로 분리돼 나오는 경우가 많아,
    // 구분자 ' '로 join하면 모든 글자 사이에 공백이 박혀 의미를 알아볼 수 없게 된다.
    // 실제 공백은 별도 item(str=' ')으로 들어오므로 빈 문자열로 이어붙이면 보존된다.
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join('');
    pageTexts.push(pageText);
    fullText += pageText + '\n';
    if (fullText.length >= MAX_CHARS) break;
  }

  const truncated = fullText.length > MAX_CHARS || totalPages > MAX_PAGES;
  const text = fullText.slice(0, MAX_CHARS).trim();

  // 페이지 단위로 누적해서 ~CHUNK_TARGET_CHARS 단위로 청크 구성.
  // NotebookLM 슬라이드 엔진은 단일 거대 소스보다 여러 작은 소스에서 더 안정적이다.
  const chunks: PdfChunk[] = [];
  let cur = '';
  let curStart = 1;
  let consumed = 0;
  for (let idx = 0; idx < pageTexts.length; idx++) {
    const pageIdx = idx + 1;
    let pageText = pageTexts[idx];
    // 전체 텍스트가 MAX_CHARS에서 잘리는 경계 페이지 처리
    if (consumed + pageText.length > MAX_CHARS) {
      pageText = pageText.slice(0, Math.max(0, MAX_CHARS - consumed));
    }
    consumed += pageText.length;
    if (!cur) curStart = pageIdx;
    cur += (cur ? '\n' : '') + pageText;
    const isLast = idx === pageTexts.length - 1 || consumed >= MAX_CHARS;
    if (cur.length >= CHUNK_TARGET_CHARS || isLast) {
      const trimmed = cur.trim();
      if (trimmed) {
        chunks.push({
          title: `p.${curStart}-${pageIdx}`,
          text: trimmed,
          pageStart: curStart,
          pageEnd: pageIdx,
        });
      }
      cur = '';
    }
    if (consumed >= MAX_CHARS) break;
  }

  return { text, chunks, totalPages, extractedPages, truncated };
}
