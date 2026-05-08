# 짱샘 유튜브 스튜디오 — 작업 로그

**최종 업데이트**: 2026-05-08 (밤 — MP4 합성 추가, 6 모듈 끝-끝 연결)
**파이프라인**: 영상 주제 → **리서치(NotebookLM)** → 대본 → **슬라이드(Remotion)** → 음성 → MP4
**실행 환경**: **로컬 dev 우선** (NotebookLM이 로컬 전용이라 클라우드 의존 단계 없음)
**저장소**: https://github.com/haemiru/jjangsaem-youtube-studio
**Vercel 미러**: https://jjangsaem-youtube-studio.vercel.app/ (참고용, 리서치·슬라이드 동작 안 함)

---

## 0. 오늘 한 일 요약 (2026-05-08)

### 밤 세션 — MP4 합성 모듈 (6번째 모듈, 파이프라인 끝-끝 연결)
1. **3가지 결정 포인트 확정** — ① 슬라이드 길이 = 라인별 `audioLengthSec` 합산 자동(+0.3s tail), ② 자막 화면 표시(화자별 색: 짱샘=accent 코랄, 부모=secondary 민트), ③ 렌더는 `/api/render-video` 비동기 잡.
2. **오디오 디스크 저장 부활** — `/api/synthesize`가 `public/audio/<jobId>/line-NNN.mp3` 로 저장하고 `audioUrl` 반환. Remotion 렌더러가 `staticFile()`로 접근 가능. 브라우저용 base64는 그대로 유지.
3. **`Deck` 타입 확장** — `AudioLine` 추가(`{slideIdx, speaker, text, audioUrl, audioLengthSec}`), `Deck.audio?: AudioLine[]`. `remotion/types.ts` 단일 진실 소스.
4. **`SlideShow` 동기화 로직** — 슬라이드 길이 = 해당 슬라이드의 라인 audio 합 + tail. `<Sequence>` 안에 `<Audio src={staticFile(...)}>` 시퀀스 + `<SubtitleOverlay>` 오버레이. 음성 없을 땐 기존 `defaultSlideDurationSec` fallback.
5. **`SubtitleOverlay`** — 현재 프레임에서 재생 중인 라인을 찾아 화자 라벨 + 본문 표시. 라인 진입/이탈 시 6프레임 페이드.
6. **`Root.tsx` 동적 길이** — `calculateMetadata`에서 `props.deck` 받아 `calcTotalFrames(deck)` 계산. `selectComposition` 호출 시 inputProps 기반 자동 결정.
7. **`/api/render-video` + `lib/render-jobs.ts`** — 인메모리 잡 스토어(`Map<jobId, RenderJob>`) + 번들 캐시. POST → 즉시 jobId 반환 + 백그라운드 `bundle()`→`selectComposition`→`renderMedia`(onProgress 콜백). GET → 진행률·outputUrl 폴링. 출력은 `public/videos/<jobId>/video.mp4`.
8. **UI 7번 섹션 "MP4 합성"** — 슬라이드 + 모든 음성 완료 후 활성화. 진행률 바, 첫 번들링 안내(30~90초), 완료시 비디오 플레이어 + MP4 다운로드 버튼. 5번 Player에도 `deckWithAudio` 전달해 미리보기에서 음성·자막 함께 재생.
9. **타입 체크 통과** — `npx tsc --noEmit` 통과 ✓.

### 저녁 세션 — 슬라이드 렌더링 모듈 추가
1. **Remotion v4.0.458 통합** — `remotion/` 서브폴더에 컴포지션·테마·슬라이드 컴포넌트 5종 (title/title-bullets/split/stat/quote/steps). 짱샘 브랜드 컬러(딥 오버진 + 코랄 액센트 + 민트 보조). `remotion compositions` 검증 ✓ — SlideShow 1920×1080 @ 30fps 정상 등록.
2. **슬라이드 플랜 JSON 추상화** — 음성용 대본 ≠ 화면 컨텐츠 분리. `SlidePlan` 유니언 타입으로 6가지 슬라이드 타입 정의. Claude가 슬라이드별 타입까지 자동 결정.
3. **`/api/generate-slides`** — POST `{ topic, script, research? }` → Claude가 대본 분석 후 슬라이드 플랜 JSON 생성. JSON 파싱 실패 시 raw 응답 일부 반환.
4. **UI에 "5. 슬라이드 플랜 + 미리보기" 섹션** — `@remotion/player` 임베드, 슬라이드 생성 버튼 + 편집 가능 JSON textarea + 라이브 Player. 음성 합성은 6번으로 밀림.
5. **npm scripts** — `npm run remotion:studio` (Remotion 자체 스튜디오), `npm run remotion:render` (mp4 렌더 — 다음 단계에서 audio 합성과 묶음).

