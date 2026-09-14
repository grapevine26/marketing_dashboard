# Supabase 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로컬 JSON 문서 저장소를 Supabase Postgres로 바꾸되, `@/lib/db`가 내보내는 함수의 이름·시그니처·반환 타입은 그대로 유지한다.

**Architecture:** 엔티티별 테이블 19개. 서버 전용 `service_role` 클라이언트 하나를 `lib/supabase/admin.ts`에 두고, `lib/db/index.ts`(2,783줄)를 도메인별 모듈(campaigns, applicants, reports, ppt-templates, events, sns, audit)로 나눠 index.ts는 re-export만 한다. 행 → 타입 변환은 `lib/db/mappers.ts`가 맡아 호출 코드가 기대하는 문자열 형식과 옵셔널 규칙을 지킨다.

**Tech Stack:** Next.js 16, `@supabase/supabase-js` v2, `pg`(마이그레이션·테스트 초기화 전용), vitest 3.

**Spec:** `docs/superpowers/specs/2026-09-14-supabase-migration-design.md`

## Global Constraints

- 모든 id는 `uuid default gen_random_uuid()`. 내장 PPT 템플릿 id 3개는 유효한 uuid로 바꾼다: event `b0000000-0000-4000-8000-000000000001`, sns `…0002`, report `…0003`.
- `@/lib/db`에서 내보내는 함수 96개의 이름·시그니처·반환 타입은 바꾸지 않는다. `readDb`, `mutateDb`, `writeDb`, `listBackups`, `getBackupDirPath`만 없앤다.
- 브라우저 번들에 `service_role` 키가 들어가면 안 된다. `lib/supabase/admin.ts`는 `import "server-only"`로 시작한다.
- 파일 저장소(`putFile`, `readFile`, `statFile`, `findFileKeyByPrefix`, `deleteFilesByPrefixes`, `isBlobBackend`, `getUploadsDirPath`, `uploadPathname`, `describeStorage`)는 그대로 둔다.
- 환경변수를 읽는 코드는 모듈 로드 시점이 아니라 호출 시점에 읽는다(테스트가 env를 덮어쓴 뒤 클라이언트를 만든다).
- 새 의존성: `@supabase/supabase-js`(dependency), `pg`, `@types/pg`(devDependency). dotenv는 들이지 않고 Node 24의 `process.loadEnvFile`을 쓴다.
- 정렬 순서는 옛 JSON의 배열 순서를 따른다. `unshift`했던 것(campaigns, sns_accounts, sns_contents 전체 목록, audit_logs)은 `created_at desc`, `push`했던 것은 `created_at asc`(applicants는 `applied_at asc`, checklist는 `sort_order asc`, 계정별 sns_contents는 `scheduled_on desc nulls last`, ppt_templates는 내장 3개 뒤에 `uploaded_at asc`).
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| `supabase/migrations/0001_init.sql` | 테이블 19개, 인덱스, RLS 활성화 |
| `scripts/db-migrate.mjs` | `pg`로 미적용 마이그레이션을 순서대로 실행. `--test`면 테스트 DB |
| `lib/supabase/admin.ts` | `getAdminClient()` 지연 싱글턴 |
| `lib/db/client.ts` | `db()` 단축 함수, `unwrap()` 에러 변환 |
| `lib/db/validation.ts` | `ValidationError`, `requireText`, `optionalText`, `nonNegativeInt`, `optionalDate`, `optionalIsoDateTime`, `optionalUrl`, `oneOf`, `nowIso`, 상수 목록 |
| `lib/db/defaults.ts` | 기본 사전조사 질문, 기본 SNS 인테이크 질문, 내장 템플릿 정의(`BUILTIN_TEMPLATES`, id 상수, placeholder 상수) |
| `lib/db/mappers.ts` | 행 인터페이스(`CampaignRow` 등)와 `rowToCampaign` 등 변환 함수 |
| `lib/db/audit.ts` | `insertAuditLog`, `recordAuditLog`, `getAuditLogs` |
| `lib/db/campaigns.ts` | 캠페인, 토큰, 웹훅, 메시지 템플릿, 사전조사 템플릿·응답, 신청폼 설정 |
| `lib/db/applicants.ts` | 지원자, 선정 상태, 시딩 기록 |
| `lib/db/reports.ts` | 보고서, `buildReportSnapshot` |
| `lib/db/ppt-templates.ts` | 내장/업로드 템플릿, 파일 업로드·교체·삭제 |
| `lib/db/events.ts` | 행사, 초대, 체크리스트, 운영안 |
| `lib/db/sns.ts` | SNS 계정, 인테이크, 운영 계획, 콘텐츠, 미디어, 승인 |
| `lib/db/index.ts` | re-export 전용 |
| `lib/db/storage.ts` | 파일 함수만 남김 |
| `tests/unit/test-db.ts` | `hasTestDb`, `resetTestDb()` |
| `tests/unit/setup.ts` | env 로드·덮어쓰기·가드, `beforeEach` 초기화 |

