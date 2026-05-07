import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// .env.local 우선, 없으면 .env
for (const f of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), f);
  if (existsSync(p)) loadEnv({ path: p });
}

import { synthesize, SupertoneError } from '../src/lib/supertone';
import { VOICE_IDS } from '../src/lib/voices';

interface Sample {
  label: string;
  voiceId: string;
  text: string;
  filename: string;
}

const SAMPLES: Sample[] = [
  {
    label: '짱샘 (25년차 아동 재활치료사)',
    voiceId: VOICE_IDS.jjangsaem,
    text: '어머님 마음 정말 잘 알아요. 그게 보통은요, 아이가 자기 몸을 아직 충분히 못 느껴서 그래요.',
    filename: '01-jjangsaem.mp3',
  },
  {
    label: '엄마 (걱정하는 부모)',
    voiceId: VOICE_IDS.parent_mom,
    text: '근데요 선생님, 우리 아이가 딱 그래요. 막 뛰어다니다가 갑자기 멍하니 서 있고요.',
    filename: '02-parent-mom.mp3',
  },
  {
    label: '아빠 (걱정하는 부모)',
    voiceId: VOICE_IDS.parent_dad,
    text: '아 그래요? 사실 저도 그게 좀 걱정이었거든요. 진짜요? 그게 그런 이유 때문이라고요?',
    filename: '03-parent-dad.mp3',
  },
];

async function main() {
  const outDir = resolve(process.cwd(), 'output', '_tts-verification');
  await mkdir(outDir, { recursive: true });

  console.log('\n=== Supertone TTS 검증 시작 ===\n');
  console.log(`출력 폴더: ${outDir}\n`);

  for (const sample of SAMPLES) {
    process.stdout.write(`[${sample.label}] 합성 중... `);
    try {
      const result = await synthesize({
        voiceId: sample.voiceId,
        text: sample.text,
        language: 'ko',
        model: 'sona_speech_1',
      });
      const filePath = resolve(outDir, sample.filename);
      await writeFile(filePath, result.audio);
      console.log(`OK (${result.audio.byteLength} bytes, ${result.audioLengthSec ?? '?'}s)`);
      console.log(`  → ${filePath}`);
    } catch (err) {
      if (err instanceof SupertoneError) {
        console.log(`FAIL [${err.status}]`);
        console.log(`  raw: ${err.raw}`);
      } else {
        console.log(`FAIL`);
        console.error(err);
      }
      process.exitCode = 1;
    }
  }

  console.log('\n=== 끝 ===');
  console.log('mp3 3개를 들어보고, 짱샘/엄마/아빠 음성 모두 만족스러우면 알려주세요.');
}

main();