### 오후 세션 — 리서치 단계 추가 + 로컬 우선 결정
1. **NotebookLM 리서치 통합** — `nlm` CLI를 child_process로 호출하는 `src/lib/notebooklm.ts` 작성. `/api/notebooks` (목록), `/api/research` (질의) 추가. UI에 "2. 리서치" 섹션 신설(노트북 드롭다운 + 리서치 버튼 + 결과 편집 가능 textarea). 검증: 90+ 노트북 정상 조회.
2. **research → 대본 grounding** — `script-prompts.ts`에 `researchBlock()` 추가, system prompt에 PDF 발췌와 함께 주입. PDF·리서치 둘 다 1차 자료로 동시 사용 가능.
3. **Vercel 배포 보류 결정** — NotebookLM이 로컬 전용(`nlm.exe`·OAuth 토큰 모두 사용자 PC에 묶임)이라 라이브 사이트에서 리서치 버튼이 동작 못 함. 짱샘님 1인 사용 + 슬라이드/MP4 단계도 로컬 친화적이라 **로컬 dev를 메인으로 운영**. Vercel은 깔아둔 채 참고용 미러로만 유지.

### 오전 세션 — 첫 끝-끝 사이클 (대본 → 음성)
1. **대본 자동 생성** — Claude Opus 4.7 연동, 두 모드(대화/1인 설명) 선택형으로 구현. `@anthropic-ai/sdk` 추가, `src/lib/anthropic.ts` + `src/lib/script-prompts.ts` + `/api/generate-script` 신설.
2. **검수 분기** — `script-validator.ts` 가 모드 인자를 받아 dialogue 5장치 / solo 3장치(구어체 표지·도입·따뜻한 마무리)로 자동 분기.
3. **Git + GitHub** — 폴더가 untracked 상태였음. `git init`, `haemiru/jjangsaem-youtube-studio` 첫 commit 후 push.
4. **Vercel 배포** — `synthesize` 라우트에서 `mkdir`+`writeFile` 제거 (Vercel read-only FS 호환), base64만 반환. (오후에 로컬 우선으로 결정했지만 호환 패치 자체는 유지.)
5. **PDF 업로드 기반 grounding** — `pdfjs-dist` 클라이언트 사이드 추출(첫 50p / 20,000자), `pdfText` 옵션으로 system prompt에 끼워넣기. 짱샘 책방 전자책(15MB+)도 처리 가능. 비용 ≈ $0.10~0.15/회. SSR 빌드 깨짐(`DOMMatrix is not defined`)은 동적 import로 해결.
6. **UX 정리** — 대본 textarea 초기값 비우고 placeholder로 형식 안내. 모드 변경 시 샘플 자동 교체도 제거(자동 생성 버튼이 생긴 후로 혼동 유발).

남은 즉시 액션은 §4 🔴 참조.

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

### 슬라이드 (Remotion) — NEW (저녁 세션)
- **의존성**: `remotion`, `@remotion/cli`, `@remotion/player`, `@remotion/bundler`, `@remotion/renderer` (모두 v4.0.458)
- **구조**: `remotion/` 서브폴더 (root package.json 공유)
  - `remotion.config.ts` — 엔트리 `./remotion/index.ts`, jpeg 이미지 포맷
  - `remotion/index.ts` — `registerRoot(RemotionRoot)`
  - `remotion/Root.tsx` — `Composition id="SlideShow"` 등록 + 샘플 deck
  - `remotion/SlideShow.tsx` — `Sequence` 로 슬라이드 직렬 연결, `calcTotalFrames()` 헬퍼
  - `remotion/theme.ts` — bg `#1A1530` + accent `#FFB5A7`(코랄) + secondary `#A8E6CF`(민트), Noto Sans KR
  - `remotion/types.ts` — `SlidePlan` 유니언, `Deck` 인터페이스 (양쪽에서 공유)
  - `remotion/slides/` — TitleSlide, TitleBulletsSlide, SplitSlide, StatSlide, QuoteSlide, StepsSlide, SlideRouter