---

### Task 1: 의존성, 스키마, 마이그레이션 스크립트

**Files:**
- Modify: `package.json` (dependencies, scripts)
- Create: `supabase/migrations/0001_init.sql`
- Create: `scripts/db-migrate.mjs`
- Create: `lib/supabase/admin.ts`

**Interfaces:**
- Produces: `getAdminClient(): SupabaseClient` — 호출 시점에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 읽어 싱글턴 생성. 둘 중 하나라도 없으면 `Error("SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.")`. URL이 바뀌면(테스트 덮어쓰기) 새로 만든다.
- Produces: `npm run db:migrate [-- --test]`

- [ ] **Step 1: 의존성 설치**

```bash
npm i @supabase/supabase-js
npm i -D pg @types/pg
```

- [ ] **Step 2: 마이그레이션 SQL 작성**

`supabase/migrations/0001_init.sql`:

```sql
-- 마케팅 대시보드 초기 스키마. 옛 JSON 문서의 최상위 키 하나가 테이블 하나다.
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_name text not null,
  campaign_type text not null check (campaign_type in ('shipping','visit')),
  status text not null default 'recruiting'
    check (status in ('draft','recruiting','selecting','seeding','reporting','completed')),
  pre_survey_token text not null unique,
  apply_form_token text not null unique,
  applicants_share_token text not null unique,
  seeding_sheet_share_token text not null unique,
  message_templates jsonb,
  webhook_url text,
  pre_survey_questions jsonb,
  created_at timestamptz not null default now()
);

create table public.pre_survey_template (
  id integer primary key check (id = 1),
  questions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.pre_survey_responses (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  used_ai_assist boolean not null default false,
  submitted_at timestamptz not null default now()
);

create table public.form_configs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  intro_text text not null default '',
  custom_questions jsonb not null default '[]'::jsonb,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.applicants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  sns_link text not null,
  nationality text not null,
  contact text not null,
  follower_count integer,
  category text,
  agency_memo text,
  shipping_address text,
  visit_schedule text,
  visit_party_size integer,
  custom_answers jsonb not null default '{}'::jsonb,
  privacy_agreed boolean not null default true,
  secondary_use_agreed boolean not null default false,
  status text not null default 'applied' check (status in ('applied','selected','reserved','rejected')),
  status_changed_by text not null default 'agency' check (status_changed_by in ('agency','company')),
  status_changed_at timestamptz,
  applied_at timestamptz not null default now()
);
create index applicants_campaign_idx on public.applicants (campaign_id, applied_at);

create table public.seeding_records (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  applicant_id uuid not null unique references public.applicants(id) on delete cascade,
  progress_stage text not null default '선정완료'
    check (progress_stage in ('선정완료','발송완료','가이드전달완료','수령완료','방문완료','확정완료','업로드완료')),
  upload_deadline date,
  upload_link text,
  views integer not null default 0,
  engagement integer not null default 0,
  notes text,
  shipping_address text,
  visit_scheduled_at text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index seeding_records_campaign_idx on public.seeding_records (campaign_id, created_at);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null,
  snapshot_data jsonb,
  custom_sections jsonb not null default '[]'::jsonb,
  generated_at timestamptz,
  created_at timestamptz not null default now()
);
create index reports_campaign_idx on public.reports (campaign_id, created_at);

-- 업로드한 템플릿만. 내장 템플릿은 코드에 있고 읽을 때 합친다.
create table public.ppt_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('event','sns','report')),
  name text not null,
  file_key text,
  placeholders jsonb not null default '[]'::jsonb,
  uploaded_at timestamptz not null default now()
);

create table public.hidden_builtin_templates (
  template_id uuid primary key,
  hidden_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  event_at timestamptz,
  venue text,
  memo text,
  status text not null default 'preparing' check (status in ('preparing','done','canceled')),
  created_at timestamptz not null default now()
);
create index events_campaign_idx on public.events (campaign_id, created_at);

create table public.event_invitees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  applicant_id uuid references public.applicants(id) on delete set null,
  name text not null,
  sns_url text,
  contact text,
  rsvp_status text not null default 'pending' check (rsvp_status in ('pending','attending','not_attending')),
  attended boolean not null default false,
  memo text,
  created_at timestamptz not null default now()
);
create index event_invitees_event_idx on public.event_invitees (event_id, created_at);

create table public.event_checklist_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null,
  due_date date,
  assignee text,
  done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index event_checklist_event_idx on public.event_checklist_items (event_id, sort_order);

create table public.event_plans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  template_id uuid not null,
  field_values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.sns_accounts (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  platform text not null check (platform in ('instagram','youtube','tiktok','other')),
  handle text not null,
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('active','ended')),
  intake_token text not null unique,
  approval_token text not null unique,
  intake_questions jsonb,
  created_at timestamptz not null default now()
);

create table public.sns_intake_template (
  id integer primary key check (id = 1),
  questions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.sns_intake_responses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.sns_accounts(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now()
);

create table public.sns_plans (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.sns_accounts(id) on delete cascade,
  template_id uuid,
  field_values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.sns_contents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.sns_accounts(id) on delete cascade,
  title text not null,
  scheduled_on date,
  assignee text,
  status text not null default 'planning'
    check (status in ('planning','producing','pending_approval','approved','posted')),
  caption text,
  hashtags text,
  media_note text,
  media_attachments jsonb not null default '[]'::jsonb,
  client_comment text,
  post_url text,
  view_count integer,
  like_count integer,
  comment_count integer,
  status_changed_at timestamptz,
  created_at timestamptz not null default now()
);
create index sns_contents_account_idx on public.sns_contents (account_id, scheduled_on desc nulls last);
create index sns_contents_media_gin on public.sns_contents using gin (media_attachments jsonb_path_ops);

-- 삭제 기록이 삭제와 함께 사라지면 안 되므로 fk 를 두지 않는다.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid,
  account_id uuid,
  entity_type text not null
    check (entity_type in ('campaign','applicant','seeding_record','sns_account','sns_content','event')),
  entity_id text not null,
  action text not null,
  actor_type text not null check (actor_type in ('agency','company','public','system')),
  actor_name text,
  summary text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_campaign_idx on public.audit_logs (campaign_id, created_at desc);
create index audit_logs_account_idx on public.audit_logs (account_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- 서버만 service_role 로 접근한다. anon 은 아무것도 못 본다.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
```

