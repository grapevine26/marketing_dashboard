# B/C/D 인계 문서 — 다른 코드베이스에서 구현할 때

작성: 2026-09-01

이 문서는 서브 프로젝트 **B(인플루언서 행사) / C(SNS 운영) / D(오버뷰·전체일정)**를 **이 저장소가 아닌 다른 코드베이스**에서 구현할 때 먼저 읽어야 하는 안내다.

## 상황

- 이 저장소(`nayounglee0924/marketing`)에는 서브 프로젝트 A(인플루언서 시딩)가 구현·배포돼 있다.
- 별도로, A 스펙과 STATUS.md만 넘겨받은 다른 도구가 **A를 자체적으로 다시 구현**했다.
- B/C/D의 스펙과 구현계획서는 이 저장소에서 작성됐고, **이 저장소의 파일 구조를 전제로 쓰였다.**

따라서 계획서를 그대로 실행하면 존재하지 않는 모듈을 참조하게 된다. 아래 대응표를 먼저 확인할 것.

## 넘길 파일

### 필수

| 파일 | 용도 |
|---|---|
| `docs/superpowers/specs/2026-09-01-influencer-event-management-design.md` | B 스펙 |
| `docs/superpowers/specs/2026-09-01-sns-operation-design.md` | C 스펙 |
| `docs/superpowers/specs/2026-09-01-overview-calendar-design.md` | D 스펙 |
| `docs/superpowers/plans/2026-09-01-ppt-template-engine.md` | 공유 PPT 엔진 계획서 (B·C의 선행 조건) |
| `docs/superpowers/plans/2026-09-01-event-management.md` | B 계획서 |
| `docs/superpowers/plans/2026-09-01-sns-operation.md` | C 계획서 |
| `docs/superpowers/plans/2026-09-01-overview-calendar.md` | D 계획서 |
| **이 문서** | 대응표 — 계획서보다 먼저 읽을 것 |

### 넘기지 않아도 되는 것

- A 스펙, STATUS.md — 이미 넘겼고, 상대 코드베이스는 그 기준으로 만들어졌다.
- `supabase/migrations/*` — 상대 코드베이스는 자체 마이그레이션 번호 체계를 갖는다(아래 참고).

## ⚠️ 대응표 — 계획서가 전제하는 것 vs 실제로 확인할 것

계획서는 이 저장소의 파일명을 그대로 쓴다. 상대 코드베이스에 같은 것이 없으면 **역할이 같은 것으로 치환**하면 된다. 개수는 4개 계획서 합계다.

### 1. Supabase 클라이언트 — `createDashboardSupabaseClient` (74회)

**이건 A 스펙에 없는, 이 저장소만의 임시 장치다.** 이 저장소는 테스트 편의를 위해 로그인을 꺼두었고(`AUTH_DISABLED`), 모든 테이블 RLS가 `to authenticated`라 세션 없이는 조회가 0행이 된다. 그래서 대시보드 경로만 service-role 키를 쓰는 별도 클라이언트를 만들었다.

**상대 코드베이스에 로그인이 정상 동작한다면 이 장치는 불필요하다.** 다음과 같이 읽을 것:

| 계획서 표현 | 치환 |
|---|---|
| `createDashboardSupabaseClient()` from `@/lib/supabase/dashboard` | 그쪽의 **인증된 서버 클라이언트** (세션 쿠키를 읽는 것) |
| 테스트에서 `vi.mock("@/lib/supabase/dashboard", ...)` | 그 클라이언트 모듈을 목킹 |
| `createServerSupabaseClient()` from `@/lib/supabase/server` (공개 라우트) | 그쪽의 **anon 클라이언트** |

**단, 구분 자체는 반드시 유지할 것.** 대시보드는 인증 클라이언트, 공개 토큰 라우트는 anon 클라이언트 + RPC만. 이 구분을 흐리면 테스트는 통과하고 런타임에만 조회가 0행으로 나온다(실제로 겪은 문제다).

### 2. D-day 계산 — `lib/seeding/dday.ts` (10회, B·D 계획서)