- **Next.js 임베드**: `src/components/SlidePlayer.tsx` (`@remotion/player` 사용, 16:9 자동 비율)
- **API**: `src/app/api/generate-slides/route.ts` — Claude Opus 4.7, temperature 0.6, JSON 추출 견고화 (코드펜스/머리말 제거)
- **프롬프트**: `src/lib/slide-prompts.ts` — 6가지 타입 카탈로그 + 규칙 (8~16자 제목, 같은 타입 3연속 금지, 화면용은 입말 표지 제거 등)
- **검증 명령**: `npm run remotion:studio`, `npx remotion compositions` (등록 확인)

### MP4 합성 (Remotion 렌더러) — NEW (밤 세션)
- **`remotion/types.ts`** — `AudioLine` 추가, `Deck.audio?: AudioLine[]`. SlidePlan은 화면 컨텐츠, AudioLine은 음성·자막 메타.
- **`remotion/SlideShow.tsx`** — `slideDurationFrames(deck, i, fps)` 헬퍼: audio 있으면 `Σ audioLengthSec + 0.3s tail`, 없으면 explicit `durationsSec[i]` 또는 `defaultSlideDurationSec`. 슬라이드별 `<Sequence>` 안에 라인 audio `<Sequence>` 직렬 배치 + `<SubtitleOverlay>`. `resolveAudioSrc()` 가 `staticFile()` 로 정규화.
- **`remotion/SubtitleOverlay.tsx`** — `useCurrentFrame` + `useVideoConfig.fps` 로 현재 라인 계산. 화자 라벨(짱샘/부모) + 본문, 화자별 액센트 보더(짱샘=`theme.accent`, 부모=`theme.secondary`), 6프레임 페이드 인/아웃, 하단 80px.
- **`remotion/Root.tsx`** — `calculateMetadata: ({props}) => ({durationInFrames: calcTotalFrames(props.deck)})` 추가. inputProps의 deck에 따라 길이 자동.
- **`src/lib/render-jobs.ts`** — `RenderJob {jobId, status, progress, renderedFrames, totalFrames, outputUrl, error}`. `getBundleLocation()` 모듈 레벨 캐시(`bundleLocationCache`). `startRenderJob(jobId, deck)` → `runRender()` 백그라운드 (bundling → rendering → done). `@remotion/bundler.bundle({entryPoint, publicDir: project/public})` → `@remotion/renderer.selectComposition` → `renderMedia({codec:'h264', onProgress})`.
- **`src/app/api/render-video/route.ts`** — POST `{jobId, deck}` → `startRenderJob` → 즉시 `{job}` 반환. GET `?jobId=` → 현재 잡 상태. `runtime: 'nodejs'`, `maxDuration: 300`. jobId 정규식 검증, deck 최소 검증.
- **`src/app/api/synthesize/route.ts`** — jobId 있을 때 `public/audio/<jobId>/line-NNN.mp3` 디스크 저장. 응답에 `audioUrl: '/audio/<jobId>/line-NNN.mp3'` 포함.
- **`src/app/page.tsx`** — `LineAudio.staticUrl` 추가, `audioLines` (parsed.lines + audioByLine 결합) `useMemo`, `deckWithAudio` 도출. 5번 SlidePlayer에도 deckWithAudio 전달(미리보기에서 음성·자막 동작). 7번 섹션 신설: 진행률 바 + 1.5s 폴링 + 완료시 video 플레이어 + 다운로드.
- **출력 경로**: `public/videos/<jobId>/video.mp4` (브라우저에서 그대로 `/videos/<jobId>/video.mp4` 로 접근).
- **결정 사항**:
  - 슬라이드 길이 = audio 합산 자동
  - 자막 화면 표시 (SRT 따로 추출 안 함)
  - 비동기 잡 (CLI 직접 호출 안 함)

### 리서치 (NotebookLM, 로컬 전용) — NEW (오후 세션)
- `src/lib/notebooklm.ts` — `nlm` CLI 래퍼 (`child_process.execFile`)
  - 함수: `listNotebooks()`, `queryNotebook(notebookId, question, { timeoutSec })`
  - `NotebookLMError` 클래스로 인증만료/미설치/파싱오류/타임아웃 분류
  - 환경변수 `NLM_BIN`으로 절대경로 지정 가능 (기본 `nlm`)
