import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { Deck } from '../../remotion/types';

export type RenderJobStatus = 'queued' | 'bundling' | 'rendering' | 'done' | 'error';

export interface RenderJob {
  jobId: string;
  status: RenderJobStatus;
  progress: number; // 0~1
  renderedFrames?: number;
  totalFrames?: number;
  outputPath?: string;
  outputUrl?: string;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

const jobs = new Map<string, RenderJob>();

let bundleLocationCache: string | null = null;
let bundlePromise: Promise<string> | null = null;

async function getBundleLocation(): Promise<string> {
  if (bundleLocationCache) return bundleLocationCache;
  if (bundlePromise) return bundlePromise;

  bundlePromise = (async () => {
    const { bundle } = await import('@remotion/bundler');
    const entryPoint = path.join(process.cwd(), 'remotion', 'index.ts');
    const location = await bundle({
      entryPoint,
      // Force publicDir to project root public/ so /audio/<jobId>/*.mp3 resolves via staticFile
      publicDir: path.join(process.cwd(), 'public'),
    });
    bundleLocationCache = location;
    return location;
  })();

  try {
    return await bundlePromise;
  } finally {
    bundlePromise = null;
  }
}

export function getJob(jobId: string): RenderJob | undefined {
  return jobs.get(jobId);
}

export function listJobs(): RenderJob[] {
  return Array.from(jobs.values()).sort((a, b) => b.startedAt - a.startedAt);
}

export function startRenderJob(jobId: string, deck: Deck): RenderJob {
  const existing = jobs.get(jobId);
  if (existing && (existing.status === 'queued' || existing.status === 'bundling' || existing.status === 'rendering')) {
    return existing;
  }

  const job: RenderJob = {
    jobId,
    status: 'queued',
    progress: 0,
    startedAt: Date.now(),
  };
  jobs.set(jobId, job);

  void runRender(job, deck);
  return job;
}

async function runRender(job: RenderJob, deck: Deck): Promise<void> {
  try {
    const { selectComposition, renderMedia } = await import('@remotion/renderer');

    job.status = 'bundling';
    const serveUrl = await getBundleLocation();

    const inputProps = { deck } as unknown as Record<string, unknown>;

    const composition = await selectComposition({
      serveUrl,
      id: 'SlideShow',
      inputProps,
    });
    job.totalFrames = composition.durationInFrames;
    job.status = 'rendering';

    const outDir = path.join(process.cwd(), 'public', 'videos', job.jobId);
    await mkdir(outDir, { recursive: true });
    const outputPath = path.join(outDir, 'video.mp4');

    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps,
      onProgress: ({ progress, renderedFrames }) => {
        job.progress = progress;
        job.renderedFrames = renderedFrames;
      },
    });

    job.status = 'done';
    job.progress = 1;
    job.outputPath = outputPath;
    job.outputUrl = `/videos/${job.jobId}/video.mp4`;
    job.finishedAt = Date.now();
  } catch (err) {
    job.status = 'error';
    job.error = err instanceof Error ? err.message : String(err);
    job.finishedAt = Date.now();
  }
}
