# Supabase 전환 설계

작성: 2026-09-14

## 목적

로컬 JSON 문서 하나를 통째로 읽고 쓰는 MVP 저장소(`.data/db.json` / Vercel Blob)를 Supabase Postgres로 바꾼다.
옮길 실제 데이터는 없다(`.data` 폴더가 없고, 샘플 데이터는 코드가 생성한다). 따라서 데이터 이전 없이 저장 계층만 갈아끼운다.

## 범위

**포함**
- 엔티티별 테이블 스키마와 마이그레이션 SQL
- `lib/db` 저장 계층을 Supabase 쿼리로 재작성. 외부에 노출된 함수 이름·시그니처·반환 타입은 유지한다.
- 샘플 데이터 제거. 기본 질문 템플릿(사전조사·SNS 인테이크)만 시드로 남긴다.
- JSON 백업/복원 장치 제거
- 마이그레이션 적용 스크립트, 테스트 DB 격리

**제외 (별도 작업)**
- 첨부 파일 저장소. SNS 시안 미디어와 업로드된 PPT 템플릿은 지금처럼 로컬 `.data/uploads` 또는 Vercel Blob에 둔다. `lib/db/storage.ts`의 파일 함수는 그대로 쓴다.
- 로그인(Supabase Auth). 이번 설계는 로그인을 막지 않는다. 대시보드 경로 접근 제어를 나중에 프록시에 얹으면 되고 DB 스키마는 바뀌지 않는다.

## 접근 방식

**엔티티별 테이블 + supabase-js.** 검토한 대안과 탈락 이유:
- jsonb 한 행에 문서 통째로 저장: 쿼리·관계·행 단위 갱신이 없어서 JSON 파일의 한계를 그대로 안고 간다.
- Drizzle ORM + Postgres 직접 연결: 트랜잭션과 타입 추론은 좋지만 서버리스에서 커넥션 풀 관리가 따라오고, 나중에 Auth/Storage를 붙일 때 supabase-js를 어차피 추가해야 한다. 이 앱의 쿼리는 단순해서 결정적 이점이 없다.

## 접근 모델

- 서버 전용 admin 클라이언트 하나: `lib/supabase/admin.ts`. `service_role` 키를 쓰고 `server-only`로 표시해 브라우저 번들에 들어가지 못하게 한다.
- 모든 테이블은 RLS를 켜되 정책을 두지 않는다. `service_role`은 RLS를 우회하므로 서버는 읽고 쓸 수 있고, anon 키로는 아무것도 못 한다.
- 브라우저는 Supabase에 직접 닿지 않는다. 외부 공개 페이지(지원폼, 사전조사, 승인 링크)는 지금처럼 앱 코드가 토큰을 검증한다.

환경변수:

| 변수 | 용도 |
|---|---|
| `SUPABASE_URL` | 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 키 |
| `SUPABASE_DB_URL` | 마이그레이션 적용용 Postgres 연결 문자열. **Session pooler** 주소를 쓴다. 직접 연결 주소(`db.<ref>.supabase.co`)는 IPv6 전용이라 이 PC에서 닿지 않는다. |
| `SUPABASE_TEST_URL`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, `SUPABASE_TEST_DB_URL` | 테스트 전용 프로젝트. 없으면 DB 테스트는 skip된다. |

## 스키마

마이그레이션 파일: `supabase/migrations/0001_init.sql` 하나. 모든 id는 `uuid default gen_random_uuid()`. 시각은 `timestamptz`, 날짜(YYYY-MM-DD)는 `date`. 중첩 객체는 `jsonb`. 상태값은 `check` 제약.