- `src/app/api/notebooks/route.ts` — GET, `nlm list notebooks --json`
- `src/app/api/research/route.ts` — POST `{ topic, mode, notebookId, slideCount? }`
  - 내부적으로 NotebookLM에 5개 항목 정리 요청 (핵심 메시지/오해/실천법/인용 표현/자료 미존재)
  - 타임아웃 150초, `nlm notebook query <id> "<question>" --json`
- `script-prompts.ts` 에 `researchBlock(research)` 추가 → system prompt에 주입
- `/api/generate-script` 가 `research` 필드 받음 (PDF와 병행 가능, 둘 다 있으면 둘 다 prompt에 들어감)
- UI 변경:
  - 신규 섹션 "2. 리서치 (NotebookLM)" — 노트북 드롭다운 + 리서치 버튼 + 결과 textarea (편집 가능)
  - 기존 2/3/4 섹션은 3/4/5로 재번호
  - 페이지 mount 시 `/api/notebooks` 자동 로드, 첫 노트북 자동 선택
- ⚠️ **로컬 dev 전용** — Vercel에서는 `nlm.exe` 부재 + OAuth 토큰 부재로 동작 안 함

### 대본 자동 생성
- `@anthropic-ai/sdk` 설치, `claude-opus-4-7` 사용
- `src/lib/anthropic.ts` — Anthropic 클라이언트 래퍼 (`generate({ system, user })`)
- `src/lib/script-prompts.ts` — dialogue / solo 두 모드 프롬프트 빌더
  - 짱샘 페르소나, 리듬 규칙, 형식 규칙 공통
  - dialogue: 부모↔짱샘, 자연스러움 5장치 명시
  - solo: 짱샘 단독, 1인 전용 3장치 (구어체 표지 / 도입 / 따뜻한 마무리)
  - PDF 업로드 시 "참고 자료 (책 발췌)" 섹션 자동 삽입
  - **리서치 결과(NEW)** 시 "리서치 결과 (NotebookLM)" 섹션도 함께 주입
- `src/app/api/generate-script/route.ts` — POST `{ topic, mode, parentGender?, slideCount, pdfText?, research? }` → `{ script, usedPdf, usedResearch }`
- ⚠️ `ANTHROPIC_API_KEY` 는 `.env.local` 에 사용자가 직접 추가해야 동작

### PDF 업로드 → 대본 grounding (NEW)
- `pdfjs-dist` 클라이언트 사이드 추출 (jjangsaem-youtube 프로젝트 패턴 차용)
- `src/lib/pdf-extract.ts` — 첫 50p / 20,000자까지 추출 (동적 import로 SSR 회피)
  - worker는 `unpkg.com/pdfjs-dist@<version>/build/pdf.worker.min.mjs` CDN 사용
- 책 PDF 업로드 → 클라이언트에서 텍스트 추출 → API에 `pdfText` 전송 → Claude system prompt에 끼워넣음
- 짱샘 책방 전자책(15MB+) 도 첫 50p만 추출하므로 Vercel 4.5MB body 제한 무관
- 비용: 20K자 ≈ ~10K 입력 토큰 → Opus 한 번 ≈ $0.10~0.15

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

### UI (현재 6 섹션 구조)
- `src/app/page.tsx` — 메인 페이지
  - **1. 영상 정보** — 주제 + 대본 형식(대화/1인) + 부모 성별 + 참고 PDF 업로드 + 슬라이드 수 + 대본 생성 버튼
  - **2. 리서치 (NotebookLM)** — 노트북 드롭다운 + 리서치 버튼 + 결과 textarea (편집 가능)
  - **3. 대본 입력** — textarea + 검수 버튼, placeholder로 모드별 형식 안내
  - **4. 자연스러움 검수** — 모드별 5장치/3장치 자동 분기, 통과 라벨/파싱 에러 표시
  - **5. 슬라이드 플랜 + 미리보기** — 슬라이드 생성 버튼(Claude) + JSON textarea(편집) + Remotion Player(16:9 라이브 미리보기)
  - **6. 음성 합성** — 전체 합성 버튼 + 라인별 진행/audio 플레이어
  - 1인 모드일 때 부모 성별 비활성화·라인 라벨 "부모(–)" 표시
  - PDF 업로드 시 추출 진행/결과(페이지 수·문자 수) 인라인 표시
