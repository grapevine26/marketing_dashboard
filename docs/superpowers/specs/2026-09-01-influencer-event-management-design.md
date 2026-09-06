# 인플루언서 행사 관리 (서브 프로젝트 B) 설계

작성: 2026-09-01
상태: 사용자 승인된 브레인스토밍 결과를 문서화

## 배경 및 범위

에이전시가 **직접 주최하는 행사**(브랜드 런칭, 팝업, 쇼케이스 등)를 관리한다. A의 현장방문형 캠페인(인플루언서가 개별 방문)과 달리, 행사 하나에 여러 인플루언서를 초대하고 행사 자체의 준비를 관리하는 것이 중심이다.

범위는 사용자 브레인스토밍에서 확정된 세 가지다: **행사 운영안 자동생성(PPT)**, **인플루언서 초대·참석 관리**, **체크리스트/할 일 관리**. 예산·지출 관리는 사용자가 명시적으로 제외했다.

행사는 **A 캠페인에 소속된다** (`campaign_id` 필수 FK). 캠페인 상세 페이지에서 행사로 진입하고, 초대 명단은 그 캠페인의 지원자 리스트에서 가져온다.

## 아키텍처

- 기존 스택 그대로: Next.js 16(App Router) + Supabase + Vercel, Tailwind v4, Vitest.
- **공개 라우트 없음.** B의 모든 화면은 대시보드 내부다. RSVP는 담당자가 수동 기록하기로 확정됐으므로 공개 응답 링크를 만들지 않는다. 따라서 토큰 스코프 RPC도 필요 없다 — 모든 읽기/쓰기는 대시보드 클라이언트(`createDashboardSupabaseClient`)로 직접 한다.
- **PPT 템플릿 엔진(`lib/ppt/`)은 B와 C가 공유한다.** 이 스펙이 엔진을 정의하고, C 스펙은 이를 참조만 한다.
- 파일 저장: Supabase Storage 버킷 `ppt-templates` (비공개). 업로드/다운로드는 서버 액션·라우트 핸들러를 통해서만.

## PPT 템플릿 엔진 (`lib/ppt/`) — B·C 공유

담당자가 치환 표시(`{{브랜드명}}`, `{{행사일시}}`, `{{행사개요}}` …)를 넣어 만든 .pptx를 업로드하면, 시스템이 그 자리만 바꿔 완성본을 출력한다. 디자인·레이아웃은 100% 보존된다.

- `extractPlaceholders(buffer): string[]` — pptx(ZIP) 내부 `ppt/slides/*.xml`에서 `{{...}}` 패턴을 수집한다. **주의: PowerPoint는 한 문장을 여러 `<a:t>` 런으로 쪼개므로 `{{`와 `}}`가 다른 런에 걸칠 수 있다.** 같은 문단(`<a:p>`) 안의 런들을 이어붙여 스캔하고, 치환 시에도 런 경계를 넘는 매치를 처리해야 한다. 이것이 엔진의 핵심 난제이며 반드시 테스트로 고정할 것.
- `fillTemplate(buffer, values: Record<string, string>): buffer` — 값을 XML 이스케이프해서 치환. 값이 없는 placeholder는 빈 문자열로 치환.
- 의존성 추가 없음: `jszip`이 이미 devDependencies에 있다. **런타임(서버 액션)에서 쓰므로 dependencies로 옮길 것.**
- 검증 테스트: 실제 최소 pptx 픽스처로 (1) placeholder 추출, (2) 런 분할 케이스 치환, (3) 출력물이 유효한 ZIP이고 `ppt/media/`가 보존되는지, (4) XML 이스케이프(`&`, `<` 포함 값).

## 데이터 모델 (마이그레이션 0015~0017 예약)

### `ppt_templates` (0015 — 스토리지 버킷 생성 포함)
- `id` uuid pk, `kind` text check in (`'event'`,`'sns'`), `name` text not null, `storage_path` text not null, `placeholders` jsonb not null default '[]' (업로드 시 추출·저장), `uploaded_at` timestamptz default now()
- RLS: authenticated 전체 읽기, admin만 insert/delete (A의 `pre_survey_template` 정책 패턴)
- 같은 마이그레이션에서 `storage.buckets`에 `ppt-templates` 버킷 생성(public=false)

### `events` (0016)
- `id` uuid pk, `campaign_id` uuid not null FK→campaigns on delete cascade
- `name` text not null, `event_at` timestamptz, `venue` text, `memo` text
- `status` text not null check in (`'preparing'`,`'done'`,`'canceled'`) default `'preparing'`
- `created_at` timestamptz default now()

