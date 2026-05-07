import type { NextRequest } from 'next/server';
import { synthesize, SupertoneError } from '@/lib/supertone';
import { resolveVoiceId, type Speaker } from '@/lib/voices';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
}

export async function POST(request: NextRequest) {
  let body: SynthesizeRequestBody;
  try {
    body = (await request.json()) as SynthesizeRequestBody;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { lineIdx, speaker, parentGender, text, style, voiceSettings } = body;

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
  if (text.length > 300) {
    return Response.json(
      { error: `Supertone 라인 제한 300자 초과: ${text.length}자` },
      { status: 400 }
    );
  }

  const voiceId = resolveVoiceId(speaker, parentGender);

  try {
    const result = await synthesize({
      voiceId,
      text,
      language: 'ko',
      model: 'sona_speech_1',
      style,
      voiceSettings,
    });

    return Response.json({
      lineIdx,
      sizeBytes: result.audio.byteLength,
      audioLengthSec: result.audioLengthSec,
      contentType: result.contentType,
      audioBase64: result.audio.toString('base64'),
    });
  } catch (err) {
    if (err instanceof SupertoneError) {
      return Response.json(
        { error: 'supertone_error', status: err.status, raw: err.raw },
        { status: 502 }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'internal_error', message }, { status: 500 });
  }
}