- `src/app/api/synthesize/route.ts` — POST 라우트 (Vercel 호환 잔재)
  - body: `{ lineIdx, speaker, parentGender, text, style?, voiceSettings?, jobId? }`
  - Supertone 호출 → base64만 반환 (디스크 저장 제거, mp3 영구 보관은 추후 R2/S3)
  - 클라이언트는 한 줄씩 순차 호출 (실패 라인은 다른 라인에 영향 없이 계속)

---

## 2. 현재 진행 중

### 2-1. 로컬 end-to-end 검증 (사용자 액션 필요)
- `npm run dev` 띄운 상태에서 (포트 3008)
- 주제 입력 → 노트북 선택 → 리서치 → 대본 생성 → 검수 → 음성 합성 한 사이클
- 책 본문 표현이 대본에 살아 들어왔는지 확인

### 2-2. ANTHROPIC_API_KEY 설정 (사용자 액션 필요)
- `.env.local` 에 `ANTHROPIC_API_KEY=sk-ant-...` 한 줄 추가
- 키 발급: https://console.anthropic.com/settings/keys

### 2-3. 엄마 voice 교체 (보류 — 나중에 다시)

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
- **SSR에서 브라우저 전용 API 참조 금지** — `pdfjs-dist`는 모듈 평가 시점에 `DOMMatrix` 참조해서 빌드 깨짐. 동적 import(`await import(...)`)로 함수 안에서 로드.

### NotebookLM (로컬 전용)
- `nlm` Python CLI (Windows: `C:\Users\bsuha\.local\bin\nlm.exe`)
- OAuth 토큰은 사용자 PC에 저장 → 다른 머신에서 사용 불가
- 인증 만료 시 `nlm login` 한 번 실행 (브라우저 OAuth)
- 자주 쓰는 명령:
  - `nlm list notebooks --json` — 노트북 목록
  - `nlm notebook query <id> "<질문>" --json --timeout 120` — 단일 노트북 질의
  - `nlm cross query "<쿼리>" --notebooks <ids>` — 다중 노트북 (JSON 미지원)
- API 라우트는 `runtime: 'nodejs'` 필수 (child_process 사용)

### Vercel 배포 제약 (현재 사용 안 함)
- 이 프로젝트는 **로컬 dev 우선**으로 운영. NotebookLM이 로컬 전용이라 Vercel에선 핵심 단계가 깨짐.
- Vercel 미러는 깔아둔 채 참고용으로만 유지. 라이브 사이트에서 리서치 버튼 누르면 "노트북 목록 불러오기 실패" 정상.
- Vercel 자체 제약 메모 (나중에 다시 살릴 때 참고):
  - Serverless 함수는 read-only FS — `mkdir`/`writeFile` 호출하면 `EROFS`. `synthesize` 라우트에서 이미 디스크 저장 제거함.
  - 요청 본문 4.5MB 한도 — 큰 PDF는 클라이언트에서 텍스트 추출 후 텍스트만 전송하는 패턴으로 회피.
  - 환경 변수 변경 시 재배포 필요.

### 개인 정보 / 브랜딩
- "짱샘" = 25년차 아동 재활치료사 페르소나
- UI 언어: 한국어
- 부모 화자는 mom/dad 선택 가능 (라디오)

---

## 4. 다음 할 일 (TODO)

### 🔴 즉시 (사용자 액션 / 검증) — **모든 모듈 통합 완료 후 한 번에 끝-끝 테스트**
- [ ] **로컬 dev 서버에서 7 섹션 끝-끝 검증** (포트 3008) — 사용자가 단계별 검증 스킵하고 마지막에 한 번에 보겠다고 함
  - 주제 → 노트북 선택 → **리서치** → 대본 생성 → 검수 → **슬라이드 생성** + Player 미리보기 → **음성 합성** → **MP4 렌더 + 다운로드**
  - 깨지는 단계 발견하면 거기서부터 디버깅.
  - **MP4 합성 단계 중점 확인**:
    - 첫 번들링이 30~90초 안에 끝나는지 (`@remotion/bundler` 캐시는 다음 호출부터 즉시)
    - 진행률 폴링이 1.5초마다 정상 갱신되는지
    - 완성된 mp4의 자막이 라인별 음성과 동기화되는지 (특히 슬라이드 경계에서 끊김 없는지)
    - `staticFile('/audio/<jobId>/...')`가 렌더러 환경에서 정상 해석되는지 (publicDir 강제 지정함)
