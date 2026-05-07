# 짱샘 유튜브 스튜디오 — 작업 로그

**최종 업데이트**: 2026-05-07 (대본 자동 생성 + 1인 설명 모드 추가)
**파이프라인**: 영상 주제 → 리서치 → 대본 → 슬라이드 → 음성 → MP4

---

## 1. 완료한 작업

### 인프라
- Next.js 16.2.5 + Tailwind v4 + TypeScript 부트스트랩 (포트 **3008**)
- `.env.local` — `SUPERTONE_API_KEY`, `GEMINI_API_KEY` 설정 완료

### 음성 (TTS)
- `src/lib/supertone.ts` — Supertone TTS REST 클라이언트
  - `synthesize()` 함수, 300자 제한 검사, 모델/스타일/voiceSettings 지원
  - 모델: `sona_speech_1` / `sona_speech_2` / `sona_speech_2_flash` / `supertonic_api_1`
  - voiceSettings: `pitch_shift -12~+12`, `pitch_variance 0.1~2`, `speed 0.5~2`
- `src/lib/voices.ts` — 화자별 voice ID 매핑
  - 짱샘: `195e1922033a6168f0c90f` ([Choice] Angelina, audiobook, styles: happy/neutral/serene)
  - 엄마: `289a055b782b3072b7cd11` ([Choice] Mika, narration, styles: **neutral**만) ⚠️ 교체 예정
  - 아빠: `838617ea6b672b84de0813`
- `scripts/tts-test.ts` — 짱샘/엄마/아빠 음성 검증 스크립트
- `scripts/tts-tune-mom.ts` — 엄마 voice settings 튜닝 비교 (pitch/speed/variance)
- `scripts/tts-mom-candidates.ts` — **엄마 voice 후보 비교 스크립트 (NEW)**
- `output/_tts-verification/` — 6개 mp3 (검증 + 튜닝 비교)
- `output/_mom-candidates/` — 8개 mp3 (Grace/Gloria/Cindy/Desphara/Mika baseline)

### 대본 자동 생성 (NEW)
- `@anthropic-ai/sdk` 설치, `claude-opus-4-7` 사용
- `src/lib/anthropic.ts` — Anthropic 클라이언트 래퍼 (`generate({ system, user })`)
- `src/lib/script-prompts.ts` — dialogue / solo 두 모드 프롬프트 빌더
  - 짱샘 페르소나, 리듬 규칙, 형식 규칙 공통
  - dialogue: 부모↔짱샘, 자연스러움 5장치 명시
  - solo: 짱샘 단독, 1인 전용 3장치 (구어체 표지 / 도입 / 따뜻한 마무리)
- `src/app/api/generate-script/route.ts` — POST `{ topic, mode, parentGender?, slideCount }` → `{ script }`
- ⚠️ `ANTHROPIC_API_KEY` 는 `.env.local` 에 사용자가 직접 추가해야 동작

### 대본
- `src/lib/script-parser.ts` — 마크다운 대본 파서
  - `## 슬라이드 N` 헤더 + `[부모]` / `[엄마]` / `[아빠]` / `[호스트]` / `[짱샘]` 라벨
  - `[부모: 걱정]` 형식으로 style 인라인 지정 가능
  - 라벨 없는 줄은 직전 라인에 이어붙임, 300자 초과 경고
- `src/lib/script-validator.ts` — 모드별 검수
  - **dialogue 5장치**:
    1. 호스트의 자기 아이 이야기·감정 (슬라이드 절반 이상)
    2. 짱샘 답변 "맞아요/정확해요/그렇습니다" 시작 ≤ 1/3
    3. 구어체 표지 화자별 5회 이상
    4. 짧·짧·긴 리듬 (비슷한 길이 3연속 금지)
    5. 발견의 순간 (매 슬라이드 부모 "아!" + 짱샘 따뜻한 한마디)
  - **solo 3장치** (NEW):
    1. 구어체 표지 5회+ (그게 보통은/한 가지만/사실은/알고 보면)
    2. 첫 슬라이드 스토리텔링 도입 (오늘은/해볼게요/얘기)
    3. 마지막 슬라이드 따뜻한 마무리 (어머님/괜찮/잘하고)
  - `validateScript(parsed, mode)` 시그니처, `recommended` 기준 dialogue 4/5 / solo 2/3