| 테이블 | 비고 |
|---|---|
| `campaigns` | 토큰 4종은 `text unique`. `message_templates`, `pre_survey_questions` jsonb null. `webhook_url` text null. |
| `pre_survey_template` | 단일 행(`id int pk check (id = 1)`). 마이그레이션이 기본 질문 4개를 시드한다. |
| `pre_survey_responses` | `campaign_id` fk cascade, **unique**. 저장은 upsert. |
| `form_configs` | `campaign_id` fk cascade, **unique**. |
| `applicants` | `campaign_id` fk cascade. `custom_answers` jsonb. |
| `seeding_records` | `campaign_id`, `applicant_id` fk cascade. `upload_deadline` date. |
| `reports` | `campaign_id` fk cascade. `snapshot_data`, `custom_sections` jsonb. |
| `ppt_templates` | **업로드한 템플릿만** 저장한다. 내장 템플릿은 코드에 있고 읽을 때 합친다. `file_key` text. `placeholders` jsonb. |
| `hidden_builtin_templates` | `template_id uuid pk`. 사용자가 지운 내장 템플릿. |
| `events` | `campaign_id` fk cascade. `event_at` timestamptz null. |
| `event_invitees` | `event_id` fk cascade. `applicant_id` fk **set null** (지원자가 지워져도 초대 기록은 남긴다). |
| `event_checklist_items` | `event_id` fk cascade. `due_date` date. |
| `event_plans` | `event_id` fk cascade, **unique**. `template_id uuid` — 내장 템플릿을 가리킬 수 있으므로 fk 없음. |
| `sns_accounts` | 토큰 2종 `text unique`. `starts_on`, `ends_on` date. `intake_questions` jsonb null. |
| `sns_intake_template` | 단일 행. 기본 질문 3개 시드. |
| `sns_intake_responses` | `account_id` fk cascade, **unique**. |
| `sns_plans` | `account_id` fk cascade, **unique**. `template_id uuid null`, fk 없음. |
| `sns_contents` | `account_id` fk cascade. `media_attachments` jsonb default `[]`. `scheduled_on` date. |
| `audit_logs` | `campaign_id`, `account_id`에 **fk 없음** (삭제 기록이 삭제와 함께 사라지면 안 된다). 인덱스: `(campaign_id, created_at desc)`, `(account_id, created_at desc)`, `(created_at desc)`. 1000건 제한은 없앤다. |

내장 템플릿 id 3개(`t1a2b3c4-…`)는 uuid 형식이 아니다. 옮길 데이터가 없으므로 유효한 uuid로 바꾼다.

연쇄 삭제는 DB fk가 맡는다. `deleteCampaign`, `deleteEvent`, `deleteSnsAccount`가 손으로 하던 필터링을 없앤다. 단, 첨부 파일(미디어, 템플릿 파일)은 DB가 모르므로 삭제 전에 키 목록을 읽어 파일 저장소에서 따로 지운다(현재도 그렇게 한다).

## 코드 구조

`lib/db/index.ts`(2,783줄)를 도메인별로 나누고 index.ts는 re-export만 한다. 52개 호출 파일은 `@/lib/db`에서 같은 이름을 가져오므로 손대지 않는다.

| 파일 | 담당 |
|---|---|
| `lib/db/validation.ts` | `ValidationError`, `requireText`, `optionalText`, `oneOf` 등 공용 검증 유틸 |
| `lib/db/mappers.ts` | 행 → 타입 변환. 아래 "타입 보존" 참고 |
| `lib/db/audit.ts` | 감사 로그 |
| `lib/db/campaigns.ts` | 캠페인, 토큰, 웹훅, 메시지 템플릿, 사전조사 템플릿·응답, 신청폼 설정 |
| `lib/db/applicants.ts` | 지원자, 선정 상태, 시딩 기록 |
| `lib/db/reports.ts` | 보고서, 스냅샷 생성 |
| `lib/db/ppt-templates.ts` | 내장/업로드 템플릿, 파일 업로드 준비·확정·교체·삭제 |
| `lib/db/events.ts` | 행사, 초대, 체크리스트, 운영안 |
| `lib/db/sns.ts` | SNS 계정, 인테이크, 운영 계획, 콘텐츠, 미디어 첨부, 승인 |
| `lib/db/storage.ts` | 파일 저장소만 남긴다. 문서 읽기/쓰기, 백업, ETag 진단 함수는 삭제 |
| `lib/supabase/admin.ts` | 서버 전용 클라이언트 |

`readDb`, `mutateDb`, `writeDb`는 없앤다. lib/db 바깥에서는 테스트만 썼다.

### 타입 보존

호출 코드는 기존 타입을 그대로 기대한다. 매퍼가 다음을 보장한다.
- 옵셔널 필드(`follower_count?`, `agency_memo?` 등): DB `null` → `undefined`. `string | null`로 선언된 필드는 `null` 유지.
- `timestamptz`: PostgREST가 `+00:00` 형식으로 주므로 `new Date(v).toISOString()`으로 `Z` 형식에 맞춘다.
- `date`: PostgREST가 `YYYY-MM-DD` 문자열로 주므로 그대로 쓴다.
- jsonb: 그대로 쓰되, `media_attachments`처럼 배열이어야 하는 필드는 빈 배열로 기본값을 준다.

