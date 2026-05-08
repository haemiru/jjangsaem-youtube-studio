export interface SlidePromptInput {
  topic: string;
  script: string;
  research?: string;
}

const TYPE_CATALOG = `슬라이드 타입 카탈로그 (각 슬라이드는 정확히 하나만 고른다):

1. "title" — 제목 슬라이드 (영상 도입·섹션 시작·결론 강조용)
   { "type": "title", "title": "...", "subtitle": "..." (선택) }

2. "title-bullets" — 제목 + 불릿 2~5개 (가장 범용적)
   { "type": "title-bullets", "title": "...", "bullets": ["...", "...", "..."] }

3. "split" — 좌측 텍스트 + 우측 이미지 슬롯
   { "type": "split", "title": "...", "bullets": ["...", "..."], "imagePrompt": "이미지 한 줄 설명" }

4. "stat" — 큰 숫자·핵심 지표 강조
   { "type": "stat", "number": "6주", "label": "신경계가 다시 잡히는 시간", "caption": "..." (선택) }

5. "quote" — 짱샘 핵심 메시지·따뜻한 한마디
   { "type": "quote", "quote": "...", "attribution": "짱샘" (선택) }

6. "steps" — 번호 매겨진 단계·실천법 2~5개
   { "type": "steps", "title": "...", "steps": [{ "label": "...", "description": "..." (선택) }, ...] }`;

const RULES = `규칙:
- 슬라이드 개수는 입력 대본의 "## 슬라이드 N" 헤더 수와 정확히 일치해야 한다.
- 슬라이드 N의 시각 컨텐츠는 그 슬라이드의 대본 라인 핵심을 요약한다 (대본 그대로 옮기지 말 것).
- 화면 텍스트는 짧게: title은 8~16자, bullet은 12~22자, quote는 30자 이내가 이상적.
- 타입 다양성: 같은 타입을 3슬라이드 연속 쓰지 말 것. title-bullets·stat·quote·steps를 적절히 섞는다.
- 첫 슬라이드는 보통 "title", 마지막은 보통 "quote" 또는 "title"로 마무리.
- 숫자·기간·횟수가 핵심인 슬라이드는 "stat".
- 실천법·순서가 있는 슬라이드는 "steps".
- 인용·핵심 메시지는 "quote" (한 줄로 끊어지게).
- 비교·대조나 이미지가 어울리면 "split".
- 그 외 일반 설명은 "title-bullets".
- 화면용 한국어 — "어머님" 같은 호칭이나 구어체 표지는 슬라이드에는 넣지 말 것 (입말은 음성으로만, 화면은 핵심 정보).
- imagePrompt는 짧은 영문 또는 한국어 한 줄로 ("아이가 침대에서 평온하게 잠든 모습" 등). 이미지 슬롯은 v1에서는 placeholder로 표시되므로 필수 아님.`;

const FORMAT = `출력 형식: 단일 JSON 객체. 마크다운 코드펜스·머리말·꼬리말 절대 금지.
{
  "topic": "<입력 주제 그대로>",
  "slides": [ <슬라이드 N개>, ... ]
}`;

export function buildSlidePrompt(input: SlidePromptInput): { system: string; user: string } {
  const system = [
    '당신은 짱샘(아동 재활치료사) 유튜브 영상의 슬라이드 디렉터입니다.',
    '대본을 받아 각 슬라이드의 시각 컨텐츠를 JSON으로 설계하세요.',
    '',
    TYPE_CATALOG,
    '',
    RULES,
    '',
    FORMAT,
    '',
    '예시 출력:',
    JSON.stringify(
      {
        topic: '잠 못 드는 아이의 밤',
        slides: [
          {
            type: 'title',
            title: '잠 못 드는 밤의 진짜 원인',
            subtitle: '훈육이 아니라 신경계 상태입니다',
          },
          {
            type: 'title-bullets',
            title: '아이가 못 자는 이유',
            bullets: [
              '낮 동안 신경계가 너무 켜져 있음',
              '코호흡이 안 돼서 산소 부족',
              '몸을 충분히 못 느끼는 상태',
            ],
          },
          {
            type: 'stat',
            number: '6주',
            label: '신경계가 다시 잡히는 시간',
            caption: '매일 같은 시간, 같은 순서로',
          },
          {
            type: 'quote',
            quote: '훈육이 아니라 신경계 상태예요',
            attribution: '짱샘',
          },
        ],
      },
      null,
      2
    ),
  ].join('\n');

  const referenceBlock =
    input.research && input.research.trim()
      ? [
          '',
          '리서치 (NotebookLM) — 화면 표현 결정 시 참고:',
          '---',
          input.research.trim().slice(0, 5000),
          '---',
        ].join('\n')
      : '';

  const user = [
    `주제: ${input.topic}`,
    referenceBlock,
    '',
    '대본:',
    '```',
    input.script.trim(),
    '```',
    '',
    '위 대본에서 "## 슬라이드 N" 헤더 개수만큼 슬라이드 객체를 만들어 JSON으로 출력하세요.',
    '슬라이드 N의 시각 컨텐츠는 그 슬라이드 안의 대본 라인 핵심만 추려야 합니다.',
    'JSON 외에 어떤 텍스트도 출력하지 마세요.',
  ]
    .filter(Boolean)
    .join('\n');

  return { system, user };
}
