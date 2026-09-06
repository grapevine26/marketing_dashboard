# SNS 운영 (서브 프로젝트 C) 설계

작성: 2026-09-01
상태: 사용자 승인된 브레인스토밍 결과를 문서화

## 배경 및 범위

에이전시가 **업체(브랜드) SNS 계정을 대행 운영**하는 업무를 관리한다. A(인플루언서 시딩)의 캠페인, B(인플루언서 행사)의 행사와 달리 캠페인에 종속되지 않는 **독립 단위**다 — 대행 계약 하나가 계정 하나에 대응하며, `campaign_id` 같은 FK로 A/B와 연결되지 않는다.

사용자가 직접 선택·확정한 기능 6가지를 전부 포함한다: (1) 업무 전 자료요청·사전체크사항 설문 링크 생성 및 결과 수집, (2) SNS 운영안 초안 작성(웹 + PPT), (3) 콘텐츠 캘린더, (4) 업체 승인 공유 링크, (5) 콘텐츠 문안 AI 초안, (6) 게시 후 성과 기록(수동 입력 + 월별 집계).

## 아키텍처

- 기존 스택 그대로: Next.js 16(App Router) + Supabase + Vercel, Tailwind v4, Vitest.
- **라우팅 구조**: A와 동일하게 공개 영역과 내부 대시보드 영역이 공존한다.
  - **공개 영역** (로그인 불필요, 계정별 고유 토큰으로 접근):
    - `/sns-intake/[token]` (업체가 자료요청·사전체크사항 설문 작성·제출)
    - `/sns-approval/[token]` (업체가 승인대기 콘텐츠 조회 + 승인/수정요청)
  - **내부 대시보드 영역**: `/sns` 계정 목록, `/sns/[id]` 계정 상세, `/sns/[id]/plan` 운영안.
- **사전설문은 A의 사전조사 패턴을 그대로 재사용**하되 A의 `pre_survey_template`/`pre_survey_responses`에 얹지 않고 C 전용 테이블로 별도 관리한다 (계정당 답변 1건, 캠페인 개념이 없어 A 테이블과 스키마가 안 맞음).
- **PPT 생성은 B가 정의한 템플릿 엔진(`lib/ppt/`)과 `ppt_templates` 테이블을 그대로 공유한다.** C는 엔진을 재정의하지 않고 `kind='sns'` 템플릿만 새로 추가해 참조한다. `extractPlaceholders`/`fillTemplate`, Storage 버킷 `ppt-templates`, 업로드/삭제 화면(`/settings/ppt-templates`, admin 전용)은 전부 B 스펙 문서를 참고할 것.
- AI 연동: `lib/ai/snsCaptionAssist.ts`(콘텐츠 캡션·해시태그 초안), `lib/ai/snsPlanAssist.ts`(운영안 필드 초안). 둘 다 서버 전용 호출, 기존 `lib/ai/*Assist.ts` 규약(`gemini-3.6-flash`, `ThinkingLevel.MINIMAL`, 실패 시 폴백 문구)을 따른다.

## 데이터 모델 (마이그레이션 0018~0021 예약 — B가 0015~0017 사용)

### `sns_accounts` (0018)
- `id` uuid pk
- `company_name` text not null, `platform` text not null check in (`'instagram'`,`'youtube'`,`'tiktok'`,`'other'`), `handle` text not null
- `starts_on` date, `ends_on` date — 대행 계약 기간
- `status` text not null check in (`'active'`,`'ended'`) default `'active'`
- `intake_token` uuid not null default `gen_random_uuid()`, `approval_token` uuid not null default `gen_random_uuid()` — 용도별 공개 토큰 (A와 같은 원칙: 용도별로 분리해 개별 회수 가능)
- `created_at` timestamptz default now()
- RLS: `to authenticated` (판단: A/B와 동일하게 select/insert/update 전부 인증 사용자에게 허용하고 역할 구분은 애플리케이션 레이어에서 처리 — 세부 권한은 "인증 및 권한" 절 참고)