- [ ] **`.env.local` 에 `ANTHROPIC_API_KEY`** 확인 + dev 서버 재시작
- [ ] `nlm login` 인증 만료 시 갱신
- [ ] (선택) `npm run remotion:studio` 별도 터미널에서 실행해서 샘플 deck 미리보기·슬라이드 컴포넌트 디자인 확인

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
- [ ] 리서치 결과 마크다운 미리보기(렌더링)
- [ ] 노트북 검색·필터 (90+ 개 드롭다운이라 길음)

### 🟢 다음 단계 (파이프라인 보강)
- [x] **슬라이드 렌더링** — Remotion v4 기반 (저녁 세션)
- [x] **MP4 합성** — audio 동기화 + 자막 + 비동기 렌더 잡 (밤 세션)
- [ ] **슬라이드 미세 조정**
  - 한국어 폰트 (Pretendard / Paperlogy 등) Google Fonts 임포트
  - split 슬라이드의 이미지 슬롯 → Gemini로 실제 이미지 생성
  - 슬라이드별 길이 수동 조정 UI (`durationsSec` 편집)
- [ ] **번들 캐시 무효화 트리거** — slide 컴포넌트 코드 변경 시 dev 서버에선 자동 HMR이지만 잡 스토어가 캐시한 bundleLocation은 그대로. 명시적 무효화 버튼 또는 파일 mtime 기반 자동 무효화.
- [ ] **잡 스토어 영속화** — 현재 인메모리 → dev 재시작 시 진행 중 잡 손실. JSON 파일이나 SQLite로 옮길지 검토 (사용 빈도 낮으면 보류).
- [ ] **(선택) 썸네일 자동 생성** — 주제 + 핵심 메시지로 Gemini/Imagen API
- [ ] **(선택) 자막 SRT 추출** — 화면 자막 외에 별도 SRT 파일 필요할 때만

### 🔵 운영 / 위생
- [x] `.env.local` 외부 노출 점검 (이미 `.gitignore`에 `.env*` 있음, OK)
- [x] `output/` 도 `.gitignore`에 들어있음, OK
- [x] git 초기 커밋 + GitHub repo (haemiru/jjangsaem-youtube-studio) 푸시
- [x] Vercel 배포 — 보류 결정 (로컬 우선). 미러는 그대로 두되 운영 단계로 끌어오지 않음.
- [x] **리서치 API (`/api/research`)** — NotebookLM MCP/CLI 기반 구현 (오늘 완료)
- [ ] **README** 작성 — 로컬 실행법, `nlm login` 안내, env 변수 목록
- [ ] 리서치 결과 캐싱 (같은 topic+notebook 조합 재호출 시 NotebookLM 쿼터 아끼기)

---

## 5. 파일 맵

