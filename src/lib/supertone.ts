const BASE_URL = 'https://supertoneapi.com/v1';

export type SupertoneModel =
  | 'sona_speech_1'
  | 'sona_speech_2'
  | 'sona_speech_2_flash'
  | 'supertonic_api_1';

export interface VoiceSettings {
  pitch_shift?: number;
  pitch_variance?: number;
  speed?: number;
}

export interface SynthesizeOptions {
  voiceId: string;
  text: string;
  language?: string;
  model?: SupertoneModel;
  style?: string;
  voiceSettings?: VoiceSettings;
  outputFormat?: 'mp3' | 'wav';
}

export interface SynthesizeResult {
  audio: Buffer;
  contentType: string;
  audioLengthSec: number | null;
}

export class SupertoneError extends Error {
  status: number;
  raw: string;
  constructor(status: number, raw: string) {
    super(`Supertone API ${status}: ${raw}`);
    this.status = status;
    this.raw = raw;
  }
}

export async function synthesize(opts: SynthesizeOptions): Promise<SynthesizeResult> {
  const apiKey = process.env.SUPERTONE_API_KEY;
  if (!apiKey) throw new Error('SUPERTONE_API_KEY 환경변수가 없습니다');

  const {
    voiceId,
    text,
    language = 'ko',
    model = 'sona_speech_2',
    style,
    voiceSettings,
    outputFormat = 'mp3',
  } = opts;

  if (text.length > 300) {
    throw new Error(`Supertone 라인 제한 300자 초과: ${text.length}자`);
  }

  const body: Record<string, unknown> = {
    text,
    language,
    model,
    output_format: outputFormat,
  };
  if (style) body.style = style;
  if (voiceSettings) body.voice_settings = voiceSettings;

  const url = `${BASE_URL}/text-to-speech/${voiceId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-sup-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const raw = await res.text();
    throw new SupertoneError(res.status, raw);
  }

  const arrBuf = await res.arrayBuffer();
  const audioLengthHeader = res.headers.get('X-Audio-Length');
  return {
    audio: Buffer.from(arrBuf),
    contentType: res.headers.get('Content-Type') ?? 'audio/mpeg',
    audioLengthSec: audioLengthHeader ? Number(audioLengthHeader) : null,
  };
}
