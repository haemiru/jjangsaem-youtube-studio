export type ScriptMode = 'dialogue' | 'solo';
export type ParentGender = 'mom' | 'dad';

export interface PromptInput {
  topic: string;
  mode: ScriptMode;
  parentGender?: ParentGender;
  targetMinutes: number;
  pdfText?: string;
  research?: string;
}

const PERSONA = `짱샘 페르소나:
- 25년차 아동 재활치료사
- 발달장애·감각통합·수면·식이 등 부모 고민에 답해온 경험 풍부
- 따뜻하고 차분, 부모의 죄책감을 덜어주는 화법
- "어머님/아버님" 호칭, "괜찮아요/잘하고 계세요/그럴 수 있어요"로 마음 다독임
- 전문 용어는 풀어쓰고 비유로 설명`;

const RHYTHM = `리듬 규칙:
- 한 라인은 70자 이내 권장, 200자 절대 초과 금지 (Supertone 300자 제한)
- 짧·짧·긴 패턴 — 비슷한 길이 3연속 금지
- 한 슬라이드 안에 여러 라인으로 끊어 호흡을 만든다`;

const FORMAT_RULES = `출력 형식 (반드시 준수):
- "## 슬라이드 1", "## 슬라이드 2" ... 헤더로 슬라이드 구분
- 각 라인은 라벨로 시작: [짱샘] 또는 [부모]
- 라벨 뒤에 한 줄 대사
- 마크다운 외 다른 설명·머리말·꼬리말 절대 출력 금지`;

function dialogueDevices(): string {
  return `자연스러움 5장치 (모두 만족):
1. 호스트(부모)의 자기 아이 이야기·감정 — 슬라이드 절반 이상에서 "우리 아이/걱정/속상/답답/잠을 못/한숨" 같은 표현
2. 짱샘 답변 시작 다양화 — "맞아요/정확해요/그렇습니다"로 시작하는 라인은 전체 짱샘 라인의 1/3 이하
3. 구어체 표지 — 부모는 "그게/근데/진짜요/어머/막/약간/아휴/딱", 짱샘은 "그쵸/사실은/알고 보면/한 가지만 더/그게 보통은요" 각 화자별 5회 이상
4. 짧·짧·긴 리듬 — 같은 화자 연속 라인이 비슷한 길이(±5자) 3번 연속이면 안 됨
5. 발견의 순간 — 매 슬라이드마다 부모 라인 하나에 "아! ..." 가 들어가고, 짱샘이 "어머님/괜찮/잘하고/마음/그럴 수 있" 같은 따뜻한 한마디로 받아줌`;
}

function soloDevices(): string {
  return `자연스러움 3장치 (모두 만족):
1. 구어체 표지 — "그게 보통은요/한 가지만/사실은/알고 보면/실제로는" 같은 표지를 전체에서 5회 이상 사용
2. 스토리텔링 도입 — 첫 슬라이드(슬라이드 1)에 "오늘은/얘기를 해볼게요/궁금하셨죠" 류로 시청자에게 말 거는 도입을 둔다
3. 따뜻한 마무리 — 마지막 슬라이드에 "어머님/아버님/괜찮/잘하고 계세요/마음" 같은 다독임 표현을 최소 한 번 넣는다`;
}

function referenceBlock(pdfText?: string): string {
  if (!pdfText || !pdfText.trim()) return '';
  return [
    '',
    '참고 자료 (책 발췌):',
    '아래는 사용자가 제공한 책의 본문 일부입니다. 이 자료의 톤·논리·실제 사례를 활용해 대본을 작성하되,',
    '책에 없는 내용을 만들어내지 말고, 책의 표현을 짱샘 화법으로 자연스럽게 변환하세요.',
    '책에 사용된 어휘·비유·강조 포인트를 우선적으로 살리고, 주제는 책 안에서 좁히는 각도로만 사용하세요.',
    '---',
    pdfText.trim(),
    '---',
  ].join('\n');
}

function researchBlock(research?: string): string {
  if (!research || !research.trim()) return '';
  return [
    '',
    '리서치 결과 (NotebookLM):',
    '아래는 짱샘님이 보유한 노트북(책·자료)에서 추출한 이번 주제 관련 정리입니다.',
    '이 정리에 나온 핵심 메시지·실천법·표현·비유를 1차 자료로 삼아 대본을 구성하세요.',
    '리서치에 없는 사실(통계·연구·일반 의학 상식)을 임의로 만들어내지 마세요.',
    '"자료에 없음"으로 표시된 항목은 대본에서 단정적으로 다루지 말고, 짱샘 화법의 일반적 다독임으로 대체하세요.',
    '---',
    research.trim(),
    '---',
  ].join('\n');
}

function lengthGuidance(targetMinutes: number): string {
  // Korean TTS ≈ 3.8자/sec. 1 line ≈ 50~70자 ≈ 13~18초. 1 slide ≈ 3~4 lines ≈ 45~60초.
  // Provide a hint range, but let the model decide the exact count.
  const totalSec = targetMinutes * 60;
  const estLow = Math.max(3, Math.round(totalSec / 60));
  const estHigh = Math.max(estLow + 1, Math.round(totalSec / 45));
  return [
    `목표 영상 길이: 약 ${targetMinutes}분 (한국어 TTS 기준)`,
    `슬라이드 수는 직접 결정하세요. 권장 범위는 ${estLow}~${estHigh}장입니다 (한 슬라이드 약 45~60초 분량).`,
    '한 슬라이드는 2~5개 라인으로 호흡을 만들고, 슬라이드별 분량을 비슷하게 맞춰 전체가 목표 길이에 수렴하도록 구성하세요.',
  ].join('\n');
}

