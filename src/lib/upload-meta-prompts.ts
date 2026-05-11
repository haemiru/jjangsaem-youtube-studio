// YouTube 업로드용 메타데이터(제목/디스크립션/태그) 생성 — 짱샘 채널 SEO 전략.
// jjangsaem-youtube 프로젝트의 UploadPanel 메타데이터 파이프라인과 동일한 톤·규칙·자기채점·후처리.

export interface UploadMetaPromptInput {
  topic: string;
  /** 슬라이드별 강의 대본 (idx -> text). 6번 단계 결과. */
  lectureScripts: Record<number, string>;
  research?: string;
  /** 대상 시청자 (디폴트: 영유아~초등 자녀를 둔 부모) */
  audience?: string;
}

export interface UploadMetaJson {
  cot_log?: string;
  title: { text: string; score?: number; improvement_note?: string };
  description: { text: string; score?: number; preview_lines?: string };
  tags: { list: string[]; score?: number; char_count?: number };
  hashtags?: string[];
  revision_count?: number;
}

export const UPLOAD_META_SYSTEM_PROMPT =
  '당신은 유튜브 SEO 전문가이자 짱샘 채널의 콘텐츠 전략가입니다. ' +
  '한국 육아·발달 분야 유튜브 채널의 검색 최적화에 특화되어 있습니다. ' +
  '항상 JSON 형식으로만 응답합니다.';

/**
 * 수동(Claude.ai 웹) 모드에서 사용. 모델이 인사/설명 없이 JSON만 뱉도록 강제하는 접두어.
 */
export const UPLOAD_META_MANUAL_PREFIX = `[중요 지시] 아래는 유튜브 메타데이터 자동화 파이프라인의 프롬프트입니다.
반드시 JSON 객체 하나만 출력하세요. 인사·설명·코드블록 마커는 모두 금지하고, JSON 외의 텍스트는 일절 포함하지 마세요.

`;

const DEFAULT_AUDIENCE = '영유아~초등 자녀를 둔 부모';

const CHANNEL_LINKS_BLOCK =
  '\n\n━━━━━━━━━━━━━━━━━━━━\n' +
  '📸 짱샘의 인스타: @seochojiye\n' +
  '📝 짱샘의 블로그: https://blog.naver.com/imoim77\n' +
  '💬 카카오톡 문의: https://open.kakao.com/o/s3YnSoni';