### `sns_intake_template` (0019)
- 단일 행, `id` = 1 고정, `questions` jsonb — A의 `pre_survey_template`과 동일한 패턴(질문 배열 JSONB, 전역 설정 1개)
- **C 전용 별도 테이블** — A의 `pre_survey_template`에 얹지 않는다 (요구사항 명시 사항)
- RLS: `to authenticated` select 전체 허용, update는 admin만 (A의 `pre_survey_template` 정책 그대로 재사용)

### `sns_intake_responses` (0019)
- `id` uuid pk, `account_id` uuid not null FK→`sns_accounts` on delete cascade
- `answers` jsonb not null, `submitted_at` timestamptz default now()
- RLS: `to authenticated` select만 (대시보드 조회용). **insert 정책 없음 — 쓰기는 아래 RPC 전용** (요구사항 명시 사항, A의 `pre_survey_responses`와 동일한 원칙)

### 0019 RPC — `intake_token` 스코프, `SECURITY DEFINER`
- `get_sns_intake_context(p_token uuid)` — 토큰으로 계정 존재 확인 + `sns_intake_template.questions` + 기존 제출 여부 반환
- `submit_sns_intake(p_token uuid, p_answers jsonb)` — `sns_intake_responses`에 upsert(계정당 1건, 재제출 시 덮어쓰기 — 판단: A의 사전조사도 담당자가 재작성 가능해야 하므로 동일 원칙 적용)
- 둘 다 `revoke execute ... from public` 후 `grant ... to anon, authenticated` — STATUS.md 규약, 순서를 지키지 않으면 0014에서 실제로 발생했던 인증 우회가 재현된다.

### `sns_plans` (0020)
- `id` uuid pk, `account_id` uuid not null unique FK→`sns_accounts` on delete cascade (계정당 운영안 1개)
- `template_id` uuid FK→`ppt_templates` (**nullable** — 웹 화면만 쓰고 PPT를 안 뽑는 경우가 있음)
- `field_values` jsonb not null default `'{}'` — `{placeholder: 값}`, B의 `event_plans.field_values`와 동일한 구조
- `updated_at` timestamptz default now()
- RLS: `to authenticated`

### `sns_contents` (0020)
- `id` uuid pk, `account_id` uuid not null FK→`sns_accounts` on delete cascade
- `title` text not null, `scheduled_on` date, `assignee` text
- `status` text not null check in (`'planning'`,`'producing'`,`'pending_approval'`,`'approved'`,`'posted'`) default `'planning'` — 기획→제작→승인대기→승인→게시완료
- `caption` text, `hashtags` text — AI 초안 또는 직접 입력
- `media_note` text — 내부 제작 메모 (판단: 업체 승인 화면에는 노출하지 않는 내부 전용 필드로 취급. 요구사항이 승인 RPC에서 "내부 메모"를 명시적으로 비노출 대상에 넣었으므로 이 컬럼을 그 "내부 메모"로 해석)
- `client_comment` text — 업체가 수정요청 시 남긴 코멘트
- `post_url` text — 게시 링크
- `view_count` integer, `like_count` integer, `comment_count` integer — 게시 후 수동 입력
- `status_changed_at` timestamptz, `created_at` timestamptz default now()
- RLS: `to authenticated`

월별 성과 집계는 별도 테이블 없이 `sns_contents`에서 `status='posted'`인 행을 `status_changed_at`의 연-월로 그룹핑해 조회 시점에 계산한다 (판단: "게시완료로 전이된 시점"을 게시월로 간주 — 별도 `posted_at` 컬럼이 요구사항에 없으므로 상태 전이 감사 컬럼을 재사용).

