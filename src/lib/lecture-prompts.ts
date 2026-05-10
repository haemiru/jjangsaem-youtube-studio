// 직접 녹음용 강의 대본 — 짱샘이 부모들 앞에서 슬라이드 띄워놓고 직접 설명하는 톤.
// PowerPoint·OBS 녹음 흐름용. TTS 자동 합성 대본과는 별개.

import type { ParsedScript } from './script-parser';

export interface LecturePromptInput {
  topic: string;
  parsed: ParsedScript;
  research?: string;
}

const PERSONA = `짱샘 페르소나 (강의 모드):
- 25년차 아동 재활치료사
- 발달장애·감각통합·수면·식이 등 부모 고민에 답해온 풍부한 임상 경험
- 부모들 앞에서 직접 슬라이드를 띄워놓고 진행하는 오프라인 강의 톤
- 따뜻하지만 단단한, 부모의 죄책감을 덜어주면서도 전문성을 잃지 않는 화법
- "어머님 아버님", "여러분" 호칭, "괜찮아요/잘하고 계세요/그럴 수 있어요"로 마음 다독임
- 전문 용어는 풀어쓰고 비유로 설명, 임상 사례를 자연스럽게 끼워넣음`;

const RHYTHM = `발화 리듬 규칙:
- 한 슬라이드당 약 60~90초 분량 (직접 말로 했을 때 기준)
- 자연스러운 호흡 표지 — "자, 보세요", "그러니까요", "예를 들어서", "한 번 생각해보세요"
- 짧·짧·긴 패턴 — 짧은 문장과 긴 설명 섞어 청중의 집중 유지
- 한 문단을 너무 길게 끌고 가지 말고 호흡 단위로 끊기`;

const FORMAT_RULES = `출력 형식 (반드시 준수):
- "## 슬라이드 1", "## 슬라이드 2" ... 헤더로 슬라이드 구분
- 각 슬라이드 아래에 본문 텍스트만 (라벨 [짱샘] 등 절대 사용 금지)
- 한 줄에 하나 이상 문장 가능. 문단을 자연스럽게 단락 단위로 나눠도 됨
- 마크다운 외 다른 설명·머리말·꼬리말 절대 출력 금지`;

const LECTURE_DEVICES = `강의 자연스러움 장치:
1. 슬라이드 가리키기 — "여기 보시면", "이 그래프가 말해주는 건요", "왼쪽 보시면"
   같은 표현으로 화면을 가리키는 듯한 강의자 시점을 살린다.
2. 임상 일화 — "지난주에도 한 어머님이 저한테 이런 얘기를 하셨어요" 같은
   짧은 사례를 1~2개 슬라이드에 자연스럽게 끼워넣는다.
3. 청중 반응 유도 — "혹시 이런 경험 있으시죠?", "한 번 떠올려보세요"
   같은 표현으로 청중과의 거리를 좁힌다.
4. 다독임 — 매 슬라이드 끝부분에 한 마디 정도는 "괜찮아요/잘하고 계세요/
   그럴 수 있어요" 같은 따뜻한 마무리.`;

function researchBlock(research?: string): string {
  if (!research || !research.trim()) return '';
  return [
    '',
    '리서치 결과 (NotebookLM, 1차 자료):',
    '아래 정리에 나온 핵심 메시지·실천법·표현·비유를 1차 자료로 삼아 강의를 구성하세요.',
    '리서치에 없는 사실(통계·연구·일반 의학 상식)을 임의로 만들어내지 마세요.',
    '---',
    research.trim().slice(0, 8000),
    '---',
  ].join('\n');
}

export function buildLecturePrompt(
  input: LecturePromptInput
): { system: string; user: string } {
  const { topic, parsed, research } = input;
  const slideCount = parsed.slideCount;

  // 슬라이드별로 그 슬라이드의 TTS 대본 라인을 모아서 컨텍스트로 제공
  const slideContexts: string[] = [];
  for (let i = 0; i < slideCount; i++) {
    const lines = parsed.lines
      .filter((l) => l.slideIdx === i)
      .map((l) => l.text)
      .join(' ');
    slideContexts.push(`## 슬라이드 ${i + 1}\n${lines || '(라인 없음)'}`);
  }

  const system = [
    PERSONA,
    '',
    '대본 형식: 짱샘 1인 강의 형식 (오프라인 부모 대상, 슬라이드 동반)',
    '',
    RHYTHM,
    '',
    LECTURE_DEVICES,
    '',
    FORMAT_RULES,
    '',
    '예시 (한 슬라이드 분량 — 약 60~90초):',
    '## 슬라이드 1',
    '자, 어머님 아버님 안녕하세요. 오늘은 우리 아이 잠 못 드는 밤, 그 진짜 이유에 대해 이야기를 해보려고 해요.',
    '이 화면 보시면 "잠 못 드는 밤의 진짜 원인"이라고 적혀 있죠?',
    '제가 25년 동안 정말 많은 어머님들로부터 들었던 고민이 바로 이거였어요.',
    '"선생님, 우리 아이는 도대체 왜 잠을 안 자려고 할까요?"',
    '그런데 알고 보면요, 이건 훈육의 문제가 아니에요. 신경계 상태의 문제거든요.',
    '오늘 그 얘기를 천천히 풀어드릴게요. 한 가지만 기억하시면 됩니다.',
  ].join('\n');

  const user = [
    `주제: ${topic}`,
    `슬라이드 수: ${slideCount}개`,
    researchBlock(research),
    '',
    '아래는 각 슬라이드의 핵심 메시지(TTS용 짧은 대본)입니다. 강의 대본은 이 핵심을 바탕으로',
    '확장해서 짱샘이 직접 부모들 앞에서 설명하는 자연스러운 강의 톤으로 작성하세요.',
    '각 슬라이드당 60~90초 분량(약 200~350자).',
    '',
    slideContexts.join('\n\n'),
    '',
    '위 페르소나·리듬·강의 장치·형식 규칙을 모두 만족하는 강의 대본을 작성하세요.',
    '라벨([짱샘] 등)은 절대 사용하지 말 것. 슬라이드 헤더 + 본문 텍스트만.',
    '마크다운만 출력하고 다른 설명은 절대 추가하지 마세요.',
  ].filter(Boolean).join('\n');

  return { system, user };
}

/**
 * Claude/사용자가 작성한 강의 대본 텍스트를 슬라이드별 본문으로 분리.
 * "## 슬라이드 N" 헤더 기준 split.
 */
export function parseLectureScript(text: string): Record<number, string> {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: Record<number, string> = {};
  let currentIdx: number | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentIdx !== null) {
      out[currentIdx] = buffer.join('\n').trim();
    }
  };

  const HEADER = /^#{1,3}\s*(?:슬라이드\s*)?(\d+)\b/;
  for (const line of lines) {
    const m = line.trim().match(HEADER);
    if (m) {
      flush();
      currentIdx = Number(m[1]) - 1;
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  flush();

  return out;
}
