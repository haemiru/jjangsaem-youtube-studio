// Phase C — ffmpeg 기반 mp4 합성 잡 스토어 (single dev process 인메모리)

import path from 'node:path';
import { renderMp4, type RenderInputSlide } from './ffmpeg-render';

export type RenderJobStatus =
  | 'queued'
  | 'audio_concat'
  | 'segment_render'
  | 'final_concat'
  | 'done'
  | 'error';

export interface RenderJob {
  jobId: string;
  status: RenderJobStatus;
  progress: number; // 0~1
  currentSlide?: number; // 1-based 현재 진행 중인 슬라이드
  totalSlides?: number;
  outputUrl?: string;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

const jobs = new Map<string, RenderJob>();

export function getJob(jobId: string): RenderJob | undefined {
  return jobs.get(jobId);
}

export function startRenderJob(
  jobId: string,
  slides: RenderInputSlide[]
): RenderJob {
  const existing = jobs.get(jobId);
  if (
    existing &&
    existing.status !== 'done' &&
    existing.status !== 'error'
  ) {
    return existing;
  }

  const job: RenderJob = {
    jobId,
    status: 'queued',
    progress: 0,
    totalSlides: slides.length,
    startedAt: Date.now(),
  };
  jobs.set(jobId, job);

  void runRender(job, slides);
  return job;
}

async function runRender(job: RenderJob, slides: RenderInputSlide[]): Promise<void> {
  try {
    const workDir = path.join(process.cwd(), 'public', 'videos', job.jobId);

    const result = await renderMp4({
      jobId: job.jobId,
      workDir,
      slides,
      onProgress: (u) => {
        if (u.stage === 'audio_concat') {
          job.status = 'audio_concat';
          job.currentSlide = (u.slideIdx ?? 0) + 1;
          // 슬라이드별 음성 concat은 segment_render의 1단계 — 슬라이드별 진행률 절반
          const base = (u.slideIdx ?? 0) / slides.length;
          job.progress = base + 0.5 / slides.length / 2;
        } else if (u.stage === 'segment_render') {
          job.status = 'segment_render';
          job.currentSlide = (u.slideIdx ?? 0) + 1;
          const base = (u.slideIdx ?? 0) / slides.length;
          job.progress = base + 1 / slides.length / 2;
        } else if (u.stage === 'final_concat') {
          job.status = 'final_concat';
          job.progress = 0.95;
        }
      },
    });

    job.status = 'done';
    job.progress = 1;
    job.outputUrl = result.outputUrl;
    job.finishedAt = Date.now();
  } catch (err) {
    job.status = 'error';
    job.error = err instanceof Error ? err.message : String(err);
    job.finishedAt = Date.now();
  }
}
