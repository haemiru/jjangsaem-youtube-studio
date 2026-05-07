import type { ParsedScript, ScriptLine } from './script-parser';

export type ScriptMode = 'dialogue' | 'solo';

export interface DeviceCheck {
  id: number;
  name: string;
  passed: boolean;
  detail: string;
}

export interface ValidationResult {
  mode: ScriptMode;
  devices: DeviceCheck[];
  passedCount: number;
  totalCount: number;
  recommended: boolean;
}

const PARENT_FILLERS = ['그게', '근데', '진짜요', '어머', '막', '약간', '아휴', '딱'];
const JJANGSAEM_FILLERS = ['그쵸', '사실은', '알고 보면', '한 가지만 더', '그게 보통은'];
const PARENT_EMOTION = [
  '우리 아이', '우리 애', '내 아이', '걱정', '불안', '속상', '답답', '슬프',
  '무서', '힘들', '눈물', '미안', '죄책', '마음이 아프', '잠을 못', '한숨',
];
const STIFF_OPENERS = ['맞아요', '정확해요', '그렇습니다', '맞습니다', '정확합니다'];

function bySlide(lines: ScriptLine[]): Map<number, ScriptLine[]> {
  const m = new Map<number, ScriptLine[]>();
  for (const l of lines) {
    if (!m.has(l.slideIdx)) m.set(l.slideIdx, []);
    m.get(l.slideIdx)!.push(l);
  }
  return m;
}

// 1. 호스트의 자기 아이 이야기·감정 — 슬라이드 절반 이상
function check1(parsed: ParsedScript): DeviceCheck {
  const slides = bySlide(parsed.lines);
  let qualified = 0;
  for (const [, lines] of slides) {
    const parentLines = lines.filter((l) => l.speaker === 'parent');
    const has = parentLines.some((l) =>
      PARENT_EMOTION.some((kw) => l.text.includes(kw))
    );
    if (has) qualified++;
  }
  const ratio = slides.size === 0 ? 0 : qualified / slides.size;
  return {
    id: 1,
    name: '호스트의 자기 아이 이야기·감정 (슬라이드 절반 이상)',
    passed: ratio >= 0.5,
    detail: `${qualified}/${slides.size} 슬라이드 (${Math.round(ratio * 100)}%)`,
  };
}

// 2. 짱샘 답변 중 "맞아요/정확해요/그렇습니다" 시작 ≤ 1/3
function check2(parsed: ParsedScript): DeviceCheck {
  const j = parsed.lines.filter((l) => l.speaker === 'jjangsaem');
  const stiff = j.filter((l) => STIFF_OPENERS.some((kw) => l.text.startsWith(kw)));
  const ratio = j.length === 0 ? 0 : stiff.length / j.length;
  return {
    id: 2,
    name: '짱샘 답변 "맞아요/정확해요/그렇습니다" 시작 ≤ 1/3',
    passed: ratio <= 1 / 3,
    detail: `${stiff.length}/${j.length} (${Math.round(ratio * 100)}%)`,
  };
}

// 3. 구어체 표지 — 화자별 5회 이상
function check3(parsed: ParsedScript): DeviceCheck {
  const parentText = parsed.lines.filter((l) => l.speaker === 'parent').map((l) => l.text).join(' ');
  const jText = parsed.lines.filter((l) => l.speaker === 'jjangsaem').map((l) => l.text).join(' ');
  const parentCount = PARENT_FILLERS.reduce(
    (sum, kw) => sum + (parentText.match(new RegExp(kw, 'g'))?.length ?? 0),
    0
  );
  const jCount = JJANGSAEM_FILLERS.reduce(
    (sum, kw) => sum + (jText.match(new RegExp(kw, 'g'))?.length ?? 0),
    0
  );
  return {
    id: 3,
    name: '구어체 표지 — 화자별 5회 이상',
    passed: parentCount >= 5 && jCount >= 5,
    detail: `부모 ${parentCount}회 / 짱샘 ${jCount}회`,
  };
}

// 4. 짧·짧·긴 리듬 — 한 턴 내 비슷한 길이 (±5자) 3번 연속 금지
function check4(parsed: ParsedScript): DeviceCheck {
  // 같은 화자 연속 묶음을 "턴"으로 본다
  const turns: ScriptLine[][] = [];
  for (const line of parsed.lines) {
    const last = turns[turns.length - 1];
    if (last && last[0].speaker === line.speaker && last[0].slideIdx === line.slideIdx) {
      last.push(line);
    } else {
      turns.push([line]);
    }
  }

  const offenders: string[] = [];
  for (const turn of turns) {
    if (turn.length < 3) continue;
    for (let i = 0; i + 2 < turn.length; i++) {
      const a = turn[i].text.length;
      const b = turn[i + 1].text.length;
      const c = turn[i + 2].text.length;
      if (Math.abs(a - b) <= 5 && Math.abs(b - c) <= 5) {
        offenders.push(`L${turn[i].rawLineNo}~ (${a}/${b}/${c}자)`);
      }
    }
  }
  return {
    id: 4,
    name: '짧·짧·긴 리듬 — 비슷한 길이 3연속 금지',
    passed: offenders.length === 0,
    detail: offenders.length === 0 ? '문제 없음' : `위반 ${offenders.length}건: ${offenders.slice(0, 3).join(', ')}`,
  };
}

