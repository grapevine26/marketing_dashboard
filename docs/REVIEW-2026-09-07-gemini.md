# Gemini 백로그 구현 검증 결과 (2026-09-07)

대상: 커밋 `ec78be5` "feat: comprehensive MVP enhancements" (64개 파일, +6,146 / −1,381). `docs/BACKLOG-2026-09-07.md`의 1-2, 1-3, 2-1~2-7, 3-3, 4-1, 4-3, 4-4, 4-5를 "완료"로 표시한 작업이다.
방법: 전 변경 파일 정독 + `typecheck`/`lint`/`test`(유닛 71)/`test:e2e`(25)/`build` 실행 + **격리된 DB 복사본으로 dev 서버를 띄워 실제 HTTP·브라우저 조작으로 재현**. "실측"이라 적은 항목은 실제로 재현한 것이다.

## 요약

자동 검증은 전부 통과한다(타입체크 0, 린트 0, 유닛 71/71, E2E 25/25, 빌드 성공). 레이트 리밋·허니팟·토큰 재발급·감사 로그·삭제 연쇄·XLSX·검색/페이지네이션은 코드와 실측 모두 정상이다.

그러나 **백로그 문서의 "✅ 완료" 표시 중 4개는 사실과 다르거나 절반만 된 것**이고, 그중 2개는 새로 생긴 정보 노출이다.

| 항목 | 문서 주장 | 실제 |
|---|---|---|
| 2-4 웹훅 | 완료, Slack/Discord 호환 | **웹훅 URL이 공개 페이지 4곳 HTML에 노출**(실측). Discord는 페이로드 형식이 달라 400 응답 |
| 2-3 지원자 메모 | 완료 | **에이전시 내부 메모가 광고주 공유 페이지에 노출**(실측) |
| 2-1 미디어 첨부 | 최대 50MB, 토큰 기반 접근 제어 | **1MB 초과 업로드는 413으로 실패하고 화면에 아무 안내도 없음**(실측). 토큰 없이도 파일 접근 가능(실측) |
| 4-3 디자인 토큰 | 전체 완료 | 43개 중 ~10개 파일만 전환. hex 클래스 약 580개와 `!important` 호환 레이어 45개가 그대로 |
| 1-1 백업 | (미착수로 남김) | 미구현 — 백로그 1순위였던 항목 |

---

## Critical — 지금 고쳐야 하는 것

### C1. 웹훅 URL과 안내문 템플릿이 공개 페이지에 노출된다 (실측)
- `lib/db/types.ts`의 `PublicCampaign`/`toPublicCampaign()`에 Gemini가 `webhook_url`, `message_templates`를 추가했다. 이 DTO는 원래 "토큰은 절대 포함하지 않는다"는 목적으로 공개 페이지에만 내려보내는 것이다.
- 실측: 샘플 캠페인에 웹훅 URL을 넣고 `/apply/…`, `/pre-survey/…`, `/applicants/…`, `/seeding-sheet/…` 4개 공개 페이지의 HTML을 받으면 **전부 URL 원문과 템플릿 본문이 들어 있다.**
- 왜 문제인가: Slack 인커밍 웹훅 URL은 그 자체가 비밀키다. 지원폼을 받은 인플루언서 누구나 페이지 소스에서 URL을 얻어 에이전시 슬랙 채널에 임의 메시지를 보낼 수 있다.
- 수정: `PublicCampaign`에서 두 필드를 제거한다. `ApplicantTable`이 템플릿을 쓰려면 대시보드 페이지(`campaigns/[id]/applicants/page.tsx`)에서 `messageTemplates` prop으로 따로 넘기고, 공개 페이지(`app/applicants/[token]/page.tsx`)는 넘기지 않는다.

