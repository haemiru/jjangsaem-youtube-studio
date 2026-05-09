import { spawn } from 'node:child_process';
import { mkdir, writeFile, unlink, access } from 'node:fs/promises';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const FFMPEG = (ffmpegPath as unknown as string) || 'ffmpeg';

const VIDEO_W = 1920;
const VIDEO_H = 1080;
const FPS = 30;

export interface RenderInputSlide {
  /** 0-based slide index */
  slideIdx: number;
  /** Absolute filesystem path to the slide image (PNG/JPG/WEBP) */
  imagePath: string;
  /** Audio files in order; each entry: absolute filesystem path */
  audioPaths: string[];
}

export interface RenderProgressUpdate {
  stage: 'audio_concat' | 'segment_render' | 'final_concat';
  slideIdx?: number;
  message?: string;
}

export interface RenderInputs {
  jobId: string;
  workDir: string; // public/videos/<jobId>
  slides: RenderInputSlide[];
  onProgress?: (u: RenderProgressUpdate) => void;
}

export interface RenderResult {
  outputPath: string; // absolute fs path
  outputUrl: string; // /videos/<jobId>/video.mp4
}

async function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      // ffmpeg는 stderr로 진행/로그 다 내보냄. 일정 길이 넘으면 자르기.
      if (stderr.length > 400_000) stderr = stderr.slice(-200_000);
    });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}\n--- stderr (last 4KB) ---\n${stderr.slice(-4000)}`));
    });
  });
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function escapeForConcatFile(p: string): string {
  // ffmpeg concat demuxer expects: file '<path>'
  // Single quotes inside path need escaping by replacing ' with '\''.
  // Also windows backslashes are fine inside single quotes.
  return p.replace(/'/g, "'\\''");
}

async function writeConcatFile(listPath: string, files: string[]): Promise<void> {
  const lines = files.map((f) => `file '${escapeForConcatFile(f)}'`).join('\n');
  await writeFile(listPath, lines, 'utf-8');
}

/**
 * 슬라이드별 이미지 + 라인 오디오들을 합쳐서 단일 mp4를 만든다.
 * 1. 라인 오디오들을 슬라이드별로 AAC m4a로 재인코딩 + concat
 * 2. 슬라이드별 PNG + 슬라이드 오디오 → segment_NNN.mp4
 * 3. 모든 segment 파일을 concat → 최종 video.mp4
 */
export async function renderMp4(inputs: RenderInputs): Promise<RenderResult> {
  const { jobId, workDir, slides, onProgress } = inputs;
  await mkdir(workDir, { recursive: true });

  if (slides.length === 0) throw new Error('슬라이드가 0개입니다');
  for (const s of slides) {
    if (!(await fileExists(s.imagePath))) {
      throw new Error(
        `슬라이드 ${s.slideIdx + 1}의 이미지 파일이 없습니다: ${s.imagePath}`
      );
    }
    if (s.audioPaths.length === 0) {
      throw new Error(`슬라이드 ${s.slideIdx + 1}의 오디오가 없습니다`);
    }
    for (const a of s.audioPaths) {
      if (!(await fileExists(a))) {
        throw new Error(`오디오 파일이 없습니다: ${a}`);
      }
    }
  }

  const tempDir = path.join(workDir, '_tmp');
  await mkdir(tempDir, { recursive: true });

  const segmentPaths: string[] = [];

  // 1+2. 슬라이드별 처리
  for (const s of slides) {
    const idxStr = String(s.slideIdx + 1).padStart(3, '0');

    // 1. 슬라이드 오디오 concat (재인코딩 — mp3/wav 혼합 호환)
    onProgress?.({ stage: 'audio_concat', slideIdx: s.slideIdx });
    const audioListPath = path.join(tempDir, `slide-${idxStr}-audio.txt`);
    await writeConcatFile(audioListPath, s.audioPaths);

    const slideAudioPath = path.join(tempDir, `slide-${idxStr}.m4a`);
    await runFfmpeg([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      audioListPath,
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-ar',
      '48000',
      slideAudioPath,
    ]);

    // 2. PNG + 슬라이드 오디오 → 세그먼트 mp4 (1920x1080 letterbox)
    onProgress?.({ stage: 'segment_render', slideIdx: s.slideIdx });
    const segmentPath = path.join(tempDir, `segment-${idxStr}.mp4`);
    await runFfmpeg([
      '-y',
      '-loop',
      '1',
      '-i',
      s.imagePath,
      '-i',
      slideAudioPath,
      '-c:v',
      'libx264',
      '-tune',
      'stillimage',
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(FPS),
      '-vf',
      `scale=${VIDEO_W}:${VIDEO_H}:force_original_aspect_ratio=decrease,pad=${VIDEO_W}:${VIDEO_H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`,
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      '-movflags',
      '+faststart',
      segmentPath,
    ]);
    segmentPaths.push(segmentPath);
  }

  // 3. 세그먼트 concat → 최종 mp4
  onProgress?.({ stage: 'final_concat' });
  const finalListPath = path.join(tempDir, 'final-list.txt');
  await writeConcatFile(finalListPath, segmentPaths);

  const outputPath = path.join(workDir, 'video.mp4');
  await runFfmpeg([
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    finalListPath,
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    outputPath,
  ]);

  // 임시 파일 정리 (실패해도 무시)
  for (const p of segmentPaths) {
    try {
      await unlink(p);
    } catch {
      // ignore
    }
  }
  try {
    await unlink(finalListPath);
  } catch {
    // ignore
  }

  return {
    outputPath,
    outputUrl: `/videos/${jobId}/video.mp4`,
  };
}
