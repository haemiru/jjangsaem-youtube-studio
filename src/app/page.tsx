'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { parseScript } from '@/lib/script-parser';
import { validateScript } from '@/lib/script-validator';
import { extractPdfText, type PdfExtractResult } from '@/lib/pdf-extract';
import { buildPrompt as buildScriptPrompt } from '@/lib/script-prompts';
import {
  buildLecturePrompt,
  parseLectureScript,
} from '@/lib/lecture-prompts';
import { buildThumbnailPrompt } from '@/lib/thumbnail-prompts';
import { GEMINI_VOICES, GEMINI_DEFAULT_VOICE } from '@/lib/gemini-voices';

type TTSProvider = 'supertone' | 'gemini';

const LS_GEMINI_KEY = 'jjangsaem.gemini.apiKey';
const LS_GEMINI_VOICES = 'jjangsaem.gemini.voices';
const LS_TTS_PROVIDER = 'jjangsaem.tts.provider';

interface NotebookOption {
  id: string;
  title: string;
}

const PLACEHOLDER_DIALOGUE = `## 슬라이드 1
[부모] 선생님, 우리 아이가요...
[짱샘] 어머님 마음 잘 알아요. 그게 보통은요...

## 슬라이드 2
[부모] 그럼 제가 뭘 해줘야 해요?
[짱샘] 한 가지만 기억하시면 돼요.`;

const PLACEHOLDER_SOLO = `## 슬라이드 1
어머님들, 오늘은 ... 얘기를 해볼게요.
한 가지만 기억하시면 됩니다.

## 슬라이드 2
그게 보통은요...
어머님 잘하고 계세요.`;

type ParentGender = 'mom' | 'dad';
type ScriptMode = 'dialogue' | 'solo';

type LineAudioStatus = 'pending' | 'synthesizing' | 'done' | 'error';

