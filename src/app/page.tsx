'use client';

import { useMemo, useRef, useState } from 'react';
import { parseScript } from '@/lib/script-parser';
import { validateScript } from '@/lib/script-validator';
import { extractPdfText, type PdfExtractResult } from '@/lib/pdf-extract';

const SAMPLE_DIALOGUE = `## 슬라이드 1
[부모] 선생님 우리 아이가요, 막 정신없이 뛰어다니다가 갑자기 멍하니 서 있어요. 저 진짜 너무 걱정돼서 잠도 못 자요.
[짱샘] 어머님 마음 잘 알아요. 그게 보통은요, 아이가 자기 몸을 아직 충분히 못 느껴서 그래요. 25년 동안 보면서 정말 자주 듣는 얘기예요.
[부모] 아! 그래서였구나... 우리 아이가 자기 몸을 못 느낀다고요?
[짱샘] 그쵸. 사실은 감각 통합이 아직 자리잡지 않아서 그래요. 어머님 잘하고 계세요.

## 슬라이드 2
[부모] 근데 선생님, 그럼 제가 뭘 해줘야 해요? 막 답답하고 속상해요.
[짱샘] 한 가지만 더 말씀드리면요, 매일 10분씩 같이 천천히 걷는 것만 해도 큰 도움이 돼요.
[부모] 진짜요? 우리 아이가 딱 그래요, 가만히 못 있고. 아! 그게 그 이유였어요?
[짱샘] 알고 보면 단순한 거예요. 어머님 너무 자책하지 마세요. 그럴 수 있어요.
`;

const SAMPLE_SOLO = `## 슬라이드 1
[짱샘] 어머님들, 오늘은 자폐 아이의 잠 못 드는 밤 얘기를 해볼게요.
[짱샘] 25년 동안 정말 자주 들은 고민이거든요.
[짱샘] 한 가지만 기억하시면 됩니다.

## 슬라이드 2
[짱샘] 그게 보통은요, 아이가 자기 몸을 충분히 못 느껴서 그래요.
[짱샘] 감각 통합이 아직 자리잡지 않은 거예요.
[짱샘] 어렵게 들리지만, 사실은 단순합니다.

## 슬라이드 3
[짱샘] 어머님 너무 자책하지 마세요.
[짱샘] 잘하고 계세요. 그럴 수 있어요.
`;

type ParentGender = 'mom' | 'dad';
type ScriptMode = 'dialogue' | 'solo';

type LineAudioStatus = 'pending' | 'synthesizing' | 'done' | 'error';

interface LineAudio {
  status: LineAudioStatus;
  audioUrl?: string;
  sizeBytes?: number;
  audioLengthSec?: number | null;
  error?: string;
}