### UI
- `src/app/page.tsx` — 메인 페이지
  - 1. 영상 정보 (주제 + **대본 형식: 대화/1인** + 부모 성별 + 슬라이드 수 + **대본 생성 버튼**)
  - 2. 대본 입력 (textarea + 검수 버튼) — 모드 변경 시 샘플 자동 교체
  - 3. 자연스러움 검수 결과 (모드별 5장치/3장치 자동 분기)
  - 4. 음성 합성 — 전체 합성 버튼 + 라인별 진행/audio 플레이어
  - 1인 모드일 때 부모 성별 비활성화·라인 라벨 "부모(–)" 표시
- `src/app/api/synthesize/route.ts` — POST 라우트
  - body: `{ jobId, lineIdx, speaker, parentGender, text, style?, voiceSettings? }`
  - Supertone 호출 → `output/<jobId>/<NNN>-<speaker>.mp3` 저장 + base64 응답
  - 클라이언트는 한 줄씩 순차 호출 (실패 라인은 다른 라인에 영향 없이 계속)

---

## 2. 현재 진행 중

### 2-1. ANTHROPIC_API_KEY 설정 (사용자 액션 필요)
- `.env.local` 에 `ANTHROPIC_API_KEY=sk-ant-...` 한 줄 추가
- 키 발급: https://console.anthropic.com/settings/keys
- 추가 후 `npm run dev` 재시작

### 2-2. 엄마 voice 교체 (보류 — 나중에 다시)

**문제**: 현재 엄마 voice "Mika"는 `narration/news` 전용이고 style이 `neutral` 하나뿐. 한국 어머님 감정 대화에 구조적으로 부적합.

**상태**: `output/_mom-candidates/` 에 8개 후보 mp3 생성 완료 — **사용자 청취 + 결정 대기**.

| 파일 | voice | style | 설명 |
|---|---|---|---|
| `Z0-mika-baseline.mp3` | 현재 Mika | neutral | 비교 기준 |
| `A1-grace-anxious-worried.mp3` | Grace (middle-aged) | **anxious** | 걱정하는 엄마 1순위 후보 |
| `A2-grace-sad-worried.mp3` | Grace | sad | 가라앉은 톤 |
| `A3-grace-neutral-discovery.mp3` | Grace | neutral | 발견 대사 검증 |
| `B1-gloria-kind-worried.mp3` | Gloria (middle-aged) | kind | 따뜻한 엄마 |
| `B2-gloria-sad-worried.mp3` | Gloria | sad | |
| `C1-cindy-neutral-worried.mp3` | Cindy (middle-aged narration) | neutral | Mika류 비교 |
| `E1-desphara-sad-worried.mp3` | Desphara (middle-aged) | sad | 저음·진중 |

**주의**: Esther (elder, anxious)는 `sona_speech_2`에서 미지원 → 실패.

**모든 후보 모델**: `sona_speech_2` (현재 메인보다 표현력 우수)

---

## 3. 알아낸 것 / 의사결정 메모

### Supertone API
- `GET /v1/voices/<id>` — voice 메타 (use_case, styles, models 배열)
- `GET /v1/voices/search?language=ko&gender=female&page_size=50` — 카탈로그 검색
- voice마다 지원 styles가 다름 (Mika는 neutral 하나, Grace는 6개)
- voice + model + style 조합이 모두 지원돼야 함 (조합이 없으면 400)
- **API 키는 `.env.local` 에만**, 코드/문서/커밋에 노출 금지

### 한국 어머님 voice 선정 기준
- `age: middle-aged` (또는 elder) — young-adult는 너무 어림
- `styles`에 `anxious`/`sad`/`kind` 중 하나 이상 — 감정 표현 가능 voice
- `use_case: game/entertainment` — 대화·연기 가능 카테고리

### Next.js 16 주의점
- `dynamic`/`dynamicParams`/`revalidate`/`fetchCache` route segment config는 Cache Components 활성 시 제거됨 → 사용 금지
- 이 프로젝트는 포트 **3008** (3000 아님)
- AGENTS.md 지침: 코드 작성 전 `node_modules/next/dist/docs/` 확인

### 개인 정보 / 브랜딩
- "짱샘" = 25년차 아동 재활치료사 페르소나
- UI 언어: 한국어
- 부모 화자는 mom/dad 선택 가능 (라디오)

---

## 4. 다음 할 일 (TODO)