- [ ] **Step 3: 마이그레이션 스크립트 작성**

`scripts/db-migrate.mjs`:

```js
#!/usr/bin/env node
/**
 * supabase/migrations/*.sql 을 이름순으로 적용한다.
 *   npm run db:migrate            → SUPABASE_DB_URL (운영)
 *   npm run db:migrate -- --test  → SUPABASE_TEST_DB_URL (테스트)
 * 적용한 파일은 schema_migrations 에 기록하고 다시 실행하지 않는다.
 */
import fs from "fs";
import path from "path";
import pg from "pg";

try { process.loadEnvFile(path.join(process.cwd(), ".env.local")); } catch { /* 없으면 넘어간다 */ }

const isTest = process.argv.includes("--test");
const url = isTest ? process.env.SUPABASE_TEST_DB_URL : process.env.SUPABASE_DB_URL;
if (!url) {
  console.error(`${isTest ? "SUPABASE_TEST_DB_URL" : "SUPABASE_DB_URL"} 이 .env.local 에 없습니다.`);
  process.exit(1);
}

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(`create table if not exists public.schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  const { rows } = await client.query("select name from public.schema_migrations");
  const applied = new Set(rows.map((r) => r.name));
  let count = 0;
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf-8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into public.schema_migrations (name) values ($1)", [f]);
      await client.query("commit");
      console.log(`적용: ${f}`);
      count++;
    } catch (err) {
      await client.query("rollback");
      console.error(`실패: ${f}\n${err.message}`);
      process.exit(1);
    }
  }
  console.log(count === 0 ? "적용할 마이그레이션이 없습니다." : `${count}개 적용 완료 (${isTest ? "테스트" : "운영"}).`);
} finally {
  await client.end();
}
```

package.json scripts: `"db:migrate": "node scripts/db-migrate.mjs"`. `db:restore`는 Task 8에서 지운다.

- [ ] **Step 4: 운영 프로젝트에 적용하고 확인**

```bash
npm run db:migrate
```
Expected: `적용: 0001_init.sql` / `1개 적용 완료 (운영).`

확인(REST로 테이블 노출 여부):
```bash
curl -s -H "apikey: $KEY" -H "Authorization: Bearer $KEY" "$URL/rest/v1/campaigns?select=id&limit=1"
```
Expected: `[]`

- [ ] **Step 5: admin 클라이언트 작성**

`lib/supabase/admin.ts`:

```ts
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: { url: string; client: SupabaseClient } | null = null;

