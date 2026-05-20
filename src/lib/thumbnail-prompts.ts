// 짱샘 채널 YouTube 썸네일 — Google Flow용 이미지 프롬프트 + 헤드라인 카피 빌더.
// 전체 강의 대본을 읽고, 다음을 출력:
// (1) visuals: 텍스트 합성 없는 비주얼-온리 이미지 프롬프트 2장 (서로 다른 컨셉)
// (2) infographics: 대본 전체 내용을 아우르는 인포그래픽 이미지 프롬프트 2장 (한글 텍스트 포함 OK)
// (3) headlines: 헤드라인 카피 5개 후보
// 사용자는 마음에 드는 이미지(비주얼 또는 인포그래픽)를 골라 Flow에서 생성하고,
// 비주얼 이미지의 경우 그 위에 헤드라인 카피를 별도로 합성.

export interface ThumbnailPromptInput {
  topic: string;
  /** 슬라이드별 강의 대본 (idx -> text). 6번 단계 결과. */
  lectureScripts: Record<number, string>;
  research?: string;
}

const PERSONA = `당신은 짱샘 YouTube 채널의 썸네일 컨셉 디자이너입니다.
짱샘은 아동 재활치료사이고, 발달장애·감각통합·수면·식이 등 부모 대상 콘텐츠를 만듭니다.
시청자는 영유아~초등 자녀를 둔 부모이며, 모바일 피드에서 스크롤하다가 멈춰서 클릭하게 만드는 게 목표입니다.`;

const PRINCIPLES = `썸네일 설계 원칙 (가장 중요 — 반드시 준수):

1. **전체 강의 대본을 처음부터 끝까지 읽는다.** 슬라이드 제목·일부만 보고 만들지 않는다.

2. **가장 강한 클릭 후크 1개를 대본 안에서 뽑는다.**
   - 부모가 피드에서 멈추고 "어? 우리 아이 얘긴가?" 하게 만들 만큼 구체적
   - 반전·의외성·자기진단 유도가 강한 신호 (예: "이 증상이 보이면", "대부분 모르는", "버릇이 아니라")
   - 영상이 실제로 약속하는 가치와 일치해야 함. 낚시·과장 금지.

3. **비주얼 이미지 2장 (visuals) — 시각 접근이 서로 분명히 달라야 한다.**
   접근 다양성 예시 (이 중 2개를 골라 쓰거나, 각자 새로 설계):
   - 비교/대비 (또렷↔흐릿, before↔after, 정상↔이상)
   - 표정 클로즈업 (아이의 불안·당황·졸음·과집중 등 감정 단독 컷)
   - 행위 장면 (특정 상황 재현)
   - 메타포·상징 (빙산, 신호등, 깨진 거울, 어두운 방 등)
   - 충격적 숫자 (시각적으로만, 텍스트는 합성하지 않음)
   - 의료/뇌 비주얼 (뇌 일러스트, 신경계 단순 다이어그램)
   비주얼 이미지는 **이미지 안에 글자가 박히지 않는다.** 텍스트는 사용자가 별도 합성.

4. **인포그래픽 이미지 2장 (infographics) — 대본 전체 내용을 아우르는 정보 시각화.**
   - 영상 본편을 본 사람이 한 장으로 핵심을 다시 떠올릴 수 있도록 정보를 정리한 16:9 한 컷.
   - 한글 텍스트 합성 허용. Flow가 한글 렌더링 잘 함.
   - 인포그래픽다운 시각 언어 사용:
     - 단계/순서(1→2→3) 흐름도
     - 좌우 비교표
     - 체크리스트·아이콘+짧은 라벨
     - 핵심 키워드 그루핑
     - 도식·다이어그램(피라미드, 사분면, 매트릭스 등)
   - 두 인포그래픽은 시각 구조가 서로 달라야 함 (예: 1번은 단계 흐름, 2번은 비교표).
   - 정보는 대본에 실제로 있는 것만. 임의 통계·수치 만들어 넣지 말 것.

5. **강사 인물 컷 자리 (옵션, visuals 전용):**
   - 짱샘 본인 사진을 사용자가 Google Flow의 reference 이미지로 합성할 가능성이 있음.
   - visuals에서 우측 1/3 정도 영역을 비워두는 레이아웃을 권장하되 필수는 아님.
   - 인물 얼굴 묘사는 하지 말 것. "강사 인물 컷이 합성될 우측 영역 비워둠" 정도로 자리만 잡는다.
   - 인포그래픽에는 인물 자리를 비우지 않는다. 정보 시각화에 집중.

6. **신뢰 배지·자격·연차·직함·전문 분야 표기 금지 (모든 출력물에 적용).**
   - "25년차", "소아발달 재활 전문가", "아동 재활치료사", "박사", "전문가", "수료증", "인증" 같은 문구를
     비주얼이든 인포그래픽이든 헤드라인이든 절대 넣지 말 것.
   - 신뢰는 콘텐츠 자체로 만들지 배지 텍스트로 만들지 않는다.

7. **헤드라인 카피 5개 후보 — 길이와 임팩트가 가장 중요**
   - **2줄 구성을 기본으로 한다.** "윗줄(꾸밈/맥락 후킹) / 아랫줄(핵심 약속)" 의 두 층 구조.
     - 윗줄(꾸밈): 8~14자 — "대부분은 모르는", "혹시 우리 아이도?", "절대 무시하면 안 되는",
       "치료해도 안 낫는", "이 증상이 보인다면", "지금 안 하면 늦는"
     - 아랫줄(핵심): 8~16자 — 구체 숫자·자기진단 유도·반전 명사구.
       "ADHD 신호 5가지", "발달 지연 진짜 이유", "수면이 무너진 뇌",
       "회복을 막는 한 가지", "이 5가지를 먼저 보세요"
   - 두 줄은 줄바꿈 문자(\\n)로 구분한다. 슬래시(/)나 점(·)으로 한 줄에 욱여넣지 말 것.
   - 합쳐서 **20~45자.** 한 줄 12자 미만은 너무 짧고, 윗줄+아랫줄 합쳐 50자 넘으면 모바일에서 잘림.
   - 어조: 호기심 갭 + 구체 숫자 + 자기진단 유도 조합 강하게.
   - 좋은 예 (그대로 따라하라는 게 아니라 길이·구조 참고용):
     "대부분은 모르는\\nADHD일때 보이는 특징 5가지"  (20자)
     "치료해도 안 낫는\\n진짜 이유 한 가지"            (16자)
     "혹시 우리 아이도?\\n이 5가지 신호부터 보세요"     (24자)
     "잠 못 자는 아이\\n자율신경 회복 6단계"            (20자)
     "발끝걸음 손가락 비비기\\n그냥 버릇이 아닙니다"     (24자)
   - 단순한 한 줄짜리 짧은 문구(예: "이거 보세요", "ADHD")는 금지. 임팩트가 약함.
   - 5개의 카피는 후크의 서로 다른 측면(원인·증상·해결·반전·결과)을 각각 다르게 강조.

8. **출력 대상: Google Flow 이미지 생성 모델**
   - 가로 16:9 (1280×720) 유튜브 썸네일 비율을 모든 이미지 프롬프트에 명시.`;

