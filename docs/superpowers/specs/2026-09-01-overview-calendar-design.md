# 오버뷰/전체일정 (서브 프로젝트 D) 설계

작성: 2026-09-01
상태: 사용자 승인된 브레인스토밍 결과를 문서화

## 배경 및 범위

D는 이 통합 대시보드의 **첫 화면(`/`)** 이다. 현재 `app/page.tsx`는 `<h1>Seeding Dashboard</h1>` 한 줄짜리 스캐폴딩이고, 사이드바의 "오버뷰" 링크가 이미 `/`를 가리키고 있다(`app/(dashboard)/layout.tsx`). D는 이 자리를 교체한다.

D는 A(인플루언서 시딩), B(인플루언서 행사), C(SNS 운영)의 데이터를 **읽기만 하는 집계 화면**이다. 새 테이블도, 새 마이그레이션도 없다. 구성은 사용자가 확정한 두 가지로 한정한다: **통합 캘린더**와 **임박·지연 알림 목록**. 요약 통계 카드와 활동 피드는 검토됐으나 사용자가 선택하지 않았다 — 아래 "제외 범위" 참고.

**구현 순서상 D는 B·C 다음이어야 한다.** D가 읽는 `events` / `event_checklist_items`(B, 마이그레이션 0016 예약)와 `sns_contents`(C, 아직 스펙 미작성)는 이 문서 작성 시점에 테이블이 존재하지 않는다. 이 스펙은 B 스펙에 정의된 스키마와 사용자가 확정한 C의 데이터 소스 컬럼명을 전제로 미리 쓰지만, 실제 구현은 B와 C의 테이블이 DB에 만들어진 뒤에 진행한다. 그 전까지 D는 A 소스(`seeding_records`)만으로도 동작해야 하므로, 아래 "에러 처리 및 검증"에 정의한 소스별 독립 조회·부분 실패 처리가 구현 순서와 무관하게 항상 성립해야 한다.

## 아키텍처

- 기존 스택 그대로: Next.js 16(App Router) + Supabase + Vercel, Tailwind v4, Vitest.
- **공개 라우트 없음.** D는 로그인된 대시보드 전용 화면이다. 모든 조회는 `createDashboardSupabaseClient()`(`@/lib/supabase/dashboard`)로 한다 — A의 규약(STATUS.md "Supabase 클라이언트가 두 개다")과 동일. 테스트는 `@/lib/supabase/dashboard`를 목킹한다.
- **외부 캘린더 라이브러리를 추가하지 않는다.** 월 그리드는 순수 서버 컴포넌트 + Tailwind로 직접 그리는 경량 커스텀 구현이다. 이는 의존성을 늘리지 않기 위한 명시적 결정이다.
- **날짜·D-day 계산은 전부 서버에서 KST로 수행한다.** `app/page.tsx`(서버 컴포넌트)가 `lib/seeding/dday.ts`의 `toKstDateString`/`daysUntilDeadline`/`formatDday`/`ddayToneClass`를 그대로 재사용하고, 계산 결과(문자열 D-day, 톤 클래스, 캘린더 셀 배열)만 클라이언트에 내려간다. 클라이언트에서 `new Date()`나 오프셋 계산을 하지 않는다 — Vercel은 UTC로 실행되므로 브라우저/서버 간 타임존이 다르면 "오늘"이 어긋나고(UTC 오프바이원), 서버 렌더와 클라이언트 렌더가 다른 날짜를 계산하면 하이드레이션 불일치 경고까지 발생한다. `lib/seeding/dday.ts`가 이미 이 문제를 KST 고정으로 해결해뒀으므로 새 로직을 만들지 않고 그대로 가져다 쓴다.
- **월 이동은 클라이언트 상태가 아니라 쿼리 파라미터로 처리한다.** `/?month=2026-09` 형식. `app/page.tsx`는 `searchParams`를 읽어 대상 월을 정하는 서버 컴포넌트이며, 이전/다음 달 링크는 `<Link href="/?month=2026-08">` 형태의 일반 링크다. 클라이언트 컴포넌트나 `useState`가 필요 없다.

## 데이터 모델

**새 테이블 없음.** D는 A·B·C가 소유한 테이블에서 아래 컬럼만 읽는다. 컬럼명은 정확히 아래와 같다.

### A — `seeding_records` (이미 존재, 0009)
- 조건: `progress_stage != '선정완료'` 인 상태에서 A 화면과 별개로, D가 실제로 다루는 조건은 사용자가 지정한 **`progress_stage != '업로드완료'`** — 즉 아직 업로드를 완료하지 않은 모든 행(초기 `선정완료` 포함).
- 기준 컬럼: `upload_deadline` (date)
- 라벨: 지원자 이름(`applicants.name`) + 캠페인명(`campaigns.name`) — `seeding_records.applicant_id` → `applicants`, `seeding_records.campaign_id` → `campaigns` 조인.
- 클릭 이동: `/campaigns/[campaignId]/seeding-sheet`