/** 서버 전용. service_role 키를 쓰므로 RLS 를 우회한다. 브라우저 번들에 들어가면 안 된다. */
export function getAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  if (cached && cached.url === url) return cached.client;
  cached = {
    url,
    client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
  return cached.client;
}
```

vitest는 `server-only`를 해석하지 못하므로 `vitest.config.ts`의 `resolve.alias`에 `"server-only": path.resolve(__dirname, "tests/unit/server-only-stub.ts")`를 추가하고 빈 파일을 만든다.

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json supabase scripts/db-migrate.mjs lib/supabase tests/unit/server-only-stub.ts vitest.config.ts
git commit -m "feat(db): Supabase 스키마, 마이그레이션 스크립트, 서버 전용 admin 클라이언트 추가"
```

---

### Task 2: 테스트 DB 격리

**Files:**
- Create: `tests/unit/test-db.ts`
- Modify: `tests/unit/setup.ts`
- Modify: `vitest.config.ts` (`fileParallelism: false`)

**Interfaces:**
- Produces: `hasTestDb: boolean`, `resetTestDb(): Promise<void>`, `closeTestDb(): Promise<void>`

- [ ] **Step 1: test-db.ts 작성**

```ts
import path from "path";
import pg from "pg";

try { process.loadEnvFile(path.join(process.cwd(), ".env.local")); } catch { /* CI 등 */ }

const prodUrl = process.env.SUPABASE_URL;
const testUrl = process.env.SUPABASE_TEST_URL;
const testKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const testDbUrl = process.env.SUPABASE_TEST_DB_URL;

export const hasTestDb = Boolean(testUrl && testKey && testDbUrl);

if (hasTestDb) {
  if (testUrl === prodUrl) {
    throw new Error("SUPABASE_TEST_URL 이 운영 SUPABASE_URL 과 같습니다. 테스트는 운영 데이터를 전부 지웁니다. 중단합니다.");
  }
  process.env.SUPABASE_URL = testUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = testKey;
}

const TABLES = [
  "audit_logs", "sns_contents", "sns_plans", "sns_intake_responses", "sns_intake_template", "sns_accounts",
  "event_plans", "event_checklist_items", "event_invitees", "events",
  "hidden_builtin_templates", "ppt_templates", "reports", "seeding_records", "applicants",
  "form_configs", "pre_survey_responses", "pre_survey_template", "campaigns",
];

let client: pg.Client | null = null;
async function conn() {
  if (!client) {
    client = new pg.Client({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
  }
  return client;
}

export async function resetTestDb() {
  const c = await conn();
  await c.query(`truncate table ${TABLES.map((t) => `public.${t}`).join(", ")} cascade`);
}

export async function closeTestDb() {
  await client?.end();
  client = null;
}
```

- [ ] **Step 2: setup.ts 교체**

```ts
import fs from "fs";
import os from "os";
import path from "path";
import { beforeEach, afterAll } from "vitest";
import { hasTestDb, resetTestDb, closeTestDb } from "./test-db";

// 업로드 파일은 테스트마다 임시 폴더를 쓴다.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "marketing-mvp-test-"));
process.env.UPLOADS_DIR = path.join(dir, "uploads");
process.env.GEMINI_API_KEY = "";

beforeEach(async () => {
  fs.rmSync(process.env.UPLOADS_DIR as string, { recursive: true, force: true });
  if (hasTestDb) await resetTestDb();
});

afterAll(async () => {
  await closeTestDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
```