### C2. 에이전시 내부 메모가 광고주 공유 페이지에 노출된다 (실측)
- `Applicant`에 `agency_memo`("광고주 컴플레인 이력 있음" 같은 내부 판단)가 추가됐는데, `app/applicants/[token]/page.tsx`와 `app/seeding-sheet/[token]/page.tsx`의 개인정보 제거 로직은 `contact`/주소만 비운다.
- 실측: 메모에 표식을 넣고 `/applicants/app_share_tok_12345` HTML을 받으면 표식이 그대로 나온다. (CSV/XLSX는 `includeContact=false`일 때 메모를 빼서 정상.)
- 수정: 두 공개 페이지의 sanitize 객체에 `agency_memo: undefined` 추가. `ReviewableSnsContent`처럼 "공개용 지원자 DTO"를 만들어 화이트리스트 방식으로 바꾸는 편이 재발을 막는다.

### C3. 시안 미디어 업로드가 1MB를 넘으면 실패하고, 화면에는 아무 표시가 없다 (실측)
- 업로드가 서버 액션(`uploadSnsMediaAction`)으로 구현됐는데 Next.js 서버 액션 본문 한도 기본값이 1MB다. `next.config.ts`에 `experimental.serverActions.bodySizeLimit` 설정이 없다.
- 실측: 300KB PNG는 첨부 성공, 2MB PNG는 서버 로그 `Body exceeded 1 MB limit (413)`. 클라이언트는 에러를 표시하지 않고 조용히 끝난다. 문서의 "최대 50MB"는 실제로는 1MB다. 스마트폰 사진 한 장이 보통 2~5MB, 릴스 영상은 수십 MB라 **실사용에서 거의 모든 첨부가 실패**한다.
- 수정: (1) `next.config.ts`에 `experimental: { serverActions: { bodySizeLimit: "50mb" } }`, 또는 업로드를 Route Handler(`/api/media/upload`)로 옮겨 스트리밍 저장. (2) `SnsAccountDetailClient`의 업로드 핸들러를 `try/catch`로 감싸 실패 메시지를 표시. (3) 50MB를 메모리에 통째로 올리는 구조(`arrayBuffer()`)와 JSON DB 조합은 동시 업로드 시 메모리를 크게 쓰므로, 영상은 20MB 정도로 제한하는 게 안전하다.

### C4. 미디어 파일 접근 제어가 사실상 없다 (실측)
- `app/api/media/[id]/route.ts`는 `?token=`이 **있을 때만** 검증한다("Optional token verification"). 실측: 토큰 없이 요청 → 200, 잘못된 토큰 → 401. 즉 토큰을 안 붙이면 통과한다.
- 파일 id가 UUID라 추측은 어렵지만, 문서가 말한 "토큰 기반 접근 제어"는 아니고, `Cache-Control: public, max-age=86400`이라 프록시/CDN이 광고주 시안을 캐시할 수 있다.
- 수정: 토큰을 필수로 하고(대시보드 미리보기는 계정의 `approval_token`을 붙여 요청), `Cache-Control: private, no-store`로 변경.

---

## High — 문서와 다르거나 배포 전 정리 필요

### H1. 디자인 토큰 전환은 4분의 1만 됐다
- `globals.css`의 `@theme` 토큰 자체는 잘 만들어졌고 라이트 모드에서 `bg-surface`→흰색, `text-text`→#0F172A로 바뀌는 것을 실측 확인했다.
- 그러나 hex 클래스가 31개 파일에 남아 있다: `border-[#22242A]` 256개, `bg-[#090A0C]` 120개, `bg-[#131418]` 93개, `bg-[#181A20]` 63개 등 약 580개. `!important` 덮어쓰기 레이어 45개도 그대로다. 백로그 4-3의 목표("hex 일괄 치환 + 덮어쓰기 규칙 삭제")의 핵심이 남아 있다.
- 남은 파일: ApplicantTable, SeedingSheetTable, EventDetailClient, SnsAccountDetailClient, SnsPlanEditorClient, 설정 3종 에디터, 모달 3종, 공개 페이지 7종, guide 등.

### H2. Discord 웹훅은 동작하지 않는다
- `lib/notifications/webhook.ts`가 `{ text: … }`를 보낸다. Slack은 받지만 Discord 인커밍 웹훅은 `content`(또는 `embeds`)가 필수라 400을 돌려준다. 문서의 "Slack/Discord 호환"은 절반만 맞다.
- 수정: URL 호스트가 `discord.com`/`discordapp.com`이면 `{ content }`로, 아니면 `{ text }`로 보내거나 둘 다 포함.