### B — `events`, `event_checklist_items` (B 스펙, 0016 예약 — 아직 미생성)
- `events.event_at` (timestamptz) — 조건: `status = 'preparing'`. 라벨: `events.name`(행사명). 클릭 이동: `/campaigns/[campaignId]/events/[eventId]` (campaignId는 `events.campaign_id`).
- `event_checklist_items.due_date` (date) — 조건: `done = false`. 라벨: 항목명(`event_checklist_items.label`) + 행사명(같은 `event_id`의 `events.name`). 클릭 이동: 같은 행사 상세(`events.campaign_id`, `event_checklist_items.event_id`로 조인해 얻은 `events.id`).

### C — `sns_contents` (C 스펙 미작성 — 아직 미생성)
- `sns_contents.scheduled_on` (date) — 조건: `status != 'posted'`.
- 라벨: 콘텐츠 제목 + 계정 handle. 클릭 이동: `/sns/[accountId]`.
- C의 정확한 컬럼명(계정 handle이 저장된 컬럼, `accountId`의 FK 이름 등)은 C 스펙에서 확정된다. D 구현 시점에 C 스펙을 다시 확인해 이 문서의 컬럼명을 갱신할 것 — 여기 적은 이름은 사용자가 브레인스토밍 중 확정한 것 그대로이며 임의 변경 금지.

**관계 요약**: D는 4개의 독립된 읽기 조회(A 업로드기한, B 행사, B 체크리스트, C 콘텐츠)를 병렬로 수행해 하나의 화면에 합친다. 각 조회는 서로의 성패에 영향받지 않는다(아래 에러 처리 참고).

## 핵심 화면/플로우

`/` (서버 컴포넌트, `searchParams: { month?: string }`):

1. **상단 — 임박·지연 목록**: 오늘(KST) 기준 기한이 이미 지났거나 3일 이내(D-3~D-0)인 항목만 모아 리스트로 표시한다. 정렬은 기한이 이른 순(지연이 위로). 각 행에는:
   - **출처 배지**: 시딩 / 행사 / SNS 셋 중 하나.
   - **D-day**: `lib/seeding/dday.ts`의 `formatDday` 그대로 사용(`D-3`, `D-DAY`, `D+2` 형식).
   - **톤**: 지연(`D+n`, 즉 기한 경과)은 `text-critical`, 임박(오늘 포함 D-3~D-0)은 `text-warning`. `ddayToneClass`가 이미 "지남→critical / 오늘·내일→warning" 경계를 제공하므로 그대로 재사용하되, D의 "3일 이내" 임계값(D-3까지)은 `ddayToneClass`의 기본 임계값(D-1까지)보다 넓다 — 목록에 포함할지 여부는 D 자체 필터(`daysUntilDeadline <= 3`)로 걸러내고, 톤 클래스는 그 필터를 통과한 항목에 한해 `ddayToneClass`를 그대로 적용한다.
   - 라벨(위 데이터 모델의 라벨 규칙).
   - 클릭 시 해당 상세 화면으로 이동(각 소스별 링크는 위 데이터 모델 참고).
   - 항목이 하나도 없으면 "임박하거나 지연된 항목이 없습니다" 안내.

2. **하단 — 월 단위 통합 캘린더**: 커스텀 경량 그리드(라이브러리 없음).
   - 헤더에 "‹ 이전 달 / YYYY년 M월 / 다음 달 ›" — 이전/다음은 `/?month=YYYY-MM` 링크.
   - `month` 쿼리 파라미터가 없으면 오늘(KST)이 속한 달을 기본값으로 한다.
   - 7열(일~토) 그리드. 각 날짜 칸에 그 날짜에 걸리는 항목을 출처별 색 점/배지로 표시:
     - 시딩(A) = `bg-accent` (또는 `text-accent`)
     - 행사(B, `events.event_at`과 `event_checklist_items.due_date` 둘 다 포함) = `bg-accent2`
     - SNS(C) = `bg-success`
   - 한 칸에 표시할 항목이 많으면 상위 몇 개만 보여주고 "+N"으로 나머지 개수를 표시한다(정확한 상한은 레이아웃에 맞춰 구현 시 정함 — 판단 필요 항목, 아래 참고).
   - 날짜 칸 클릭이 아니라 칸 안 개별 항목 클릭 시 해당 상세로 이동(목록과 동일한 링크 규칙).

3. **부분 실패 안내**: A/B/C 중 조회에 실패한 소스가 있으면 화면 상단에 "일부 데이터를 불러오지 못했습니다" 배너를 표시하고, 성공한 소스의 데이터만으로 목록·캘린더를 정상 렌더링한다(아래 에러 처리 참고).