`storage.ts`의 템플릿 폴더는 `path.dirname(getUploadsDirPath())/templates`이므로 임시 폴더 아래에 같이 생긴다.

- [ ] **Step 3: vitest.config.ts에 `fileParallelism: false` 추가.** 파일마다 같은 DB를 truncate하므로 병렬이면 서로 지운다.

- [ ] **Step 4: 커밋**

```bash
git commit -am "test: Supabase 테스트 프로젝트 격리 및 초기화 셋업"
```

---

### Task 3: 공용 모듈 (validation, defaults, mappers, client)

**Files:**
- Create: `lib/db/validation.ts`, `lib/db/defaults.ts`, `lib/db/mappers.ts`, `lib/db/client.ts`

**Interfaces (Produces):**
- `validation.ts`: 기존 index.ts 653–721행의 함수·상수를 그대로 옮긴다. `ValidationError`, `requireText(value, label, max=500)`, `optionalText(value, max=2000)`, `nonNegativeInt`, `optionalDate`, `optionalIsoDateTime`, `optionalUrl`, `oneOf`, `nowIso()`, `CAMPAIGN_STATUSES`, `APPLICANT_STATUSES`, `PROGRESS_STAGES`, `EVENT_STATUSES`, `RSVP_STATUSES`, `SNS_PLATFORMS`. 추가로 `cleanQuestions(questions: PreSurveyQuestion[]): PreSurveyQuestion[]`(updatePreSurveyTemplate 등 4곳이 반복하던 map), `cleanFieldValues`.
- `defaults.ts`: `DEFAULT_PRE_SURVEY_QUESTIONS`(index.ts 170–173행의 4개), `DEFAULT_SNS_INTAKE_QUESTIONS`(383–385행의 3개), `BUILTIN_EVENT_TEMPLATE_ID`, `BUILTIN_SNS_TEMPLATE_ID`, `BUILTIN_REPORT_TEMPLATE_ID`(새 uuid), `BUILTIN_EVENT_PLACEHOLDERS`, `BUILTIN_SNS_PLACEHOLDERS`, `BUILTIN_REPORT_PLACEHOLDERS`, `BUILTIN_TEMPLATES`, `builtinTemplate(id): PptTemplate`.
- `client.ts`: `db()` = `getAdminClient()`, `unwrap<T>(res: { data: T | null; error: PostgrestError | null }): T` — error면 `Error(\`[db] ${error.message}\`)`를 던진다.
- `mappers.ts`: 각 엔티티의 `XRow` 인터페이스와 `rowToX(row): X`. 규칙:
  - `ts(v: string | null): string` = `new Date(v).toISOString()`; null이면 그대로.
  - 옵셔널(`?:`) 필드는 `null → undefined`: Campaign.message_templates/webhook_url/pre_survey_questions, Applicant.follower_count/category/agency_memo/shipping_address/visit_schedule/visit_party_size/status_changed_at, SeedingRecord.shipping_address/visit_scheduled_at, CampaignReport.snapshot_data/generated_at, PptTemplate.file_key, SnsAccount.intake_questions.
  - `string | null` 필드는 null 유지.
  - `SnsContent.media_attachments`는 항상 배열.
  - `Applicant.custom_answers`는 항상 객체.

- [ ] **Step 1: 네 파일 작성** (코드는 index.ts에서 옮기고, mappers는 위 규칙대로 엔티티 15종 작성)
- [ ] **Step 2: `npx tsc --noEmit` 통과 확인** (아직 index.ts는 옛 코드. 새 파일은 독립적으로 컴파일된다)
- [ ] **Step 3: 커밋** `feat(db): 검증 유틸, 기본값, 행 매퍼 분리`

---

### Task 4: audit.ts, campaigns.ts

**Files:** Create `lib/db/audit.ts`, `lib/db/campaigns.ts`

