import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const NLM_BIN = process.env.NLM_BIN ?? 'nlm';

export class NotebookLMError extends Error {
  code: 'auth_expired' | 'not_installed' | 'parse_error' | 'cli_error' | 'timeout';
  stderr?: string;
  stdout?: string;
  constructor(
    code: NotebookLMError['code'],
    message: string,
    extra?: { stderr?: string; stdout?: string }
  ) {
    super(message);
    this.code = code;
    this.stderr = extra?.stderr;
    this.stdout = extra?.stdout;
  }
}

interface RunOptions {
  timeoutMs?: number;
  maxBuffer?: number;
}

async function runNlm(args: string[], opts: RunOptions = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxBuffer = opts.maxBuffer ?? 16 * 1024 * 1024;

  try {
    const { stdout } = await execFileP(NLM_BIN, args, {
      timeout: timeoutMs,
      maxBuffer,
      windowsHide: true,
    });
    return stdout;
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      killed?: boolean;
      signal?: string | null;
    };

    const stderr = e.stderr ? String(e.stderr) : '';
    const stdout = e.stdout ? String(e.stdout) : '';

    if (e.code === 'ENOENT') {
      throw new NotebookLMError(
        'not_installed',
        `nlm CLI를 찾을 수 없습니다. (${NLM_BIN}가 PATH에 있는지, 또는 NLM_BIN 환경변수로 절대경로 지정 가능)`
      );
    }
    if (e.killed && e.signal === 'SIGTERM') {
      throw new NotebookLMError('timeout', `nlm 명령이 ${timeoutMs}ms 안에 끝나지 않았습니다.`);
    }
    if (
      stderr.includes('Authentication') ||
      stderr.includes('login') ||
      stdout.includes('Authentication')
    ) {
      throw new NotebookLMError(
        'auth_expired',
        'NotebookLM 인증이 만료되었습니다. 터미널에서 `nlm login` 실행 후 다시 시도하세요.',
        { stderr, stdout }
      );
    }
    throw new NotebookLMError(
      'cli_error',
      `nlm 실행 실패: ${e.message || 'unknown'}`,
      { stderr, stdout }
    );
  }
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const startArr = trimmed.indexOf('[');
    const firstJson =
      start === -1 ? startArr : startArr === -1 ? start : Math.min(start, startArr);
    if (firstJson === -1) {
      throw new NotebookLMError('parse_error', 'nlm JSON 응답을 파싱할 수 없습니다.', {
        stdout: trimmed.slice(0, 500),
      });
    }
    try {
      return JSON.parse(trimmed.slice(firstJson));
    } catch {
      throw new NotebookLMError('parse_error', 'nlm JSON 응답을 파싱할 수 없습니다.', {
        stdout: trimmed.slice(0, 500),
      });
    }
  }
}

export interface Notebook {
  id: string;
  title: string;
  raw: Record<string, unknown>;
}

export async function listNotebooks(): Promise<Notebook[]> {
  const stdout = await runNlm(['list', 'notebooks', '--json'], { timeoutMs: 30_000 });
  const parsed = tryParseJson(stdout);
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { notebooks?: unknown }).notebooks)
      ? ((parsed as { notebooks: unknown[] }).notebooks)
      : null;

  if (!arr) {
    throw new NotebookLMError('parse_error', 'notebook list 응답이 배열 형태가 아닙니다.', {
      stdout: JSON.stringify(parsed).slice(0, 500),
    });
  }

  return arr
    .map((n) => {
      const obj = (n ?? {}) as Record<string, unknown>;
      const id =
        (obj.id as string | undefined) ??
        (obj.notebook_id as string | undefined) ??
        (obj.project_id as string | undefined) ??
        '';
      const title =
        (obj.title as string | undefined) ??
        (obj.name as string | undefined) ??
        '(제목 없음)';
      return { id, title, raw: obj };
    })
    .filter((n) => n.id);
}

export interface NotebookQueryResult {
  answer: string;
  citations?: unknown;
  raw: unknown;
}

function extractIdFromStdout(stdout: string): string | null {
  const m = stdout.match(/ID:\s*([0-9a-fA-F-]{20,})/);
  return m ? m[1].trim() : null;
}

export async function createNotebook(title: string): Promise<string> {
  const stdout = await runNlm(['notebook', 'create', title], { timeoutMs: 60_000 });
  const id = extractIdFromStdout(stdout);
  if (!id) {
    throw new NotebookLMError(
      'parse_error',
      'notebook create 응답에서 노트북 ID를 찾을 수 없습니다.',
      { stdout: stdout.slice(0, 500) }
    );
  }
  return id;
}