### 🔴 즉시 (사용자 액션)
- [ ] `.env.local` 에 `ANTHROPIC_API_KEY` 추가 → 대본 생성 동작 확인
- [ ] 대화/1인 두 모드로 실제 대본 생성·검수·합성까지 end-to-end 한 사이클 돌려보기

### 🟡 짧은 작업 (음성 + 생성 보강)
- [ ] **엄마 voice 교체 (보류 중)** — `output/_mom-candidates/` 8개 mp3 청취 후 ID·style 결정
- [ ] 라벨에 `style` 인라인 지정 시 API 라우트가 그대로 전달하는지 end-to-end 검증
- [ ] 대본 라인 톤 → style 자동 매핑 휴리스틱
  - 부모: "걱정/속상/답답/잠을 못" → `anxious` / `sad`
  - 부모: "아! 그래서/진짜요?" 발견 → `neutral` / `happy`
  - 짱샘: "어머님/괜찮/잘하고" → `serene`
- [ ] 모델 선택 UI — `sona_speech_1` / `sona_speech_2` 토글
- [ ] 짱샘·아빠 voice 후보 비교
- [ ] 대본 생성 결과가 검수 통과 못 할 때 자동 재생성 루프 (max 2회)

### 🟢 다음 단계 (파이프라인 다음 모듈)
- [ ] **리서치** API (`/api/research`)
  - NotebookLM MCP 또는 web search → 주제 관련 근거 수집
  - 대본 생성 단계에 컨텍스트로 주입
- [ ] **슬라이드 렌더링** — Remotion 기반? HTML/canvas?
  - `## 슬라이드 N` 단위로 시각 슬라이드 생성
  - remotion-slides 스킬 활용 가능성 검토
- [ ] **MP4 합성** — 슬라이드 + 라인별 mp3 → 최종 영상
  - 라인 audioLengthSec 누적으로 슬라이드 표시 시간 계산
  - 짱샘/부모 라벨에 따라 좌/우 캐릭터 토글

### 🔵 운영 / 위생
- [ ] `.env.local` 외부 노출 점검 (이미 `.gitignore`에 `.env*` 있음, OK)
- [ ] `output/` 도 `.gitignore`에 들어있음, OK
- [ ] git 초기 커밋 — 이 프로젝트 폴더는 아직 한 번도 커밋된 적 없음
- [ ] Vercel 배포는 일단 보류 (서버사이드 mp3 저장이 read-only FS와 안 맞음, 추후 R2/S3 검토)

---

## 5. 파일 맵

```
jjangsaem-youtube-studio/
├── AGENTS.md                          # Next.js 16 주의 지침
├── CLAUDE.md                          # AGENTS.md 포함
├── WORK-LOG.md                        # ← 이 문서
├── .env.local                         # API 키 (gitignored)
├── package.json                       # next 16.2.5, react 19, tsx
├── scripts/
│   ├── tts-test.ts                    # 3 화자 기본 검증
│   ├── tts-tune-mom.ts                # voiceSettings 튜닝 (구)
│   └── tts-mom-candidates.ts          # voice 자체 교체 후보 비교 (신)
├── src/
│   ├── app/
│   │   ├── page.tsx                   # 메인 UI (4 섹션 + 모드 선택 + 대본 생성)
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── api/
│   │       ├── generate-script/route.ts  # 대본 생성 POST (Claude Opus 4.7)
│   │       └── synthesize/route.ts       # 라인별 TTS POST
│   └── lib/
│       ├── anthropic.ts               # Claude SDK 래퍼
│       ├── script-prompts.ts          # dialogue / solo 프롬프트 빌더
│       ├── supertone.ts               # Supertone REST 클라이언트
│       ├── voices.ts                  # 화자 → voice ID 매핑
│       ├── script-parser.ts           # 마크다운 대본 파서
│       └── script-validator.ts        # 모드별 검수 (5장치 / 3장치)
└── output/                            # 생성된 mp3 (gitignored)
    ├── _tts-verification/
    └── _mom-candidates/
```

---

## 다시 돌아왔을 때

이 문서를 처음부터 끝까지 한 번 읽고, **§4 다음 할 일** 의 🔴/🟡/🟢 순서대로 to-do를 알려주면 됨.
첫 항목은 거의 항상 **"엄마 voice 후보 청취 + 선택"** 이고, 결정 후에야 그 아래 단계가 풀린다.
