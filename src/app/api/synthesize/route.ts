import type { NextRequest } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { synthesize, SupertoneError } from '@/lib/supertone';
import { synthesizeWithGemini, GeminiTTSError } from '@/lib/gemini-tts';
import { resolveVoiceId, type Speaker } from '@/lib/voices';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Provider = 'supertone' | 'gemini';

interface SynthesizeRequestBody {
  jobId?: string;
  lineIdx: number;
  speaker: Speaker;
  parentGender: 'mom' | 'dad';
  text: string;
  style?: string;
  voiceSettings?: {
    pitch_shift?: number;
    pitch_variance?: number;
    speed?: number;
  };
  // Phase A — Gemini TTS 옵션
  provider?: Provider;
  geminiApiKey?: string;
  geminiVoices?: {
    jjangsaem?: string;
    mom?: string;
    dad?: string;
  };
}

const SAFE_JOB_ID = /^[A-Za-z0-9_-]+$/;

function resolveGeminiVoice(
  speaker: Speaker,
  parentGender: 'mom' | 'dad',
  voices?: SynthesizeRequestBody['geminiVoices']
): string {
  if (speaker === 'jjangsaem') return voices?.jjangsaem || 'Sulafat';
  if (parentGender === 'mom') return voices?.mom || 'Leda';
  return voices?.dad || 'Charon';
}

export async function POST(request: NextRequest) {
  let body: SynthesizeRequestBody;
  try {
    body = (await request.json()) as SynthesizeRequestBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const {
    jobId,
    lineIdx,
    speaker,
    parentGender,
    text,
    style,
    voiceSettings,
    provider = 'supertone',
    geminiApiKey,
    geminiVoices,
  } = body;

  if (typeof lineIdx !== 'number' || lineIdx < 0 || !Number.isFinite(lineIdx)) {
    return Response.json({ error: 'invalid lineIdx' }, { status: 400 });
  }
  if (speaker !== 'jjangsaem' && speaker !== 'parent') {
    return Response.json({ error: 'invalid speaker' }, { status: 400 });
  }
  if (parentGender !== 'mom' && parentGender !== 'dad') {
    return Response.json({ error: 'invalid parentGender' }, { status: 400 });
  }
  if (typeof text !== 'string' || !text.trim()) {
    return Response.json({ error: 'empty text' }, { status: 400 });
  }
  if (provider === 'supertone' && text.length > 300) {
    return Response.json(
      { error: `Supertone 라인 제한 300자 초과: ${text.length}자` },
      { status: 400 }
    );
  }
  if (provider !== 'supertone' && provider !== 'gemini') {
    return Response.json({ error: 'invalid provider' }, { status: 400 });
  }
  if (provider === 'gemini' && !geminiApiKey) {
    return Response.json(
      { error: 'gemini provider 사용 시 geminiApiKey 필수' },
      { status: 400 }
    );
  }
  if (jobId && !SAFE_JOB_ID.test(jobId)) {
    return Response.json({ error: 'invalid jobId' }, { status: 400 });
  }

  try {
    let audioBytes: Buffer;
    let contentType: string;
    let audioLengthSec: number | null;
    let extension: 'mp3' | 'wav';

    if (provider === 'gemini') {
      const voiceName = resolveGeminiVoice(speaker, parentGender, geminiVoices);
      const result = await synthesizeWithGemini({
        apiKey: geminiApiKey!,
        text,
        voiceName,
      });
      audioBytes = result.audio;
      contentType = result.contentType;
      audioLengthSec = result.audioLengthSec;
      extension = 'wav';
    } else {
      const voiceId = resolveVoiceId(speaker, parentGender);
      const result = await synthesize({
        voiceId,
        text,
        language: 'ko',
        model: 'sona_speech_2',
        style,
        voiceSettings,
      });
      audioBytes = result.audio;
      contentType = result.contentType;
      audioLengthSec = result.audioLengthSec;
      extension = 'mp3';
    }

    let audioUrl: string | null = null;
    if (jobId) {
      const fileName = `line-${String(lineIdx).padStart(3, '0')}.${extension}`;
      const dir = path.join(process.cwd(), 'public', 'audio', jobId);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, fileName), audioBytes);
      audioUrl = `/audio/${jobId}/${fileName}`;
    }

    return Response.json({
      lineIdx,
      jobId: jobId ?? null,
      provider,
      sizeBytes: audioBytes.byteLength,
      audioLengthSec,
      contentType,
      audioBase64: audioBytes.toString('base64'),
      audioUrl,
    });
  } catch (err) {
    if (err instanceof SupertoneError) {
      return Response.json(
        { error: 'supertone_error', status: err.status, raw: err.raw },
        { status: 502 }
      );
    }
    if (err instanceof GeminiTTSError) {
      return Response.json(
        { error: 'gemini_error', status: err.status, raw: err.raw },
        { status: 502 }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'internal_error', message }, { status: 500 });
  }
}