export function buildUploadMetaPrompt(
  input: UploadMetaPromptInput
): { system: string; user: string } {
  const { topic, lectureScripts, research, audience } = input;

  const entries = Object.entries(lectureScripts)
    .map(([k, v]) => [Number(k), (v ?? '').trim()] as const)
    .filter(([idx, v]) => Number.isFinite(idx) && v.length > 0)
    .sort((a, b) => a[0] - b[0]);

  // 최대 3000자까지만 (Claude.ai 웹 붙여넣기 시 길이 부담 줄임)
  const compiledScript = entries
    .map(([idx, v]) => `[슬라이드 ${idx + 1}] ${v}`)
    .join('\n\n')
    .slice(0, 3000);

  const aud = (audience ?? '').trim() || DEFAULT_AUDIENCE;

  const researchBlock =
    research && research.trim()
      ? `\n[리서치 (참고)]\n${research.trim().slice(0, 2000)}\n`
      : '';

  const user = `아래 정보를 바탕으로 유튜브 메타데이터를 작성해줘.

[영상 정보]
주제: ${topic}
대상 시청자: ${aud}
전체 강의 대본:
${compiledScript}
${researchBlock}
바로 작성하지 말고 먼저 생각해:

<thinking>
1. 검색 의도 분석
2. SEO 키워드 계층 설계 (1순위·2순위·롱테일)
3. 제목 최종 선택 근거 (앞 30자 핵심 키워드, 감정 트리거, 클릭 유도)
4. 설명(Description) 구성 계획 (첫 2줄 클릭 후크, 핵심 내용 3~5포인트, 관련 키워드, CTA)
5. 태그 조합 전략 (핵심 키워드·롱테일·관련 주제·브랜드 4종 균형)
</thinking>

[초안 생성 후 아래 기준으로 즉시 자기채점]
제목 평가: 앞30자 키워드/25 + 감정트리거/25 + 패턴부합/20 + 브랜드톤/15 + 시청자언어/15
설명 평가: 첫2줄 클릭유도/30 + 키워드삽입/25 + 내용충실도/25 + CTA자연스러움/20
태그 평가: 4종균형/25 + 경쟁도최적화/25 + 키워드연관/25 + 500자활용/25

[디스크립션 작성 규칙 - 중요!]
- 타임스탬프(타임라인)는 넣지 마세요
- 대신 영상의 핵심 내용을 풍부하게 요약해주세요 (최소 500자 이상)
- 구성: 첫 2줄 클릭 유도 → 영상 핵심 내용 요약 (3~5개 포인트) → 관련 키워드/정보 → 구독/좋아요 CTA
- 시청자가 디스크립션만 읽어도 영상 내용을 파악할 수 있도록 상세하게 작성
- 채널 정보(인스타/블로그/카톡)는 자동으로 후처리 추가됨 — 직접 넣지 말 것

[태그 작성 규칙]
- 한국어 태그 위주, 영문 태그는 필요할 때만
- 총 길이는 약 450~500자 (YouTube 한도 500자 가까이 채우기)
- 핵심 키워드 + 롱테일 + 관련 주제 + 브랜드 4종 균형

[60점 미만 항목은 즉시 재작성 후 재채점, 최대 3회 반복]

최종 JSON 출력:
{
  "cot_log": "전체 사고 과정 요약 (5단계)",
  "title": { "text": "최종 제목", "score": 92, "improvement_note": "개선 내용" },
  "description": { "text": "전체 설명 텍스트 (타임스탬프 없이, 500자 이상, 내용 풍부하게, 채널 링크는 후처리)", "score": 87, "preview_lines": "첫 2줄" },
  "tags": { "list": ["태그1", "태그2"], "score": 89, "char_count": 487 },
  "hashtags": ["#해시태그1", "#해시태그2", "#해시태그3"],
  "revision_count": 2
}
JSON만 출력.`;

  return { system: UPLOAD_META_SYSTEM_PROMPT, user };
}

/**
 * Claude 응답에서 <thinking> 블록·코드펜스를 제거하고 JSON만 안전하게 추출.
 */
export function parseUploadMetaJSON(rawText: string): UploadMetaJson {
  let cleaned = rawText.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) cleaned = codeBlockMatch[1].trim();
  try {
    return JSON.parse(cleaned) as UploadMetaJson;
  } catch {
    // 중괄호 깊이를 추적해서 첫 완결 JSON 객체만 추출
    const startIdx = cleaned.indexOf('{');
    if (startIdx === -1) throw new Error('JSON 파싱 실패: { 를 찾을 수 없습니다');
    let depth = 0;
    let endIdx = -1;
    for (let i = startIdx; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++;
      else if (cleaned[i] === '}') {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    if (endIdx === -1) throw new Error('JSON 파싱 실패: 불완전한 JSON');
    return JSON.parse(cleaned.substring(startIdx, endIdx + 1)) as UploadMetaJson;
  }
}

/**
 * 디스크립션에 짱샘 채널 링크 블록 자동 첨부 (이미 들어있으면 건너뜀).
 */
export function applyChannelLinksPostProcess(
  meta: UploadMetaJson
): UploadMetaJson {
  if (!meta?.description?.text) return meta;
  if (meta.description.text.includes('blog.naver.com/imoim77')) {
    return meta;
  }
  return {
    ...meta,
    description: {
      ...meta.description,
      text: meta.description.text.trimEnd() + CHANNEL_LINKS_BLOCK,
    },
  };
}