### 0021 RPC — `approval_token` 스코프, `SECURITY DEFINER`
- `get_pending_contents(p_token uuid)` — 토큰으로 계정을 찾아 그 계정의 `status='pending_approval'` 콘텐츠 목록 반환. **캡션·해시태그·예정일만** 반환하고 `media_note`, 성과 수치(`view_count`/`like_count`/`comment_count`), 토큰 값 자체는 절대 포함하지 않는다.
- `review_sns_content(p_token uuid, p_content_id uuid, p_decision text check in ('approve','request_changes'), p_comment text)` — `p_content_id`가 `p_token`으로 확인된 계정 소속인지 검증 후: `approve`면 `status='approved'`, `request_changes`면 `status='producing'` + `client_comment`에 코멘트 기록. 둘 다 `status_changed_at` 갱신.
- 둘 다 `revoke execute ... from public` 후 `grant ... to anon, authenticated`.

## 핵심 화면/플로우

1. **`/sns` 계정 목록 + 새 계정**: 사이드바의 "SNS 운영" 비활성 항목을 여기로 활성화(링크 연결). 계정 카드에 업체명·플랫폼·핸들·상태 표시, "새 계정" 폼에서 기본정보 입력 시 `intake_token`/`approval_token` 자동 발급.
2. **`/sns/[id]` 계정 상세**: 콘텐츠 캘린더(월 그리드)/목록 탭 전환, 콘텐츠 생성·수정 폼, 상태 변경 드롭다운, "AI 문안" 버튼(캡션·해시태그 초안), 성과 입력 폼(`status='posted'`일 때만 노출), 월별 성과 요약 카드(위 집계 로직), 사전설문 결과 보기, 두 공개 링크(설문/승인) 복사 UI.
3. **`/sns/[id]/plan` 운영안**: 템플릿 선택(`kind='sns'` 목록, nullable이므로 미선택 가능) → placeholder별 입력 필드 → "AI 초안" 버튼이 사전설문 응답(`sns_intake_responses.answers`)과 계정 정보(업체명·플랫폼·핸들)를 컨텍스트로 각 필드 초안 생성(`lib/ai/snsPlanAssist.ts`) → 담당자 수정 → 저장(`sns_plans.field_values`) → 웹 화면에서 바로 보기 + "PPT 다운로드" 버튼이 라우트 핸들러 `/sns/[id]/plan/export`에서 B의 `fillTemplate` 호출 후 `Content-Disposition: attachment`로 다운로드. 템플릿을 선택하지 않은 경우 PPT 다운로드 버튼은 비활성.
4. **사전설문**: `/sns-intake/[token]` — `get_sns_intake_context`로 질문틀 로드, 업체 담당자(또는 에이전시 내부 담당자)가 답변 후 `submit_sns_intake` 호출. 질문틀 자체는 `/settings/sns-intake`에서 admin이 수정 (A의 `/settings/pre-survey`와 동일 패턴).
5. **콘텐츠 문안 AI 초안**: 콘텐츠 편집 화면에서 "AI 문안" 클릭 시 제목·예정일·계정 정보(업체명·플랫폼)를 컨텍스트로 캡션·해시태그 초안 생성(`lib/ai/snsCaptionAssist.ts`), 담당자가 수정 후 저장.
6. **업체 승인**: `/sns-approval/[token]` — `get_pending_contents`로 승인대기 목록(캡션·해시태그·예정일만) 표시, 콘텐츠별로 "승인" 또는 "수정요청 + 코멘트" 버튼 → `review_sns_content` 호출, 성공 시 화면에서 즉시 목록 갱신(멱등: 이미 처리된 콘텐츠 재조회 시 목록에서 자연히 빠짐).

## 인증 및 권한

