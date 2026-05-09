// Gemini 2.5 Pro Preview TTS — direct REST 호출 (SDK 미사용)
// API ref: https://ai.google.dev/gemini-api/docs/speech-generation

const GEMINI_TTS_MODEL =
  process.env.GEMINI_TTS_MODEL ?? 'gemini-2.5-pro-preview-tts';

export interface GeminiSynthesizeOptions {
  apiKey: string;
  text: string;
  voiceName: string;
}

export interface GeminiSynthesizeResult {
  audio: Buffer; // WAV 바이트 (PCM L16 + WAV 헤더)
  contentType: 'audio/wav';
  audioLengthSec: number;
  sampleRate: number;
}

export class GeminiTTSError extends Error {
  status: number;
  raw: string;
  constructor(status: number, raw: string) {
    super(`Gemini TTS API ${status}: ${raw.slice(0, 500)}`);
    this.status = status;
    this.raw = raw;
  }
}

interface GeminiTTSResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string };
      }>;
    };
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

function parseSampleRateFromMime(mime: string): number {
  // "audio/L16;codec=pcm;rate=24000" → 24000
  const m = mime.match(/rate=(\d+)/);
  return m ? Number(m[1]) : 24_000;
}

function buildWavHeader(pcmBytesLength: number, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(36 + pcmBytesLength, 4); // ChunkSize
  header.write('WAVE', 8, 4, 'ascii');
  header.write('fmt ', 12, 4, 'ascii');
  header.writeUInt32LE(16, 16); // Subchunk1Size for PCM
  header.writeUInt16LE(1, 20); // AudioFormat = PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 4, 'ascii');
  header.writeUInt32LE(pcmBytesLength, 40);
  return header;
}

export async function synthesizeWithGemini(
  opts: GeminiSynthesizeOptions
): Promise<GeminiSynthesizeResult> {
  const { apiKey, text, voiceName } = opts;
  if (!apiKey) throw new Error('Gemini API key가 비어있습니다');
  if (!text.trim()) throw new Error('합성할 텍스트가 비어있습니다');

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const responseText = await res.text();
  if (!res.ok) {
    throw new GeminiTTSError(res.status, responseText);
  }

  let parsed: GeminiTTSResponse;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new GeminiTTSError(res.status, `parse failed: ${responseText.slice(0, 300)}`);
  }

  if (parsed.error) {
    throw new GeminiTTSError(
      parsed.error.code ?? 500,
      parsed.error.message ?? 'Gemini API error'
    );
  }
  if (parsed.promptFeedback?.blockReason) {
    throw new GeminiTTSError(
      400,
      `차단됨: ${parsed.promptFeedback.blockReason}`
    );
  }

  const inline = parsed.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
    ?.inlineData;
  if (!inline?.data) {
    throw new GeminiTTSError(
      500,
      `응답에 audio inlineData가 없음. shape: ${JSON.stringify(parsed).slice(0, 500)}`
    );
  }

  const sampleRate = parseSampleRateFromMime(inline.mimeType ?? 'audio/L16;rate=24000');
  const pcm = Buffer.from(inline.data, 'base64');
  const wavHeader = buildWavHeader(pcm.byteLength, sampleRate);
  const wav = Buffer.concat([wavHeader, pcm]);
  const audioLengthSec = pcm.byteLength / 2 / sampleRate; // 16-bit mono

  return {
    audio: wav,
    contentType: 'audio/wav',
    audioLengthSec,
    sampleRate,
  };
}
