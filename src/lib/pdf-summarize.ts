// PDF 본문 전체를 주제 키워드 관련 부분만 발췌하는 헬퍼.
// 같은 책 + 다른 주제일 때, 책 본문 전체를 reference로 박으면 주제 변별력이 묻혀
// 결과가 비슷해지는 문제를 해결하기 위함.

import { generate } from './anthropic';

export interface SummarizeOptions {
  pdfText: string;
  topic: string;
  /** 발췌 결과 목표 자수 (대략). 기본 3000. */
  maxChars?: number;
}

const SYSTEM = `당신은 책 본문에서 주어진 주제와 직접 관련된 부분만 골라 발췌하는 편집자입니다.
- 책 본문에 있는 표현·문장·사례·통계·비유를 가능한 한 원문 그대로 보존하세요.
- 임의로 일반 의학·교육 상식을 더하지 마세요.
- 책 본문에 주제 관련 내용이 거의 없으면 "주제와 직접 연결되는 부분이 책에서 빈약합니다." 한 줄만 출력하세요.
- 어떤 머리말·꼬리말·코멘트·마크다운 헤더도 출력하지 마세요. 발췌 본문만 출력.`;

export async function summarizeForTopic(opts: SummarizeOptions): Promise<string> {
  const { pdfText, topic } = opts;
  const maxChars = opts.maxChars ?? 3_000;
  const text = (pdfText ?? '').trim();
  if (!text) return '';

  const user = [
    `주제: ${topic}`,
    '',
    `위 주제와 직접 관련된 부분만 책 본문에서 발췌하세요.`,
    `발췌 결과 분량은 약 ${maxChars}자 이내로. 책에 있는 표현을 우선 보존.`,
    '',
    '== 책 본문 ==',
    text,
    '== 본문 끝 ==',
  ].join('\n');

  // 발췌는 작은 응답이라 maxTokens 절약. 안전 여유로 4000.
  const result = await generate({ system: SYSTEM, user, maxTokens: 4000 });
  return result.trim();
}