const OUTPUT_FORMAT = `출력 형식 (반드시 준수):

- 응답은 **순수 JSON 객체 하나만** 출력. 머리말·꼬리말·코드펜스(\`\`\`json\`\`\`)·코멘트 일절 금지.
- 스키마:

{
  "visuals": [
    { "concept": "<한 줄 컨셉 라벨>", "prompt": "<텍스트 합성 없는 비주얼-온리 이미지 프롬프트, 250~500자, 자연스러운 한국어 문장>" },
    { "concept": "<...>", "prompt": "<...>" }
  ],
  "infographics": [
    { "concept": "<한 줄 컨셉 라벨 — 시각 구조 명시. 예: '단계 흐름도', '좌우 비교표', '체크리스트'>", "prompt": "<대본 전체를 아우르는 인포그래픽 이미지 프롬프트, 300~600자, 한글 텍스트 합성 지시 포함 가능>" },
    { "concept": "<...>", "prompt": "<...>" }
  ],
  "headlines": [
    "<헤드라인 카피 1>",
    "<헤드라인 카피 2>",
    "<헤드라인 카피 3>",
    "<헤드라인 카피 4>",
    "<헤드라인 카피 5>"
  ]
}

- visuals: 정확히 2개. infographics: 정확히 2개. headlines: 정확히 5개.

- visuals[*].prompt 안에 들어가야 할 요소:
  - 가로 16:9 (1280×720) 유튜브 썸네일 비율
  - 시각 컨셉 — 어떤 장면·구도·표정·소품·배경·색감
  - 강사 인물 컷 자리 (선택, 우측 1/3 영역 비움)
  - 시선 유도 장치 (선택)
  - 텍스트 합성을 막는 마무리 한 줄 (예: "no text, no captions, no logos, no on-image typography")
- visuals[*].prompt 안에 **들어가면 안 되는 것**:
  - 한글 헤드라인 카피(따옴표로 인용된 텍스트), "큰 글씨", "노란 텍스트" 같은 텍스트 렌더링 지시
  - 자격·경력·연차·직함·전문분야 같은 신뢰 배지 문구

- infographics[*].prompt 안에 들어가야 할 요소:
  - 가로 16:9 (1280×720) 유튜브 썸네일 비율
  - 인포그래픽의 시각 구조 (단계 흐름도/비교표/체크리스트/다이어그램 등 — concept 라벨과 일치)
  - 대본에서 추출한 핵심 항목·키워드·짧은 라벨 (한글 그대로 명시; 따옴표로 인용)
  - 색감·타이포 스타일 (모바일 가독성)
  - 두 인포그래픽의 시각 구조가 서로 달라야 함
- infographics[*].prompt 안에 **들어가면 안 되는 것**:
  - 자격·경력·연차·직함·전문분야 배지 문구
  - 대본에 없는 통계·수치
  - 인물 얼굴 묘사

- headlines: **각 카피는 2줄 구성을 기본으로 한다.** 두 줄을 줄바꿈 문자(\\n)로 구분.
  윗줄 8~14자(꾸밈/맥락 후킹) + 아랫줄 8~16자(핵심 약속). 합쳐서 20~45자.
  따옴표·괄호 없이 순수 카피 문자열만. 슬래시(/)·점(·)으로 한 줄에 합치지 말 것.
  JSON 문자열 안에서는 줄바꿈을 \`\\n\`(이스케이프된 두 글자)으로 표기.
- 모든 prompt 본문 안에서는 라벨(예: "이미지 컨셉:", "헤드라인:"), 마크다운, "프롬프트:" 같은 접두어 금지.`;