### `event_invitees` (0016)
- `id` uuid pk, `event_id` uuid not null FK→events on delete cascade
- `applicant_id` uuid FK→applicants (캠페인 지원자에서 가져온 경우; 직접 추가면 null)
- `name` text not null, `sns_url` text, `contact` text — 가져오기 시 지원자 값 **복사**(스냅샷; 지원자 수정에 영향받지 않음)
- `rsvp_status` text not null check in (`'pending'`,`'attending'`,`'not_attending'`) default `'pending'` — 담당자 수동 기록
- `attended` boolean not null default false — 당일 참석 체크
- `memo` text, `created_at` timestamptz default now()
- unique(event_id, applicant_id) — 같은 지원자 중복 초대 방지 (applicant_id가 null이 아닐 때)

### `event_checklist_items` (0016)
- `id` uuid pk, `event_id` uuid not null FK→events on delete cascade
- `label` text not null, `due_date` date, `assignee` text, `done` boolean not null default false
- `sort_order` integer not null default 0, `created_at` timestamptz default now()

### `event_plans` (0017)
- `id` uuid pk, `event_id` uuid not null unique FK→events on delete cascade (행사당 운영안 1개)
- `template_id` uuid not null FK→ppt_templates
- `field_values` jsonb not null default '{}' — {placeholder: 값}
- `updated_at` timestamptz default now()

모든 테이블 RLS는 `to authenticated` (A 규약과 동일). 공개 라우트가 없으므로 anon 정책·RPC 없음.

## 핵심 화면/플로우

1. **행사 목록·생성**: `/campaigns/[id]/events` — 해당 캠페인의 행사 목록 + "새 행사". 캠페인 상세 페이지에 "행사" 섹션 추가(진입점).
2. **행사 상세**: `/campaigns/[id]/events/[eventId]` — 개요(일시·장소·상태), 운영안·초대·체크리스트 세 블록.
3. **운영안**: 템플릿 선택(kind='event' 목록) → placeholder별 입력 필드가 열림 → "AI 초안" 버튼이 캠페인 사전조사 응답 + 행사 정보(이름·일시·장소)를 컨텍스트로 각 필드 초안 생성(`lib/ai/eventPlanAssist.ts`, 기존 Gemini 규약: `gemini-3.6-flash`, `ThinkingLevel.MINIMAL`, 실패 시 "AI 제안 실패 — 직접 입력해주세요." 폴백) → 담당자 수정 → 저장(`event_plans.field_values`) → "PPT 생성" 버튼이 라우트 핸들러 `/campaigns/[id]/events/[eventId]/plan/export`에서 fillTemplate 후 `Content-Disposition: attachment`로 다운로드.
4. **초대 관리**: "캠페인 지원자에서 가져오기" 모달(지원자 목록에서 체크 선택, 이미 초대된 사람은 비활성) + 직접 추가 폼. 행마다 RSVP 3상태 토글과 참석(당일) 체크박스, 메모. 상단에 집계(초대 N / 참석예정 N / 참석 N).
5. **체크리스트**: 항목 추가/삭제/완료 토글, 마감일·담당자 입력, 마감일 D-day 표시(기존 `lib/seeding/dday.ts` 재사용, 서버 계산 후 props 전달).
6. **템플릿 설정**: `/settings/ppt-templates` — admin 전용. 업로드(kind 선택) 시 서버에서 placeholder 추출·표시, 목록·삭제. 사이드바 설정 영역에 링크 추가. 사이드바의 "인플루언서 행사" 비활성 항목을 `/campaigns`로 연결하는 대신 그대로 두고, 행사는 캠페인 경유로만 진입한다(행사가 캠페인 소속이므로).

## 인증 및 권한

- 전 화면 대시보드 내부. 현재 `AUTH_DISABLED = true` 상태(STATUS.md 참고)이므로 사실상 열려 있으나, 코드는 A 규약대로 작성한다: 페이지·액션은 `createDashboardSupabaseClient()` 사용, 테스트는 `@/lib/supabase/dashboard` 목킹.
- 템플릿 업로드·삭제는 `requireRole("admin")`. 나머지는 staff 가능.

## 에러 처리 및 검증

- 행사명 필수. 초대 직접 추가 시 이름 필수.
- PPT 생성 시 템플릿 파일을 Storage에서 못 읽으면 "템플릿 파일을 불러오지 못했습니다. 다시 업로드해주세요." 표시.
- 업로드 파일은 .pptx만 허용, placeholder가 0개면 업로드는 되되 경고 표시.
- AI 폴백 문구는 A와 동일 규약.

## UI/디자인 시스템

A와 동일: Tailwind 토큰 클래스만(`bg-bg` `bg-surface` `bg-surface2` `border-border` `text-text` `text-textMuted` `bg-accent` `text-onAccent` `text-critical` `text-success` `text-warning` `rounded-token`), UI 문구 한국어, D-day·숫자는 `font-mono tabular-nums`.

## 제외 범위

- 예산·지출 관리 (사용자가 명시적으로 제외)
- 초대장 발송 자동화(메일·DM 발송) — 안내문 복사해서 수동 발송
- RSVP 공개 응답 링크 — 수동 기록으로 확정
- 행사 결과보고서 — 필요해지면 A의 보고서 패턴 재사용 검토