KST(UTC+9) 기준 D-day 계산 순수 함수들. 상대 코드베이스에 같은 게 있으면 그걸 쓰고, 없으면 새로 만들 것. **요구사항만 지키면 된다: 서버에서 KST로 계산해 props로 넘길 것.** 클라이언트에서 계산하면 UTC 자정 경계에서 하루 어긋나고 하이드레이션 불일치가 난다.

### 3. AI 어시스트 — `lib/ai/preSurveyAssist.ts` (5회, B·C 계획서)

"이 파일을 그대로 미러링하라"는 지시가 나온다. 상대 코드베이스의 사전조사 AI 어시스트 파일로 바꿔 읽으면 된다. **다만 아래 설정은 파일명과 무관하게 반드시 지킬 것** (실제 API로 검증한 값이다):

```ts
model: "gemini-3.6-flash"
config: {
  maxOutputTokens: 800,        // 문안이 길면 1200
  thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
}
```

`thinkingLevel`을 기본값으로 두면 **thinking 토큰이 출력 예산을 다 먹어 답변이 문장 중간에 잘린다.** 측정값: MINIMAL은 thinking 0토큰, LOW는 521, MEDIUM/HIGH는 770~1030이고 MEDIUM 이상은 800 예산에서 잘렸다. 품질 차이는 없었다. `thinkingBudget: 0`은 이 모델이 400으로 거부한다.

테스트에서 `@google/genai`를 목킹할 때 **`ThinkingLevel`을 목 팩토리에 포함**해야 한다(실제 모듈이 enum으로 export하므로 빠뜨리면 import가 깨진다).

### 4. 마이그레이션 번호 — 0015~0021

이 저장소 기준 번호다(A가 0001~0014를 씀). 상대 코드베이스의 마지막 번호 다음부터 이어서 쓰되, **계획서가 정한 순서와 파일 분리는 유지할 것**:

| 계획서 번호 | 내용 | 의존 |
|---|---|---|
| 0015 | `ppt_templates` + Storage 버킷 | — |
| 0016 | `events`, `event_invitees`, `event_checklist_items` | — |
| 0017 | `event_plans` | 0015, 0016 |
| 0018 | `sns_accounts` | — |
| 0019 | `sns_intake_template`, `sns_intake_responses`, intake RPC 2개 | 0018 |
| 0020 | `sns_plans`, `sns_contents` | 0015, 0018 |
| 0021 | 승인 RPC 2개 | 0018, 0020 |

D는 마이그레이션이 없다.

### 5. 마이그레이션 적용 방법

계획서에 "Supabase CLI가 인증돼 있지 않으니 `supabase migration up`을 실행하지 말고 대시보드 SQL 에디터에 붙여넣으라"는 지시가 있다. **이건 이 저장소의 환경 제약이다.** 상대 환경에서 CLI가 동작하면 정상적으로 `supabase db push`를 쓰면 된다.

### 6. 캠페인 상세 페이지 — `app/(dashboard)/campaigns/[id]/page.tsx` (1회, B 계획서)

B는 이 페이지에 "행사" 섹션 하나를 추가한다. 상대 코드베이스의 캠페인 상세 화면에서, 기존 섹션들과 같은 형태로 하나 덧붙이면 된다.

### 7. 설정 화면 패턴 — `settings/pre-survey` (4회)

"이 화면을 미러링하라"는 지시가 나온다. 핵심 요구사항만 옮기면 된다: **저장된 값을 서버에서 읽어 클라이언트 에디터에 props로 넘길 것.** 빈 값으로 초기화하면 사용자가 화면만 열고 저장을 눌러도 기존 데이터가 날아간다(실제로 겪은 버그다).

---

## 코드베이스와 무관하게 반드시 지켜야 할 것

아래는 파일 구조와 상관없이 유효하다. 전부 실제로 문제를 겪고 얻은 것들이다.

### 공개 라우트 보안 — `revoke` 누락 시 인증 우회

토큰으로 접근하는 공개 라우트는 anon에게 테이블 권한을 직접 주지 말고 `SECURITY DEFINER` RPC로만 처리한다. 그리고 **반드시 이 순서**:

```sql
revoke execute on function public.foo(...) from public;
grant  execute on function public.foo(...) to anon, authenticated;
```