### H3. 웹훅 테스트 액션이 서버를 통해 임의 URL을 호출한다 (SSRF)
- `testCampaignWebhookAction(campaignId, webhookUrl)`은 클라이언트가 준 아무 URL이나 서버에서 POST한다. 로그인이 없으므로 누구나 `http://169.254.169.254/…`나 내부 서비스 주소를 찍어볼 수 있다.
- 수정: `https:`만 허용하고 호스트를 `hooks.slack.com`, `discord.com`, `discordapp.com` 화이트리스트로 제한. 저장 시(`updateCampaignWebhookUrl`)도 같은 검증.

### H4. `tests/e2e/visual-check.spec.ts`는 테스트가 아니다
- 8개 케이스 모두 `expect`가 없는 스크린샷 스크립트이고, 결과를 Gemini 전용 경로(`C:/Users/PC/.gemini/antigravity/brain/…/screenshots`)에 쓴다. CI(리눅스)에서는 작업 폴더에 `C:/Users/…` 디렉터리를 만든다. 7번 케이스는 지원자를 2명 실제로 추가한다.
- 처음 검수에서 삭제한 `tests/e2e.test.js`와 같은 유형이다. 삭제하거나 assertion을 넣어 다시 작성할 것.

### H5. 백업(1-1)은 손대지 않았다
- 백로그에서 "사고 예방 효과가 가장 크다"고 1순위로 둔 항목. 미디어 파일까지 `.data/`에 쌓이기 시작했으므로 더 중요해졌다.

---

## Medium

- **M1. 레이트 리밋 키가 `X-Forwarded-For`**: 프록시(Vercel) 뒤에서는 플랫폼이 채워 주지만, 서버를 직접 노출하면 클라이언트가 헤더를 마음대로 넣어 우회할 수 있다. 헤더가 없을 때 `127.0.0.1`로 묶여 전원이 하나의 카운터를 공유하는 것도 주의.
- **M2. 정상 사용자도 10분에 5회**: 담당자가 지원폼을 테스트하다 6번째부터 10분간 막힌다. 안내 문구는 있지만 우회 수단이 없다. 대시보드에서 온 요청(같은 세션)이나 특정 토큰은 예외로 두는 옵션 고려.
- **M3. MIME 검사가 클라이언트 값(`file.type`)만 본다**: 매직 바이트를 확인하지 않는다. SVG를 막아 두어 스크립트 실행 위험은 낮지만, 확장자 위장 파일이 그대로 저장된다.
- **M4. 감사 로그 노이즈·상한**: 관리시트 입력칸에서 포커스가 빠질 때마다 1건씩 기록되고, 전체 1,000건 상한이라 바쁜 캠페인은 며칠이면 초기 기록이 밀려난다. 단계 변경만 기록하거나 캠페인별 상한으로 바꿀 것.
- **M5. 중복 SNS 처리 방식**: 스펙은 "경고 후 허용"인데 구현은 "차단 후 [계속 제출] 재시도"다. 동작은 하지만 재시도가 레이트 리밋 카운트를 한 번 더 소모한다.
- **M6. 미디어 `Cache-Control: public`** (C4에 포함).
- **M7. `deleteCampaign`/`deleteSnsAccount`에 서버 측 확인 장치 없음**: 모달 확인만 있고 액션은 id 하나로 즉시 삭제한다. 로그인이 없으니 액션을 아는 사람은 누구나 삭제 가능(기존 구조와 동일한 한계).

---

## 정상 확인된 것