export function buildThumbnailPrompt(
  input: ThumbnailPromptInput
): { system: string; user: string } {
  const { topic, lectureScripts, research } = input;

  const entries = Object.entries(lectureScripts)
    .map(([k, v]) => [Number(k), (v ?? '').trim()] as const)
    .filter(([idx, v]) => Number.isFinite(idx) && v.length > 0)
    .sort((a, b) => a[0] - b[0]);

  const compiledScript = entries
    .map(([idx, v]) => `[슬라이드 ${idx + 1}]\n${v}`)
    .join('\n\n');

  const system = [PERSONA, '', PRINCIPLES, '', OUTPUT_FORMAT].join('\n');

  const researchBlock =
    research && research.trim()
      ? [
          '',
          '== 리서치 (참고만 — 후크는 대본에서 뽑을 것) ==',
          research.trim().slice(0, 4000),
          '',
        ].join('\n')
      : '';

  const user = [
    `영상 주제: ${topic}`,
    researchBlock,
    '== 전체 강의 대본 (이걸 다 읽고 후크와 핵심 항목들을 뽑으세요) ==',
    compiledScript,
    '',
    '위 대본 전체를 읽고:',
    '- 비주얼(visuals) 2장: 시각 접근이 서로 다른 텍스트 합성 없는 이미지 프롬프트',
    '- 인포그래픽(infographics) 2장: 대본 전체를 아우르는 정보 시각화, 한글 텍스트 합성 OK',
    '- 헤드라인(headlines) 5개: 비주얼 위에 별도로 합성할 카피 후보',
    '를 위 JSON 스키마로 출력하세요. JSON 외 다른 텍스트는 절대 출력 금지. 코드펜스도 금지.',
  ].filter(Boolean).join('\n');

  return { system, user };
}

export interface ThumbnailImageItem {
  concept: string;
  prompt: string;
}

export interface ThumbnailResult {
  visuals: ThumbnailImageItem[];
  infographics: ThumbnailImageItem[];
  headlines: string[];
}

/**
 * Claude 응답에서 JSON을 안전하게 추출 (혹시 코드펜스로 감쌌어도 살린다).
 * 반환: { visuals, infographics, headlines } (없는 필드는 빈 배열).
 */
export function parseThumbnailResult(raw: string): ThumbnailResult {
  let text = raw.trim();
  // 코드펜스 제거
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1].trim();
  // JSON 본체 추출 (앞뒤 잡음 허용)
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { visuals: [], infographics: [], headlines: [] };
  }
  const obj = (parsed ?? {}) as Record<string, unknown>;

  const pickItems = (raw: unknown, max: number): ThumbnailImageItem[] => {
    if (!Array.isArray(raw)) return [];
    const out: ThumbnailImageItem[] = [];
    for (const item of raw.slice(0, max)) {
      const it = (item ?? {}) as Record<string, unknown>;
      const concept = typeof it.concept === 'string' ? it.concept.trim() : '';
      const prompt = typeof it.prompt === 'string' ? it.prompt.trim() : '';
      if (prompt) out.push({ concept: concept || '(라벨 없음)', prompt });
    }
    return out;
  };

  const visuals = pickItems(obj.visuals, 4);
  const infographics = pickItems(obj.infographics, 4);
  const headlinesRaw = Array.isArray(obj.headlines) ? obj.headlines : [];
  const headlines: string[] = [];
  for (const h of headlinesRaw.slice(0, 8)) {
    if (typeof h === 'string' && h.trim()) headlines.push(h.trim());
  }
  return { visuals, infographics, headlines };
}