`revoke`를 빠뜨리면 PostgreSQL이 새 함수의 EXECUTE를 **PUBLIC에 기본 부여**하므로, `authenticated`에만 grant해도 anon이 호출할 수 있다. 이 저장소에서 실제로 한 건 발생했고, insert 정책이 하나도 없는 테이블에 anon이 행을 만들 수 있는 상태였다.

### `"use server"` export는 전부 공개 엔드포인트다

`"use server"` 모듈에서 export한 함수는 클라이언트가 직접 호출할 수 있다. 따라서 **신뢰가 걸린 값을 파라미터로 받는 헬퍼를 export하면 안 된다.** 예: `setStatus(actor, ...)`를 export하면 공격자가 `actor`를 임의로 넘긴다. 호출 지점별로 값을 고정한 얇은 액션을 각각 만들고, 공유 컴포넌트에는 prop으로 주입할 것.

### 서버 액션 반환 타입

명시적 반환 타입(`Promise<{error: string} | {success: true}>`)이 없으면 `"error" in result` 내로잉이 깨져 **프로덕션 빌드가 실패**한다. 개발 중에는 안 드러난다.

### PPT 치환 — 텍스트 런 분할

PowerPoint는 한 문장을 여러 `<a:t>` 런으로 쪼개 저장한다. `{{브랜드명}}`의 `{{`와 `}}`가 서로 다른 런에 들어갈 수 있으므로, 단순 문자열 치환은 실패한다. **문단(`<a:p>`) 단위로 런 텍스트를 이어붙여 치환한 뒤 첫 런에 쓰고 나머지를 비우는** 방식이어야 한다. 엔진 계획서에 구현과 테스트가 들어 있다.

### PDF 한글 폰트

PDF에는 시스템 폰트 폴백이 없다. 한글 글리프가 있는 폰트를 저장소에 넣고 **번들러가 추적하도록 강제 포함**해야 한다(Next.js는 `outputFileTracingIncludes`). 이걸 빠뜨리면 로컬에서는 되고 배포 환경에서만 조용히 깨진다. A의 보고서 기능에서 겪었고, B/C의 PPT에는 해당 없다(pptx는 폰트를 임베드하지 않음).

### 테스트에서 실제로 실패했던 것들

- `Response.text()`는 사양상 선행 BOM을 제거한다. CSV의 UTF-8 BOM을 검사하려면 **원시 바이트**(`arrayBuffer()`)로 봐야 한다.
- jsdom은 `disabled` 체크박스 클릭에도 `change` 이벤트를 발생시킨다. 조회 전용 컴포넌트는 핸들러 안에서 방어할 것.
- ZIP 시그니처 `"PK"`는 **2바이트**다. 4바이트를 잘라 비교하면 절대 통과하지 못한다.
- 바이너리(PDF/PPTX)는 스냅샷하지 말고 구조로 검증할 것 — 시그니처, 추출한 텍스트에 기대 문자열 포함 여부, `ppt/media/`가 비었는지 등.

### 조회 실패와 빈 결과를 구분할 것

이 저장소는 테이블이 없는 상태에서도 화면이 "데이터 없음"으로 정상처럼 보이는 결함이 있었다. 조회 실패를 빈 배열로 삼키지 말고 `{ ok: true, rows: [] } | { ok: false }`처럼 값으로 구분할 것. D 계획서는 이 방식으로 설계돼 있다.

---

## 구현 순서

```
PPT 엔진 (0015) ──┬── B 행사 (0016~0017)
                  └── C SNS  (0018~0021)
                              └── D 오버뷰 (마이그레이션 없음, 마지막)
```

D는 A·B·C 세 곳의 데이터를 읽으므로 마지막이다. B와 C는 서로 독립이라 병렬 가능하다.

D가 읽는 컬럼(이름 고정):

| 출처 | 컬럼 | 조건 |
|---|---|---|
| A | `seeding_records.upload_deadline` | `progress_stage != '업로드완료'` |
| B | `events.event_at` | `status = 'preparing'` |
| B | `event_checklist_items.due_date` | `done = false` |
| C | `sns_contents.scheduled_on` | `status != 'posted'` |

상대 코드베이스의 A 구현에서 `seeding_records`의 컬럼명이 다르다면(예: `stage` vs `progress_stage`) D 구현 전에 확인해서 맞출 것.