function newJobId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export default function Home() {
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<ScriptMode>('dialogue');
  const [parentGender, setParentGender] = useState<ParentGender>('mom');
  const [slideCount, setSlideCount] = useState(6);
  const [script, setScript] = useState(SAMPLE_DIALOGUE);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfExtract, setPdfExtract] = useState<PdfExtractResult | null>(null);
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [validateOn, setValidateOn] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [audioByLine, setAudioByLine] = useState<Record<number, LineAudio>>({});
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthError, setSynthError] = useState<string | null>(null);
  const blobUrlsRef = useRef<string[]>([]);

  const parsed = useMemo(() => parseScript(script), [script]);
  const validation = useMemo(() => validateScript(parsed, mode), [parsed, mode]);

  function handleModeChange(next: ScriptMode) {
    setMode(next);
    setValidateOn(false);
    setScript(next === 'solo' ? SAMPLE_SOLO : SAMPLE_DIALOGUE);
  }

  async function handlePdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfError(null);
    setPdfExtract(null);
    setPdfFileName(file.name);
    setExtractingPdf(true);
    try {
      const result = await extractPdfText(file);
      setPdfExtract(result);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : String(err));
      setPdfFileName(null);
    } finally {
      setExtractingPdf(false);
    }
  }

  function handleClearPdf() {
    setPdfFileName(null);
    setPdfExtract(null);
    setPdfError(null);
  }

  async function handleGenerate() {
    if (!topic.trim() || generating) return;
    setGenError(null);
    setGenerating(true);
    setValidateOn(false);
    try {
      const res = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          mode,
          parentGender: mode === 'dialogue' ? parentGender : undefined,
          slideCount,
          pdfText: pdfExtract?.text,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data?.message || data?.error || `HTTP ${res.status}`);
        return;
      }
      setScript(String(data.script ?? ''));
    } catch (err) {
      setGenError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  const canSynthesize =
    parsed.lines.length > 0 &&
    parsed.errors.length === 0 &&
    parsed.lines.every((l) => l.text.length <= 300);

  async function handleSynthesizeAll() {
    if (!canSynthesize || synthesizing) return;

    for (const url of blobUrlsRef.current) URL.revokeObjectURL(url);
    blobUrlsRef.current = [];

    const id = newJobId();
    setJobId(id);
    setSynthError(null);
    setSynthesizing(true);

    const initial: Record<number, LineAudio> = {};
    parsed.lines.forEach((_, i) => (initial[i] = { status: 'pending' }));
    setAudioByLine(initial);

    try {
      for (let i = 0; i < parsed.lines.length; i++) {
        const line = parsed.lines[i];
        setAudioByLine((prev) => ({ ...prev, [i]: { status: 'synthesizing' } }));
        try {
          const res = await fetch('/api/synthesize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId: id,
              lineIdx: i,
              speaker: line.speaker,
              parentGender,
              text: line.text,
              style: line.style,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            const detail = data?.raw || data?.message || data?.error || `HTTP ${res.status}`;
            setAudioByLine((prev) => ({ ...prev, [i]: { status: 'error', error: detail } }));
            continue;
          }
          const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: data.contentType ?? 'audio/mpeg' });
          const url = URL.createObjectURL(blob);
          blobUrlsRef.current.push(url);
          setAudioByLine((prev) => ({
            ...prev,
            [i]: {
              status: 'done',
              audioUrl: url,
              sizeBytes: data.sizeBytes,
              audioLengthSec: data.audioLengthSec,
            },
          }));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setAudioByLine((prev) => ({ ...prev, [i]: { status: 'error', error: message } }));
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSynthError(message);
    } finally {
      setSynthesizing(false);
    }
  }

  const doneCount = Object.values(audioByLine).filter((a) => a.status === 'done').length;
  const errorCount = Object.values(audioByLine).filter((a) => a.status === 'error').length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 font-sans text-zinc-900 dark:text-zinc-100">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">짱샘 유튜브 스튜디오</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          영상 주제 → 리서치 → 대본 → 슬라이드 → 음성 → MP4 자동 생성
        </p>
      </header>

      <section className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <h2 className="mb-3 text-sm font-semibold">1. 영상 정보</h2>
        <label className="block text-xs font-medium mb-1">영상 주제</label>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="예: 자폐 아이의 잠 못 드는 밤"
          className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
        />

        <div className="mt-3">
          <span className="text-xs font-medium mr-3">대본 형식</span>
          <label className="mr-4 text-sm">
            <input
              type="radio"
              checked={mode === 'dialogue'}
              onChange={() => handleModeChange('dialogue')}
              className="mr-1"
            />
            대화 (부모 ↔ 짱샘)
          </label>
          <label className="text-sm">
            <input
              type="radio"
              checked={mode === 'solo'}
              onChange={() => handleModeChange('solo')}
              className="mr-1"
            />
            1인 설명 (짱샘 단독)
          </label>
        </div>

        <div className={`mt-3 ${mode === 'solo' ? 'opacity-40' : ''}`}>
          <span className="text-xs font-medium mr-3">호스트(부모) 화자</span>
          <label className="mr-4 text-sm">
            <input
              type="radio"
              checked={parentGender === 'mom'}
              onChange={() => setParentGender('mom')}
              disabled={mode === 'solo'}
              className="mr-1"
            />
            엄마
          </label>
          <label className="text-sm">
            <input
              type="radio"
              checked={parentGender === 'dad'}
              onChange={() => setParentGender('dad')}
              disabled={mode === 'solo'}
              className="mr-1"
            />
            아빠
          </label>
        </div>

        <div className="mt-4 rounded border border-dashed border-zinc-300 dark:border-zinc-700 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-medium">참고 PDF (선택) — 짱샘 책방 전자책</span>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                업로드하면 책 본문을 1차 자료로 삼아 대본 생성. 첫 50페이지 / 20,000자까지 추출.
              </p>
            </div>
            {pdfFileName && (
              <button
                onClick={handleClearPdf}
                className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                제거
              </button>
            )}
          </div>
          <input
            type="file"
            accept="application/pdf"
            onChange={handlePdfChange}
            disabled={extractingPdf}
            className="mt-2 block w-full text-xs file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-200 dark:hover:file:bg-zinc-700"
          />
          {extractingPdf && (
            <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
              PDF 텍스트 추출 중...
            </p>
          )}
          {pdfError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{pdfError}</p>
          )}
          {pdfExtract && pdfFileName && (
            <p className="mt-2 text-xs text-green-700 dark:text-green-400">
              ✓ {pdfFileName} — {pdfExtract.extractedPages}/{pdfExtract.totalPages}페이지,{' '}
              {pdfExtract.text.length.toLocaleString()}자 추출
              {pdfExtract.truncated && ' (잘림)'}
            </p>
          )}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <label className="text-xs font-medium">슬라이드 수</label>
          <input
            type="number"
            min={1}
            max={20}
            value={slideCount}
            onChange={(e) => setSlideCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            className="w-20 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-sm"
          />
          <button
            onClick={handleGenerate}
            disabled={!topic.trim() || generating || extractingPdf}
            className="ml-auto rounded bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500 disabled:bg-zinc-400 disabled:cursor-not-allowed"
          >
            {generating
              ? 'Claude 생성 중...'
              : pdfExtract
                ? '대본 생성 (PDF 기반)'
                : '대본 생성 (Claude Opus 4.7)'}
          </button>
        </div>

        {genError && (
          <div className="mt-3 rounded bg-red-50 dark:bg-red-950 p-3 text-xs text-red-800 dark:text-red-200">
            {genError}
          </div>
        )}
      </section>

      <section className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <h2 className="mb-3 text-sm font-semibold">
          2. 대본 입력
          <span className="ml-2 text-xs font-normal text-zinc-500">
            (형식: <code>## 슬라이드 N</code> 헤더 + <code>[부모]</code>/<code>[짱샘]</code> 라벨)
          </span>
        </h2>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={18}
          className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 font-mono text-sm leading-6"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => setValidateOn(true)}
            className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
          >
            검수
          </button>
          <span className="text-xs text-zinc-500">
            슬라이드 {parsed.slideCount}개 / 라인 {parsed.lines.length}개
          </span>
        </div>
      </section>

      {validateOn && (
        <section className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
          <h2 className="mb-3 text-sm font-semibold">
            3. 자연스러움 {validation.totalCount}장치 검수
            <span className="ml-2 text-xs font-normal text-zinc-500">
              ({mode === 'solo' ? '1인 설명용' : '대화용'})
            </span>
            <span
              className={`ml-2 inline-block rounded px-2 py-0.5 text-xs ${
                validation.recommended
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100'
              }`}
            >
              {validation.passedCount}/{validation.totalCount} 통과{' '}
              {validation.recommended
                ? '✓'
                : `— ${mode === 'solo' ? '2' : '4'}개 이상 필요`}
            </span>
          </h2>

          {parsed.errors.length > 0 && (
            <div className="mb-3 rounded bg-red-50 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-200">
              <strong>파싱 에러:</strong>
              <ul className="ml-4 list-disc">
                {parsed.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          {parsed.warnings.length > 0 && (
            <div className="mb-3 rounded bg-amber-50 dark:bg-amber-950 p-3 text-xs text-amber-800 dark:text-amber-200">
              <strong>경고:</strong>
              <ul className="ml-4 list-disc">
                {parsed.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <ul className="space-y-2">
            {validation.devices.map((d) => (
              <li
                key={d.id}
                className={`rounded border p-3 text-sm ${
                  d.passed
                    ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950'
                    : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'
                }`}
              >
                <div className="font-medium">
                  {d.passed ? '✓' : '✗'} 장치 {d.id}: {d.name}
                </div>
                <div className="text-xs mt-1 text-zinc-600 dark:text-zinc-400">{d.detail}</div>
              </li>
            ))}
          </ul>

          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-zinc-600 dark:text-zinc-400">
              파싱된 라인 보기 ({parsed.lines.length}개)
            </summary>
            <div className="mt-2 max-h-80 overflow-auto rounded bg-zinc-50 dark:bg-zinc-900 p-2 text-xs font-mono">
              {parsed.lines.map((l, i) => (
                <div key={i} className="py-0.5">
                  <span className="text-zinc-500">[S{l.slideIdx + 1}]</span>{' '}
                  <span className={l.speaker === 'jjangsaem' ? 'text-blue-600' : 'text-pink-600'}>
                    {l.speaker === 'jjangsaem' ? '짱샘' : `부모(${mode === 'solo' ? '–' : parentGender === 'mom' ? '엄마' : '아빠'})`}
                  </span>
                  {l.style && <span className="text-zinc-400"> ({l.style})</span>}
                  : {l.text}
                </div>
              ))}
            </div>
          </details>
        </section>
      )}

      <section className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <h2 className="mb-3 text-sm font-semibold">
          4. 음성 합성
          {jobId && (
            <span className="ml-2 text-xs font-normal text-zinc-500">job: {jobId}</span>
          )}
        </h2>

        <div className="mb-3 flex items-center gap-3">
          <button
            onClick={handleSynthesizeAll}
            disabled={!canSynthesize || synthesizing}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:bg-zinc-400 disabled:cursor-not-allowed"
          >
            {synthesizing ? '합성 중...' : '전체 합성'}
          </button>
          <span className="text-xs text-zinc-500">
            {parsed.lines.length}줄 — 한 줄씩 순차 호출 (Supertone)
          </span>
          {Object.keys(audioByLine).length > 0 && (
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              완료 {doneCount}/{parsed.lines.length}
              {errorCount > 0 && (
                <span className="ml-2 text-red-600">실패 {errorCount}</span>
              )}
            </span>
          )}
        </div>

        {!canSynthesize && parsed.lines.length > 0 && (
          <div className="mb-3 rounded bg-amber-50 dark:bg-amber-950 p-3 text-xs text-amber-800 dark:text-amber-200">
            파싱 에러나 300자 초과 라인이 있어 합성을 시작할 수 없습니다. 위 검수 패널을
            확인해주세요.
          </div>
        )}

        {synthError && (
          <div className="mb-3 rounded bg-red-50 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-200">
            {synthError}
          </div>
        )}

        {Object.keys(audioByLine).length > 0 && (
          <ul className="space-y-2">
            {parsed.lines.map((l, i) => {
              const a = audioByLine[i];
              const speakerLabel =
                l.speaker === 'jjangsaem'
                  ? '짱샘'
                  : `부모(${mode === 'solo' ? '–' : parentGender === 'mom' ? '엄마' : '아빠'})`;
              return (
                <li
                  key={i}
                  className="rounded border border-zinc-200 dark:border-zinc-800 p-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 font-mono">
                      {String(i).padStart(3, '0')}
                    </span>
                    <span
                      className={
                        l.speaker === 'jjangsaem' ? 'text-blue-600' : 'text-pink-600'
                      }
                    >
                      {speakerLabel}
                    </span>
                    <span className="text-zinc-500">[S{l.slideIdx + 1}]</span>
                    <StatusBadge status={a?.status ?? 'pending'} />
                    {a?.audioLengthSec != null && (
                      <span className="text-zinc-500">{a.audioLengthSec.toFixed(2)}s</span>
                    )}
                    {a?.sizeBytes != null && (
                      <span className="text-zinc-500">
                        {(a.sizeBytes / 1024).toFixed(1)} KB
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-zinc-700 dark:text-zinc-300">{l.text}</div>
                  {a?.audioUrl && (
                    <audio
                      controls
                      src={a.audioUrl}
                      className="mt-2 w-full"
                      preload="none"
                    />
                  )}
                  {a?.error && (
                    <div className="mt-2 rounded bg-red-50 dark:bg-red-950 p-2 text-red-800 dark:text-red-200">
                      {a.error}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: LineAudioStatus }) {
  const map: Record<LineAudioStatus, { label: string; cls: string }> = {
    pending: { label: '대기', cls: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
    synthesizing: {
      label: '합성중',
      cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
    },
    done: {
      label: '완료',
      cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
    },
    error: { label: '실패', cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' },
  };
  const { label, cls } = map[status];
  return <span className={`rounded px-1.5 py-0.5 ${cls}`}>{label}</span>;
}