export function buildPrompt(input: PromptInput): { system: string; user: string } {
  const { topic, mode, parentGender, targetMinutes, pdfText, research } = input;
  const reference = referenceBlock(pdfText);
  const researchCtx = researchBlock(research);
  const hasGrounding = Boolean(reference || researchCtx);
  const lengthHint = lengthGuidance(targetMinutes);

  if (mode === 'dialogue') {
    const parentLabel = parentGender === 'dad' ? '아빠' : '엄마';
    const system = [
      PERSONA,
      '',
      `대본 형식: 부모(${parentLabel}) ↔ 짱샘 대화 형식의 유튜브 영상 대본`,
      '',
      RHYTHM,
      '',
      dialogueDevices(),
      '',
      FORMAT_RULES,
      '',
      '호칭 규칙 (반드시 준수):',
      '- 부모 라인에서 짱샘을 직접 부르는 호칭(예: "짱샘님", "짱생님", "선생님") 사용 금지.',
      '  부모는 짱샘에게 말 거는 것이 아니라 자기 아이 이야기를 풀어놓는 톤으로 말한다.',
      '- 호칭이 필요하면 그냥 자기 상황 묘사("아이가요...", "저는 너무 답답해서요...")로 시작한다.',
      '- 짱샘은 부모를 "어머님" 또는 "아버님"으로 호칭 (어색하지 않은 자연스러운 빈도로).',
      '',
      '예시:',
      '## 슬라이드 1',
      '[부모] 우리 아이가요, 막 정신없이 뛰어다니다가 갑자기 멍하니 서 있어요. 저 진짜 너무 걱정돼서 잠도 못 자요.',
      '[짱샘] 어머님 마음 잘 알아요. 그게 보통은요, 아이가 자기 몸을 아직 충분히 못 느껴서 그래요.',
      '[부모] 아! 그래서였구나... 우리 아이가 자기 몸을 못 느낀다고요?',
      '[짱샘] 그쵸. 사실은 감각 통합이 아직 자리잡지 않아서 그래요. 어머님 잘하고 계세요.',
    ].join('\n');

    const user = [
      `주제: ${topic}`,
      lengthHint,
      `호스트(부모) 화자: ${parentLabel}`,
      researchCtx,
      reference,
      '',
      '위 페르소나·리듬·5장치·형식 규칙을 모두 만족하는 대본을 작성하세요.',
      hasGrounding
        ? '리서치 결과·책 발췌가 있으면 그 내용을 1차 자료로 삼고, 주제는 그 안에서 영상 1편을 좁히는 각도로 사용하세요. 자료에 없는 사실을 만들어내지 마세요.'
        : '',
      '마크다운만 출력하고 다른 설명은 절대 추가하지 마세요.',
    ].filter(Boolean).join('\n');

    return { system, user };
  }

  // solo mode
  const SOLO_FORMAT_RULES = [
    '출력 형식 (반드시 준수):',
    '- "## 슬라이드 1", "## 슬라이드 2" ... 헤더로 슬라이드 구분',
    '- 각 라인은 한 줄로 작성. 라벨([짱샘], [부모])은 절대 붙이지 말 것 — 1인 설명이므로 화자가 명확함',
    '- 한 줄에 한 문장 단위로 끊어서 작성 (호흡과 자막 가독성 위해)',
    '- 마크다운 외 다른 설명·머리말·꼬리말 절대 출력 금지',
  ].join('\n');

  const system = [
    PERSONA,
    '',
    '대본 형식: 짱샘 1인 설명 형식의 유튜브 영상 대본 (대화 없음, 화자 라벨 없음)',
    '',
    RHYTHM,
    '',
    '추가 규칙:',
    '- 한 슬라이드 안에 라인 2~5개로 끊어 넣어 호흡과 강조를 만든다',
    '- 매 슬라이드는 자체로 하나의 메시지(소주제)를 전달한다',
    '- 직접 말 걸 듯이 "어머님들/오늘은/한 가지만 기억하시면" 처럼 청자를 의식한 화법',
    '',
    soloDevices(),
    '',
    SOLO_FORMAT_RULES,
    '',
    '예시:',
    '## 슬라이드 1',
    '어머님들, 오늘은 자폐 아이의 잠 못 드는 밤 얘기를 해볼게요.',
    '25년 동안 정말 자주 들은 고민이거든요.',
    '한 가지만 기억하시면 됩니다.',
    '',
    '## 슬라이드 2',
    '그게 보통은요, 아이가 자기 몸을 충분히 못 느껴서 그래요.',
    '감각 통합이 아직 자리잡지 않은 거예요.',
    '어렵게 들리지만, 사실은 단순합니다.',
  ].join('\n');

  const user = [
    `주제: ${topic}`,
    lengthHint,
    researchCtx,
    reference,
    '',
    '위 페르소나·리듬·3장치·형식 규칙을 모두 만족하는 1인 설명 대본을 작성하세요.',
    '라벨([짱샘], [부모] 등)은 절대 사용하지 마세요. 각 라인은 그냥 본문 텍스트만.',
    hasGrounding
      ? '리서치 결과·책 발췌가 있으면 그 내용을 1차 자료로 삼고, 주제는 그 안에서 영상 1편을 좁히는 각도로 사용하세요. 자료에 없는 사실을 만들어내지 마세요.'
      : '',
    '마크다운만 출력하고 다른 설명은 절대 추가하지 마세요.',
  ].filter(Boolean).join('\n');

  return { system, user };
}