**Interfaces:**
- `audit.ts`: `insertAuditLog(entry): Promise<AuditLogEntry>`(내부용, 옛 `appendAuditLog`와 같은 인자), `recordAuditLog`, `getAuditLogs(filter?)` — `order created_at desc`, `limit` 기본 50, 필터 `eq campaign_id` / `eq account_id`.
- `campaigns.ts`: `getCampaigns`(created_at desc), `getCampaignById`, `getCampaignByToken(type, token)`(`eq(\`${type}_token\`)`), `createCampaign`(insert campaigns → insert form_configs; 토큰 접두사·안내문은 옛 코드 그대로), `updateCampaign`, `updateCampaignMessageTemplates`, `deleteCampaign`(insert audit → delete; fk cascade), `updateCampaignWebhookUrl`, `regenerateCampaignToken`, `getPreSurveyTemplate`(행 없으면 `DEFAULT_PRE_SURVEY_QUESTIONS`로 upsert ignoreDuplicates 후 반환), `updatePreSurveyTemplate`(upsert id=1), `getPreSurveyQuestionsForCampaign`, `updateCampaignPreSurveyQuestions`, `getPreSurveyResponse`, `savePreSurveyResponse`(upsert onConflict campaign_id; id는 기존 행 있으면 유지), `getFormConfig`, `saveFormConfig`(upsert onConflict campaign_id, created_at 유지).

패턴 예시(update):
```ts
export async function updateCampaign(id: string, patch: {...}): Promise<Campaign | null> {
  const values: Partial<CampaignRow> = {};
  if (patch.name !== undefined) values.name = requireText(patch.name, "캠페인명", 200);
  if (patch.company_name !== undefined) values.company_name = requireText(patch.company_name, "브랜드명", 200);
  if (patch.status !== undefined) values.status = oneOf(patch.status, CAMPAIGN_STATUSES, "캠페인 상태");
  if (Object.keys(values).length === 0) return getCampaignById(id);
  const row = unwrap(await db().from("campaigns").update(values).eq("id", id).select("*").maybeSingle());
  return row ? rowToCampaign(row) : null;
}
```
- [ ] Step 1: 작성. Step 2: `tsc --noEmit`. Step 3: 커밋 `feat(db): 감사 로그·캠페인 모듈을 Supabase 로`

---

### Task 5: applicants.ts

`getApplicantsByCampaignId`(applied_at asc), `getApplicantById`, `createApplicant`(캠페인·폼설정 조회 → 검증(옛 코드 그대로) → 중복 SNS 검사는 같은 캠페인 지원자 `sns_link` 목록을 가져와 정규화 비교 → insert → audit), `updateApplicantAgencyMemo`, `updateApplicantStatus`(같은 상태면 `{changed:false}`; update → audit → selected면 seeding_records `upsert({...}, { onConflict: "applicant_id", ignoreDuplicates: true })`), `getSeedingRecordsByCampaignId`(created_at asc), `getAllSeedingRecords`, `updateSeedingRecord`(현재 행 조회 → 검증 → update → 단계/링크 바뀌었으면 지원자 이름 조회 후 audit).

- [ ] 작성 → `tsc` → 커밋 `feat(db): 지원자·시딩 모듈을 Supabase 로`

---

### Task 6: reports.ts

`getReportsByCampaignId`(created_at asc), `getReportById`, `saveReportSections`, `buildReportSnapshot`(순수 함수, 그대로), `createReport`(캠페인·지원자·시딩 조회 → 스냅샷 → insert; `custom_sections` 기본 1개 `sec_default`).

- [ ] 작성 → `tsc` → 커밋 `feat(db): 보고서 모듈을 Supabase 로`

---

### Task 7: ppt-templates.ts

`getPptTemplates(kind?)` = 숨김 목록 조회 → 내장(defaults 순서) 필터 + DB 행(uploaded_at asc), kind 필터. `getPptTemplateById` = 내장이면(숨김 아닐 때) defaults에서, 아니면 DB. `getPptTemplateBuffer`(그대로, `file_data` 분기는 삭제), `savePptTemplate`, `preparePptTemplateUpload`, `recordUploadedPptTemplate`, `readUploadedPptTemplateBuffer`, `readPptTemplateFileByKey`, `discardUploadedPptTemplate`, `updatePptTemplateMeta`(내장이면 ValidationError), `putPptTemplateReplacement`, `preparePptTemplateReplace`, `recordReplacedPptTemplate`(update 전에 옛 file_key 조회 → update → 옛 키 삭제), `getHiddenBuiltinTemplateCount`(count head), `restoreBuiltinPptTemplates`(delete all from hidden → 삭제 수 반환), `deletePptTemplate`(내장이면 hidden insert ignoreDuplicates, 아니면 delete + 파일 삭제).