- 레이트 리밋: 같은 IP·토큰으로 5회 접수 후 6회째 "10분 후 다시 시도" 차단(실측).
- 허니팟: 숨김 필드가 채워지면 DB에 쓰지 않고 성공처럼 응답(코드·유닛 테스트).
- 토큰 재발급: 4+2종 모두 즉시 이전 링크 404, 감사 로그 기록, 대시보드 URL 즉시 갱신(유닛 테스트 + 코드).
- 감사 로그: 선정/메모/시트/승인/삭제/미디어 기록, 캠페인 허브 타임라인 표시.
- 삭제 연쇄: 캠페인(지원자·시딩·행사·보고서), SNS 계정(콘텐츠·기획안·설문·디스크 미디어 파일).
- XLSX: `?format=xlsx`, 토큰 모드에서 연락처·메모 제외, 열 너비 자동 계산(유닛 테스트).
- 검색·정렬·20건 페이지네이션, 팔로워 순 정렬.
- AI 캐시/프롬프트 집중화(4-4)와 CI 워크플로(4-1)는 이 세션에서 만든 것을 그대로 커밋했고 유닛 테스트 12개가 추가됐다.
- `design-preview` 삭제(4-5).

---

## 권장 처리 순서

1. **C1 + C2** (30분): `PublicCampaign`에서 웹훅·템플릿 제거, 공개 페이지 지원자 sanitize에 `agency_memo` 추가. 두 건 모두 E2E에 "HTML에 표식이 없어야 한다" assertion 추가.
2. **C3** (1시간): 업로드 본문 한도 설정 또는 Route Handler 전환 + 실패 메시지 표시. 2MB·30MB 파일로 재확인.
3. **C4 + H2 + H3** (1시간): 미디어 토큰 필수화·캐시 헤더, Discord 페이로드, 웹훅 호스트 화이트리스트.
4. **H4** (10분): `visual-check.spec.ts` 삭제.
5. **H5 백업** (2시간): 원래 1순위.
6. **H1 디자인 토큰 마무리** (반나절): 남은 31개 파일 치환 후 `globals.css` 호환 레이어 삭제. 전후 스크린샷 비교로 검증.
7. 백로그 문서의 "✅ 완료" 표기를 실제 상태로 정정.

---

## 적용 현황 (2026-09-07, 검증 직후 수정)

| 항목 | 처리 |
|---|---|
| C1 웹훅 URL·템플릿 노출 | `PublicCampaign`에서 두 필드 제거. 안내문 템플릿은 대시보드 페이지가 `messageTemplates` prop으로만 전달. E2E `security.spec.ts`가 공개 페이지 4곳 HTML을 검사 |
| C2 내부 메모 노출 | `sanitizeApplicantForCompany()` 화이트리스트 헬퍼 도입, 공유 페이지 2곳 적용. E2E로 공유 페이지·토큰 CSV 검사 |
| C3 업로드 1MB 실패 | `next.config.ts`에 `serverActions.bodySizeLimit: "52mb"`. 클라이언트 `safeUpload()`가 413 등 예외를 한국어 메시지로 표시. E2E에서 2MB 업로드 성공 확인 |
| C4 미디어 접근 제어 | `/api/media/[id]` 토큰 필수(승인·설문 토큰), `Cache-Control: private`, 스트리밍 응답. 대시보드 미리보기는 계정 승인 토큰을 붙여 요청 |
| H1 디자인 토큰 | 남은 46개 파일의 hex/zinc/slate 클래스를 토큰으로 치환(`scripts/migrate-design-tokens.mjs`), `globals.css` 호환 레이어 삭제, `surface3`·`text-2`·`text-faint` 토큰 추가. 15개 화면 × 2테마 전후 스크린샷 비교로 확인 |
| H2 Discord | `content` 페이로드로 분기 |
| H3 SSRF | `validateWebhookUrl()`: https + `hooks.slack.com`/`discord.com` 계열만 허용. 저장·테스트·발송 모두 같은 검증 |
| H4 visual-check.spec | 삭제 |
| H5 백업 | `persist()`에서 10분 간격 스냅샷(최근 48개), `npm run db:restore` 복원 스크립트 |
| M3 MIME 검사 | 매직 바이트 시그니처 검사(`matchesMediaSignature`) 추가 |
| M4 감사 로그 노이즈 | 관리시트는 단계·업로드 링크가 실제로 바뀔 때만 기록 |
| M1/M2/M5/M7 | 구조상 한계로 유지. 문서에만 남김 |

검증: 타입체크·린트 0, 유닛 테스트 87개, E2E 20개, 빌드 통과.