// 5. 발견의 순간 — 슬라이드별 부모 "아!" + 짱샘 따뜻한 한마디
function check5(parsed: ParsedScript): DeviceCheck {
  const slides = bySlide(parsed.lines);
  const WARM = ['어머님', '아버님', '괜찮', '잘하고', '마음', '잘 알', '그럴 수 있'];
  let qualified = 0;
  const failedSlides: number[] = [];
  for (const [idx, lines] of slides) {
    const parentAh = lines.some(
      (l) => l.speaker === 'parent' && /(^|\s)아[!?\.~]/.test(l.text)
    );
    const warm = lines.some(
      (l) => l.speaker === 'jjangsaem' && WARM.some((kw) => l.text.includes(kw))
    );
    if (parentAh && warm) qualified++;
    else failedSlides.push(idx + 1);
  }
  return {
    id: 5,
    name: '발견의 순간 — 매 슬라이드 부모 "아!" + 짱샘 따뜻한 한마디',
    passed: qualified === slides.size && slides.size > 0,
    detail:
      qualified === slides.size
        ? `${qualified}/${slides.size} 슬라이드 OK`
        : `${qualified}/${slides.size} OK, 부족: 슬라이드 ${failedSlides.join(', ')}`,
  };
}

// ============= 1인 모드 (solo) 전용 체크 =============

const SOLO_FILLERS = [
  '그게 보통은', '한 가지만', '사실은', '알고 보면', '실제로는',
  '그쵸', '그게요', '말씀드리면', '기억하시면',
];
const STORYTELLING_OPENERS = [
  '오늘은', '해볼게요', '얘기를', '얘기예요', '궁금하셨', '얘기해', '시작',
];
const WARM_CLOSERS = [
  '어머님', '아버님', '괜찮', '잘하고', '마음', '잘 알', '그럴 수 있',
];

// S1. 구어체 표지 5회 이상
function soloCheck1(parsed: ParsedScript): DeviceCheck {
  const text = parsed.lines.map((l) => l.text).join(' ');
  const count = SOLO_FILLERS.reduce(
    (sum, kw) => sum + (text.match(new RegExp(kw, 'g'))?.length ?? 0),
    0
  );
  return {
    id: 1,
    name: '구어체 표지 5회 이상',
    passed: count >= 5,
    detail: `${count}회 (목표 5회+)`,
  };
}

// S2. 첫 슬라이드에 스토리텔링 도입
function soloCheck2(parsed: ParsedScript): DeviceCheck {
  const firstSlide = parsed.lines.filter((l) => l.slideIdx === 0);
  const has = firstSlide.some((l) =>
    STORYTELLING_OPENERS.some((kw) => l.text.includes(kw))
  );
  return {
    id: 2,
    name: '첫 슬라이드 스토리텔링 도입 ("오늘은/해볼게요/얘기")',
    passed: has,
    detail: has ? '도입부 OK' : '슬라이드 1에 도입 표현 없음',
  };
}

// S3. 마지막 슬라이드에 따뜻한 마무리
function soloCheck3(parsed: ParsedScript): DeviceCheck {
  if (parsed.lines.length === 0) {
    return { id: 3, name: '마지막 슬라이드 따뜻한 마무리', passed: false, detail: '대본 없음' };
  }
  const lastSlide = Math.max(...parsed.lines.map((l) => l.slideIdx));
  const lastLines = parsed.lines.filter((l) => l.slideIdx === lastSlide);
  const has = lastLines.some((l) =>
    WARM_CLOSERS.some((kw) => l.text.includes(kw))
  );
  return {
    id: 3,
    name: '마지막 슬라이드 따뜻한 마무리 ("어머님/괜찮/잘하고")',
    passed: has,
    detail: has ? `슬라이드 ${lastSlide + 1} 마무리 OK` : `슬라이드 ${lastSlide + 1}에 다독임 표현 없음`,
  };
}

export function validateScript(
  parsed: ParsedScript,
  mode: ScriptMode = 'dialogue'
): ValidationResult {
  if (mode === 'solo') {
    const devices = [soloCheck1(parsed), soloCheck2(parsed), soloCheck3(parsed)];
    const passedCount = devices.filter((d) => d.passed).length;
    return {
      mode,
      devices,
      passedCount,
      totalCount: devices.length,
      recommended: passedCount >= 2,
    };
  }

  const devices = [
    check1(parsed),
    check2(parsed),
    check3(parsed),
    check4(parsed),
    check5(parsed),
  ];
  const passedCount = devices.filter((d) => d.passed).length;
  return {
    mode,
    devices,
    passedCount,
    totalCount: devices.length,
    recommended: passedCount >= 4,
  };
}