- [ ] 작성 → `tsc` → 커밋 `feat(db): PPT 템플릿 모듈을 Supabase 로`

---

### Task 8: events.ts

`getEventsByCampaignId`, `getAllEvents`(created_at asc), `getEventById`, `createEvent`(캠페인 존재 확인), `updateEvent`, `deleteEvent`(cascade), `getEventInvitees`(created_at asc), `addEventInviteesFromApplicants`(행사 조회 → 같은 캠페인 지원자 `in("id", ids)` → 기존 초대 `applicant_id` 목록 제외 → insert 다건 → 반환), `addDirectEventInvitee`, `updateEventInvitee`, `deleteEventInvitee`, `getEventChecklistItems`(sort_order asc), `getAllEventChecklistItems`, `addEventChecklistItem`(max sort_order 조회 +1), `updateEventChecklistItem`, `deleteEventChecklistItem`, `getEventPlan`, `saveEventPlan`(행사 존재·템플릿 kind=event 확인 → upsert onConflict event_id).

- [ ] 작성 → `tsc` → 커밋 `feat(db): 행사 모듈을 Supabase 로`

---

### Task 9: sns.ts

`getSnsAccounts`(created_at desc), `getSnsAccountById`, `getSnsAccountByToken`, `createSnsAccount`(insert → 기본 sns 템플릿 = `getPptTemplates("sns")[0]` → sns_plans insert; 기본 field_values 옛 코드 그대로), `updateSnsAccount`(현재 행 조회 후 병합 검증), `regenerateSnsToken`, `deleteSnsAccount`(콘텐츠 media id 수집 → audit → delete → 파일 삭제), `getSnsIntakeTemplate`(행 없으면 기본값 upsert), `updateSnsIntakeTemplate`, `getSnsIntakeQuestionsForAccount`, `updateSnsAccountIntakeQuestions`, `getSnsIntakeResponse`, `saveSnsIntakeResponse`(upsert onConflict account_id), `getSnsPlan`, `saveSnsPlan`, `getSnsContentsByAccountId`(scheduled_on desc nullsFirst:false), `getAllSnsContents`(created_at desc), `getSnsContentById`, `createSnsContent`, `SnsContentPatch`, `updateSnsContent`(현재 행 조회 → 옛 검증 그대로 → update), `deleteSnsContent`, `matchesMediaSignature`, `prepareSnsMediaUpload`, `recordUploadedSnsMedia`(콘텐츠 조회 → `media_attachments` 배열에 push → update → audit), `saveSnsMediaAttachment`, `deleteSnsMediaAttachment`, `getSnsMediaAttachmentById`(`.contains("media_attachments", JSON.stringify([{ id }]))`), `reviewSnsContent`.

- [ ] 작성 → `tsc` → 커밋 `feat(db): SNS 모듈을 Supabase 로`

---

### Task 10: index.ts 교체, storage.ts 정리, 잔재 제거

**Files:**
- Rewrite: `lib/db/index.ts` → re-export
- Modify: `lib/db/storage.ts` (readDoc/writeDoc/toStrongEtag/ConcurrentWriteError/probe*/backup*/getDbFilePath/getBackupDirPath 삭제; `describeStorage`에서 `localPath`를 uploads 경로로)
- Modify: `app/api/storage-health/route.ts` (문서·백업·ETag 검사 삭제, `supabase` 검사 추가: `db().from("campaigns").select("id", { count: "exact", head: true })`)
- Delete: `scripts/db-restore.mjs`; package.json에서 `db:restore` 삭제
- Modify: `.env.local.example`에 SUPABASE_* 6개 추가
- Modify: `AGENTS.md`/README가 `.data/db.json`을 언급하면 갱신

