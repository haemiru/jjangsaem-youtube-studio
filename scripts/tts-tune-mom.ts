import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

for (const f of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), f);
  if (existsSync(p)) loadEnv({ path: p });
}

import { synthesize, SupertoneError, type VoiceSettings } from '../src/lib/supertone';
import { VOICE_IDS } from '../src/lib/voices';

interface Variant {
  filename: string;
  label: string;
  text: string;
  voiceSettings?: VoiceSettings;
}

const calmText =
  '근데요 선생님, 우리 아이가 딱 그래요. 막 뛰어다니다가 갑자기 멍하니 서 있고요.';

const seriousText =
  '선생님, 사실 요즘 잠을 못 자요. 우리 아이가 또래보다 많이 다른 것 같아서요. 어떻게 해야 할지 모르겠어요.';

const VARIANTS: Variant[] = [
  {
    filename: 'mom-A-calm.mp3',
    label: 'A안 — 약간 차분 (speed 0.95, pitch_shift -1, pitch_variance 0.8)',
    text: calmText,
    voiceSettings: { speed: 0.95, pitch_shift: -1, pitch_variance: 0.8 },
  },
  {
    filename: 'mom-B-deeper.mp3',
    label: 'B안 — 좀 더 진중 (speed 0.92, pitch_shift -2, pitch_variance 0.7)',
    text: calmText,
    voiceSettings: { speed: 0.92, pitch_shift: -2, pitch_variance: 0.7 },
  },
  {
    filename: 'mom-C-serious-text.mp3',
    label: 'C안 — 진중한 문장 + 차분한 세팅 (speed 0.95, pitch_shift -1, pitch_variance 0.7)',
    text: seriousText,
    voiceSettings: { speed: 0.95, pitch_shift: -1, pitch_variance: 0.7 },
  },
];

async function main() {
  const outDir = resolve(process.cwd(), 'output', '_tts-verification');
  await mkdir(outDir, { recursive: true });
  console.log('\n=== 엄마 voice 튜닝 비교 ===\n');

  for (const v of VARIANTS) {
    process.stdout.write(`[${v.label}] ... `);
    try {
      const r = await synthesize({
        voiceId: VOICE_IDS.parent_mom,
        text: v.text,
        language: 'ko',
        model: 'sona_speech_1',
        voiceSettings: v.voiceSettings,
      });
      const filePath = resolve(outDir, v.filename);
      await writeFile(filePath, r.audio);
      console.log(`OK (${r.audioLengthSec ?? '?'}s)`);
      console.log(`  → ${filePath}`);
    } catch (err) {
      if (err instanceof SupertoneError) {
        console.log(`FAIL [${err.status}] ${err.raw}`);
      } else {
        console.log('FAIL');
        console.error(err);
      }
      process.exitCode = 1;
    }
  }

  console.log('\n=== 끝. A/B/C 들어보고 어느 게 가장 자연스러운지 알려주세요 ===');
}

main();