```
jjangsaem-youtube-studio/
├── AGENTS.md                          # Next.js 16 주의 지침
├── CLAUDE.md                          # AGENTS.md 포함
├── WORK-LOG.md                        # ← 이 문서
├── .env.local                         # API 키 (gitignored)
├── package.json                       # next 16.2.5, react 19, remotion 4.0.458, tsx
├── remotion.config.ts                 # Remotion CLI 설정 (NEW)
├── remotion/                          # Remotion 서브프로젝트
│   ├── index.ts                       # registerRoot
│   ├── Root.tsx                       # Composition + calculateMetadata (동적 길이)
│   ├── SlideShow.tsx                  # Sequence + Audio + SubtitleOverlay
│   ├── SubtitleOverlay.tsx            # 화자별 색 자막 (NEW 밤)
│   ├── theme.ts                       # 짱샘 브랜드 컬러
│   ├── types.ts                       # SlidePlan / AudioLine / Deck
│   └── slides/
│       ├── SlideRouter.tsx
│       ├── TitleSlide.tsx
│       ├── TitleBulletsSlide.tsx
│       ├── SplitSlide.tsx
│       ├── StatSlide.tsx
│       ├── QuoteSlide.tsx
│       └── StepsSlide.tsx
├── scripts/
│   ├── tts-test.ts                    # 3 화자 기본 검증
│   ├── tts-tune-mom.ts                # voiceSettings 튜닝 (구)
│   └── tts-mom-candidates.ts          # voice 자체 교체 후보 비교 (신)
├── src/
│   ├── app/
│   │   ├── page.tsx                   # 메인 UI (7 섹션: 정보→리서치→대본→검수→슬라이드→음성→MP4)
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── api/
│   │       ├── notebooks/route.ts        # NotebookLM 노트북 목록 GET
│   │       ├── research/route.ts         # NotebookLM 질의 POST
│   │       ├── generate-script/route.ts  # 대본 생성 POST (Claude Opus 4.7)
│   │       ├── generate-slides/route.ts  # 슬라이드 플랜 생성 POST
│   │       ├── synthesize/route.ts       # 라인별 TTS POST + public/audio 디스크 저장
│   │       └── render-video/route.ts     # MP4 비동기 렌더 잡 POST/GET (NEW 밤)
│   ├── components/
│   │   └── SlidePlayer.tsx            # @remotion/player 임베드
│   └── lib/
│       ├── notebooklm.ts              # nlm CLI 래퍼 (child_process)
│       ├── anthropic.ts               # Claude SDK 래퍼
│       ├── script-prompts.ts          # dialogue / solo 프롬프트 빌더 (+ PDF + 리서치)
│       ├── slide-prompts.ts           # 슬라이드 플랜 생성 프롬프트
│       ├── render-jobs.ts             # 인메모리 잡 스토어 + 번들 캐시 (NEW 밤)
│       ├── pdf-extract.ts             # 클라이언트 PDF 텍스트 추출
│       ├── supertone.ts               # Supertone REST 클라이언트
│       ├── voices.ts                  # 화자 → voice ID 매핑
│       ├── script-parser.ts           # 마크다운 대본 파서
│       └── script-validator.ts        # 모드별 검수 (5장치 / 3장치)
├── public/                            # Next.js 정적 + Remotion 렌더러 publicDir
│   ├── audio/<jobId>/line-NNN.mp3     # 라인별 mp3 (NEW 밤, gitignore 권장)
│   └── videos/<jobId>/video.mp4       # 렌더 결과 (NEW 밤, gitignore 권장)
└── output/                            # 검증용 mp3 (gitignored)
    ├── _tts-verification/
    └── _mom-candidates/
```

---

## 다시 돌아왔을 때

§0(오늘 한 일)과 §4(다음 할 일)만 읽으면 컨텍스트 복원 끝. 🔴 → 🟡 → 🟢 순서.

**현재 위치**: **6 모듈 모두 붙어 있음 — 리서치 / 대본 / 슬라이드 / 음성 / MP4 / (검수)** (UI 7 섹션). 코드 작성 끝, **사용자 끝-끝 검증만 남음**. 사용자가 단계별 검증 스킵하고 마지막에 한 번에 보겠다고 함 → 다음 세션은 통합 테스트 + 발견되는 버그 수정.

**바로 할 일 한 줄 요약**:
1. 🔴 `npm run dev` → 7 섹션 한 번 끝-끝 → MP4까지 떨어지는지 확인 → 깨지는 곳 디버깅
2. 🟡 한국어 폰트 (Pretendard / Paperlogy) Remotion 임포트, 슬라이드 미세 조정

**MP4 합성 결정 사항** (확정):
- 슬라이드 길이 = 라인별 `audioLengthSec` 합산 + 0.3s tail (자동)
- 자막 화면 표시 (화자별 색: 짱샘=accent, 부모=secondary)
- 렌더는 `/api/render-video` 비동기 잡 (CLI 호출 안 함)

**MP4 합성 알려진 한계 / 검증 시 주의**:
- 첫 번들링은 30~90초 (이후 모듈 레벨 캐시로 즉시)
- 잡 스토어 인메모리 → dev 서버 재시작 시 진행 중 잡 손실
- `public/audio/`, `public/videos/`는 jobId별 디렉토리 — 시간 지나면 정리 필요 (별도 cleanup 미구현)
- `staticFile()` 경로 해석을 위해 `bundle({ publicDir: project/public })` 명시 지정함
- Remotion 슬라이드 코드 수정해도 캐시된 bundleLocation이 그대로 → dev 서버 재시작 또는 명시적 무효화 트리거 필요 (TODO에 추가됨)

운영 메모:
- **로컬이 메인** — Vercel 미러는 동작하지 않는 게 정상 (NotebookLM 부재 + Remotion 렌더는 chromium 의존)
- 노트북 90+ 개 잡혀 있음 — 영상 주제별로 관련 노트북 골라 쓰면 됨
- 엄마 voice 교체는 사용자가 명시적으로 보류 (§2-3)
- Remotion v4.0.458, Next.js 16.2.5, React 19.2.4 (호환 검증됨)
- 포트 **3008**, NotebookLM 인증 만료 시 `nlm login`