index.ts:
```ts
export * from "./validation";   // ValidationError
export * from "./audit";
export * from "./campaigns";
export * from "./applicants";
export * from "./reports";
export * from "./ppt-templates";
export * from "./events";
export * from "./sns";
export { getUploadsDirPath } from "./storage";
export { ALLOWED_SNS_MEDIA_MIME_TYPES, MAX_SNS_MEDIA_BYTES } from "./types";
export {
  BUILTIN_REPORT_TEMPLATE_ID, BUILTIN_EVENT_PLACEHOLDERS, BUILTIN_SNS_PLACEHOLDERS, BUILTIN_REPORT_PLACEHOLDERS,
} from "./defaults";
// 예전 이름 별칭
export { savePreSurveyResponse as upsertPreSurveyResponse, getFormConfig as getCampaignFormConfig, saveFormConfig as upsertCampaignFormConfig } from "./campaigns";
export { saveReportSections as updateReportCustomSections } from "./reports";
```
`validation.ts`의 내부 유틸이 `export *`로 새어 나가지 않도록 validation.ts는 `ValidationError`만 `export`하고 나머지는 별도 이름공간… 대신 index.ts에서 `export { ValidationError } from "./validation"`로 한정한다.

- [ ] Step 1: 위 변경. Step 2: `npm run typecheck && npm run lint` 통과. Step 3: `grep -rn "readDb\|mutateDb\|getInitialData\|db.json" app lib components` 결과 없음 확인. Step 4: 커밋 `refactor(db): JSON 문서 백엔드 제거, index.ts 를 re-export 로`

---

### Task 11: 단위 테스트 재작성

**Files:** `tests/unit/db.test.ts`, `storage.test.ts`, `ppt_template_storage.test.ts`, `phase2.test.ts`, `phase3.test.ts`, `security_fixes.test.ts`, `security_tokens.test.ts`, `client_upload.test.ts`

규칙:
- DB를 건드리는 `describe`는 `import { hasTestDb } from "./test-db"` 후 `describe.skipIf(!hasTestDb)(...)`.
- `readDb()`로 상태를 보던 단정은 공개 getter로 바꾼다(`getCampaigns`, `getApplicantsByCampaignId`, `getSeedingRecordsByCampaignId`, `getFormConfig`, `getEventsByCampaignId`, `getEventInvitees`, `getSnsAccounts`, `getSnsContentsByAccountId`, `getSnsPlan`, `getSnsIntakeResponse`, `getSnsIntakeTemplate`).
- 삭제하는 테스트: db.test.ts "초기 데이터가 샘플 캠페인…"(→ "첫 조회에 캠페인이 없고 내장 템플릿 3개가 있다"로 교체), "mutateDb 안에서 던진 에러…", storage.test.ts의 ETag·문서·mutateDb 3개 describe, ppt_template_storage.test.ts "파일이 DB 문서를 키우지 않는다"(→ `file_key`만 검증).
- "쓰기는 직렬화되어…" 테스트는 "동시 생성 10건이 모두 저장된다"로 이름만 바꾸고 유지.

- [ ] Step 1: 수정. Step 2: `npm test` — 테스트 프로젝트가 있으면 전부, 없으면 DB 스위트 skip 확인. Step 3: 커밋 `test: Supabase 기반으로 단위 테스트 정리`

---

### Task 12: 브라우저 검증

- [ ] `next dev` 기동 → `/`에 캠페인 0건, 설정 > 사전조사에 기본 질문 4개, 설정 > PPT 템플릿에 내장 3개.
- [ ] 캠페인 생성 → 신청폼 링크로 지원 → 지원자 선정 → 시딩 시트 수정 → 보고서 생성 → PDF/PPTX 다운로드.
- [ ] SNS 계정 생성 → 콘텐츠 생성 → 미디어 첨부(로컬 업로드) → 승인대기 → 승인 링크에서 승인.
- [ ] 행사 생성 → 지원자 초대 → 체크리스트 → 운영안 저장 → export.
- [ ] `/api/storage-health`가 `healthy: true`.
- [ ] 문제 없으면 커밋 없음(코드 변경 없을 때). 발견한 버그는 각각 커밋.

---

### Task 13: 후속 정리 및 인계

- [ ] e2e(`tests/e2e/fixtures.ts`)는 샘플 데이터 식별자에 의존한다. 이번 범위에서는 고치지 않고, 스펙의 "e2e" 절과 최종 보고에 "테스트 프로젝트에 샘플을 심는 시드 스크립트가 필요하다"고 남긴다.
- [ ] `docs/sql/`은 다른 저장소의 스키마 사본이다. README 첫 줄에 "이 프로젝트의 스키마는 `supabase/migrations/`다"라는 안내를 붙인다.
- [ ] 커밋 `docs: Supabase 전환 후 남은 작업 정리`