## 인증 및 권한

- `/`는 대시보드 레이아웃(`app/(dashboard)/layout.tsx`) 산하이므로 이미 로그인 필요 + `getCurrentProfile()` 리다이렉트가 걸려 있다. 별도 `requireRole` 체크는 없음 — admin/staff 구분 없이 로그인한 누구나 볼 수 있다(A/B와 동일하게 조회 전용 화면에 역할 제한을 두지 않는 패턴).
- 현재 `AUTH_DISABLED = true`(STATUS.md)이므로 사실상 열려 있으나, 코드는 정상 인증 경로로 작성한다(B 규약과 동일).
- 쓰기 액션이 전혀 없다(순수 조회·링크 이동) — 서버 액션·RPC가 필요 없다.

## 에러 처리 및 검증

- **A/B/C 조회는 각각 독립적으로 수행한다.** 하나가 실패해도 나머지 결과로 화면을 렌더링한다(`Promise.allSettled` 방식).
- **조회 실패를 빈 결과로 위장하지 않는다.** STATUS.md의 "조회 실패와 빈 결과 구분" 항목이 지적한 문제(테이블이 아직 없거나 RLS/RPC 오류가 나도 "데이터 없음"과 똑같이 보이는 결함)를 D에서 반복하지 않는다. 각 소스 조회에서 에러가 나면(Supabase 에러 응답, 테이블 없음 포함) 그 소스를 "실패"로 표시하고, 배너에 "일부 데이터를 불러오지 못했습니다"를 노출한다. 반대로 조회는 성공했지만 행이 0개인 경우는 실패로 취급하지 않고 그냥 빈 목록/캘린더로 둔다 — 이 두 상태를 코드상 명확히 구분해서 다룬다(예: `{ ok: true, rows: [] } | { ok: false }`처럼 성공/실패를 값으로 표현하고 빈 배열 하나로 두 의미를 겹쳐 쓰지 않는다).
- **B·C 테이블이 아직 없는 동안에도 화면이 깨지지 않아야 한다.** 테이블이 존재하지 않을 때 Supabase가 반환하는 에러(예: `relation does not exist`, 42P01)도 위와 동일하게 "그 소스 실패"로 처리되어 배너만 뜨고 나머지(A)는 정상 렌더링된다. 이는 B·C 구현 전 지금 당장도 성립해야 하는 요구사항이다.
- 링크 대상 캠페인/행사/계정이 삭제된 경우(조인 실패로 라벨을 못 만드는 경우) 해당 항목은 목록·캘린더에서 조용히 제외한다(에러로 막지 않음).
- 잘못된 `month` 쿼리 파라미터(형식 오류, 존재하지 않는 월 등)는 파싱 실패 시 오늘이 속한 달로 폴백한다.

## UI/디자인 시스템

A·B와 동일한 토큰 체계를 그대로 쓴다: Tailwind 토큰 클래스만 사용 — `bg-bg` `bg-surface` `bg-surface2` `border-border` `text-text` `text-textMuted` `bg-accent` `text-accent` `bg-accent2` `text-accent2` `text-onAccent` `text-critical` `text-success` `text-warning` `rounded-token`. `bg-accent2`/`text-accent2`는 `app/globals.css`에 이미 `--accent-2` CSS 변수로 정의돼 있어 별도 토큰 추가가 필요 없다(다크 `#35d0ba` / 라이트 `#7048e8`).

- UI 문구는 한국어.
- D-day와 날짜 숫자는 `font-mono tabular-nums`로 정렬(A의 관례).
- 카드형 레이아웃 + 좌측 사이드바 내비게이션은 이미 `app/(dashboard)/layout.tsx`가 제공 — D는 `main` 슬롯 안의 콘텐츠만 채운다.
- 캘린더 그리드의 요일 헤더, 오늘 날짜 강조(border 또는 배경색), 월 밖 날짜(이전/다음 달에 걸치는 칸)의 흐린 처리 등 세부 스타일은 구현 시 A/B 화면과 톤을 맞춰 정한다.

## 제외 범위

- 요약 통계 카드 (사용자가 선택하지 않음)
- 활동 피드 (사용자가 선택하지 않음)
- 푸시/이메일 알림
- 캘린더 외부 연동(구글 캘린더 등 export/sync)
- 주간·일간 뷰 — 월 단위만 지원
- 새 테이블·마이그레이션 — D는 A/B/C 데이터를 읽기만 함
- C의 정확한 스키마 확정 — C 스펙에서 별도로 다룬다. D는 사용자가 확정한 컬럼명(`sns_contents.scheduled_on`, `status`)을 전제로만 설계했다.
