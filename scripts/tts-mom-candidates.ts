import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

for (const f of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), f);
  if (existsSync(p)) loadEnv({ path: p });
}

import { synthesize, SupertoneError, type SupertoneModel } from '../src/lib/supertone';

interface Candidate {
  filename: string;
  label: string;
  voiceId: string;
  style?: string;
  model?: SupertoneModel;
  text: string;
  voiceSettings?: { pitch_shift?: number; pitch_variance?: number; speed?: number };
}

// 감정 강도가 다른 두 톤의 대사
const WORRIED =
  '선생님 우리 아이가요, 막 정신없이 뛰어다니다가 갑자기 멍하니 서 있어요. 저 진짜 너무 걱정돼서 잠도 못 자요.';
const DISCOVERY =
  '아! 그래서였구나... 우리 아이가 자기 몸을 못 느낀다고요? 진짜요? 그게 그런 이유 때문이라고요?';

// 후보 voice — 한국 어머님 대화체 후보들 (middle-aged 우선 + sona_speech_2)
const CANDIDATES: Candidate[] = [
  // 1) Grace — middle-aged, anxious style
  {
    filename: 'A1-grace-anxious-worried.mp3',
    label: 'A1. Grace (middle-aged) / anxious / 걱정 대사',
    voiceId: 'bacc385ac094a4e0c187a0',
    style: 'anxious',
    model: 'sona_speech_2',
    text: WORRIED,
  },
  {
    filename: 'A2-grace-sad-worried.mp3',
    label: 'A2. Grace / sad / 걱정 대사',
    voiceId: 'bacc385ac094a4e0c187a0',
    style: 'sad',
    model: 'sona_speech_2',
    text: WORRIED,
  },
  {
    filename: 'A3-grace-neutral-discovery.mp3',
    label: 'A3. Grace / neutral / 발견 대사',
    voiceId: 'bacc385ac094a4e0c187a0',
    style: 'neutral',
    model: 'sona_speech_2',
    text: DISCOVERY,
  },

  // 2) Gloria — middle-aged, kind style
  {
    filename: 'B1-gloria-kind-worried.mp3',
    label: 'B1. Gloria (middle-aged) / kind / 걱정 대사',
    voiceId: 'fa1880d5d3846077811a76',
    style: 'kind',
    model: 'sona_speech_2',
    text: WORRIED,
  },
  {
    filename: 'B2-gloria-sad-worried.mp3',
    label: 'B2. Gloria / sad / 걱정 대사',
    voiceId: 'fa1880d5d3846077811a76',
    style: 'sad',
    model: 'sona_speech_2',
    text: WORRIED,
  },

  // 3) Cindy — middle-aged narration (Mika류 baseline 비교)
  {
    filename: 'C1-cindy-neutral-worried.mp3',
    label: 'C1. Cindy (middle-aged narration) / neutral / 걱정 대사',
    voiceId: '39f27eaab088024ff6f9ac',
    style: 'neutral',
    model: 'sona_speech_2',
    text: WORRIED,
  },

  // 4) Esther — elder, anxious (좀 더 나이든 어머님 톤)
  {
    filename: 'D1-esther-anxious-worried.mp3',
    label: 'D1. Esther (elder) / anxious / 걱정 대사',
    voiceId: 'bd78c6dc3a148c716ca72c',
    style: 'anxious',
    model: 'sona_speech_2',
    text: WORRIED,
  },

  // 5) Desphara — middle-aged sad (저음·진중)
  {
    filename: 'E1-desphara-sad-worried.mp3',
    label: 'E1. Desphara (middle-aged) / sad / 걱정 대사',
    voiceId: '18139042935bc2849cb6ca',
    style: 'sad',
    model: 'sona_speech_2',
    text: WORRIED,
  },

  // 6) 현재 Mika baseline — 비교용
  {
    filename: 'Z0-mika-baseline.mp3',
    label: 'Z0. 현재 Mika / neutral / 걱정 대사 (baseline)',
    voiceId: '289a055b782b3072b7cd11',
    style: 'neutral',
    model: 'sona_speech_2',
    text: WORRIED,
  },
];

async function main() {
  const outDir = resolve(process.cwd(), 'output', '_mom-candidates');
  await mkdir(outDir, { recursive: true });

  console.log('\n=== 엄마 voice 후보 비교 ===');
  console.log(`출력 폴더: ${outDir}\n`);

  for (const c of CANDIDATES) {
    process.stdout.write(`[${c.label}] ... `);
    try {
      const r = await synthesize({
        voiceId: c.voiceId,
        text: c.text,
        language: 'ko',
        model: c.model ?? 'sona_speech_2',
        style: c.style,
        voiceSettings: c.voiceSettings,
      });
      const filePath = resolve(outDir, c.filename);
      await writeFile(filePath, r.audio);
      console.log(`OK (${r.audioLengthSec ?? '?'}s, ${(r.audio.byteLength / 1024).toFixed(1)} KB)`);
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

  console.log('\n=== 끝. mp3 들어보고 가장 자연스러운 후보 알려주세요 ===');
}

main();