- 전 화면 대시보드 내부는 `createDashboardSupabaseClient()`(`@/lib/supabase/dashboard`) 사용, 공개 라우트(`/sns-intake`, `/sns-approval`)는 `createServerSupabaseClient()`(`@/lib/supabase/server`) + RPC로만 접근한다. 대시보드 화면에서 anon 클라이언트를 쓰면 RLS가 `to authenticated`이므로 런타임에만 조회가 0행으로 나오는 STATUS.md의 함정을 그대로 따른다.
- 역할: A와 동일한 `admin`/`staff` 2단계를 그대로 사용한다. **admin**: 계정 생성부터 승인 처리까지 전체 + `sns_intake_template` 수정 + (B와 공유하는) `ppt_templates` 업로드/삭제. **staff**: 계정 생성, 콘텐츠 캘린더 운영, AI 초안, 운영안 작성·PPT 다운로드, 성과 입력까지 실무 전체 가능하나 설정 화면(`/settings/sns-intake`, `/settings/ppt-templates`)은 접근 불가.
- 이 승인 공유 링크(`/sns-approval/[token]`)는 단순 제출형 폼과 달리 **조회 후 승인/수정요청이라는 쓰기 액션이 콘텐츠 상태를 전이시키는 공개 라우트**다. 사전설문(`/sns-intake/[token]`)이나 A의 `/pre-survey/[token]`, `/apply/[token]`처럼 1회성 데이터 제출로 끝나는 폼과는 성격이 다르며, **스펙 전체를 통틀어 이런 성격(공유형 목록 조회 + 상태 전이 액션)의 공개 라우트는 A의 `/applicants/[token]`과 이 `/sns-approval/[token]` 둘뿐이다.**

## 에러 처리 및 검증

- 공개 폼(사전설문): 필수항목 미입력 시 제출 차단. 잘못되거나 존재하지 않는 토큰 접근 시 안내 페이지 (A와 동일 패턴).
- 승인 공유 링크: 잘못된 토큰, 또는 승인대기 콘텐츠가 하나도 없는 경우 각각 다른 안내 문구 표시(토큰 오류 vs 처리할 항목 없음). `review_sns_content`는 `p_content_id`가 토큰이 가리키는 계정 소속인지 반드시 검증하고, 이미 `approved`/`producing`으로 바뀐 콘텐츠를 다시 조회하면 목록에서 빠지므로 중복 클릭에 안전(멱등).
- AI 어시스트(`snsCaptionAssist`, `snsPlanAssist`) 실패 시: 에러로 막지 않고 `"AI 제안 실패 — 직접 입력해주세요."`로 폴백, 수동 입력은 항상 가능 (기존 규약 그대로).
- 콘텐츠 생성: 제목 필수. 상태 변경은 정해진 값(`planning`/`producing`/`pending_approval`/`approved`/`posted`) 외 전이를 서버 액션에서 재검증.
- 성과 입력(조회수·좋아요·댓글): 음수 입력 차단, `status='posted'`가 아닌 콘텐츠는 입력 폼 자체를 노출하지 않음.
- 공개 라우트에서 호출 가능한 서버 액션/RPC는 RPC 자체가 토큰을 검증하더라도 액션 단에서 입력을 재검증한다 (STATUS.md 규약).

## UI/디자인 시스템

A/B와 동일: Tailwind 토큰 클래스만(`bg-bg` `bg-surface` `bg-surface2` `border-border` `text-text` `text-textMuted` `bg-accent` `text-onAccent` `text-critical` `text-success` `text-warning` `rounded-token`), UI 문구 한국어, 조회수·좋아요·댓글 등 숫자와 월별 집계 수치는 `font-mono tabular-nums`로 정렬. 콘텐츠 캘린더의 월 그리드는 카드형 레이아웃 원칙을 따르고 상태별로 시맨틱 색상(success/warning/critical)을 액센트와 분리해 사용한다(A의 디자인 시스템 문서 기준).

## 제외 범위

- SNS API를 통한 자동 게시 및 조회수·좋아요·댓글 자동 수집 — A가 인플루언서 개인 계정에 대해 배제한 것과 같은 사유(공식 API로 임의 계정 데이터에 접근하기 어려움). 이번 범위는 게시 링크 기록 + 수동 수치 입력 + 월별 집계까지만 다룬다.
- 광고 집행 관리 — 대행 운영은 오가닉 콘텐츠 범위로 한정, 유료 광고 캠페인 관리는 다루지 않는다.
- 캠페인(A)과의 연결 — `sns_accounts`는 `campaign_id` 등 A를 향한 FK를 갖지 않는다. 업무 정의상 대행 계약은 캠페인과 무관한 독립 단위다.