interface LineAudio {
  status: LineAudioStatus;
  audioUrl?: string;        // blob: URL for browser playback
  staticUrl?: string;       // /audio/<jobId>/line-NNN.mp3 — for renderer
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
  const [targetMinutes, setTargetMinutes] = useState(6);
  const [script, setScript] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfExtract, setPdfExtract] = useState<PdfExtractResult | null>(null);
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [notebooks, setNotebooks] = useState<NotebookOption[]>([]);
  const [notebooksLoading, setNotebooksLoading] = useState(false);
  const [notebooksError, setNotebooksError] = useState<string | null>(null);
  const [notebookId, setNotebookId] = useState<string>('');
  const [research, setResearch] = useState('');
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [autoNotebook, setAutoNotebook] = useState<{
    id: string;
    title: string;
    via: 'pdf' | 'research';
  } | null>(null);
  const [validateOn, setValidateOn] = useState(false);
  const [scriptUseApi, setScriptUseApi] = useState(true);
  const [scriptPrompt, setScriptPrompt] = useState<{ system: string; user: string } | null>(null);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [audioByLine, setAudioByLine] = useState<Record<number, LineAudio>>({});
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthError, setSynthError] = useState<string | null>(null);
  const blobUrlsRef = useRef<string[]>([]);

  // Phase B — 슬라이드 이미지 (NotebookLM 자동 / 수동 업로드 / Claude 프롬프트)
  const [slideImages, setSlideImages] = useState<Record<number, string>>({});
  const [slidedeckLoading, setSlidedeckLoading] = useState(false);
  const [slidedeckError, setSlidedeckError] = useState<string | null>(null);
  const [slidedeckInfo, setSlidedeckInfo] = useState<{
    pageCount: number;
    notebookId: string;
  } | null>(null);
  const [imagePromptByIdx, setImagePromptByIdx] = useState<Record<number, string>>({});
  const [imagePromptLoadingIdx, setImagePromptLoadingIdx] = useState<number | null>(null);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);

  // 직접 녹음용 강의 대본 (PowerPoint + OBS 흐름용)
  const [lectureUseApi, setLectureUseApi] = useState(true);
  const [lectureScripts, setLectureScripts] = useState<Record<number, string>>({});
  const [lectureGenerating, setLectureGenerating] = useState(false);
  const [lectureError, setLectureError] = useState<string | null>(null);
  const [lecturePrompt, setLecturePrompt] = useState<{
    system: string;
    user: string;
  } | null>(null);
  const [lecturePromptCopied, setLecturePromptCopied] = useState(false);
  const [lectureManualPaste, setLectureManualPaste] = useState('');

  // 7번 — 썸네일 프롬프트 (Google Flow용)
  const [thumbnailUseApi, setThumbnailUseApi] = useState(true);
  const [thumbnailGenerating, setThumbnailGenerating] = useState(false);
  const [thumbnailError, setThumbnailError] = useState('');
  const [thumbnailResult, setThumbnailResult] = useState(''); // Flow에 붙여넣을 최종 한국어 프롬프트
  const [thumbnailResultCopied, setThumbnailResultCopied] = useState(false);
  const [thumbnailManualPrompt, setThumbnailManualPrompt] = useState<{
    system: string;
    user: string;
  } | null>(null);
  const [thumbnailManualCopied, setThumbnailManualCopied] = useState(false);
  const [forceShowTTS, setForceShowTTS] = useState(false);

  // 강의 대본을 받으면(=녹음 흐름) TTS·MP4 섹션 자동 숨김
  const hasLectureScripts = useMemo(
    () => Object.values(lectureScripts).some((s) => s && s.trim().length > 10),
    [lectureScripts]
  );
  const showTTSSections = !hasLectureScripts || forceShowTTS;

  // Phase C — ffmpeg MP4 렌더 잡 폴링
  type RenderStatus =
    | 'idle'
    | 'queued'
    | 'audio_concat'
    | 'segment_render'
    | 'final_concat'
    | 'done'
    | 'error';
  interface RenderState {
    status: RenderStatus;
    progress: number;
    currentSlide?: number;
    totalSlides?: number;
    outputUrl?: string;
    error?: string;
  }
  const [renderState, setRenderState] = useState<RenderState>({
    status: 'idle',
    progress: 0,
  });
  const renderPollRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (renderPollRef.current) window.clearInterval(renderPollRef.current);
    };
  }, []);

  // Phase A — Gemini TTS 설정 (localStorage 영속)
  // SSR/client 일치를 위해 기본값으로 시작하고, 마운트 후 useEffect에서 localStorage 읽음.
  const [ttsProvider, setTtsProvider] = useState<TTSProvider>('supertone');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiKeyVisible, setGeminiKeyVisible] = useState(false);
  const [geminiVoiceJjangsaem, setGeminiVoiceJjangsaem] = useState<string>(
    GEMINI_DEFAULT_VOICE.jjangsaem
  );
  const [geminiVoiceMom, setGeminiVoiceMom] = useState<string>(GEMINI_DEFAULT_VOICE.mom);
  const [geminiVoiceDad, setGeminiVoiceDad] = useState<string>(GEMINI_DEFAULT_VOICE.dad);
  const [tssHydrated, setTssHydrated] = useState(false);

  useEffect(() => {
    // 마운트 후 localStorage에서 한번에 hydrate (SSR mismatch 회피)
    try {
      const provider = window.localStorage.getItem(LS_TTS_PROVIDER);
      if (provider === 'gemini' || provider === 'supertone') {
        setTtsProvider(provider);
      }
      const key = window.localStorage.getItem(LS_GEMINI_KEY);
      if (key) setGeminiApiKey(key);
      const voicesJson = window.localStorage.getItem(LS_GEMINI_VOICES);
      if (voicesJson) {
        const v = JSON.parse(voicesJson) as {
          jjangsaem?: string;
          mom?: string;
          dad?: string;
        };
        if (v?.jjangsaem) setGeminiVoiceJjangsaem(v.jjangsaem);
        if (v?.mom) setGeminiVoiceMom(v.mom);
        if (v?.dad) setGeminiVoiceDad(v.dad);
      }
    } catch {
      // ignore
    }
    setTssHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!tssHydrated) return; // hydrate 전엔 default를 localStorage에 덮어쓰지 말 것
    window.localStorage.setItem(LS_TTS_PROVIDER, ttsProvider);
  }, [ttsProvider, tssHydrated]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!tssHydrated) return;
    if (geminiApiKey) window.localStorage.setItem(LS_GEMINI_KEY, geminiApiKey);
    else window.localStorage.removeItem(LS_GEMINI_KEY);
  }, [geminiApiKey, tssHydrated]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!tssHydrated) return;
    window.localStorage.setItem(
      LS_GEMINI_VOICES,
      JSON.stringify({
        jjangsaem: geminiVoiceJjangsaem,
        mom: geminiVoiceMom,
        dad: geminiVoiceDad,
      })
    );
  }, [geminiVoiceJjangsaem, geminiVoiceMom, geminiVoiceDad, tssHydrated]);

  const parsed = useMemo(() => parseScript(script, mode), [script, mode]);
  const validation = useMemo(() => validateScript(parsed, mode), [parsed, mode]);

  useEffect(() => {
    let cancelled = false;
    async function loadNotebooks() {
      setNotebooksLoading(true);
      setNotebooksError(null);
      try {
        const res = await fetch('/api/notebooks');
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setNotebooksError(data?.message || data?.error || `HTTP ${res.status}`);
          return;
        }
        const list: NotebookOption[] = (data.notebooks ?? []).map(
          (n: { id: string; title: string }) => ({ id: n.id, title: n.title })
        );
        setNotebooks(list);
      } catch (err) {
        if (!cancelled) setNotebooksError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setNotebooksLoading(false);
      }
    }
    loadNotebooks();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleResearch() {
    if (!topic.trim() || researching) return;
    setResearchError(null);
    setResearching(true);
    setAutoNotebook(null);
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          mode,
          notebookId: notebookId || undefined,
          targetMinutes,
          pdfText: !notebookId && pdfExtract?.text ? pdfExtract.text : undefined,
          pdfFileName: !notebookId && pdfFileName ? pdfFileName : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResearchError(data?.message || data?.error || `HTTP ${res.status}`);
        return;
      }
      setResearch(String(data.findings ?? ''));
      if (data.createdNotebook) {
        setAutoNotebook(data.createdNotebook);
        // 새로 만든 노트북을 노트북 목록에 추가하고 선택
        const created = data.createdNotebook as { id: string; title: string };
        setNotebooks((prev) => {
          if (prev.some((n) => n.id === created.id)) return prev;
          return [{ id: created.id, title: created.title }, ...prev];
        });
        setNotebookId(created.id);
      }
    } catch (err) {
      setResearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setResearching(false);
    }
  }

  function handleModeChange(next: ScriptMode) {
    setMode(next);
    setValidateOn(false);
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

  function buildScriptPromptForManual() {
    if (!topic.trim()) return;
    const { system, user } = buildScriptPrompt({
      topic: topic.trim(),
      mode,
      parentGender: mode === 'dialogue' ? parentGender : undefined,
      targetMinutes,
      pdfText: pdfExtract?.text,
      research: research.trim() || undefined,
    });
    setScriptPrompt({ system, user });
    setScriptCopied(false);
  }

  function ensureJobId(): string {
    if (jobId) return jobId;
    const id = newJobId();
    setJobId(id);
    return id;
  }

  // Phase B — NotebookLM 슬라이드 덱 자동 생성
  async function handleGenerateSlideDeck() {
    if (!notebookId) {
      setSlidedeckError('노트북을 먼저 선택해야 합니다 (2번 섹션).');
      return;
    }
    setSlidedeckError(null);
    setSlidedeckLoading(true);
    const id = ensureJobId();
    try {
      const res = await fetch('/api/generate-slidedeck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notebookId,
          jobId: id,
          focus: topic.trim() || undefined,
          length: 'default',
          language: 'ko',
          create: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSlidedeckError(data?.message || data?.error || `HTTP ${res.status}`);
        return;
      }
      const next: Record<number, string> = {};
      const arr = data.slides as { index: number; url: string }[];
      arr.forEach((s) => {
        next[s.index] = s.url;
      });
      setSlideImages(next);
      setSlidedeckInfo({ pageCount: data.pageCount, notebookId: data.notebookId });
    } catch (err) {
      setSlidedeckError(err instanceof Error ? err.message : String(err));
    } finally {
      setSlidedeckLoading(false);
    }
  }

  async function handleUploadSlide(slideIdx: number, file: File) {
    setUploadingIdx(slideIdx);
    const id = ensureJobId();
    try {
      const fd = new FormData();
      fd.append('jobId', id);
      fd.append('slideIdx', String(slideIdx));
      fd.append('file', file);
      const res = await fetch('/api/upload-slide', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      // 캐시 회피 위해 쿼리 추가
      const url = `${data.url}?t=${Date.now()}`;
      setSlideImages((prev) => ({ ...prev, [slideIdx]: url }));
    } catch (err) {
      alert(`업로드 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploadingIdx(null);
    }
  }

  // Phase C — MP4 합성
  const allSlideImagesReady = useMemo(() => {
    if (parsed.slideCount === 0) return false;
    for (let i = 0; i < parsed.slideCount; i++) {
      if (!slideImages[i]) return false;
    }
    return true;
  }, [parsed.slideCount, slideImages]);

  const allAudioReady = useMemo(() => {
    if (parsed.lines.length === 0) return false;
    return parsed.lines.every((_, i) => {
      const a = audioByLine[i];
      return a && a.status === 'done' && !!a.staticUrl;
    });
  }, [parsed.lines, audioByLine]);

  const canRender =
    !!jobId &&
    allSlideImagesReady &&
    allAudioReady &&
    renderState.status !== 'queued' &&
    renderState.status !== 'audio_concat' &&
    renderState.status !== 'segment_render' &&
    renderState.status !== 'final_concat';

  async function pollRenderJob(id: string) {
    try {
      const res = await fetch(`/api/render-video?jobId=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) {
        setRenderState((prev) => ({
          ...prev,
          status: 'error',
          error: data?.message || data?.error || `HTTP ${res.status}`,
        }));
        return;
      }
      const j = data.job as RenderState & { jobId: string };
      setRenderState({
        status: j.status,
        progress: j.progress ?? 0,
        currentSlide: j.currentSlide,
        totalSlides: j.totalSlides,
        outputUrl: j.outputUrl,
        error: j.error,
      });
      if (j.status === 'done' || j.status === 'error') {
        if (renderPollRef.current) {
          window.clearInterval(renderPollRef.current);
          renderPollRef.current = null;
        }
      }
    } catch (err) {
      setRenderState((prev) => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  async function handleRenderMp4() {
    if (!canRender || !jobId) return;
    setRenderState({ status: 'queued', progress: 0 });

    // 슬라이드별 페이로드 구성
    const slidesPayload = Array.from({ length: parsed.slideCount }, (_, idx) => {
      const lineIdxs = parsed.lines
        .map((l, i) => (l.slideIdx === idx ? i : -1))
        .filter((i) => i >= 0);
      const audioUrls = lineIdxs
        .map((i) => audioByLine[i]?.staticUrl)
        .filter((u): u is string => !!u);
      return {
        slideIdx: idx,
        // 캐시버스터 쿼리스트링은 서버에서 제거됨 — 그래도 안전하게 raw URL 추출
        imageUrl: (slideImages[idx] || '').split('?')[0],
        audioUrls,
      };
    });

    try {
      const res = await fetch('/api/render-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, slides: slidesPayload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRenderState({
          status: 'error',
          progress: 0,
          error: data?.message || data?.error || `HTTP ${res.status}`,
        });
        return;
      }
      if (renderPollRef.current) window.clearInterval(renderPollRef.current);
      renderPollRef.current = window.setInterval(() => {
        void pollRenderJob(jobId);
      }, 1500);
      void pollRenderJob(jobId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRenderState({ status: 'error', progress: 0, error: message });
    }
  }

  // 강의 대본 — 자동 생성 (Claude API)
  async function handleGenerateLectureScripts() {
    if (!topic.trim() || !script.trim() || lectureGenerating) return;
    setLectureError(null);
    setLectureGenerating(true);
    try {
      // 슬라이드 이미지 URL을 함께 전달 — Claude Vision이 실제 PNG 보고 정합성 맞추도록
      const slideImagesPayload: Record<string, string> = {};
      for (let i = 0; i < parsed.slideCount; i++) {
        const u = slideImages[i];
        if (u) slideImagesPayload[String(i)] = u.split('?')[0];
      }

      const res = await fetch('/api/lecture-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          script,
          scriptMode: mode,
          research: research.trim() || undefined,
          slideImages: Object.keys(slideImagesPayload).length > 0
            ? slideImagesPayload
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLectureError(data?.message || data?.error || `HTTP ${res.status}`);
        return;
      }
      setLectureScripts(data.scripts ?? {});
    } catch (err) {
      setLectureError(err instanceof Error ? err.message : String(err));
    } finally {
      setLectureGenerating(false);
    }
  }

  // 강의 대본 — 수동 모드 프롬프트 빌드
  function buildLecturePromptForManual() {
    if (!topic.trim() || !script.trim()) return;
    const { system, user } = buildLecturePrompt({
      topic: topic.trim(),
      parsed,
      research: research.trim() || undefined,
    });
    setLecturePrompt({ system, user });
    setLecturePromptCopied(false);
  }

  // 강의 대본 — 수동 paste 적용
  function applyLectureManualPaste() {
    if (!lectureManualPaste.trim()) return;
    const byIdx = parseLectureScript(lectureManualPaste);
    const filled: Record<number, string> = {};
    for (let i = 0; i < parsed.slideCount; i++) {
      filled[i] = byIdx[i] ?? '';
    }
    setLectureScripts(filled);
  }

  // 7번 — 썸네일 프롬프트 (API 호출 모드: Claude가 직접 Flow 프롬프트 생성)
  async function handleGenerateThumbnailPrompt() {
    if (!topic.trim()) return;
    setThumbnailGenerating(true);
    setThumbnailError('');
    setThumbnailResult('');
    setThumbnailResultCopied(false);
    try {
      const res = await fetch('/api/thumbnail-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          lectureScripts,
          research: research.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      }
      setThumbnailResult(typeof data.prompt === 'string' ? data.prompt.trim() : '');
    } catch (err) {
      setThumbnailError(err instanceof Error ? err.message : String(err));
    } finally {
      setThumbnailGenerating(false);
    }
  }

  // 7번 — 썸네일 프롬프트 (수동 모드: Claude.ai 웹에 붙여넣을 메타 프롬프트만 생성)
  function buildThumbnailPromptForManual() {
    if (!topic.trim()) return;
    const { system, user } = buildThumbnailPrompt({
      topic: topic.trim(),
      lectureScripts,
      research: research.trim() || undefined,
    });
    setThumbnailManualPrompt({ system, user });
    setThumbnailManualCopied(false);
  }

  async function handleSlideImagePrompt(slideIdx: number) {
    if (!topic.trim()) return;
    setImagePromptLoadingIdx(slideIdx);
    try {
      const slideText = parsed.lines
        .filter((l) => l.slideIdx === slideIdx)
        .map((l) => `[${l.speaker === 'jjangsaem' ? '짱샘' : '부모'}] ${l.text}`)
        .join('\n');
      const res = await fetch('/api/slide-image-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          slideText,
          slideIdx,
          totalSlides: parsed.slideCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      setImagePromptByIdx((prev) => ({ ...prev, [slideIdx]: data.prompt }));
    } catch (err) {
      alert(`프롬프트 생성 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImagePromptLoadingIdx(null);
    }
  }

  function combinedPromptText(p: { system: string; user: string } | null): string {
    if (!p) return '';
    return `[System]\n${p.system}\n\n[User]\n${p.user}`;
  }

  async function copyToClipboard(text: string, onDone: () => void) {
    try {
      await navigator.clipboard.writeText(text);
      onDone();
    } catch {
      // ignore
    }
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
          targetMinutes,
          pdfText: pdfExtract?.text,
          research: research.trim() || undefined,
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
    (ttsProvider === 'gemini'
      ? geminiApiKey.trim().length > 0
      : parsed.lines.every((l) => l.text.length <= 300));

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
              provider: ttsProvider,
              geminiApiKey: ttsProvider === 'gemini' ? geminiApiKey : undefined,
              geminiVoices:
                ttsProvider === 'gemini'
                  ? {
                      jjangsaem: geminiVoiceJjangsaem,
                      mom: geminiVoiceMom,
                      dad: geminiVoiceDad,
                    }
                  : undefined,
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
              staticUrl: typeof data.audioUrl === 'string' ? data.audioUrl : undefined,
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
        <h1
          onClick={() => {
            if (typeof window !== 'undefined') window.location.reload();
          }}
          title="클릭하면 새로고침"
          className="cursor-pointer text-2xl font-bold tracking-tight hover:opacity-70"
        >
          짱샘 유튜브 스튜디오
        </h1>
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
          <label className="text-xs font-medium">목표 영상 길이</label>
          <input
            type="number"
            min={1}
            max={30}
            value={targetMinutes}
            onChange={(e) =>
              setTargetMinutes(Math.max(1, Math.min(30, Number(e.target.value) || 1)))
            }
            className="w-20 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-sm"
          />
          <span className="text-xs text-zinc-500">분 — 슬라이드 수는 Claude가 자동으로 결정</span>
        </div>
      </section>

      <section className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <h2 className="mb-3 text-sm font-semibold">
          2. 리서치 (NotebookLM)
          <span className="ml-2 text-xs font-normal text-zinc-500">
            노트북에서 주제 관련 핵심 정리 추출 — 대본 생성 시 1차 자료로 사용
          </span>
        </h2>

        {notebooksError && (
          <div className="mb-3 rounded bg-red-50 dark:bg-red-950 p-3 text-xs text-red-800 dark:text-red-200">
            노트북 목록 불러오기 실패: {notebooksError}
            <div className="mt-1 text-[11px] opacity-80">
              로컬 dev 환경에서만 동작. 터미널에서 <code>nlm login</code> 후 dev 서버 재시작.
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium">노트북</label>
          <select
            value={notebookId}
            onChange={(e) => setNotebookId(e.target.value)}
            disabled={notebooksLoading || notebooks.length === 0}
            className="min-w-[280px] rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-sm"
          >
            {notebooksLoading ? (
              <option value="">불러오는 중...</option>
            ) : notebooks.length === 0 ? (
              <option value="">(노트북 없음)</option>
            ) : (
              <>
                <option value="">— 선택 안 함 (리서치 건너뛰기) —</option>
                {notebooks.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
              </>
            )}
          </select>
          <button
            onClick={handleResearch}
            disabled={!topic.trim() || researching}
            title={!topic.trim() ? '먼저 1번 섹션에서 영상 주제를 입력하세요' : undefined}
            className="ml-auto rounded bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:bg-zinc-400 disabled:cursor-not-allowed"
          >
            {researching
              ? notebookId
                ? '리서치 중... (60-120초)'
                : pdfExtract
                  ? '새 노트북 생성 + 리서치 중... (90-180초)'
                  : '웹 리서치 + 노트북 생성 중... (2-3분)'
              : '리서치 실행'}
          </button>
        </div>

        {!topic.trim() && (
          <div className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
            ⚠️ 위 1번 섹션의 <strong>영상 주제</strong>를 먼저 입력해야 리서치를 실행할 수 있습니다.
          </div>
        )}

        {!notebookId && !researching && (
          <div className="mt-2 rounded bg-emerald-50 dark:bg-emerald-950 p-2 text-[11px] text-emerald-800 dark:text-emerald-200">
            노트북 미선택 — 리서치 실행 시{' '}
            {pdfExtract ? (
              <>
                업로드한 PDF 텍스트를 소스로 한{' '}
                <strong>새 노트북</strong>이 자동 생성됩니다.
              </>
            ) : (
              <>
                NotebookLM이 웹에서 관련 자료를 찾아 <strong>새 노트북</strong>을 자동
                생성합니다 (fast 모드, ~10개 소스).
              </>
            )}
          </div>
        )}

        {researchError && (
          <div className="mt-3 rounded bg-red-50 dark:bg-red-950 p-3 text-xs text-red-800 dark:text-red-200">
            {researchError}
          </div>
        )}

        {autoNotebook && (
          <div className="mt-3 rounded bg-emerald-50 dark:bg-emerald-950 p-3 text-xs text-emerald-800 dark:text-emerald-200">
            ✓ 새 노트북 자동 생성:{' '}
            <strong>{autoNotebook.title}</strong>
            <span className="ml-2 text-emerald-600 dark:text-emerald-400">
              ({autoNotebook.via === 'pdf' ? 'PDF 텍스트 소스' : '웹 리서치 결과'} 기반)
            </span>
            <div className="mt-1 text-[11px] opacity-80">
              ID: <code>{autoNotebook.id}</code> — 다음 리서치부터는 이 노트북을 재사용할 수 있습니다.
            </div>
          </div>
        )}

        <label className="mt-3 block text-xs font-medium">
          리서치 결과 <span className="text-zinc-500 font-normal">(편집 가능)</span>
        </label>
        <textarea
          value={research}
          onChange={(e) => setResearch(e.target.value)}
          rows={10}
          placeholder="리서치 실행 후 여기에 자동으로 채워집니다. 직접 입력하거나 결과를 다듬어도 됩니다."
          className="mt-1 w-full rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 font-mono text-xs leading-5 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
        />
        {research.trim() && (
          <p className="mt-1 text-[11px] text-zinc-500">
            {research.trim().length.toLocaleString()}자 — 대본 생성 시 system prompt에 주입됨
          </p>
        )}
      </section>

      <section className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <h2 className="mb-3 text-sm font-semibold">
          3. 대본 생성 / 편집
          <span className="ml-2 text-xs font-normal text-zinc-500">
            (형식: <code>## 슬라이드 N</code> 헤더 + <code>[부모]</code>/<code>[짱샘]</code> 라벨)
          </span>
        </h2>

        {!research.trim() && notebookId && (
          <div className="mb-3 rounded bg-amber-50 dark:bg-amber-950 p-3 text-xs text-amber-800 dark:text-amber-200">
            ⚠️ 노트북을 선택했지만 아직 리서치를 실행하지 않았습니다. 위 2번 섹션에서{' '}
            <strong>[리서치 실행]</strong> 버튼을 눌러 결과를 받아온 뒤 대본을 생성하세요.
            <span className="opacity-70"> (그냥 진행하면 노트북 자료가 반영되지 않습니다.)</span>
          </div>
        )}

        {!research.trim() && !notebookId && !pdfExtract && (
          <div className="mb-3 rounded bg-amber-50 dark:bg-amber-950 p-3 text-xs text-amber-800 dark:text-amber-200">
            ⚠️ 리서치 결과나 PDF 없이 대본을 생성합니다. Claude의 자체 지식만으로 작성되므로
            근거가 약할 수 있어요. 위 2번 섹션에서 리서치를 먼저 실행하는 것을 권장합니다.
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded border border-zinc-300 dark:border-zinc-700 text-xs">
            <button
              onClick={() => setScriptUseApi(true)}
              className={`px-3 py-1.5 ${scriptUseApi ? 'bg-violet-600 text-white' : 'text-zinc-600 dark:text-zinc-400'}`}
            >
              API 호출
            </button>
            <button
              onClick={() => setScriptUseApi(false)}
              className={`px-3 py-1.5 ${!scriptUseApi ? 'bg-violet-600 text-white' : 'text-zinc-600 dark:text-zinc-400'}`}
            >
              수동 (Claude.ai 웹)
            </button>
          </div>
          {scriptUseApi ? (
            <button
              onClick={handleGenerate}
              disabled={!topic.trim() || generating || extractingPdf}
              className="rounded bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500 disabled:bg-zinc-400 disabled:cursor-not-allowed"
            >
              {generating
                ? 'Claude 생성 중...'
                : research.trim()
                  ? '대본 생성 (리서치 기반)'
                  : pdfExtract
                    ? '대본 생성 (PDF 기반)'
                    : '대본 생성 (근거 없음)'}
            </button>
          ) : (
            <button
              onClick={buildScriptPromptForManual}
              disabled={!topic.trim() || extractingPdf}
              className="rounded bg-violet-600 px-4 py-2 text-sm text-white hover:bg-violet-500 disabled:bg-zinc-400 disabled:cursor-not-allowed"
            >
              프롬프트 생성
            </button>
          )}
          <span className="text-xs text-zinc-500">
            {research.trim() && `리서치 ${research.trim().length.toLocaleString()}자`}
            {research.trim() && pdfExtract && ' · '}
            {pdfExtract && `PDF ${pdfExtract.text.length.toLocaleString()}자`}
            {!research.trim() && !pdfExtract && '근거 자료 없음'}
          </span>
        </div>

        {!scriptUseApi && scriptPrompt && (
          <div className="mb-3 rounded border border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-violet-900 dark:text-violet-100">
                Claude.ai 웹에 붙여넣기 — 결과를 아래 textarea에 그대로 붙여넣으세요
              </span>
              <button
                onClick={() =>
                  copyToClipboard(combinedPromptText(scriptPrompt), () => setScriptCopied(true))
                }
                className="rounded bg-violet-600 px-3 py-1 text-xs text-white hover:bg-violet-500"
              >
                {scriptCopied ? '복사됨 ✓' : '프롬프트 복사'}
              </button>
            </div>
            <textarea
              readOnly
              value={combinedPromptText(scriptPrompt)}
              rows={10}
              className="w-full rounded border border-violet-300 dark:border-violet-800 bg-white dark:bg-zinc-900 px-3 py-2 font-mono text-[11px] leading-5"
            />
            <p className="mt-1 text-[11px] text-violet-800 dark:text-violet-200">
              💡 claude.ai에서 [System] 영역은 시스템 프롬프트 / Project instructions에, [User] 영역은 일반 메시지로 보내거나, 통째로 붙여넣어도 됩니다.
            </p>
          </div>
        )}

        {genError && (
          <div className="mb-3 rounded bg-red-50 dark:bg-red-950 p-3 text-xs text-red-800 dark:text-red-200">
            {genError}
          </div>
        )}

        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={18}
          placeholder={`위의 "대본 생성" 버튼을 누르면 여기에 자동으로 채워집니다. 직접 입력해도 됩니다.\n\n형식 예시:\n${mode === 'solo' ? PLACEHOLDER_SOLO : PLACEHOLDER_DIALOGUE}`}
          className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 font-mono text-sm leading-6 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
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
            4. 자연스러움 {validation.totalCount}장치 검수
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
          5. 슬라이드 이미지
          <span className="ml-2 text-xs font-normal text-zinc-500">
            NotebookLM 자동 생성 + 슬라이드별 PNG 직접 업로드 (Flow 등에서 만든 이미지)
          </span>
        </h2>

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <button
            onClick={handleGenerateSlideDeck}
            disabled={!notebookId || slidedeckLoading}
            className="rounded bg-fuchsia-600 px-4 py-2 text-sm text-white hover:bg-fuchsia-500 disabled:bg-zinc-400 disabled:cursor-not-allowed"
          >
            {slidedeckLoading
              ? 'NotebookLM 슬라이드 덱 생성 + PNG 변환 중... (3~7분)'
              : '슬라이드 덱 자동 생성 (NotebookLM)'}
          </button>
          {!notebookId && (
            <span className="text-xs text-amber-700 dark:text-amber-300">
              ⚠️ 위 2번 섹션에서 노트북을 먼저 선택하세요.
            </span>
          )}
          {slidedeckInfo && (
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              {slidedeckInfo.pageCount}페이지 변환 완료. 마음에 안드는 슬라이드는 아래에서 교체 업로드.
            </span>
          )}
        </div>

        {slidedeckError && (
          <div className="mb-3 rounded bg-red-50 dark:bg-red-950 p-3 text-xs text-red-800 dark:text-red-200">
            {slidedeckError}
          </div>
        )}

        {jobId && Object.keys(slideImages).length > 0 && (
          <div className="mb-3 rounded border border-fuchsia-200 dark:border-fuchsia-900 bg-fuchsia-50 dark:bg-fuchsia-950 p-3 text-[11px]">
            <div className="font-medium text-fuchsia-900 dark:text-fuchsia-100">
              📂 PNG 파일 위치 (PowerPoint에 끌어넣기)
            </div>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-white dark:bg-zinc-900 px-2 py-1 font-mono text-[11px]">
                {`${typeof window !== 'undefined' ? window.location.origin : ''}/slides/${jobId}/`}
              </code>
              <button
                onClick={() =>
                  copyToClipboard(
                    `${typeof window !== 'undefined' ? window.location.origin : ''}/slides/${jobId}/`,
                    () => {}
                  )
                }
                className="rounded border border-fuchsia-300 dark:border-fuchsia-800 px-2 py-1 hover:bg-fuchsia-100 dark:hover:bg-fuchsia-900"
              >
                URL 복사
              </button>
            </div>
            <p className="mt-2 text-fuchsia-800 dark:text-fuchsia-200">
              💡 Windows 탐색기에서{' '}
              <code className="rounded bg-white dark:bg-zinc-900 px-1 py-0.5 font-mono">
                C:\Users\bsuha\Claude-prj\jjangsaem-youtube-studio\public\slides\{jobId}\
              </code>{' '}
              경로 열어서 PNG들을 PowerPoint로 드래그하면 한 번에 슬라이드 8장 생성됨. 또는 아래
              카드에서 슬라이드별 [PNG 다운로드] 클릭.
            </p>
          </div>
        )}

        {parsed.slideCount === 0 ? (
          <div className="rounded bg-amber-50 dark:bg-amber-950 p-3 text-xs text-amber-800 dark:text-amber-200">
            아직 대본이 없거나 파싱된 슬라이드가 0개입니다. 위 3번 섹션에서 대본을 먼저 작성하세요.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: parsed.slideCount }, (_, idx) => {
              const slideLines = parsed.lines.filter((l) => l.slideIdx === idx);
              const imgUrl = slideImages[idx];
              const promptText = imagePromptByIdx[idx];
              return (
                <div
                  key={idx}
                  className="rounded border border-zinc-200 dark:border-zinc-800 p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium">슬라이드 {idx + 1}</span>
                    <span className="text-[11px] text-zinc-500">
                      라인 {slideLines.length}개
                    </span>
                  </div>
                  <div
                    className="relative w-full overflow-hidden rounded bg-zinc-100 dark:bg-zinc-900"
                    style={{ aspectRatio: '16 / 9' }}
                  >
                    {imgUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imgUrl}
                        alt={`슬라이드 ${idx + 1}`}
                        className="absolute inset-0 h-full w-full object-contain"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">
                        (이미지 없음)
                      </div>
                    )}
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-zinc-500">
                      대본 미리보기 ({slideLines.length}줄)
                    </summary>
                    <div className="mt-1 max-h-32 overflow-auto rounded bg-zinc-50 dark:bg-zinc-900 p-2 text-[11px]">
                      {slideLines.map((l, i) => (
                        <div key={i} className="py-0.5">
                          <span
                            className={
                              l.speaker === 'jjangsaem'
                                ? 'text-blue-600'
                                : 'text-pink-600'
                            }
                          >
                            {l.speaker === 'jjangsaem' ? '짱샘' : '부모'}
                          </span>
                          : {l.text}
                        </div>
                      ))}
                    </div>
                  </details>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="cursor-pointer rounded border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-100 dark:hover:bg-zinc-800">
                      {uploadingIdx === idx ? '업로드 중...' : '교체 업로드'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUploadSlide(idx, f);
                          e.currentTarget.value = '';
                        }}
                        disabled={uploadingIdx !== null}
                        className="hidden"
                      />
                    </label>
                    {imgUrl && (
                      <a
                        href={imgUrl}
                        download={`slide-${String(idx + 1).padStart(3, '0')}.png`}
                        className="rounded border border-emerald-300 dark:border-emerald-800 px-2 py-1 text-[11px] text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                      >
                        PNG 다운로드
                      </a>
                    )}
                    <button
                      onClick={() => handleSlideImagePrompt(idx)}
                      disabled={
                        !topic.trim() ||
                        slideLines.length === 0 ||
                        imagePromptLoadingIdx !== null
                      }
                      className="rounded border border-fuchsia-300 dark:border-fuchsia-800 px-2 py-1 text-[11px] text-fuchsia-700 dark:text-fuchsia-300 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-950 disabled:text-zinc-400"
                    >
                      {imagePromptLoadingIdx === idx
                        ? '프롬프트 생성 중...'
                        : 'Claude로 인포그래픽 프롬프트 받기'}
                    </button>
                  </div>
                  {promptText && (
                    <div className="mt-2 rounded border border-fuchsia-300 dark:border-fuchsia-800 bg-fuchsia-50 dark:bg-fuchsia-950 p-2">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-fuchsia-900 dark:text-fuchsia-100">
                          Flow에 붙여넣을 프롬프트
                        </span>
                        <button
                          onClick={() =>
                            copyToClipboard(promptText, () => {
                              // 짧은 피드백 — alert 대신 콘솔
                            })
                          }
                          className="rounded bg-fuchsia-600 px-2 py-0.5 text-[10px] text-white hover:bg-fuchsia-500"
                        >
                          복사
                        </button>
                      </div>
                      <textarea
                        readOnly
                        value={promptText}
                        rows={4}
                        className="w-full rounded border border-fuchsia-300 dark:border-fuchsia-800 bg-white dark:bg-zinc-900 px-2 py-1 font-mono text-[11px] leading-5"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <h2 className="mb-3 text-sm font-semibold">
          6. 직접 녹음용 강의 대본
          <span className="ml-2 text-xs font-normal text-zinc-500">
            (옵션) PowerPoint 녹화용. 자동 생성은 5번 슬라이드 PNG를 Claude Vision으로 직접 보고
            2단계 검토(호칭 남발·AI 티·이미지 정합·구어체) 후 최종본 출력. 이걸로 가면 8·9번 스킵 가능.
          </span>
        </h2>

        {mode === 'dialogue' && (
          <div className="mb-3 rounded bg-amber-50 dark:bg-amber-950 p-2 text-[11px] text-amber-800 dark:text-amber-200">
            ℹ️ 위 1번에서 <strong>대화 모드</strong>로 대본을 작성했어도 강의 대본은 1인 강의(짱샘 단독)로 자동 변환됩니다.
            부모 라인의 걱정·고민은 강의에서 &ldquo;어머님들 이런 질문 자주 하시잖아요&rdquo; 식으로 흡수되고,
            짱샘 답변은 본문으로 풀어쓰여집니다. 처음부터 강의용이면 1번에서 &ldquo;1인 설명&rdquo; 모드를 고르는 게 더 깔끔.
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded border border-zinc-300 dark:border-zinc-700 text-xs">
            <button
              onClick={() => setLectureUseApi(true)}
              className={`px-3 py-1.5 ${lectureUseApi ? 'bg-orange-600 text-white' : 'text-zinc-600 dark:text-zinc-400'}`}
            >
              API 호출
            </button>
            <button
              onClick={() => setLectureUseApi(false)}
              className={`px-3 py-1.5 ${!lectureUseApi ? 'bg-orange-600 text-white' : 'text-zinc-600 dark:text-zinc-400'}`}
            >
              수동 (Claude.ai 웹)
            </button>
          </div>
          {lectureUseApi ? (
            <button
              onClick={handleGenerateLectureScripts}
              disabled={!topic.trim() || !script.trim() || lectureGenerating}
              className="rounded bg-orange-600 px-4 py-2 text-sm text-white hover:bg-orange-500 disabled:bg-zinc-400 disabled:cursor-not-allowed"
            >
              {lectureGenerating
                ? '강의 대본 생성 + 검토 중... (1~2분)'
                : '전체 강의 대본 생성 (Claude)'}
            </button>
          ) : (
            <button
              onClick={buildLecturePromptForManual}
              disabled={!topic.trim() || !script.trim()}
              className="rounded bg-orange-600 px-4 py-2 text-sm text-white hover:bg-orange-500 disabled:bg-zinc-400 disabled:cursor-not-allowed"
            >
              프롬프트 생성
            </button>
          )}
          {parsed.slideCount > 0 && (
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              {parsed.slideCount}개 슬라이드 — 분량은 슬라이드 내용에 따라 가변 (균등 X)
            </span>
          )}
        </div>

        {!lectureUseApi && lecturePrompt && (
          <div className="mb-3 rounded border border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-orange-900 dark:text-orange-100">
                Claude.ai 웹에 붙여넣고 응답을 아래 textarea에 붙여넣으세요
              </span>
              <button
                onClick={() =>
                  copyToClipboard(combinedPromptText(lecturePrompt), () =>
                    setLecturePromptCopied(true)
                  )
                }
                className="rounded bg-orange-600 px-3 py-1 text-xs text-white hover:bg-orange-500"
              >
                {lecturePromptCopied ? '복사됨 ✓' : '프롬프트 복사'}
              </button>
            </div>
            <textarea
              readOnly
              value={combinedPromptText(lecturePrompt)}
              rows={8}
              className="w-full rounded border border-orange-300 dark:border-orange-800 bg-white dark:bg-zinc-900 px-3 py-2 font-mono text-[11px] leading-5"
            />
            <label className="mt-3 block text-[11px] font-medium text-orange-900 dark:text-orange-100">
              Claude.ai 응답 붙여넣기 (## 슬라이드 N 헤더 형식 그대로)
            </label>
            <textarea
              value={lectureManualPaste}
              onChange={(e) => setLectureManualPaste(e.target.value)}
              rows={8}
              placeholder={`## 슬라이드 1\n안녕하세요. 오늘은 ...\n\n## 슬라이드 2\n...`}
              className="mt-1 w-full rounded border border-orange-300 dark:border-orange-800 bg-white dark:bg-zinc-900 px-3 py-2 font-mono text-[11px] leading-5"
            />
            <button
              onClick={applyLectureManualPaste}
              disabled={!lectureManualPaste.trim()}
              className="mt-2 rounded bg-orange-600 px-3 py-1.5 text-xs text-white hover:bg-orange-500 disabled:bg-zinc-400"
            >
              슬라이드별로 분배
            </button>
          </div>
        )}

        {lectureError && (
          <div className="mb-3 rounded bg-red-50 dark:bg-red-950 p-3 text-xs text-red-800 dark:text-red-200">
            {lectureError}
          </div>
        )}

        {parsed.slideCount === 0 ? (
          <div className="rounded bg-amber-50 dark:bg-amber-950 p-3 text-xs text-amber-800 dark:text-amber-200">
            먼저 3번에서 대본을 작성하세요.
          </div>
        ) : (
          <div className="space-y-3">
            {Array.from({ length: parsed.slideCount }, (_, idx) => {
              const imgUrl = slideImages[idx];
              const lectureText = lectureScripts[idx] ?? '';
              return (
                <div
                  key={idx}
                  className="flex flex-col gap-3 rounded border border-zinc-200 dark:border-zinc-800 p-3 sm:flex-row"
                >
                  <div className="flex-shrink-0 sm:w-48">
                    <div
                      className="relative w-full overflow-hidden rounded bg-zinc-100 dark:bg-zinc-900"
                      style={{ aspectRatio: '16 / 9' }}
                    >
                      {imgUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={imgUrl}
                          alt={`슬라이드 ${idx + 1}`}
                          className="absolute inset-0 h-full w-full object-contain"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-zinc-400">
                          (이미지 없음)
                        </div>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] font-medium">슬라이드 {idx + 1}</p>
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                        강의 대본 (편집 가능)
                      </label>
                      {lectureText && (
                        <button
                          onClick={() => copyToClipboard(lectureText, () => {})}
                          className="rounded border border-zinc-300 dark:border-zinc-700 px-2 py-0.5 text-[10px] hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          복사
                        </button>
                      )}
                    </div>
                    <textarea
                      value={lectureText}
                      onChange={(e) =>
                        setLectureScripts((prev) => ({ ...prev, [idx]: e.target.value }))
                      }
                      rows={6}
                      placeholder="이 슬라이드를 보면서 짱샘이 직접 설명하는 대본 — 위에서 자동 생성하거나 직접 입력"
                      className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-xs leading-6 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                    />
                    {lectureText && (
                      <p className="mt-1 text-[10px] text-zinc-500">
                        {lectureText.length}자 — 약 {Math.round(lectureText.length / 4)}초 발화 (한국어 평균 4자/초 기준)
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 7. 썸네일 프롬프트 — Google Flow용 */}
      <section className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <h2 className="mb-3 text-sm font-semibold">
          7. 썸네일 프롬프트 (Google Flow용)
          <span className="ml-2 text-xs font-normal text-zinc-500">
            6번 강의 대본 전체를 읽고 가장 강한 클릭 후크를 뽑아, Google Flow에 그대로 붙여넣을
            한국어 이미지 생성 프롬프트를 출력. Flow가 한글 텍스트를 잘 렌더링하므로 헤드라인 한글이 포함됨.
          </span>
        </h2>

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded border border-zinc-300 dark:border-zinc-700 text-xs">
            <button
              onClick={() => setThumbnailUseApi(true)}
              className={`px-3 py-1.5 ${thumbnailUseApi ? 'bg-fuchsia-600 text-white' : 'text-zinc-600 dark:text-zinc-400'}`}
            >
              API 호출
            </button>
            <button
              onClick={() => setThumbnailUseApi(false)}
              className={`px-3 py-1.5 ${!thumbnailUseApi ? 'bg-fuchsia-600 text-white' : 'text-zinc-600 dark:text-zinc-400'}`}
            >
              수동 (Claude.ai 웹)
            </button>
          </div>
          {thumbnailUseApi ? (
            <button
              onClick={handleGenerateThumbnailPrompt}
              disabled={
                !topic.trim() ||
                thumbnailGenerating ||
                !Object.values(lectureScripts).some((s) => (s ?? '').trim())
              }
              className="rounded bg-fuchsia-600 px-4 py-2 text-sm text-white hover:bg-fuchsia-500 disabled:bg-zinc-400 disabled:cursor-not-allowed"
            >
              {thumbnailGenerating ? '생성 중... (10~30초)' : 'Flow 프롬프트 생성'}
            </button>
          ) : (
            <button
              onClick={buildThumbnailPromptForManual}
              disabled={
                !topic.trim() ||
                !Object.values(lectureScripts).some((s) => (s ?? '').trim())
              }
              className="rounded bg-fuchsia-600 px-4 py-2 text-sm text-white hover:bg-fuchsia-500 disabled:bg-zinc-400 disabled:cursor-not-allowed"
            >
              프롬프트 생성
            </button>
          )}
          {!Object.values(lectureScripts).some((s) => (s ?? '').trim()) && (
            <span className="text-xs text-amber-700 dark:text-amber-300">
              6번 강의 대본을 먼저 생성하세요
            </span>
          )}
        </div>

        {thumbnailError && (
          <div className="mb-3 rounded bg-red-50 dark:bg-red-950 p-3 text-xs text-red-800 dark:text-red-200">
            {thumbnailError}
          </div>
        )}

        {!thumbnailUseApi && thumbnailManualPrompt && (
          <div className="mb-3 rounded border border-fuchsia-300 dark:border-fuchsia-800 bg-fuchsia-50 dark:bg-fuchsia-950 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-fuchsia-900 dark:text-fuchsia-100">
                Claude.ai 웹에 붙여넣고 응답(=Flow 프롬프트)을 Google Flow에 다시 붙여넣으세요
              </span>
              <button
                onClick={() =>
                  copyToClipboard(combinedPromptText(thumbnailManualPrompt), () =>
                    setThumbnailManualCopied(true)
                  )
                }
                className="rounded bg-fuchsia-600 px-3 py-1 text-xs text-white hover:bg-fuchsia-500"
              >
                {thumbnailManualCopied ? '복사됨 ✓' : '프롬프트 복사'}
              </button>
            </div>
            <textarea
              readOnly
              value={combinedPromptText(thumbnailManualPrompt)}
              rows={8}
              className="w-full rounded border border-fuchsia-300 dark:border-fuchsia-800 bg-white dark:bg-zinc-900 px-3 py-2 font-mono text-[11px] leading-5"
            />
          </div>
        )}

        {thumbnailResult && (
          <div className="rounded border border-fuchsia-300 dark:border-fuchsia-800 bg-fuchsia-50 dark:bg-fuchsia-950 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-fuchsia-900 dark:text-fuchsia-100">
                Google Flow에 그대로 붙여넣으세요
              </span>
              <button
                onClick={() =>
                  copyToClipboard(thumbnailResult, () => setThumbnailResultCopied(true))
                }
                className="rounded bg-fuchsia-600 px-3 py-1 text-xs text-white hover:bg-fuchsia-500"
              >
                {thumbnailResultCopied ? '복사됨 ✓' : 'Flow 프롬프트 복사'}
              </button>
            </div>
            <textarea
              value={thumbnailResult}
              onChange={(e) => setThumbnailResult(e.target.value)}
              rows={10}
              className="w-full rounded border border-fuchsia-300 dark:border-fuchsia-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs leading-6"
            />
            <p className="mt-1 text-[10px] text-fuchsia-700 dark:text-fuchsia-300">
              필요하면 직접 편집한 뒤 Flow에 붙여넣으세요. 한글 헤드라인 카피는 Flow가 잘 렌더링합니다.
            </p>
          </div>
        )}
      </section>

      {!showTTSSections && (
        <section className="mb-6 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            🎙️ 강의(녹음) 흐름이라 TTS·MP4 단계는 숨겼어요. PowerPoint 노트에 강의 대본 붙여넣고
            녹화하면 끝.
          </p>
          <button
            onClick={() => setForceShowTTS(true)}
            className="mt-2 rounded border border-zinc-300 dark:border-zinc-700 px-3 py-1 text-[11px] hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            그래도 8·9번 (TTS·MP4) 보기
          </button>
        </section>
      )}

      {showTTSSections && (
      <>
      <section className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <h2 className="mb-3 text-sm font-semibold">
          8. 음성 합성 (TTS — 자동 합성용)
          {jobId && (
            <span className="ml-2 text-xs font-normal text-zinc-500">job: {jobId}</span>
          )}
          {hasLectureScripts && (
            <button
              onClick={() => setForceShowTTS(false)}
              className="ml-3 rounded border border-zinc-300 dark:border-zinc-700 px-2 py-0.5 text-[10px] font-normal hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              8·9번 숨기기
            </button>
          )}
        </h2>

        <div className="mb-4 rounded border border-zinc-200 dark:border-zinc-800 p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-medium">TTS 공급자</span>
            <div className="inline-flex rounded border border-zinc-300 dark:border-zinc-700 text-xs">
              <button
                onClick={() => setTtsProvider('supertone')}
                className={`px-3 py-1 ${ttsProvider === 'supertone' ? 'bg-blue-600 text-white' : 'text-zinc-600 dark:text-zinc-400'}`}
              >
                Supertone (Sona 2)
              </button>
              <button
                onClick={() => setTtsProvider('gemini')}
                className={`px-3 py-1 ${ttsProvider === 'gemini' ? 'bg-blue-600 text-white' : 'text-zinc-600 dark:text-zinc-400'}`}
              >
                Gemini 2.5 TTS
              </button>
            </div>
          </div>

          {ttsProvider === 'gemini' && (
            <div className="mt-2 rounded border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 p-3">
              <label className="block text-xs font-medium text-blue-900 dark:text-blue-100">
                Gemini API 키{' '}
                <span className="font-normal opacity-70">
                  (Google AI Studio에서 발급, 브라우저 localStorage에 저장됨)
                </span>
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type={geminiKeyVisible ? 'text' : 'password'}
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIza..."
                  className="flex-1 rounded border border-blue-300 dark:border-blue-800 bg-white dark:bg-zinc-900 px-2 py-1 font-mono text-xs"
                />
                <button
                  onClick={() => setGeminiKeyVisible((v) => !v)}
                  className="rounded border border-blue-300 dark:border-blue-800 px-2 py-1 text-[11px]"
                >
                  {geminiKeyVisible ? '숨김' : '표시'}
                </button>
                {geminiApiKey && (
                  <button
                    onClick={() => setGeminiApiKey('')}
                    className="rounded border border-red-300 px-2 py-1 text-[11px] text-red-700"
                  >
                    삭제
                  </button>
                )}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <VoiceSelect
                  label="짱샘 voice"
                  value={geminiVoiceJjangsaem}
                  onChange={setGeminiVoiceJjangsaem}
                  filterFor="jjangsaem"
                />
                <VoiceSelect
                  label="엄마 voice"
                  value={geminiVoiceMom}
                  onChange={setGeminiVoiceMom}
                  filterFor="mom"
                />
                <VoiceSelect
                  label="아빠 voice"
                  value={geminiVoiceDad}
                  onChange={setGeminiVoiceDad}
                  filterFor="dad"
                />
              </div>
              <p className="mt-2 text-[11px] text-blue-800 dark:text-blue-200">
                💡 모델: <code>gemini-2.5-pro-preview-tts</code>. WAV 24kHz 모노 출력. 모든
                보이스는 Gemini 30개 사전 정의 보이스 중 선택. 추천(★) 표시는 짱샘 영상
                톤에 어울릴 만한 후보 — 자유롭게 바꿔도 됨.
              </p>
            </div>
          )}
        </div>

        <div className="mb-3 flex items-center gap-3">
          <button
            onClick={handleSynthesizeAll}
            disabled={!canSynthesize || synthesizing}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:bg-zinc-400 disabled:cursor-not-allowed"
          >
            {synthesizing ? '합성 중...' : '전체 합성'}
          </button>
          <span className="text-xs text-zinc-500">
            {parsed.lines.length}줄 — 한 줄씩 순차 호출 (
            {ttsProvider === 'gemini' ? 'Gemini 2.5 TTS' : 'Supertone Sona 2'})
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
            {ttsProvider === 'gemini' && !geminiApiKey.trim()
              ? 'Gemini API 키를 먼저 입력해주세요.'
              : ttsProvider === 'supertone'
                ? '파싱 에러나 300자 초과 라인이 있어 합성을 시작할 수 없습니다. 위 검수 패널을 확인해주세요.'
                : '파싱 에러가 있어 합성을 시작할 수 없습니다.'}
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

      <section className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
        <h2 className="mb-3 text-sm font-semibold">
          9. MP4 합성 (TTS 경로 전용)
          <span className="ml-2 text-xs font-normal text-zinc-500">
            슬라이드 PNG + 라인 오디오 → 1920×1080 MP4 (ffmpeg). 자막은 vrew에서 추가.
            직접 녹음(OBS) 흐름이면 이 단계는 건너뛰고 PowerPoint+OBS로 진행.
          </span>
        </h2>

        {parsed.slideCount === 0 && (
          <div className="mb-3 rounded bg-amber-50 dark:bg-amber-950 p-3 text-xs text-amber-800 dark:text-amber-200">
            먼저 3번에서 대본을 작성하세요.
          </div>
        )}
        {parsed.slideCount > 0 && !allSlideImagesReady && (
          <div className="mb-3 rounded bg-amber-50 dark:bg-amber-950 p-3 text-xs text-amber-800 dark:text-amber-200">
            모든 슬라이드 이미지가 필요합니다 ({Object.keys(slideImages).length}/
            {parsed.slideCount}). 5번 섹션에서 자동 생성 또는 업로드해주세요.
          </div>
        )}
        {parsed.slideCount > 0 && allSlideImagesReady && !allAudioReady && (
          <div className="mb-3 rounded bg-amber-50 dark:bg-amber-950 p-3 text-xs text-amber-800 dark:text-amber-200">
            모든 라인 음성이 합성되어야 합니다 ({doneCount}/{parsed.lines.length}).
            7번에서 합성을 완료하세요.
          </div>
        )}

        <div className="mb-3 flex items-center gap-3">
          <button
            onClick={handleRenderMp4}
            disabled={!canRender}
            className="rounded bg-rose-600 px-4 py-2 text-sm text-white hover:bg-rose-500 disabled:bg-zinc-400 disabled:cursor-not-allowed"
          >
            {renderState.status === 'queued' && '대기 중...'}
            {renderState.status === 'audio_concat' &&
              `슬라이드 ${renderState.currentSlide ?? 1}/${renderState.totalSlides ?? '?'} 오디오 정리 중...`}
            {renderState.status === 'segment_render' &&
              `슬라이드 ${renderState.currentSlide ?? 1}/${renderState.totalSlides ?? '?'} 영상 합성 중...`}
            {renderState.status === 'final_concat' && '최종 합치는 중...'}
            {(renderState.status === 'idle' ||
              renderState.status === 'done' ||
              renderState.status === 'error') &&
              '영상 렌더 시작'}
          </button>
          {jobId && <span className="text-xs text-zinc-500">job: {jobId}</span>}
        </div>

        {(renderState.status === 'queued' ||
          renderState.status === 'audio_concat' ||
          renderState.status === 'segment_render' ||
          renderState.status === 'final_concat') && (
          <div className="mb-3">
            <div className="h-2 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full bg-rose-500 transition-all"
                style={{ width: `${Math.round(renderState.progress * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              {Math.round(renderState.progress * 100)}% — 슬라이드 수에 따라 1~5분 소요.
            </p>
          </div>
        )}

        {renderState.status === 'error' && renderState.error && (
          <div className="mb-3 rounded bg-red-50 dark:bg-red-950 p-3 text-xs text-red-800 dark:text-red-200">
            렌더 실패: {renderState.error}
          </div>
        )}

        {renderState.status === 'done' && renderState.outputUrl && (
          <div className="rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 p-3">
            <p className="mb-2 text-xs font-medium text-emerald-800 dark:text-emerald-200">
              ✓ 렌더 완료
            </p>
            <video
              src={renderState.outputUrl}
              controls
              className="w-full rounded bg-black"
              style={{ aspectRatio: '16 / 9' }}
            />
            <a
              href={renderState.outputUrl}
              download={`${jobId}.mp4`}
              className="mt-2 inline-block rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-500"
            >
              MP4 다운로드
            </a>
          </div>
        )}
      </section>
      </>
      )}

      <BackToTopButton />
    </main>
  );
}

function BackToTopButton() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onScroll = () => setVisible(window.scrollY > 400);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!visible) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      title="맨 위로"
      aria-label="맨 위로"
      className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  );
}

function VoiceSelect({
  label,
  value,
  onChange,
  filterFor,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  filterFor: 'jjangsaem' | 'mom' | 'dad';
}) {
  return (
    <label className="block text-[11px]">
      <span className="block font-medium text-blue-900 dark:text-blue-100">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-blue-300 dark:border-blue-800 bg-white dark:bg-zinc-900 px-2 py-1 text-xs"
      >
        {GEMINI_VOICES.map((v) => {
          const recommended = v.suggestedFor?.includes(filterFor);
          return (
            <option key={v.name} value={v.name}>
              {recommended ? '★ ' : ''}
              {v.name} — {v.style}
            </option>
          );
        })}
      </select>
    </label>
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