### 여러 테이블을 건드리는 쓰기

트랜잭션 없이 순차로 쓴다. 대상: 캠페인 생성(캠페인 + 폼 설정), 지원자 선정(상태 갱신 + 시딩 기록 생성 + 감사 로그), 토큰 재발급(갱신 + 감사 로그). 중간 실패 시 앞 단계가 남을 수 있으나, 앱은 이미 "폼 설정 없음"과 "시딩 기록 없음"을 처리한다. 이 정도에 RPC를 만드는 건 과하다. 나중에 원자성이 문제가 되는 함수가 생기면 그 함수만 Postgres 함수로 뺀다.

### 동시성

낙관적 잠금, 재시도, 프로세스 내 잠금, 1초 캐시는 전부 사라진다. 행 단위 update라 문서 전체를 덮어쓰는 경합이 없다.

## 없애는 것

- `.data/db.json` 백엔드, `getInitialData`(샘플 데이터), `migrateDb`
- JSON 백업: `writeBackupIfDue`, `listBackups`, `getBackupDirPath`, `scripts/db-restore.mjs`, `npm run db:restore`. Supabase의 일일 백업으로 대체한다.
- `app/api/storage-health`: 파일 저장소 진단만 남기고, 문서 ETag 진단과 백업 목록은 뺀다. Supabase 연결 확인(`campaigns` 테이블 `head` count)을 추가한다.
- `DB_FILE`, `DB_BACKUP_DIR` 환경변수. `UPLOADS_DIR`는 유지.

## 마이그레이션 적용

Supabase CLI 인증이 없으므로 `scripts/db-migrate.mjs`를 둔다.
- `pg`(devDependency)로 `SUPABASE_DB_URL`에 연결한다. `--test` 플래그면 `SUPABASE_TEST_DB_URL`.
- `supabase/migrations/*.sql`을 이름순으로 읽고, `schema_migrations(name text pk, applied_at)` 테이블에 없는 것만 트랜잭션 안에서 실행한다. 재실행해도 안전하다.
- `npm run db:migrate`, `npm run db:migrate -- --test`.
- 환경변수는 Node 24의 `process.loadEnvFile(".env.local")`로 읽는다. dotenv를 들이지 않는다.

## 테스트

**단위 테스트(vitest)**: DB를 건드리는 스위트는 실제 Postgres가 필요하다.
- `tests/unit/setup.ts`가 `.env.local`을 읽고, `SUPABASE_TEST_URL`이 있으면 `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`를 테스트 값으로 덮어쓴 뒤 클라이언트를 만든다.
- **가드**: 테스트 URL이 운영 URL과 같으면 즉시 실패시킨다. 운영 데이터를 지우는 사고를 막는다.
- 각 테스트 전에 `pg`로 모든 테이블을 `truncate … cascade`하고 단일 행 템플릿을 다시 시드한다.
- `SUPABASE_TEST_URL`이 없으면 DB 스위트는 `describe.skipIf`로 건너뛰고, 순수 로직 스위트만 돈다.
- 테스트 프로젝트 스키마는 `npm run db:migrate -- --test`로 맞춘다.

**e2e(playwright)**: 개발 서버가 `.env.local`의 운영 프로젝트를 본다. 실제 데이터가 들어가기 전까지는 그대로 돌리고, 이후에는 테스트 프로젝트 env로 서버를 띄워 돌린다. 이번 작업에서 e2e 코드는 바꾸지 않는다.

## 검증 기준

1. `npm run typecheck`, `npm run lint` 통과
2. `npm test` 통과 (테스트 프로젝트 연결 시 DB 스위트 포함)
3. 개발 서버에서 캠페인 생성 → 지원폼 제출 → 선정 → 시딩 시트 → 보고서 생성, SNS 계정 생성 → 콘텐츠 → 승인, 행사 생성 → 초대 → 운영안 export 흐름을 브라우저로 확인
4. 첫 실행 시 캠페인 목록이 비어 있고(샘플 없음), 설정의 사전조사·SNS 인테이크 질문은 기본값이 채워져 있다