export async function addTextSource(
  notebookId: string,
  text: string,
  sourceTitle: string,
  options: { timeoutSec?: number } = {}
): Promise<string> {
  const timeoutSec = options.timeoutSec ?? 180;
  const stdout = await runNlm(
    ['source', 'add', notebookId, '--text', text, '--title', sourceTitle, '--wait'],
    { timeoutMs: (timeoutSec + 30) * 1000 }
  );
  const id = extractIdFromStdout(stdout);
  if (!id) {
    throw new NotebookLMError(
      'parse_error',
      'source add 응답에서 소스 ID를 찾을 수 없습니다.',
      { stdout: stdout.slice(0, 500) }
    );
  }
  return id;
}

export async function startResearchAutoImport(
  query: string,
  notebookTitle: string,
  options: { mode?: 'fast' | 'deep'; timeoutSec?: number } = {}
): Promise<string> {
  const mode = options.mode ?? 'fast';
  const timeoutSec = options.timeoutSec ?? (mode === 'fast' ? 180 : 600);
  const stdout = await runNlm(
    [
      'research',
      'start',
      query,
      '--title',
      notebookTitle,
      '--mode',
      mode,
      '--auto-import',
    ],
    { timeoutMs: (timeoutSec + 30) * 1000 }
  );
  const id = extractIdFromStdout(stdout);
  if (!id) {
    throw new NotebookLMError(
      'parse_error',
      'research start 응답에서 노트북 ID를 찾을 수 없습니다.',
      { stdout: stdout.slice(0, 800) }
    );
  }
  return id;
}

export interface CreateSlideDeckOptions {
  format?: 'detailed_deck' | 'presenter_slides';
  length?: 'short' | 'default';
  language?: string;
  focus?: string;
  timeoutSec?: number;
}

export async function createSlideDeck(
  notebookId: string,
  options: CreateSlideDeckOptions = {}
): Promise<string> {
  const timeoutSec = options.timeoutSec ?? 300;
  const args = ['slides', 'create', notebookId, '--confirm'];
  if (options.format) args.push('--format', options.format);
  if (options.length) args.push('--length', options.length);
  if (options.language) args.push('--language', options.language);
  if (options.focus) args.push('--focus', options.focus);
  return runNlm(args, { timeoutMs: (timeoutSec + 30) * 1000 });
}

export async function downloadSlideDeck(
  notebookId: string,
  outputPath: string,
  options: { format?: 'pdf' | 'pptx'; timeoutSec?: number } = {}
): Promise<string> {
  const timeoutSec = options.timeoutSec ?? 180;
  const format = options.format ?? 'pdf';
  return runNlm(
    [
      'download',
      'slide-deck',
      notebookId,
      '--output',
      outputPath,
      '--format',
      format,
      '--no-progress',
    ],
    { timeoutMs: (timeoutSec + 30) * 1000 }
  );
}

export async function queryNotebook(
  notebookId: string,
  question: string,
  options: { timeoutSec?: number } = {}
): Promise<NotebookQueryResult> {
  const timeoutSec = options.timeoutSec ?? 120;
  const stdout = await runNlm(
    [
      'notebook',
      'query',
      notebookId,
      question,
      '--json',
      '--timeout',
      String(timeoutSec),
    ],
    { timeoutMs: (timeoutSec + 30) * 1000 }
  );

  const top = tryParseJson(stdout) as Record<string, unknown>;
  // nlm CLI 신버전은 응답을 { value: { answer, citations, references, ... } } 로 래핑
  const inner =
    top.value && typeof top.value === 'object' && !Array.isArray(top.value)
      ? (top.value as Record<string, unknown>)
      : top;

  const answer =
    (inner.answer as string | undefined) ??
    (inner.response as string | undefined) ??
    (inner.text as string | undefined) ??
    (inner.message as string | undefined) ??
    '';

  if (!answer || typeof answer !== 'string') {
    throw new NotebookLMError(
      'parse_error',
      'nlm 응답에서 답변 텍스트를 찾을 수 없습니다. (raw 응답 키: ' +
        Object.keys(top).join(',') +
        (top !== inner ? ' / inner: ' + Object.keys(inner).join(',') : '') +
        ')',
      { stdout: JSON.stringify(top).slice(0, 800) }
    );
  }

  return {
    answer: answer.trim(),
    citations:
      inner.citations ?? inner.references ?? inner.sources ?? inner.sources_used,
    raw: top,
  };
}
