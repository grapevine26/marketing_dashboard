# SNS Operation (Sub-Project C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SNS 대행 운영 (agency-run SNS account management) sub-project: account roster with per-account public tokens, a client intake survey (admin-editable question template + public token form), a content calendar with status workflow and AI caption drafts, a client approval share link that transitions content status, an operation plan editor (web + PPT export via the shared template engine), and manual post-performance entry with monthly aggregation.

**Architecture:** `sns_accounts` is an independent unit (no FK to campaigns). Two public token routes (`/sns-intake/[token]`, `/sns-approval/[token]`) reach data ONLY through `SECURITY DEFINER` RPCs scoped by per-purpose tokens, mirroring sub-project A's pattern. The dashboard area (`/sns`, `/sns/[id]`, `/sns/[id]/plan`, `/settings/sns-intake`) uses the authenticated dashboard client and normal RLS. PPT generation consumes sub-project B's shared engine (`lib/ppt/`, `ppt_templates` with `kind='sns'`) and never redefines it.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres RPC + RLS), `@google/genai` (already installed — **this plan adds no new npm dependencies**), Vitest + React Testing Library, Tailwind v4 token classes.

**Spec:** [docs/superpowers/specs/2026-09-01-sns-operation-design.md](../specs/2026-09-01-sns-operation-design.md)

## Prerequisites — read before starting

1. **The parallel plan `docs/superpowers/plans/2026-09-01-ppt-template-engine.md` MUST land first.** It owns: migration `0015` (`ppt_templates` table + `ppt-templates` storage bucket), `lib/ppt/template.ts`, `lib/ppt/storage.ts`, and the `/settings/ppt-templates` admin screen. This plan only **consumes** those and never redefines them. Task 3 (FK to `ppt_templates`), Task 15, and Task 16 depend on it. Its public API is settled as the following contract — consume these exact names, and note that **both engine functions are async** (jszip's `loadAsync` is Promise-only), so every call site `await`s them:
   - `extractPlaceholders(pptx: Buffer): Promise<string[]>` (from `lib/ppt/template.ts`)
   - `fillTemplate(pptx: Buffer, values: Record<string, string>): Promise<Buffer>` (from `lib/ppt/template.ts`)
   - `uploadTemplateFile`, `downloadTemplateFile`, `removeTemplateFile` (from `lib/ppt/storage.ts`). `downloadTemplateFile` resolves to `null` when the file cannot be fetched — the Task 16 export route maps that `null` to the user-facing error "템플릿 파일을 불러오지 못했습니다. 다시 업로드해주세요."
   - The template row type `PptTemplate` is exported (type-only) from `app/(dashboard)/settings/ppt-templates/actions.ts`.
2. Sub-project A's foundation is already merged: `profiles` with `role`, `getCurrentProfile`/`requireRole` in `lib/auth/roles.ts`, `createServerSupabaseClient` in `lib/supabase/server.ts`, `createDashboardSupabaseClient` in `lib/supabase/dashboard.ts`, the dashboard shell at `app/(dashboard)/layout.tsx`, design tokens. Reuse all of it verbatim; redefine none of it.
3. `npm install` is already done. Do not run `npm install` unless a task explicitly says so (none do).

## Global Constraints

Every task's requirements implicitly include this section. These are copied from `STATUS.md` "코드 규약" and the spec — they are not suggestions.

- **Two Supabase clients — picking the wrong one breaks only at runtime, never in tests:**

  | Location | Use | What tests mock |
  |---|---|---|
  | `app/(dashboard)/**`, `app/api/**`, route handlers in the dashboard group | `createDashboardSupabaseClient()` from `@/lib/supabase/dashboard` | `@/lib/supabase/dashboard` |
  | Public routes (`app/sns-intake/**`, `app/sns-approval/**`) | `createServerSupabaseClient()` from `@/lib/supabase/server` | `@/lib/supabase/server` |

  All table RLS is `to authenticated`, so an anon client inside the dashboard returns 0 rows at runtime while every mocked test passes. Public routes must reach data **only via token-scoped RPCs** — never direct table reads.
- **RPC grant order is mandatory and exact.** For every `SECURITY DEFINER` function:

  ```sql
  revoke execute on function public.fn_name(arg_types) from public;
  grant execute on function public.fn_name(arg_types) to anon, authenticated;
  ```

  The `revoke` must come first (PostgreSQL grants EXECUTE to PUBLIC by default; omitting the revoke caused a real auth bypass in migration 0014). Every RPC also carries `security definer` and `set search_path = public`. Reference: `supabase/migrations/0005_pre_survey_rpc.sql`.
- **Every exported function in a `"use server"` module is a directly callable public endpoint.** Never export a helper that takes a trust-bearing parameter (an actor, a role, an unvalidated decision). The approval flow bakes the decision validation into the action and the RPC; no action ever accepts an actor argument.
- **Server actions must declare explicit return types** (e.g. `Promise<{ error: string } | { success: true }>`). Without them `"error" in result` narrowing breaks and **the production build fails**.
- **Actions using `revalidatePath` need `vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))` in their tests.**
- **Server actions reachable from public routes re-validate inputs at the action level even though the RPC validates too.**
- **Screens that load saved data must read it server-side and pass it as props.** Initializing a client form with empty values silently wipes existing data on save. This applies to the intake template editor, the intake form (resubmit overwrites), and the plan editor.
- **AI calls are server-only:** model `gemini-3.6-flash` via `@google/genai`, `GEMINI_API_KEY` from env, `config: { maxOutputTokens, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } }`. MINIMAL is required — at higher levels thinking tokens eat the budget and the answer is truncated. On any failure the caller falls back to the message `"AI 제안 실패 — 직접 입력해주세요."` and never blocks manual entry. Empty/blank model output throws `new Error("UNEXPECTED_RESPONSE")`. Mirror `lib/ai/preSurveyAssist.ts` and its test (including the mock factory with a `ThinkingLevel` object).
- **All UI copy is Korean.** Tailwind is restricted to token classes only: `bg-bg` `bg-surface` `bg-surface2` `border-border` `text-text` `text-textMuted` `bg-accent` `text-onAccent` `text-critical` `text-success` `text-warning` `rounded-token` (plus layout/spacing/typography utilities like `flex`, `p-4`, `text-sm`, `font-mono`, `tabular-nums`). Numeric performance values use `font-mono tabular-nums`.
- **Commit messages in English**, and every commit ends with the trailer:

  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  ```
- **NEVER run the full `npm test`.** DB tests hit the shared **production** Supabase project (no mocking) and pollute it; parallel runs clobber each other. Run **only your own test file** with `npx vitest run <exact-file-path>`.
- **The Supabase CLI is NOT authenticated** and there is no DB password — `supabase db push` / `migration up` do not work. Migrations are applied by pasting the `docs/sql/` bundle into the Supabase dashboard SQL Editor. **DB migration tests (Tasks 1–4) will fail with `relation ... does not exist` until the bundle from Task 5 is applied by a human.** That is expected; write the migration + test, verify the test fails for the right reason, and move on. After the bundle is applied, re-run each migration test file individually to confirm.
- **Migration numbers 0018–0021 are reserved for this plan** (B owns 0015–0017). Do not create any other migration number.
- **`app/(dashboard)/layout.tsx` is shared with parallel plans — additive edits only.** If an exact-match edit fails because a parallel plan already changed a neighboring line, re-read the file and apply the same additive change by hand; never rewrite the file wholesale.

---

## File Structure

```
marketing/
├── supabase/migrations/
│   ├── 0018_sns_accounts.sql            (+ .test.ts)   # account roster + 2 public tokens
│   ├── 0019_sns_intake.sql              (+ .test.ts)   # single-row template, responses, 2 intake RPCs
│   ├── 0020_sns_plans_contents.sql      (+ .test.ts)   # operation plan + content calendar rows
│   └── 0021_sns_approval_rpc.sql        (+ .test.ts)   # 2 approval RPCs
├── docs/sql/setup-0018-0021.sql                        # dashboard SQL-editor bundle (copy of the above)
├── lib/
│   ├── ai/
│   │   ├── snsCaptionAssist.ts          (+ .test.ts)   # generateCaptionDraft -> {caption, hashtags}
│   │   └── snsPlanAssist.ts             (+ .test.ts)   # generatePlanFieldDraft -> string
│   └── sns/
│       ├── labels.ts                    (+ .test.ts)   # status/platform enums, Korean labels, status classes
│       ├── calendar.ts                  (+ .test.ts)   # buildMonthGrid — month grid, no external lib
│       └── monthlySummary.ts            (+ .test.ts)   # summarizeByMonth — posted rows grouped by month
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx                                  # MODIFY (additive): activate "SNS 운영", add settings link
│   │   ├── sns/
│   │   │   ├── page.tsx                 (+ .test.tsx)  # account list
│   │   │   ├── actions.ts               (+ .test.ts)   # createSnsAccount
│   │   │   ├── NewSnsAccountForm.tsx    (+ .test.tsx)  # client create form
│   │   │   └── [id]/
│   │   │       ├── page.tsx             (+ .test.tsx)  # account detail: board + summary + intake + links
│   │   │       ├── actions.ts           (+ .test.ts)   # content CRUD, status, performance, caption assist
│   │   │       ├── ShareLinks.tsx       (+ .test.tsx)  # copy UI for both public links
│   │   │       ├── ContentBoard.tsx                    # tabs (캘린더/목록) + form orchestration
│   │   │       ├── ContentForm.tsx      (+ .test.tsx)  # create/edit + "AI 문안" button
│   │   │       ├── ContentListView.tsx  (+ .test.tsx)  # list rows, status select, delete, performance
│   │   │       ├── ContentCalendarView.tsx (+ .test.tsx) # month grid render
│   │   │       ├── PerformanceForm.tsx  (+ .test.tsx)  # posted-only metrics entry
│   │   │       ├── MonthlySummaryCard.tsx (+ .test.tsx) # monthly aggregate display
│   │   │       └── plan/
│   │   │           ├── page.tsx                        # plan editor page (server load -> props)
│   │   │           ├── actions.ts       (+ .test.ts)   # saveSnsPlan, getPlanAssist
│   │   │           ├── PlanEditor.tsx   (+ .test.tsx)  # template select, fields, AI 초안, web view
│   │   │           └── export/route.ts  (+ .test.ts)   # PPT download via B's fillTemplate
│   │   └── settings/
│   │       └── sns-intake/
│   │           ├── page.tsx                            # admin-only, server-loads questions -> props
│   │           ├── actions.ts           (+ .test.ts)   # updateSnsIntakeTemplate
│   │           └── SnsIntakeTemplateEditor.tsx (+ .test.tsx)
│   ├── sns-intake/
│   │   └── [token]/
│   │       ├── page.tsx                                # public: RPC context -> form (prefilled on resubmit)
│   │       ├── actions.ts               (+ .test.ts)   # submitSnsIntake
│   │       └── SnsIntakeForm.tsx        (+ .test.tsx)  # client form (no AI on this form)
│   └── sns-approval/
│       └── [token]/
│           ├── page.tsx                 (+ .test.tsx)  # public: pending list via RPC
│           ├── actions.ts               (+ .test.ts)   # reviewSnsContentAsClient
│           └── ApprovalControls.tsx     (+ .test.tsx)  # approve / request-changes + comment (prop-injected action)
```

Design decisions locked in here (each resolves a spec ambiguity; the spec rationale is noted inline in the tasks):

1. `sns_intake_responses.account_id` is `unique` — that is how "계정당 답변 1건 + 재제출 시 덮어쓰기" becomes an `on conflict (account_id) do update` upsert.
2. `get_sns_intake_context` also returns the prior `answers` and `submitted_at`. Because resubmit **overwrites**, the public form must prefill with the existing answers (the "load server-side, pass as props" rule) — otherwise a resubmit from a blank form wipes the client's previous answers.
3. `get_pending_contents` includes each content's `id` alongside title/caption/hashtags/scheduled_on — the id is required to call `review_sns_content`. It still never exposes `media_note`, performance counts, or any token.
4. `sns_plans.template_id` is `on delete set null` so deleting a PPT template in `/settings/ppt-templates` neither blocks nor cascades.
5. `review_sns_content` only updates rows still in `pending_approval` (`and status = 'pending_approval'` in the UPDATE) — double clicks and stale tabs are idempotently rejected (returns `false`), matching the spec's 멱등 requirement.
6. Caption assist returns caption AND hashtags from one model call using a `---` delimiter line contract; a response without the delimiter throws `UNEXPECTED_RESPONSE` so the caller shows the standard fallback.
7. Invalid approval token → `notFound()` (404 page); valid token with zero pending items → a distinct "처리할 항목 없음" empty-state message. Two different notices as the spec requires.

---

## Task 1: Migration 0018 — `sns_accounts`

**Files:**
- Create: `supabase/migrations/0018_sns_accounts.sql`
- Test: `supabase/migrations/0018_sns_accounts.test.ts`

**Interfaces:**
- Produces: table `public.sns_accounts` with columns exactly: `id uuid pk default gen_random_uuid()`, `company_name text not null`, `platform text not null check in ('instagram','youtube','tiktok','other')`, `handle text not null`, `starts_on date`, `ends_on date`, `status text not null default 'active' check in ('active','ended')`, `intake_token uuid not null default gen_random_uuid()`, `approval_token uuid not null default gen_random_uuid()`, `created_at timestamptz not null default now()`. RLS enabled; select/insert/update `to authenticated`. Later tasks reference these column names verbatim — do not rename anything.

- [ ] **Step 1: Write the failing test**

`supabase/migrations/0018_sns_accounts.test.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "vitest";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

test("an account row gets defaults: active status and two distinct tokens", async () => {
  const { data, error } = await admin
    .from("sns_accounts")
    .insert({ company_name: "글로우랩", platform: "instagram", handle: "@glowlab" })
    .select()
    .single();

  expect(error).toBeNull();
  expect(data.status).toBe("active");
  expect(data.intake_token).toBeTruthy();
  expect(data.approval_token).toBeTruthy();
  expect(data.intake_token).not.toBe(data.approval_token);
});

test("platform outside the check constraint is rejected", async () => {
  const { error } = await admin
    .from("sns_accounts")
    .insert({ company_name: "글로우랩", platform: "facebook", handle: "@x" });
  expect(error).not.toBeNull();
});

test("status outside the check constraint is rejected", async () => {
  const { error } = await admin
    .from("sns_accounts")
    .insert({ company_name: "글로우랩", platform: "other", handle: "@x", status: "paused" });
  expect(error).not.toBeNull();
});

test("anon cannot read sns_accounts (RLS is to authenticated)", async () => {
  await admin
    .from("sns_accounts")
    .insert({ company_name: "익명확인", platform: "tiktok", handle: "@anon-check" });

  const { data } = await anon.from("sns_accounts").select("id");
  expect(data ?? []).toEqual([]);
});
```

- [ ] **Step 2: Run the test to verify it fails for the right reason**

Run: `npx vitest run supabase/migrations/0018_sns_accounts.test.ts`
Expected: FAIL — `relation "public.sns_accounts" does not exist` (surfaced as a Supabase error object; the first assertion fails). It stays failing until the Task 5 bundle is applied in the dashboard SQL editor — that is expected.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0018_sns_accounts.sql`:

```sql
-- Sub-project C: agency-run SNS accounts. Independent of campaigns (no FK to A).
-- Two per-purpose public tokens, so each share link can be revoked separately.
create table public.sns_accounts (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  platform text not null check (platform in ('instagram', 'youtube', 'tiktok', 'other')),
  handle text not null,
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('active', 'ended')),
  intake_token uuid not null default gen_random_uuid(),
  approval_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.sns_accounts enable row level security;

create policy "authenticated users can read sns accounts"
  on public.sns_accounts for select
  to authenticated
  using (true);

create policy "authenticated users can create sns accounts"
  on public.sns_accounts for insert
  to authenticated
  with check (true);

create policy "authenticated users can update sns accounts"
  on public.sns_accounts for update
  to authenticated
  using (true)
  with check (true);
```

- [ ] **Step 4: Commit**

The test cannot pass yet (SQL not applied — see Global Constraints). Commit the pair; Task 5 bundles the SQL for human application, after which this test file is re-run.

```bash
git add supabase/migrations/0018_sns_accounts.sql supabase/migrations/0018_sns_accounts.test.ts
git commit -m "feat: add sns_accounts table with per-purpose public tokens

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Migration 0019 — intake template, responses, and token RPCs

**Files:**
- Create: `supabase/migrations/0019_sns_intake.sql`
- Test: `supabase/migrations/0019_sns_intake.test.ts`

**Interfaces:**
- Consumes: `public.sns_accounts` (Task 1), `public.profiles` (role check, pre-existing).
- Produces:
  - table `public.sns_intake_template` — single row `id = 1`, `questions jsonb not null default '[]'`, `updated_at timestamptz`. Mirrors `0003_pre_survey_template.sql` exactly (select to authenticated; update admin-only). **C-only table — never touch A's `pre_survey_template`.**
  - table `public.sns_intake_responses` — `id uuid pk`, `account_id uuid not null unique` FK→`sns_accounts` on delete cascade, `answers jsonb not null`, `submitted_at timestamptz not null default now()`. Select to authenticated; **deliberately no insert/update policy for anyone** — writes go only through the RPC below.
  - `get_sns_intake_context(p_token uuid) returns json` — `{ account_id, company_name, platform, handle, questions, submitted_at, answers }` for a matching `intake_token`, else `null` (`submitted_at`/`answers` are `null` when nothing was submitted yet). Granted to anon + authenticated.
  - `submit_sns_intake(p_token uuid, p_answers jsonb) returns boolean` — upserts one response per account (resubmit overwrites, per the spec's decision), `true` on success, `false` for an unknown token. Granted to anon + authenticated.

- [ ] **Step 1: Write the failing test**

`supabase/migrations/0019_sns_intake.test.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "vitest";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function makeAccount() {
  const { data, error } = await admin
    .from("sns_accounts")
    .insert({ company_name: "글로우랩", platform: "instagram", handle: "@glowlab" })
    .select()
    .single();
  if (error) throw error;
  await admin
    .from("sns_intake_template")
    .update({ questions: [{ id: "q1", label: "브랜드 톤앤매너를 알려주세요" }] })
    .eq("id", 1);
  return data;
}

test("the intake template row exists and is pinned to id=1", async () => {
  const { data, error } = await admin
    .from("sns_intake_template")
    .select("id")
    .eq("id", 1)
    .single();
  expect(error).toBeNull();
  expect(data).toEqual({ id: 1 });

  const { error: insertError } = await admin
    .from("sns_intake_template")
    .insert({ id: 2, questions: [] });
  expect(insertError).not.toBeNull();
});

test("anon cannot insert into sns_intake_responses directly (RPC-only writes)", async () => {
  const account = await makeAccount();
  const { error } = await anon
    .from("sns_intake_responses")
    .insert({ account_id: account.id, answers: {} });
  expect(error).not.toBeNull();
});

test("get_sns_intake_context returns account info, questions, and no prior answers, as anon", async () => {
  const account = await makeAccount();

  const { data, error } = await anon.rpc("get_sns_intake_context", {
    p_token: account.intake_token,
  });

  expect(error).toBeNull();
  expect(data).toEqual({
    account_id: account.id,
    company_name: "글로우랩",
    platform: "instagram",
    handle: "@glowlab",
    questions: [{ id: "q1", label: "브랜드 톤앤매너를 알려주세요" }],
    submitted_at: null,
    answers: null,
  });
});

test("get_sns_intake_context returns null for an unknown token", async () => {
  const { data, error } = await anon.rpc("get_sns_intake_context", {
    p_token: "00000000-0000-0000-0000-000000000000",
  });
  expect(error).toBeNull();
  expect(data).toBeNull();
});

test("submit_sns_intake inserts once and overwrites on resubmit (one row per account)", async () => {
  const account = await makeAccount();

  const first = await anon.rpc("submit_sns_intake", {
    p_token: account.intake_token,
    p_answers: { q1: "차분하고 신뢰감 있는 톤" },
  });
  expect(first.error).toBeNull();
  expect(first.data).toBe(true);

  const second = await anon.rpc("submit_sns_intake", {
    p_token: account.intake_token,
    p_answers: { q1: "밝고 위트있는 톤" },
  });
  expect(second.error).toBeNull();
  expect(second.data).toBe(true);

  const { data: rows } = await admin
    .from("sns_intake_responses")
    .select("answers")
    .eq("account_id", account.id);
  expect(rows).toEqual([{ answers: { q1: "밝고 위트있는 톤" } }]);
});

test("after a submit, the context includes the stored answers for prefill", async () => {
  const account = await makeAccount();
  await anon.rpc("submit_sns_intake", {
    p_token: account.intake_token,
    p_answers: { q1: "차분한 톤" },
  });

  const { data } = await anon.rpc("get_sns_intake_context", {
    p_token: account.intake_token,
  });
  expect(data.answers).toEqual({ q1: "차분한 톤" });
  expect(data.submitted_at).not.toBeNull();
});

test("submit_sns_intake returns false for an unknown token and writes nothing", async () => {
  const { data, error } = await anon.rpc("submit_sns_intake", {
    p_token: "00000000-0000-0000-0000-000000000000",
    p_answers: {},
  });
  expect(error).toBeNull();
  expect(data).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails for the right reason**

Run: `npx vitest run supabase/migrations/0019_sns_intake.test.ts`
Expected: FAIL — `relation "public.sns_intake_template" does not exist`. Stays failing until the Task 5 bundle is applied.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0019_sns_intake.sql`:

```sql
-- C-only intake survey. Mirrors A's pre_survey_template pattern (0003) but is a
-- separate table on purpose: accounts have no campaign, one response per account.
create table public.sns_intake_template (
  id integer primary key default 1 check (id = 1),
  questions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.sns_intake_template (id, questions) values (1, '[]'::jsonb);

alter table public.sns_intake_template enable row level security;

create policy "authenticated users can read the sns intake template"
  on public.sns_intake_template for select
  to authenticated
  using (true);

create policy "admins can update the sns intake template"
  on public.sns_intake_template for update
  to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

-- One response per account; resubmit overwrites via the RPC's upsert.
create table public.sns_intake_responses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.sns_accounts(id) on delete cascade,
  answers jsonb not null,
  submitted_at timestamptz not null default now()
);

alter table public.sns_intake_responses enable row level security;

-- Select only. Deliberately NO insert/update policy: all writes go through
-- submit_sns_intake below, so there is exactly one write path to audit.
create policy "authenticated users can read sns intake responses"
  on public.sns_intake_responses for select
  to authenticated
  using (true);

-- Token-scoped read for the public /sns-intake/[token] page. Returns prior
-- answers too: resubmit overwrites, so the form must prefill or a blank
-- resubmit would wipe the client's previous answers.
create or replace function public.get_sns_intake_context(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  select json_build_object(
    'account_id', a.id,
    'company_name', a.company_name,
    'platform', a.platform,
    'handle', a.handle,
    'questions', t.questions,
    'submitted_at', r.submitted_at,
    'answers', r.answers
  )
  into result
  from public.sns_accounts a
  cross join public.sns_intake_template t
  left join public.sns_intake_responses r on r.account_id = a.id
  where a.intake_token = p_token
    and t.id = 1;

  return result;
end;
$$;

revoke execute on function public.get_sns_intake_context(uuid) from public;
grant execute on function public.get_sns_intake_context(uuid) to anon, authenticated;

create or replace function public.submit_sns_intake(p_token uuid, p_answers jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  select id into v_account_id
  from public.sns_accounts
  where intake_token = p_token;

  if v_account_id is null then
    return false;
  end if;

  insert into public.sns_intake_responses (account_id, answers)
  values (v_account_id, p_answers)
  on conflict (account_id) do update
    set answers = excluded.answers,
        submitted_at = now();

  return true;
end;
$$;

revoke execute on function public.submit_sns_intake(uuid, jsonb) from public;
grant execute on function public.submit_sns_intake(uuid, jsonb) to anon, authenticated;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0019_sns_intake.sql supabase/migrations/0019_sns_intake.test.ts
git commit -m "feat: add sns intake template, responses, and token-scoped RPCs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Migration 0020 — `sns_plans` and `sns_contents`

**Files:**
- Create: `supabase/migrations/0020_sns_plans_contents.sql`
- Test: `supabase/migrations/0020_sns_plans_contents.test.ts`

**Interfaces:**
- Consumes: `public.sns_accounts` (Task 1), `public.ppt_templates` (**owned by the parallel plan `2026-09-01-ppt-template-engine.md`, migration 0015 — must already be applied; do not redefine it here**).
- Produces:
  - table `public.sns_plans` — `id uuid pk`, `account_id uuid not null unique` FK→`sns_accounts` on delete cascade (one plan per account), `template_id uuid` FK→`ppt_templates` **nullable, on delete set null**, `field_values jsonb not null default '{}'`, `updated_at timestamptz not null default now()`. RLS select/insert/update to authenticated.
  - table `public.sns_contents` — `id uuid pk`, `account_id uuid not null` FK→`sns_accounts` on delete cascade, `title text not null`, `scheduled_on date`, `assignee text`, `status text not null default 'planning' check in ('planning','producing','pending_approval','approved','posted')`, `caption text`, `hashtags text`, `media_note text` (internal-only note — never exposed to the client), `client_comment text`, `post_url text`, `view_count integer`, `like_count integer`, `comment_count integer`, `status_changed_at timestamptz`, `created_at timestamptz not null default now()`. RLS select/insert/update/delete to authenticated.

- [ ] **Step 1: Write the failing test**

`supabase/migrations/0020_sns_plans_contents.test.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "vitest";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function makeAccount() {
  const { data, error } = await admin
    .from("sns_accounts")
    .insert({ company_name: "글로우랩", platform: "instagram", handle: "@glowlab" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

test("a plan row defaults to empty field_values and allows a null template", async () => {
  const account = await makeAccount();
  const { data, error } = await admin
    .from("sns_plans")
    .insert({ account_id: account.id })
    .select()
    .single();

  expect(error).toBeNull();
  expect(data.field_values).toEqual({});
  expect(data.template_id).toBeNull();
});

test("only one plan per account (unique account_id)", async () => {
  const account = await makeAccount();
  await admin.from("sns_plans").insert({ account_id: account.id });
  const { error } = await admin.from("sns_plans").insert({ account_id: account.id });
  expect(error).not.toBeNull();
});

test("a content row defaults to planning status", async () => {
  const account = await makeAccount();
  const { data, error } = await admin
    .from("sns_contents")
    .insert({ account_id: account.id, title: "9월 신제품 티저" })
    .select()
    .single();

  expect(error).toBeNull();
  expect(data.status).toBe("planning");
  expect(data.status_changed_at).toBeNull();
});

test("content status outside the check constraint is rejected", async () => {
  const account = await makeAccount();
  const { error } = await admin
    .from("sns_contents")
    .insert({ account_id: account.id, title: "x", status: "published" });
  expect(error).not.toBeNull();
});

test("deleting an account cascades to its plan and contents", async () => {
  const account = await makeAccount();
  await admin.from("sns_plans").insert({ account_id: account.id });
  await admin.from("sns_contents").insert({ account_id: account.id, title: "x" });

  await admin.from("sns_accounts").delete().eq("id", account.id);

  const { data: plans } = await admin.from("sns_plans").select("id").eq("account_id", account.id);
  const { data: contents } = await admin
    .from("sns_contents")
    .select("id")
    .eq("account_id", account.id);
  expect(plans).toEqual([]);
  expect(contents).toEqual([]);
});
```

- [ ] **Step 2: Run the test to verify it fails for the right reason**

Run: `npx vitest run supabase/migrations/0020_sns_plans_contents.test.ts`
Expected: FAIL — `relation "public.sns_plans" does not exist`. Stays failing until the Task 5 bundle is applied (and it also requires B's 0015 `ppt_templates` to exist, or the FK creation itself errors in the SQL editor).

- [ ] **Step 3: Write the migration**

`supabase/migrations/0020_sns_plans_contents.sql`:

```sql
-- Operation plan: one per account. template_id points at the SHARED ppt_templates
-- table owned by sub-project B (migration 0015) — kind='sns' rows. Nullable because
-- the web view works without a PPT; set null on template deletion so removing a
-- template in /settings/ppt-templates never blocks or cascades.
create table public.sns_plans (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.sns_accounts(id) on delete cascade,
  template_id uuid references public.ppt_templates(id) on delete set null,
  field_values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.sns_plans enable row level security;

create policy "authenticated users can read sns plans"
  on public.sns_plans for select to authenticated using (true);
create policy "authenticated users can create sns plans"
  on public.sns_plans for insert to authenticated with check (true);
create policy "authenticated users can update sns plans"
  on public.sns_plans for update to authenticated using (true) with check (true);

-- Content calendar rows. media_note is an internal production memo and must
-- NEVER be exposed through the approval RPCs (0021). status_changed_at doubles
-- as the "posted month" for the monthly aggregate (spec decision: no posted_at).
create table public.sns_contents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.sns_accounts(id) on delete cascade,
  title text not null,
  scheduled_on date,
  assignee text,
  status text not null default 'planning'
    check (status in ('planning', 'producing', 'pending_approval', 'approved', 'posted')),
  caption text,
  hashtags text,
  media_note text,
  client_comment text,
  post_url text,
  view_count integer,
  like_count integer,
  comment_count integer,
  status_changed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.sns_contents enable row level security;

create policy "authenticated users can read sns contents"
  on public.sns_contents for select to authenticated using (true);
create policy "authenticated users can create sns contents"
  on public.sns_contents for insert to authenticated with check (true);
create policy "authenticated users can update sns contents"
  on public.sns_contents for update to authenticated using (true) with check (true);
create policy "authenticated users can delete sns contents"
  on public.sns_contents for delete to authenticated using (true);
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0020_sns_plans_contents.sql supabase/migrations/0020_sns_plans_contents.test.ts
git commit -m "feat: add sns_plans and sns_contents tables

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: Migration 0021 — approval RPCs

**Files:**
- Create: `supabase/migrations/0021_sns_approval_rpc.sql`
- Test: `supabase/migrations/0021_sns_approval_rpc.test.ts`

**Interfaces:**
- Consumes: `public.sns_accounts.approval_token` (Task 1), `public.sns_contents` (Task 3).
- Produces:
  - `get_pending_contents(p_token uuid) returns json` — `null` for an unknown token; else `{ company_name, contents: [{ id, title, caption, hashtags, scheduled_on }] }` containing ONLY that account's `status='pending_approval'` rows. **Never returns `media_note`, `view_count`/`like_count`/`comment_count`, or any token value.**
  - `review_sns_content(p_token uuid, p_content_id uuid, p_decision text, p_comment text) returns boolean` — validates `p_decision in ('approve','request_changes')` (raises `INVALID_DECISION` otherwise), verifies the content belongs to the token's account AND is still `pending_approval`; `approve` → `status='approved'`, `request_changes` → `status='producing'` + `client_comment = p_comment`; both set `status_changed_at = now()`. Returns `false` for unknown token, foreign content, or already-processed content (idempotent under double clicks).
  - Both: `security definer`, `set search_path = public`, revoke-from-public **then** grant to anon + authenticated.

- [ ] **Step 1: Write the failing test**

`supabase/migrations/0021_sns_approval_rpc.test.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "vitest";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function makeAccount() {
  const { data, error } = await admin
    .from("sns_accounts")
    .insert({ company_name: "글로우랩", platform: "instagram", handle: "@glowlab" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function makeContent(accountId: string, overrides: Record<string, unknown> = {}) {
  const { data, error } = await admin
    .from("sns_contents")
    .insert({
      account_id: accountId,
      title: "9월 신제품 티저",
      status: "pending_approval",
      caption: "새 세럼이 나왔어요",
      hashtags: "#글로우랩 #신제품",
      scheduled_on: "2026-09-10",
      media_note: "내부 메모 — 절대 노출 금지",
      view_count: 999,
      ...overrides,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

test("get_pending_contents returns only pending rows with only the allowed keys", async () => {
  const account = await makeAccount();
  const pending = await makeContent(account.id);
  await makeContent(account.id, { title: "이미 승인됨", status: "approved" });

  const { data, error } = await anon.rpc("get_pending_contents", {
    p_token: account.approval_token,
  });

  expect(error).toBeNull();
  expect(data.company_name).toBe("글로우랩");
  expect(data.contents).toHaveLength(1);
  expect(data.contents[0]).toEqual({
    id: pending.id,
    title: "9월 신제품 티저",
    caption: "새 세럼이 나왔어요",
    hashtags: "#글로우랩 #신제품",
    scheduled_on: "2026-09-10",
  });
  // Exact key set — media_note, counts, and tokens must never leak.
  expect(Object.keys(data.contents[0]).sort()).toEqual(
    ["caption", "hashtags", "id", "scheduled_on", "title"]
  );
});

test("get_pending_contents returns an empty list (not null) when nothing is pending", async () => {
  const account = await makeAccount();
  const { data, error } = await anon.rpc("get_pending_contents", {
    p_token: account.approval_token,
  });
  expect(error).toBeNull();
  expect(data).toEqual({ company_name: "글로우랩", contents: [] });
});

test("get_pending_contents returns null for an unknown token", async () => {
  const { data, error } = await anon.rpc("get_pending_contents", {
    p_token: "00000000-0000-0000-0000-000000000000",
  });
  expect(error).toBeNull();
  expect(data).toBeNull();
});

test("approve transitions pending_approval -> approved and stamps status_changed_at", async () => {
  const account = await makeAccount();
  const content = await makeContent(account.id);

  const { data, error } = await anon.rpc("review_sns_content", {
    p_token: account.approval_token,
    p_content_id: content.id,
    p_decision: "approve",
    p_comment: "",
  });
  expect(error).toBeNull();
  expect(data).toBe(true);

  const { data: row } = await admin
    .from("sns_contents")
    .select("status, status_changed_at")
    .eq("id", content.id)
    .single();
  expect(row?.status).toBe("approved");
  expect(row?.status_changed_at).not.toBeNull();
});

test("request_changes transitions back to producing and records the comment", async () => {
  const account = await makeAccount();
  const content = await makeContent(account.id);

  const { data } = await anon.rpc("review_sns_content", {
    p_token: account.approval_token,
    p_content_id: content.id,
    p_decision: "request_changes",
    p_comment: "해시태그를 줄여주세요",
  });
  expect(data).toBe(true);

  const { data: row } = await admin
    .from("sns_contents")
    .select("status, client_comment")
    .eq("id", content.id)
    .single();
  expect(row).toEqual({ status: "producing", client_comment: "해시태그를 줄여주세요" });
});

test("a content belonging to a different account is rejected", async () => {
  const accountA = await makeAccount();
  const accountB = await makeAccount();
  const foreign = await makeContent(accountB.id);

  const { data } = await anon.rpc("review_sns_content", {
    p_token: accountA.approval_token,
    p_content_id: foreign.id,
    p_decision: "approve",
    p_comment: "",
  });
  expect(data).toBe(false);

  const { data: row } = await admin
    .from("sns_contents")
    .select("status")
    .eq("id", foreign.id)
    .single();
  expect(row?.status).toBe("pending_approval");
});

test("an already-processed content returns false (idempotent double click)", async () => {
  const account = await makeAccount();
  const content = await makeContent(account.id);

  await anon.rpc("review_sns_content", {
    p_token: account.approval_token,
    p_content_id: content.id,
    p_decision: "approve",
    p_comment: "",
  });
  const second = await anon.rpc("review_sns_content", {
    p_token: account.approval_token,
    p_content_id: content.id,
    p_decision: "approve",
    p_comment: "",
  });
  expect(second.data).toBe(false);
});

test("an invalid decision raises an error", async () => {
  const account = await makeAccount();
  const content = await makeContent(account.id);

  const { error } = await anon.rpc("review_sns_content", {
    p_token: account.approval_token,
    p_content_id: content.id,
    p_decision: "delete_everything",
    p_comment: "",
  });
  expect(error).not.toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails for the right reason**

Run: `npx vitest run supabase/migrations/0021_sns_approval_rpc.test.ts`
Expected: FAIL — `function get_pending_contents(uuid) does not exist` (or the table error if 0018/0020 are not applied). Stays failing until the Task 5 bundle is applied.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0021_sns_approval_rpc.sql`:

```sql
-- Public approval share link (/sns-approval/[token]). Unlike the intake form this
-- is a list-then-write route: reading pending contents and transitioning their
-- status. Scope everything by approval_token; expose only what the client needs.

-- Returns null for an unknown token (page shows 404) and an empty contents array
-- for "nothing pending" (page shows a distinct empty-state message).
create or replace function public.get_pending_contents(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.sns_accounts%rowtype;
  result json;
begin
  select * into v_account
  from public.sns_accounts
  where approval_token = p_token;

  if not found then
    return null;
  end if;

  -- Only id/title/caption/hashtags/scheduled_on. NEVER media_note (internal memo),
  -- NEVER view/like/comment counts, NEVER any token column.
  select json_build_object(
    'company_name', v_account.company_name,
    'contents', coalesce(
      (
        select json_agg(
          json_build_object(
            'id', c.id,
            'title', c.title,
            'caption', c.caption,
            'hashtags', c.hashtags,
            'scheduled_on', c.scheduled_on
          )
          order by c.scheduled_on nulls last, c.created_at
        )
        from public.sns_contents c
        where c.account_id = v_account.id
          and c.status = 'pending_approval'
      ),
      '[]'::json
    )
  ) into result;

  return result;
end;
$$;

revoke execute on function public.get_pending_contents(uuid) from public;
grant execute on function public.get_pending_contents(uuid) to anon, authenticated;

create or replace function public.review_sns_content(
  p_token uuid,
  p_content_id uuid,
  p_decision text,
  p_comment text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_updated integer;
begin
  if p_decision not in ('approve', 'request_changes') then
    raise exception 'INVALID_DECISION';
  end if;

  select id into v_account_id
  from public.sns_accounts
  where approval_token = p_token;

  if v_account_id is null then
    return false;
  end if;

  -- The `status = 'pending_approval'` predicate makes double clicks and stale
  -- tabs idempotent: an already-processed row updates 0 rows and returns false.
  if p_decision = 'approve' then
    update public.sns_contents
       set status = 'approved',
           status_changed_at = now()
     where id = p_content_id
       and account_id = v_account_id
       and status = 'pending_approval';
  else
    update public.sns_contents
       set status = 'producing',
           client_comment = p_comment,
           status_changed_at = now()
     where id = p_content_id
       and account_id = v_account_id
       and status = 'pending_approval';
  end if;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke execute on function public.review_sns_content(uuid, uuid, text, text) from public;
grant execute on function public.review_sns_content(uuid, uuid, text, text) to anon, authenticated;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0021_sns_approval_rpc.sql supabase/migrations/0021_sns_approval_rpc.test.ts
git commit -m "feat: add token-scoped approval RPCs for sns contents

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: SQL bundle for the dashboard SQL editor

**Files:**
- Create: `docs/sql/setup-0018-0021.sql` (generated — do not hand-write)
- Modify: `docs/sql/README.md` (additive: one table row + one regeneration block)

**Interfaces:**
- Consumes: the four migration files from Tasks 1–4.
- Produces: one paste-ready file a human applies in Supabase dashboard → SQL Editor. **This is the only way migrations reach the DB in this repo** (the Supabase CLI is not authenticated).

- [ ] **Step 1: Generate the bundle** (Git Bash / POSIX shell):

```bash
{ for f in supabase/migrations/00{18,19,20,21}_*.sql; do
    echo "-- ============================================"
    echo "-- $(basename $f)"
    echo "-- ============================================"
    cat "$f"; echo ""
  done
} > docs/sql/setup-0018-0021.sql
```

- [ ] **Step 2: Verify the bundle**

Run: `grep -c "revoke execute" docs/sql/setup-0018-0021.sql`
Expected: `4` (two intake RPCs + two approval RPCs — every RPC has its revoke line).

Run: `grep -c "create table" docs/sql/setup-0018-0021.sql`
Expected: `5` (`sns_accounts`, `sns_intake_template`, `sns_intake_responses`, `sns_plans`, `sns_contents`).

- [ ] **Step 3: Update `docs/sql/README.md`** — additive edit only (parallel plans add their own rows; if the table already has a `setup-0015-0017.sql` row, add this row after it). Add to the file table:

```markdown
| [setup-0018-0021.sql](setup-0018-0021.sql) | SNS 운영 (계정, 설문, 콘텐츠, 승인 RPC) | **적용 대기 — setup-0015-0017.sql(ppt_templates) 적용 이후에만 실행** |
```

The ordering warning matters: `0020` has an FK to `ppt_templates` (B's `0015`), so this bundle errors if run before B's bundle.

- [ ] **Step 4: Commit**

```bash
git add docs/sql/setup-0018-0021.sql docs/sql/README.md
git commit -m "docs: add SQL editor bundle for sns migrations 0018-0021

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Hand off to the human** — tell the user: "docs/sql/setup-0018-0021.sql을 Supabase 대시보드 SQL Editor에서 실행해주세요 (setup-0015-0017.sql 이후에). 적용 후 0018~0021 테스트 4개 파일을 개별 실행해 검증합니다." After application, run each of the four migration test files individually (`npx vitest run supabase/migrations/0018_sns_accounts.test.ts`, then 0019, 0020, 0021) and confirm PASS. **Never `npm test`.**

---

## Task 6: AI caption assist — `lib/ai/snsCaptionAssist.ts`

**Files:**
- Create: `lib/ai/snsCaptionAssist.ts`
- Test: `lib/ai/snsCaptionAssist.test.ts`

**Interfaces:**
- Produces:
  - `type CaptionAssistInput = { title: string; scheduledOn: string | null; companyName: string; platform: string }`
  - `type CaptionDraft = { caption: string; hashtags: string }`
  - `generateCaptionDraft(input: CaptionAssistInput): Promise<CaptionDraft>` — throws on API failure or an unparseable response; callers (Task 13's `getCaptionAssist`) catch and return the standard fallback message.
- The model must answer with the caption, then a delimiter line `---`, then one hashtags line. A response missing the delimiter throws `UNEXPECTED_RESPONSE` — the fallback path handles it; never try to "rescue" a malformed response.

- [ ] **Step 1: Write the failing test**

`lib/ai/snsCaptionAssist.test.ts` (the `@google/genai` mock factory — including `ThinkingLevel` — mirrors `lib/ai/preSurveyAssist.test.ts` exactly):

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockGenerateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
  ThinkingLevel: { MINIMAL: "MINIMAL", LOW: "LOW", HIGH: "HIGH" },
}));

import { generateCaptionDraft } from "./snsCaptionAssist";

const INPUT = {
  title: "9월 신제품 세럼 티저",
  scheduledOn: "2026-09-10",
  companyName: "글로우랩",
  platform: "instagram",
};

describe("generateCaptionDraft", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  test("parses caption and hashtags across the --- delimiter", async () => {
    mockGenerateContent.mockResolvedValue({
      text: "9월, 글로우랩의 새 세럼이 찾아옵니다.\n---\n#글로우랩 #신제품 #세럼",
    });

    const result = await generateCaptionDraft(INPUT);
    expect(result).toEqual({
      caption: "9월, 글로우랩의 새 세럼이 찾아옵니다.",
      hashtags: "#글로우랩 #신제품 #세럼",
    });
  });

  test("sends title, company, and platform in the prompt with the fixed model", async () => {
    mockGenerateContent.mockResolvedValue({ text: "캡션\n---\n#태그" });

    await generateCaptionDraft(INPUT);

    const call = mockGenerateContent.mock.calls[0][0];
    expect(call.model).toBe("gemini-3.6-flash");
    expect(call.contents).toContain("9월 신제품 세럼 티저");
    expect(call.contents).toContain("글로우랩");
    expect(call.contents).toContain("instagram");
  });

  test("caps output and keeps thinking minimal", async () => {
    mockGenerateContent.mockResolvedValue({ text: "캡션\n---\n#태그" });

    await generateCaptionDraft(INPUT);

    expect(mockGenerateContent.mock.calls[0][0].config).toEqual(
      expect.objectContaining({
        maxOutputTokens: expect.any(Number),
        thinkingConfig: { thinkingLevel: "MINIMAL" },
      })
    );
  });

  test("omits the schedule line when scheduledOn is null", async () => {
    mockGenerateContent.mockResolvedValue({ text: "캡션\n---\n#태그" });

    await generateCaptionDraft({ ...INPUT, scheduledOn: null });

    expect(mockGenerateContent.mock.calls[0][0].contents).not.toContain("게시 예정일");
  });

  test("throws UNEXPECTED_RESPONSE when the delimiter is missing", async () => {
    mockGenerateContent.mockResolvedValue({ text: "구분선 없는 응답" });
    await expect(generateCaptionDraft(INPUT)).rejects.toThrow("UNEXPECTED_RESPONSE");
  });

  test("throws UNEXPECTED_RESPONSE when the response text is blank", async () => {
    mockGenerateContent.mockResolvedValue({ text: "   " });
    await expect(generateCaptionDraft(INPUT)).rejects.toThrow("UNEXPECTED_RESPONSE");
  });

  test("propagates API errors", async () => {
    mockGenerateContent.mockRejectedValue(new Error("rate limited"));
    await expect(generateCaptionDraft(INPUT)).rejects.toThrow("rate limited");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/ai/snsCaptionAssist.test.ts`
Expected: FAIL — module `./snsCaptionAssist` doesn't exist.

- [ ] **Step 3: Implement**

`lib/ai/snsCaptionAssist.ts`:

```ts
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export type CaptionAssistInput = {
  title: string;
  scheduledOn: string | null;
  companyName: string;
  platform: string;
};

export type CaptionDraft = { caption: string; hashtags: string };

export const CAPTION_ASSIST_MODEL = "gemini-3.6-flash";

// Same rationale as lib/ai/preSurveyAssist.ts: this model always thinks before
// answering and thinking tokens count against maxOutputTokens. MINIMAL is the
// floor (thinkingBudget: 0 is rejected) and anything higher truncates the answer.
const ASSIST_CONFIG = {
  maxOutputTokens: 800,
  thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
};

export async function generateCaptionDraft(input: CaptionAssistInput): Promise<CaptionDraft> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const scheduleLine = input.scheduledOn ? `게시 예정일: ${input.scheduledOn}` : "";

  const response = await ai.models.generateContent({
    model: CAPTION_ASSIST_MODEL,
    contents: `당신은 SNS 대행 운영사의 콘텐츠 문안 작성을 돕는 어시스턴트입니다. 아래 콘텐츠의 캡션과 해시태그 초안을 써주세요.

규칙:
- 먼저 캡션을 2~4문장의 평문으로 쓴다. 머리말, 설명, 마크다운 서식을 쓰지 않는다.
- 그 다음 줄에 정확히 "---" 만 있는 구분선을 쓴다.
- 마지막 줄에 해시태그 5~8개를 공백으로 구분해 쓴다 (각각 #으로 시작).
- 위 세 부분 외에는 아무것도 출력하지 않는다.

업체명: ${input.companyName}
플랫폼: ${input.platform}
콘텐츠 제목: ${input.title}
${scheduleLine}`,
    config: ASSIST_CONFIG,
  });

  const text = response.text?.trim();
  if (!text) throw new Error("UNEXPECTED_RESPONSE");

  const parts = text.split(/\n-{3,}\s*\n/);
  if (parts.length < 2) throw new Error("UNEXPECTED_RESPONSE");

  const caption = parts[0].trim();
  const hashtags = parts[1].trim();
  if (!caption || !hashtags) throw new Error("UNEXPECTED_RESPONSE");

  return { caption, hashtags };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/ai/snsCaptionAssist.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ai/snsCaptionAssist.ts lib/ai/snsCaptionAssist.test.ts
git commit -m "feat: add AI caption and hashtag draft generation for sns contents

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: AI plan assist — `lib/ai/snsPlanAssist.ts`

**Files:**
- Create: `lib/ai/snsPlanAssist.ts`
- Test: `lib/ai/snsPlanAssist.test.ts`

**Interfaces:**
- Produces:
  - `type PlanAssistInput = { placeholder: string; account: { companyName: string; platform: string; handle: string }; intakeAnswers: Record<string, string> }` — `intakeAnswers` is keyed by **question label** (prose the model can read), not question id; the caller (Task 15) does the label mapping.
  - `generatePlanFieldDraft(input: PlanAssistInput): Promise<string>` — throws on failure; callers catch and fall back.

- [ ] **Step 1: Write the failing test**

`lib/ai/snsPlanAssist.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockGenerateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
  ThinkingLevel: { MINIMAL: "MINIMAL", LOW: "LOW", HIGH: "HIGH" },
}));

import { generatePlanFieldDraft } from "./snsPlanAssist";

const INPUT = {
  placeholder: "operation_goal",
  account: { companyName: "글로우랩", platform: "instagram", handle: "@glowlab" },
  intakeAnswers: { "브랜드 톤앤매너를 알려주세요": "차분하고 신뢰감 있는 톤" },
};

describe("generatePlanFieldDraft", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  test("returns the trimmed draft and sends placeholder, account, and intake context", async () => {
    mockGenerateContent.mockResolvedValue({ text: "  월 12회 게시로 팔로워 20% 성장  " });

    const result = await generatePlanFieldDraft(INPUT);

    expect(result).toBe("월 12회 게시로 팔로워 20% 성장");
    const call = mockGenerateContent.mock.calls[0][0];
    expect(call.model).toBe("gemini-3.6-flash");
    expect(call.contents).toContain("operation_goal");
    expect(call.contents).toContain("글로우랩");
    expect(call.contents).toContain("@glowlab");
    expect(call.contents).toContain("차분하고 신뢰감 있는 톤");
  });

  test("renders (없음) when there are no usable intake answers", async () => {
    mockGenerateContent.mockResolvedValue({ text: "초안" });

    await generatePlanFieldDraft({ ...INPUT, intakeAnswers: { q: "   " } });

    expect(mockGenerateContent.mock.calls[0][0].contents).toContain("(없음)");
  });

  test("caps output and keeps thinking minimal", async () => {
    mockGenerateContent.mockResolvedValue({ text: "초안" });

    await generatePlanFieldDraft(INPUT);

    expect(mockGenerateContent.mock.calls[0][0].config).toEqual(
      expect.objectContaining({
        maxOutputTokens: expect.any(Number),
        thinkingConfig: { thinkingLevel: "MINIMAL" },
      })
    );
  });

  test("throws UNEXPECTED_RESPONSE on blank output", async () => {
    mockGenerateContent.mockResolvedValue({ text: "   " });
    await expect(generatePlanFieldDraft(INPUT)).rejects.toThrow("UNEXPECTED_RESPONSE");
  });

  test("propagates API errors", async () => {
    mockGenerateContent.mockRejectedValue(new Error("rate limited"));
    await expect(generatePlanFieldDraft(INPUT)).rejects.toThrow("rate limited");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/ai/snsPlanAssist.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

`lib/ai/snsPlanAssist.ts`:

```ts
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export type PlanAssistInput = {
  placeholder: string;
  account: { companyName: string; platform: string; handle: string };
  intakeAnswers: Record<string, string>;
};

export const PLAN_ASSIST_MODEL = "gemini-3.6-flash";

// Same rationale as lib/ai/preSurveyAssist.ts: MINIMAL thinking or the answer
// gets truncated by thinking tokens eating the output budget.
const ASSIST_CONFIG = {
  maxOutputTokens: 800,
  thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
};

export async function generatePlanFieldDraft(input: PlanAssistInput): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const contextLines = Object.entries(input.intakeAnswers)
    .filter(([, value]) => value.trim().length > 0)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");

  const response = await ai.models.generateContent({
    model: PLAN_ASSIST_MODEL,
    contents: `당신은 SNS 대행 운영사의 운영안 작성을 돕는 어시스턴트입니다. 아래 계정의 운영안에서 "${input.placeholder}" 항목에 들어갈 내용의 초안을 써주세요.

규칙:
- 2~4문장의 평문으로만 작성한다.
- 머리말, 설명, 선택지, 마크다운 서식, 이모지를 쓰지 않는다.
- 항목 내용만 출력한다.

계정 정보:
- 업체명: ${input.account.companyName}
- 플랫폼: ${input.account.platform}
- 핸들: ${input.account.handle}

사전설문 답변:
${contextLines || "(없음)"}`,
    config: ASSIST_CONFIG,
  });

  const draft = response.text?.trim();
  if (!draft) throw new Error("UNEXPECTED_RESPONSE");
  return draft;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/ai/snsPlanAssist.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ai/snsPlanAssist.ts lib/ai/snsPlanAssist.test.ts
git commit -m "feat: add AI plan field draft generation from intake context

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: Pure SNS libs — labels, month grid, monthly summary

**Files:**
- Create: `lib/sns/labels.ts`, Test: `lib/sns/labels.test.ts`
- Create: `lib/sns/calendar.ts`, Test: `lib/sns/calendar.test.ts`
- Create: `lib/sns/monthlySummary.ts`, Test: `lib/sns/monthlySummary.test.ts`

**Interfaces:**
- Produces (used verbatim by Tasks 9, 12, 13, 14 — do not rename):
  - `SNS_CONTENT_STATUSES: readonly ["planning","producing","pending_approval","approved","posted"]`, `type SnsContentStatus`, `STATUS_LABEL: Record<SnsContentStatus, string>`, `STATUS_CLASS: Record<SnsContentStatus, string>`, `PLATFORM_LABEL: Record<string, string>` — all from `lib/sns/labels.ts`.
  - `buildMonthGrid(year: number, month: number): CalendarCell[][]` with `type CalendarCell = { date: string; day: number; inMonth: boolean }` — Sunday-first weeks covering the whole month, `date` as `YYYY-MM-DD`. No external calendar library (spec requirement).
  - `summarizeByMonth(contents: MonthlySummaryInput[]): MonthlySummaryRow[]` with `type MonthlySummaryInput = { status: string; status_changed_at: string | null; view_count: number | null; like_count: number | null; comment_count: number | null }` and `type MonthlySummaryRow = { month: string; postCount: number; viewCount: number; likeCount: number; commentCount: number }` — only `status === "posted"` rows with a non-null `status_changed_at` count; `month` is `YYYY-MM` of `status_changed_at` (spec decision: the transition-to-posted moment IS the posted month); rows sorted newest month first; null counts treated as 0.

- [ ] **Step 1: Write the failing tests**

`lib/sns/labels.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { SNS_CONTENT_STATUSES, STATUS_LABEL, STATUS_CLASS, PLATFORM_LABEL } from "./labels";

describe("sns labels", () => {
  test("statuses match the DB check constraint order", () => {
    expect(SNS_CONTENT_STATUSES).toEqual([
      "planning",
      "producing",
      "pending_approval",
      "approved",
      "posted",
    ]);
  });

  test("every status has a Korean label and a style class", () => {
    for (const s of SNS_CONTENT_STATUSES) {
      expect(STATUS_LABEL[s]).toBeTruthy();
      expect(STATUS_CLASS[s]).toBeTruthy();
    }
  });

  test("every platform has a label", () => {
    expect(Object.keys(PLATFORM_LABEL).sort()).toEqual(
      ["instagram", "other", "tiktok", "youtube"]
    );
  });
});
```

`lib/sns/calendar.ts` test — `lib/sns/calendar.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { buildMonthGrid } from "./calendar";

describe("buildMonthGrid", () => {
  test("September 2026 starts on Tuesday and spans 5 weeks", () => {
    const grid = buildMonthGrid(2026, 9);

    expect(grid).toHaveLength(5);
    for (const week of grid) expect(week).toHaveLength(7);

    // 2026-09-01 is a Tuesday: Sun/Mon of week 1 belong to August.
    expect(grid[0][0]).toEqual({ date: "2026-08-30", day: 30, inMonth: false });
    expect(grid[0][2]).toEqual({ date: "2026-09-01", day: 1, inMonth: true });
    // Last day of September is Wednesday 2026-09-30.
    expect(grid[4][3]).toEqual({ date: "2026-09-30", day: 30, inMonth: true });
    expect(grid[4][4].inMonth).toBe(false);
  });

  test("a month starting on Sunday has no leading filler", () => {
    // 2026-02-01 is a Sunday.
    const grid = buildMonthGrid(2026, 2);
    expect(grid[0][0]).toEqual({ date: "2026-02-01", day: 1, inMonth: true });
  });

  test("dates are zero-padded YYYY-MM-DD", () => {
    const grid = buildMonthGrid(2026, 2);
    expect(grid[0][4].date).toBe("2026-02-05");
  });
});
```

`lib/sns/monthlySummary.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { summarizeByMonth } from "./monthlySummary";

describe("summarizeByMonth", () => {
  test("groups posted rows by the month of status_changed_at, newest first", () => {
    const rows = summarizeByMonth([
      {
        status: "posted",
        status_changed_at: "2026-08-12T09:00:00.000Z",
        view_count: 1000,
        like_count: 50,
        comment_count: 5,
      },
      {
        status: "posted",
        status_changed_at: "2026-08-25T09:00:00.000Z",
        view_count: 2000,
        like_count: 150,
        comment_count: 15,
      },
      {
        status: "posted",
        status_changed_at: "2026-09-01T09:00:00.000Z",
        view_count: 300,
        like_count: 30,
        comment_count: 3,
      },
    ]);

    expect(rows).toEqual([
      { month: "2026-09", postCount: 1, viewCount: 300, likeCount: 30, commentCount: 3 },
      { month: "2026-08", postCount: 2, viewCount: 3000, likeCount: 200, commentCount: 20 },
    ]);
  });

  test("ignores non-posted rows and posted rows without a transition timestamp", () => {
    const rows = summarizeByMonth([
      {
        status: "approved",
        status_changed_at: "2026-08-12T09:00:00.000Z",
        view_count: 999,
        like_count: 9,
        comment_count: 9,
      },
      { status: "posted", status_changed_at: null, view_count: 999, like_count: 9, comment_count: 9 },
    ]);
    expect(rows).toEqual([]);
  });

  test("treats null counts as zero", () => {
    const rows = summarizeByMonth([
      {
        status: "posted",
        status_changed_at: "2026-08-12T09:00:00.000Z",
        view_count: null,
        like_count: null,
        comment_count: null,
      },
    ]);
    expect(rows).toEqual([
      { month: "2026-08", postCount: 1, viewCount: 0, likeCount: 0, commentCount: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/sns/labels.test.ts lib/sns/calendar.test.ts lib/sns/monthlySummary.test.ts`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement**

`lib/sns/labels.ts`:

```ts
// Shared enums/labels for sub-project C. Kept OUTSIDE any "use server" module —
// "use server" files may only export async functions, so constants live here.

export const SNS_CONTENT_STATUSES = [
  "planning",
  "producing",
  "pending_approval",
  "approved",
  "posted",
] as const;

export type SnsContentStatus = (typeof SNS_CONTENT_STATUSES)[number];

export const STATUS_LABEL: Record<SnsContentStatus, string> = {
  planning: "기획",
  producing: "제작",
  pending_approval: "승인대기",
  approved: "승인",
  posted: "게시완료",
};

// Semantic colors kept separate from the accent (design system rule):
// warning = waiting on the client, success = done states.
export const STATUS_CLASS: Record<SnsContentStatus, string> = {
  planning: "text-textMuted",
  producing: "text-text",
  pending_approval: "text-warning",
  approved: "text-success",
  posted: "text-success font-medium",
};

export const PLATFORM_LABEL: Record<string, string> = {
  instagram: "인스타그램",
  youtube: "유튜브",
  tiktok: "틱톡",
  other: "기타",
};
```

`lib/sns/calendar.ts`:

```ts
export type CalendarCell = { date: string; day: number; inMonth: boolean };

function toCell(d: Date, inMonth: boolean): CalendarCell {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = d.getUTCDate();
  return { date: `${y}-${m}-${String(day).padStart(2, "0")}`, day, inMonth };
}

/**
 * Sunday-first month grid, e.g. buildMonthGrid(2026, 9). Uses UTC arithmetic so
 * the grid is identical regardless of the server's timezone. No external lib.
 */
export function buildMonthGrid(year: number, month: number): CalendarCell[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay()); // back up to the preceding Sunday

  const weeks: CalendarCell[][] = [];
  const cursor = new Date(start);

  while (true) {
    const week: CalendarCell[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(toCell(cursor, cursor.getUTCMonth() === month - 1));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
    // Stop once the next week starts after the month has ended.
    if (cursor.getUTCMonth() !== month - 1 || cursor.getUTCFullYear() !== year) break;
  }
  return weeks;
}
```

`lib/sns/monthlySummary.ts`:

```ts
export type MonthlySummaryInput = {
  status: string;
  status_changed_at: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
};

export type MonthlySummaryRow = {
  month: string; // "YYYY-MM"
  postCount: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
};

/**
 * Monthly aggregate computed at read time — no extra table. A content counts
 * toward the month it transitioned to 'posted' (spec decision: status_changed_at
 * stands in for a posted_at column that doesn't exist).
 */
export function summarizeByMonth(contents: MonthlySummaryInput[]): MonthlySummaryRow[] {
  const byMonth = new Map<string, MonthlySummaryRow>();

  for (const c of contents) {
    if (c.status !== "posted" || !c.status_changed_at) continue;
    const month = c.status_changed_at.slice(0, 7);
    const row = byMonth.get(month) ?? {
      month,
      postCount: 0,
      viewCount: 0,
      likeCount: 0,
      commentCount: 0,
    };
    row.postCount += 1;
    row.viewCount += c.view_count ?? 0;
    row.likeCount += c.like_count ?? 0;
    row.commentCount += c.comment_count ?? 0;
    byMonth.set(month, row);
  }

  return [...byMonth.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/sns/labels.test.ts lib/sns/calendar.test.ts lib/sns/monthlySummary.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/sns
git commit -m "feat: add sns status labels, month grid, and monthly summary libs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 9: `/sns` account list + create + sidebar activation

**Files:**
- Create: `app/(dashboard)/sns/actions.ts`, Test: `app/(dashboard)/sns/actions.test.ts`
- Create: `app/(dashboard)/sns/NewSnsAccountForm.tsx`, Test: `app/(dashboard)/sns/NewSnsAccountForm.test.tsx`
- Create: `app/(dashboard)/sns/page.tsx`, Test: `app/(dashboard)/sns/page.test.tsx`
- Modify: `app/(dashboard)/layout.tsx` (one-line additive swap — see Step 7)

**Interfaces:**
- Consumes: `requireRole` (`@/lib/auth/roles`), `createDashboardSupabaseClient` (`@/lib/supabase/dashboard`), `PLATFORM_LABEL` (Task 8).
- Produces:
  - `type CreateSnsAccountInput = { companyName: string; platform: string; handle: string; startsOn?: string; endsOn?: string }`
  - `createSnsAccount(input: CreateSnsAccountInput): Promise<{ error: string } | { success: true; id: string }>` — trims strings, requires companyName/handle, validates platform against the four allowed values, inserts (tokens auto-issued by the DB defaults), returns the new id.
  - `<NewSnsAccountForm />` — client component that calls `createSnsAccount` and `router.push(\`/sns/${id}\`)` on success.

- [ ] **Step 1: Write the failing action test**

`app/(dashboard)/sns/actions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/roles", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/dashboard", () => ({ createDashboardSupabaseClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { createSnsAccount } from "./actions";

function mockInsert(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  (createDashboardSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    from: vi.fn().mockReturnValue({ insert }),
  });
  return insert;
}

describe("createSnsAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireRole as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1",
      role: "staff",
    });
  });

  test("rejects a blank company name", async () => {
    const result = await createSnsAccount({
      companyName: "   ",
      platform: "instagram",
      handle: "@glowlab",
    });
    expect(result).toEqual({ error: "업체명을 입력해주세요." });
  });

  test("rejects a blank handle", async () => {
    const result = await createSnsAccount({
      companyName: "글로우랩",
      platform: "instagram",
      handle: "  ",
    });
    expect(result).toEqual({ error: "계정 핸들을 입력해주세요." });
  });

  test("rejects an unknown platform", async () => {
    const result = await createSnsAccount({
      companyName: "글로우랩",
      platform: "facebook",
      handle: "@glowlab",
    });
    expect(result).toEqual({ error: "플랫폼을 선택해주세요." });
  });

  test("inserts trimmed values and returns the new id", async () => {
    const insert = mockInsert({ data: { id: "acc-1" }, error: null });

    const result = await createSnsAccount({
      companyName: "  글로우랩  ",
      platform: "instagram",
      handle: "  @glowlab  ",
      startsOn: "2026-09-01",
      endsOn: "",
    });

    expect(result).toEqual({ success: true, id: "acc-1" });
    expect(insert).toHaveBeenCalledWith({
      company_name: "글로우랩",
      platform: "instagram",
      handle: "@glowlab",
      starts_on: "2026-09-01",
      ends_on: null,
    });
  });

  test("maps a DB failure to a Korean error", async () => {
    mockInsert({ data: null, error: { message: "boom" } });
    const result = await createSnsAccount({
      companyName: "글로우랩",
      platform: "instagram",
      handle: "@glowlab",
    });
    expect(result).toEqual({ error: "계정 생성에 실패했습니다. 다시 시도해주세요." });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/(dashboard)/sns/actions.test.ts"`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the action**

`app/(dashboard)/sns/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";

const PLATFORMS = ["instagram", "youtube", "tiktok", "other"] as const;

export type CreateSnsAccountInput = {
  companyName: string;
  platform: string;
  handle: string;
  startsOn?: string;
  endsOn?: string;
};

export type CreateSnsAccountResult = { error: string } | { success: true; id: string };

export async function createSnsAccount(
  input: CreateSnsAccountInput
): Promise<CreateSnsAccountResult> {
  await requireRole("staff");

  const companyName = input.companyName.trim();
  const handle = input.handle.trim();
  const startsOn = (input.startsOn ?? "").trim();
  const endsOn = (input.endsOn ?? "").trim();

  if (!companyName) return { error: "업체명을 입력해주세요." };
  if (!handle) return { error: "계정 핸들을 입력해주세요." };
  if (!(PLATFORMS as readonly string[]).includes(input.platform)) {
    return { error: "플랫폼을 선택해주세요." };
  }

  const supabase = await createDashboardSupabaseClient();
  const { data, error } = await supabase
    .from("sns_accounts")
    // intake_token / approval_token are issued by the DB defaults on insert.
    .insert({
      company_name: companyName,
      platform: input.platform,
      handle,
      starts_on: startsOn.length > 0 ? startsOn : null,
      ends_on: endsOn.length > 0 ? endsOn : null,
    })
    .select()
    .single();

  if (error || !data) return { error: "계정 생성에 실패했습니다. 다시 시도해주세요." };

  revalidatePath("/sns");
  return { success: true, id: data.id as string };
}
```

- [ ] **Step 4: Run the action test to verify it passes**

Run: `npx vitest run "app/(dashboard)/sns/actions.test.ts"`
Expected: PASS

- [ ] **Step 5: Write the failing form test, then implement the form**

`app/(dashboard)/sns/NewSnsAccountForm.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock, refresh: vi.fn() }) }));
vi.mock("./actions", () => ({ createSnsAccount: vi.fn() }));

import { createSnsAccount } from "./actions";
import NewSnsAccountForm from "./NewSnsAccountForm";

describe("NewSnsAccountForm", () => {
  test("submits the entered values and navigates to the new account", async () => {
    (createSnsAccount as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      id: "acc-1",
    });

    render(<NewSnsAccountForm />);
    fireEvent.change(screen.getByLabelText("업체명"), { target: { value: "글로우랩" } });
    fireEvent.change(screen.getByLabelText("플랫폼"), { target: { value: "instagram" } });
    fireEvent.change(screen.getByLabelText("계정 핸들"), { target: { value: "@glowlab" } });
    fireEvent.click(screen.getByRole("button", { name: "계정 만들기" }));

    await waitFor(() => {
      expect(createSnsAccount).toHaveBeenCalledWith({
        companyName: "글로우랩",
        platform: "instagram",
        handle: "@glowlab",
        startsOn: "",
        endsOn: "",
      });
      expect(pushMock).toHaveBeenCalledWith("/sns/acc-1");
    });
  });

  test("shows the action's error message", async () => {
    (createSnsAccount as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: "업체명을 입력해주세요.",
    });

    render(<NewSnsAccountForm />);
    fireEvent.click(screen.getByRole("button", { name: "계정 만들기" }));

    await waitFor(() => {
      expect(screen.getByText("업체명을 입력해주세요.")).toBeInTheDocument();
    });
  });
});
```

`app/(dashboard)/sns/NewSnsAccountForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSnsAccount } from "./actions";

export default function NewSnsAccountForm() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [handle, setHandle] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    setPending(true);
    setError(null);
    const result = await createSnsAccount({ companyName, platform, handle, startsOn, endsOn });
    setPending(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.push(`/sns/${result.id}`);
  }

  const inputClass = "rounded-token border border-border bg-surface px-3 py-2 text-text";

  return (
    <div className="flex max-w-md flex-col gap-3 rounded-token border border-border bg-surface p-6">
      <label className="text-sm font-medium text-text" htmlFor="company">업체명</label>
      <input id="company" aria-label="업체명" value={companyName}
        onChange={(e) => setCompanyName(e.target.value)} className={inputClass} />

      <label className="text-sm font-medium text-text" htmlFor="platform">플랫폼</label>
      <select id="platform" aria-label="플랫폼" value={platform}
        onChange={(e) => setPlatform(e.target.value)} className={inputClass}>
        <option value="instagram">인스타그램</option>
        <option value="youtube">유튜브</option>
        <option value="tiktok">틱톡</option>
        <option value="other">기타</option>
      </select>

      <label className="text-sm font-medium text-text" htmlFor="handle">계정 핸들</label>
      <input id="handle" aria-label="계정 핸들" value={handle} placeholder="@brand"
        onChange={(e) => setHandle(e.target.value)} className={inputClass} />

      <label className="text-sm font-medium text-text" htmlFor="startsOn">계약 시작일</label>
      <input id="startsOn" aria-label="계약 시작일" type="date" value={startsOn}
        onChange={(e) => setStartsOn(e.target.value)} className={inputClass} />

      <label className="text-sm font-medium text-text" htmlFor="endsOn">계약 종료일</label>
      <input id="endsOn" aria-label="계약 종료일" type="date" value={endsOn}
        onChange={(e) => setEndsOn(e.target.value)} className={inputClass} />

      <button type="button" onClick={handleSubmit} disabled={pending}
        className="mt-2 self-start rounded-token bg-accent px-4 py-2 font-medium text-onAccent disabled:opacity-60">
        {pending ? "생성 중..." : "계정 만들기"}
      </button>

      {error && <p className="text-sm text-critical">{error}</p>}
    </div>
  );
}
```

Run: `npx vitest run "app/(dashboard)/sns/NewSnsAccountForm.test.tsx"`
Expected: PASS

- [ ] **Step 6: Write the failing page test, then implement the page**

`app/(dashboard)/sns/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/dashboard", () => ({ createDashboardSupabaseClient: vi.fn() }));
vi.mock("./NewSnsAccountForm", () => ({ default: () => <div data-testid="new-account-form" /> }));

import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import SnsAccountsPage from "./page";

function mockAccounts(rows: unknown[]) {
  (createDashboardSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    from: () => ({
      select: () => ({
        order: async () => ({ data: rows, error: null }),
      }),
    }),
  });
}

describe("SnsAccountsPage", () => {
  test("renders account cards with company, platform label, handle, and status", async () => {
    mockAccounts([
      {
        id: "acc-1",
        company_name: "글로우랩",
        platform: "instagram",
        handle: "@glowlab",
        status: "active",
      },
    ]);

    render(await SnsAccountsPage());

    expect(screen.getByText("글로우랩")).toBeInTheDocument();
    expect(screen.getByText(/인스타그램/)).toBeInTheDocument();
    expect(screen.getByText(/@glowlab/)).toBeInTheDocument();
    expect(screen.getByText(/운영중/)).toBeInTheDocument();
  });

  test("shows the empty state when there are no accounts", async () => {
    mockAccounts([]);
    render(await SnsAccountsPage());
    expect(screen.getByText("아직 운영 계정이 없습니다")).toBeInTheDocument();
  });
});
```

`app/(dashboard)/sns/page.tsx`:

```tsx
import Link from "next/link";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { PLATFORM_LABEL } from "@/lib/sns/labels";
import NewSnsAccountForm from "./NewSnsAccountForm";

const ACCOUNT_STATUS_LABEL: Record<string, string> = { active: "운영중", ended: "종료" };

export default async function SnsAccountsPage() {
  const supabase = await createDashboardSupabaseClient();
  const { data: accounts } = await supabase
    .from("sns_accounts")
    .select("id, company_name, platform, handle, status")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text">SNS 운영</h1>
      </div>

      {!accounts || accounts.length === 0 ? (
        <p className="mb-8 text-textMuted">아직 운영 계정이 없습니다</p>
      ) : (
        <ul className="mb-8 flex flex-col gap-3">
          {accounts.map((a) => (
            <li key={a.id}>
              <Link
                href={`/sns/${a.id}`}
                className="block rounded-token border border-border bg-surface p-4"
              >
                <p className="font-semibold text-text">{a.company_name}</p>
                <p className="text-sm text-textMuted">
                  {PLATFORM_LABEL[a.platform] ?? a.platform} · {a.handle} ·{" "}
                  {ACCOUNT_STATUS_LABEL[a.status] ?? a.status}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 text-lg font-bold text-text">새 계정</h2>
      <NewSnsAccountForm />
    </div>
  );
}
```

Run: `npx vitest run "app/(dashboard)/sns/page.test.tsx"`
Expected: PASS

- [ ] **Step 7: Activate the sidebar item** — additive edit to the SHARED `app/(dashboard)/layout.tsx`. Replace exactly this line:

```tsx
          <span className="rounded-token px-3 py-2 text-sm text-textMuted opacity-50">SNS 운영</span>
```

with:

```tsx
          <Link href="/sns" className="rounded-token px-3 py-2 text-sm text-textMuted">SNS 운영</Link>
```

Touch nothing else in that file (parallel plans edit their own lines). If the exact string is not found, re-read the file — a parallel plan may have reformatted — and make the equivalent one-line change by hand.

- [ ] **Step 8: Commit**

```bash
git add "app/(dashboard)/sns/actions.ts" "app/(dashboard)/sns/actions.test.ts" "app/(dashboard)/sns/NewSnsAccountForm.tsx" "app/(dashboard)/sns/NewSnsAccountForm.test.tsx" "app/(dashboard)/sns/page.tsx" "app/(dashboard)/sns/page.test.tsx" "app/(dashboard)/layout.tsx"
git commit -m "feat: add sns account list and creation, activate sidebar entry

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 10: `/settings/sns-intake` — admin intake question editor

Mirror `app/(dashboard)/settings/pre-survey/` exactly — same structure, same rules: the page loads the saved questions **server-side** and passes them as props (a blank-initialized client form would wipe the saved template on save).

**Files:**
- Create: `app/(dashboard)/settings/sns-intake/actions.ts`, Test: `app/(dashboard)/settings/sns-intake/actions.test.ts`
- Create: `app/(dashboard)/settings/sns-intake/SnsIntakeTemplateEditor.tsx`, Test: `app/(dashboard)/settings/sns-intake/SnsIntakeTemplateEditor.test.tsx`
- Create: `app/(dashboard)/settings/sns-intake/page.tsx`
- Modify: `app/(dashboard)/layout.tsx` (one additive line in the admin settings block)

**Interfaces:**
- Consumes: `requireRole("admin")`, `createDashboardSupabaseClient()`, table `sns_intake_template` (Task 2).
- Produces: `type SnsIntakeQuestion = { id: string; label: string }`; `updateSnsIntakeTemplate(questions: SnsIntakeQuestion[]): Promise<{ error: string } | { success: true }>`. The question shape `{ id, label }` is the one flowing through Tasks 11 and 15 — do not add fields.

- [ ] **Step 1: Write the failing action test**

`app/(dashboard)/settings/sns-intake/actions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/roles", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/dashboard", () => ({ createDashboardSupabaseClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { updateSnsIntakeTemplate } from "./actions";

describe("updateSnsIntakeTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireRole as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1",
      role: "admin",
    });
  });

  test("rejects when every question is blank", async () => {
    const result = await updateSnsIntakeTemplate([{ id: "q1", label: "   " }]);
    expect(result).toEqual({ error: "질문을 최소 1개 이상 입력해주세요." });
  });

  test("trims labels, drops blanks, and updates row id=1", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    (createDashboardSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update }),
    });

    const result = await updateSnsIntakeTemplate([
      { id: "q1", label: "  브랜드 톤앤매너를 알려주세요  " },
      { id: "q2", label: "   " },
    ]);

    expect(result).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        questions: [{ id: "q1", label: "브랜드 톤앤매너를 알려주세요" }],
      })
    );
    expect(eq).toHaveBeenCalledWith("id", 1);
  });

  test("maps a DB failure to a Korean error", async () => {
    const eq = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    (createDashboardSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: vi.fn().mockReturnValue({ eq }) }),
    });

    const result = await updateSnsIntakeTemplate([{ id: "q1", label: "질문" }]);
    expect(result).toEqual({ error: "저장에 실패했습니다. 다시 시도해주세요." });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/(dashboard)/settings/sns-intake/actions.test.ts"`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the action**

`app/(dashboard)/settings/sns-intake/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";

export type SnsIntakeQuestion = { id: string; label: string };

export type UpdateTemplateResult = { error: string } | { success: true };

export async function updateSnsIntakeTemplate(
  questions: SnsIntakeQuestion[]
): Promise<UpdateTemplateResult> {
  await requireRole("admin");

  const cleaned = questions
    .map((q) => ({ id: q.id, label: q.label.trim() }))
    .filter((q) => q.label.length > 0);

  if (cleaned.length === 0) {
    return { error: "질문을 최소 1개 이상 입력해주세요." };
  }

  const supabase = await createDashboardSupabaseClient();
  const { error } = await supabase
    .from("sns_intake_template")
    .update({ questions: cleaned, updated_at: new Date().toISOString() })
    .eq("id", 1);

  if (error) return { error: "저장에 실패했습니다. 다시 시도해주세요." };

  revalidatePath("/settings/sns-intake");
  return { success: true } as const;
}
```

- [ ] **Step 4: Run the action test to verify it passes**

Run: `npx vitest run "app/(dashboard)/settings/sns-intake/actions.test.ts"`
Expected: PASS

- [ ] **Step 5: Write the failing editor test, then implement editor and page**

`app/(dashboard)/settings/sns-intake/SnsIntakeTemplateEditor.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("./actions", () => ({ updateSnsIntakeTemplate: vi.fn() }));

import { updateSnsIntakeTemplate } from "./actions";
import SnsIntakeTemplateEditor from "./SnsIntakeTemplateEditor";

describe("SnsIntakeTemplateEditor", () => {
  test("initializes from the saved questions passed as props", () => {
    render(
      <SnsIntakeTemplateEditor
        initialQuestions={[{ id: "q1", label: "브랜드 톤앤매너를 알려주세요" }]}
      />
    );
    expect(screen.getByDisplayValue("브랜드 톤앤매너를 알려주세요")).toBeInTheDocument();
  });

  test("saves the current question list", async () => {
    (updateSnsIntakeTemplate as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    });

    render(<SnsIntakeTemplateEditor initialQuestions={[{ id: "q1", label: "기존 질문" }]} />);
    fireEvent.change(screen.getByDisplayValue("기존 질문"), {
      target: { value: "수정된 질문" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(updateSnsIntakeTemplate).toHaveBeenCalledWith([{ id: "q1", label: "수정된 질문" }]);
      expect(screen.getByText("저장되었습니다.")).toBeInTheDocument();
    });
  });

  test("shows the action's error message", async () => {
    (updateSnsIntakeTemplate as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: "질문을 최소 1개 이상 입력해주세요.",
    });

    render(<SnsIntakeTemplateEditor initialQuestions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(screen.getByText("질문을 최소 1개 이상 입력해주세요.")).toBeInTheDocument();
    });
  });
});
```

`app/(dashboard)/settings/sns-intake/SnsIntakeTemplateEditor.tsx` (mirror of `PreSurveyTemplateEditor.tsx`):

```tsx
"use client";

import { useState } from "react";
import { updateSnsIntakeTemplate, type SnsIntakeQuestion } from "./actions";

let idCounter = 0;
function newQuestionId() {
  idCounter += 1;
  return `q-${Date.now()}-${idCounter}`;
}

export default function SnsIntakeTemplateEditor({
  initialQuestions,
}: {
  initialQuestions: SnsIntakeQuestion[];
}) {
  const [questions, setQuestions] = useState<SnsIntakeQuestion[]>(
    initialQuestions.length > 0 ? initialQuestions : [{ id: newQuestionId(), label: "" }]
  );
  const [status, setStatus] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    const result = await updateSnsIntakeTemplate(questions);
    setSaving(false);
    setStatus(
      "error" in result
        ? { kind: "error", message: result.error }
        : { kind: "ok", message: "저장되었습니다." }
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex flex-col gap-3">
        {questions.map((q, i) => (
          <div key={q.id} className="flex gap-2">
            <input
              value={q.label}
              aria-label={`질문 ${i + 1}`}
              onChange={(e) => {
                const next = [...questions];
                next[i] = { ...next[i], label: e.target.value };
                setQuestions(next);
              }}
              className="flex-1 rounded-token border border-border bg-surface px-3 py-2 text-text"
              placeholder="질문 내용"
            />
            <button
              type="button"
              onClick={() => setQuestions(questions.filter((_, idx) => idx !== i))}
              className="rounded-token border border-border px-3 py-2 text-textMuted"
            >
              삭제
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setQuestions([...questions, { id: newQuestionId(), label: "" }])}
          className="rounded-token border border-border px-4 py-2 text-text"
        >
          질문 추가
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-token bg-accent px-4 py-2 font-medium text-onAccent disabled:opacity-60"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>

      {status && (
        <p className={`mt-3 text-sm ${status.kind === "error" ? "text-critical" : "text-text"}`}>
          {status.message}
        </p>
      )}
    </div>
  );
}
```

`app/(dashboard)/settings/sns-intake/page.tsx` (server-loads saved questions → props):

```tsx
import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import SnsIntakeTemplateEditor from "./SnsIntakeTemplateEditor";
import type { SnsIntakeQuestion } from "./actions";

export default async function SnsIntakeSettingsPage() {
  await requireRole("admin");

  const supabase = await createDashboardSupabaseClient();
  const { data } = await supabase
    .from("sns_intake_template")
    .select("questions")
    .eq("id", 1)
    .single();

  const questions = (data?.questions ?? []) as SnsIntakeQuestion[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-text">SNS 설문틀 설정</h1>
      <p className="mb-8 text-textMuted">
        모든 SNS 운영 계정의 자료요청·사전체크 설문에 공통으로 쓰이는 질문 목록입니다.
      </p>
      <SnsIntakeTemplateEditor initialQuestions={questions} />
    </div>
  );
}
```

Run: `npx vitest run "app/(dashboard)/settings/sns-intake/SnsIntakeTemplateEditor.test.tsx"`
Expected: PASS

- [ ] **Step 6: Add the settings sidebar link** — additive edit to `app/(dashboard)/layout.tsx`, inside the existing `{profile.role === "admin" && (...)}` block, directly after the `사전조사 질문틀` Link (add a new line; change nothing else):

```tsx
            <Link href="/settings/sns-intake" className="rounded-token px-3 py-2 text-sm text-textMuted">
              SNS 설문틀
            </Link>
```

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/settings/sns-intake" "app/(dashboard)/layout.tsx"
git commit -m "feat: add admin editor for the sns intake question template

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 11: Public intake form — `/sns-intake/[token]`

Mirrors `/pre-survey/[token]` (public route → `createServerSupabaseClient` → RPC only), with two differences: **no AI assist on this form**, and the form **prefills from prior answers** because resubmit overwrites (Task 2's RPC returns them).

**Files:**
- Create: `app/sns-intake/[token]/actions.ts`, Test: `app/sns-intake/[token]/actions.test.ts`
- Create: `app/sns-intake/[token]/SnsIntakeForm.tsx`, Test: `app/sns-intake/[token]/SnsIntakeForm.test.tsx`
- Create: `app/sns-intake/[token]/page.tsx`

**Interfaces:**
- Consumes: `createServerSupabaseClient()` (`@/lib/supabase/server`), RPCs `get_sns_intake_context` / `submit_sns_intake` (Task 2).
- Produces:
  - `submitSnsIntake(token: string, answers: Record<string, string>): Promise<{ error: string } | { success: true }>`
  - `<SnsIntakeForm token questions initialAnswers alreadySubmitted />` with `questions: { id: string; label: string }[]`, `initialAnswers: Record<string, string>`, `alreadySubmitted: boolean`.

- [ ] **Step 1: Write the failing action test**

`app/sns-intake/[token]/actions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { submitSnsIntake } from "./actions";

describe("submitSnsIntake", () => {
  beforeEach(() => vi.clearAllMocks());

  test("calls the RPC and returns success when it returns true", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ rpc });

    const result = await submitSnsIntake("tok", { q1: "차분한 톤" });

    expect(result).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("submit_sns_intake", {
      p_token: "tok",
      p_answers: { q1: "차분한 톤" },
    });
  });

  test("returns an error when the RPC returns false (unknown token)", async () => {
    (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    });

    const result = await submitSnsIntake("bad", {});
    expect(result).toEqual({ error: "제출에 실패했습니다. 링크가 유효한지 확인해주세요." });
  });

  test("re-validates input at the action level: non-string answers are rejected", async () => {
    const rpc = vi.fn();
    (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ rpc });

    const result = await submitSnsIntake("tok", {
      q1: { nested: "object" },
    } as unknown as Record<string, string>);

    expect(result).toEqual({ error: "제출에 실패했습니다. 링크가 유효한지 확인해주세요." });
    expect(rpc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/sns-intake/[token]/actions.test.ts"`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the action**

`app/sns-intake/[token]/actions.ts`:

```ts
"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SubmitIntakeResult = { error: string } | { success: true };

const SUBMIT_FAILED = "제출에 실패했습니다. 링크가 유효한지 확인해주세요.";

export async function submitSnsIntake(
  token: string,
  answers: Record<string, string>
): Promise<SubmitIntakeResult> {
  // Reachable from the unauthenticated public route — re-validate the payload
  // shape here even though the RPC scopes everything by token.
  if (
    typeof answers !== "object" ||
    answers === null ||
    Array.isArray(answers) ||
    Object.values(answers).some((v) => typeof v !== "string")
  ) {
    return { error: SUBMIT_FAILED };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("submit_sns_intake", {
    p_token: token,
    p_answers: answers,
  });

  if (error || data !== true) return { error: SUBMIT_FAILED };

  return { success: true } as const;
}
```

- [ ] **Step 4: Run the action test to verify it passes**

Run: `npx vitest run "app/sns-intake/[token]/actions.test.ts"`
Expected: PASS

- [ ] **Step 5: Write the failing form test, then implement form and page**

`app/sns-intake/[token]/SnsIntakeForm.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("./actions", () => ({ submitSnsIntake: vi.fn() }));

import { submitSnsIntake } from "./actions";
import SnsIntakeForm from "./SnsIntakeForm";

const questions = [{ id: "q1", label: "브랜드 톤앤매너를 알려주세요" }];

describe("SnsIntakeForm", () => {
  test("prefills fields from prior answers and warns about overwriting", () => {
    render(
      <SnsIntakeForm
        token="tok"
        questions={questions}
        initialAnswers={{ q1: "차분한 톤" }}
        alreadySubmitted={true}
      />
    );

    expect(screen.getByLabelText("브랜드 톤앤매너를 알려주세요")).toHaveValue("차분한 톤");
    expect(
      screen.getByText("이미 제출된 설문입니다. 다시 제출하면 이전 답변을 덮어씁니다.")
    ).toBeInTheDocument();
  });

  test("submits the answers", async () => {
    (submitSnsIntake as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    render(
      <SnsIntakeForm token="tok" questions={questions} initialAnswers={{}} alreadySubmitted={false} />
    );
    fireEvent.change(screen.getByLabelText("브랜드 톤앤매너를 알려주세요"), {
      target: { value: "밝고 위트있는 톤" },
    });
    fireEvent.click(screen.getByRole("button", { name: "제출" }));

    await waitFor(() => {
      expect(submitSnsIntake).toHaveBeenCalledWith("tok", { q1: "밝고 위트있는 톤" });
      expect(screen.getByText("제출되었습니다. 감사합니다.")).toBeInTheDocument();
    });
  });

  test("blocks submission while a required answer is blank", async () => {
    render(
      <SnsIntakeForm token="tok" questions={questions} initialAnswers={{}} alreadySubmitted={false} />
    );
    fireEvent.click(screen.getByRole("button", { name: "제출" }));

    await waitFor(() => {
      expect(screen.getByText("모든 질문에 답변해주세요.")).toBeInTheDocument();
    });
    expect(submitSnsIntake).not.toHaveBeenCalled();
  });

  test("shows the action's error message", async () => {
    (submitSnsIntake as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: "제출에 실패했습니다. 링크가 유효한지 확인해주세요.",
    });

    render(
      <SnsIntakeForm
        token="tok"
        questions={questions}
        initialAnswers={{ q1: "답변" }}
        alreadySubmitted={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "제출" }));

    await waitFor(() => {
      expect(
        screen.getByText("제출에 실패했습니다. 링크가 유효한지 확인해주세요.")
      ).toBeInTheDocument();
    });
  });
});
```

`app/sns-intake/[token]/SnsIntakeForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { submitSnsIntake } from "./actions";

type Question = { id: string; label: string };

export default function SnsIntakeForm({
  token,
  questions,
  initialAnswers,
  alreadySubmitted,
}: {
  token: string;
  questions: Question[];
  initialAnswers: Record<string, string>;
  alreadySubmitted: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    // 필수항목 미입력 시 제출 차단 (spec: 에러 처리 및 검증).
    const missing = questions.some((q) => (answers[q.id] ?? "").trim().length === 0);
    if (missing) {
      setSubmitError("모든 질문에 답변해주세요.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    const result = await submitSnsIntake(token, answers);
    setSubmitting(false);

    if ("error" in result) {
      setSubmitError(result.error);
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return <p className="text-text">제출되었습니다. 감사합니다.</p>;
  }

  if (questions.length === 0) {
    return <p className="text-textMuted">아직 준비된 질문이 없습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {alreadySubmitted && (
        <p className="rounded-token border border-border bg-surface2 px-3 py-2 text-sm text-warning">
          이미 제출된 설문입니다. 다시 제출하면 이전 답변을 덮어씁니다.
        </p>
      )}

      {questions.map((q) => (
        <div key={q.id} className="flex flex-col gap-2">
          <label htmlFor={q.id} className="text-sm font-medium text-text">
            {q.label}
          </label>
          <textarea
            id={q.id}
            aria-label={q.label}
            value={answers[q.id] ?? ""}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
            className="rounded-token border border-border bg-surface px-3 py-2 text-text"
            rows={3}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="self-start rounded-token bg-accent px-4 py-2 font-medium text-onAccent disabled:opacity-60"
      >
        {submitting ? "제출 중..." : "제출"}
      </button>

      {submitError && <p className="text-sm text-critical">{submitError}</p>}
    </div>
  );
}
```

`app/sns-intake/[token]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import SnsIntakeForm from "./SnsIntakeForm";

type IntakeContext = {
  account_id: string;
  company_name: string;
  platform: string;
  handle: string;
  questions: { id: string; label: string }[];
  submitted_at: string | null;
  answers: Record<string, string> | null;
};

export default async function PublicSnsIntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc("get_sns_intake_context", { p_token: token });

  if (!data) notFound();

  const context = data as IntakeContext;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-1 text-2xl font-bold text-text">{context.company_name} 자료요청 설문</h1>
      <p className="mb-8 text-textMuted">
        {context.handle} · SNS 운영 시작 전 확인이 필요한 내용입니다.
      </p>
      <SnsIntakeForm
        token={token}
        questions={context.questions ?? []}
        initialAnswers={context.answers ?? {}}
        alreadySubmitted={context.submitted_at !== null}
      />
    </main>
  );
}
```

Run: `npx vitest run "app/sns-intake/[token]/SnsIntakeForm.test.tsx"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/sns-intake
git commit -m "feat: add public sns intake form with prefill on resubmit

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 12: Public approval page — `/sns-approval/[token]`

This is the second-ever public route of the "shared list view + state-transition write" kind (the first is `/applicants/[token]`). Mirror that route's **prop-injection pattern**: the page injects the token-scoped action into the client component; the component never imports an action itself, no action accepts an actor, and the decision value is validated in the action AND the RPC.

**Files:**
- Create: `app/sns-approval/[token]/actions.ts`, Test: `app/sns-approval/[token]/actions.test.ts`
- Create: `app/sns-approval/[token]/ApprovalControls.tsx`, Test: `app/sns-approval/[token]/ApprovalControls.test.tsx`
- Create: `app/sns-approval/[token]/page.tsx`, Test: `app/sns-approval/[token]/page.test.tsx`

**Interfaces:**
- Consumes: `createServerSupabaseClient()`, RPCs `get_pending_contents` / `review_sns_content` (Task 4).
- Produces:
  - `type ReviewResult = { error: string } | { success: true }`
  - `reviewSnsContentAsClient(token: string, contentId: string, decision: string, comment: string): Promise<ReviewResult>` — the ONLY exported function; validates `decision` before touching the DB.
  - `<ApprovalControls token contentId onReview />` where `onReview: (token: string, contentId: string, decision: string, comment: string) => Promise<ReviewResult>`.

- [ ] **Step 1: Write the failing action test**

`app/sns-approval/[token]/actions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { reviewSnsContentAsClient } from "./actions";

describe("reviewSnsContentAsClient", () => {
  beforeEach(() => vi.clearAllMocks());

  test("re-validates the decision at the action level before calling the RPC", async () => {
    const rpc = vi.fn();
    (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ rpc });

    const result = await reviewSnsContentAsClient("tok", "c1", "delete_everything", "");

    expect(result).toEqual({ error: "알 수 없는 요청입니다." });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("approve calls the RPC with the approve decision", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ rpc });

    const result = await reviewSnsContentAsClient("tok", "c1", "approve", "");

    expect(result).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("review_sns_content", {
      p_token: "tok",
      p_content_id: "c1",
      p_decision: "approve",
      p_comment: "",
    });
  });

  test("request_changes passes the trimmed comment through", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ rpc });

    await reviewSnsContentAsClient("tok", "c1", "request_changes", "  해시태그를 줄여주세요  ");

    expect(rpc).toHaveBeenCalledWith("review_sns_content", {
      p_token: "tok",
      p_content_id: "c1",
      p_decision: "request_changes",
      p_comment: "해시태그를 줄여주세요",
    });
  });

  test("maps an RPC false (already processed / foreign content) to a Korean error", async () => {
    (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    });

    const result = await reviewSnsContentAsClient("tok", "c1", "approve", "");
    expect(result).toEqual({
      error: "처리에 실패했습니다. 이미 처리되었거나 링크가 유효하지 않습니다.",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/sns-approval/[token]/actions.test.ts"`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the action**

`app/sns-approval/[token]/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ReviewResult = { error: string } | { success: true };

/**
 * The client-company side of the approval flow (/sns-approval/[token], no login).
 *
 * Every export of a "use server" module is a callable endpoint, so this action
 * takes NO actor parameter — trust comes only from the approval_token, and the
 * decision is a closed two-value enum validated here AND inside the RPC
 * (STATUS.md rule: public-route actions re-validate even when the RPC does).
 */
export async function reviewSnsContentAsClient(
  token: string,
  contentId: string,
  decision: string,
  comment: string
): Promise<ReviewResult> {
  if (decision !== "approve" && decision !== "request_changes") {
    return { error: "알 수 없는 요청입니다." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("review_sns_content", {
    p_token: token,
    p_content_id: contentId,
    p_decision: decision,
    p_comment: comment.trim(),
  });

  if (error || data !== true) {
    return { error: "처리에 실패했습니다. 이미 처리되었거나 링크가 유효하지 않습니다." };
  }

  revalidatePath(`/sns-approval/${token}`);
  return { success: true } as const;
}
```

- [ ] **Step 4: Run the action test to verify it passes**

Run: `npx vitest run "app/sns-approval/[token]/actions.test.ts"`
Expected: PASS

- [ ] **Step 5: Write the failing controls test, then implement the component**

`app/sns-approval/[token]/ApprovalControls.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import ApprovalControls from "./ApprovalControls";

describe("ApprovalControls", () => {
  test("approve calls the injected action and refreshes", async () => {
    const onReview = vi.fn().mockResolvedValue({ success: true });
    render(<ApprovalControls token="tok" contentId="c1" onReview={onReview} />);

    fireEvent.click(screen.getByRole("button", { name: "승인" }));

    await waitFor(() => {
      expect(onReview).toHaveBeenCalledWith("tok", "c1", "approve", "");
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  test("request_changes sends the typed comment", async () => {
    const onReview = vi.fn().mockResolvedValue({ success: true });
    render(<ApprovalControls token="tok" contentId="c1" onReview={onReview} />);

    fireEvent.change(screen.getByLabelText("수정요청 코멘트"), {
      target: { value: "해시태그를 줄여주세요" },
    });
    fireEvent.click(screen.getByRole("button", { name: "수정요청" }));

    await waitFor(() => {
      expect(onReview).toHaveBeenCalledWith(
        "tok",
        "c1",
        "request_changes",
        "해시태그를 줄여주세요"
      );
    });
  });

  test("shows the action's error message", async () => {
    const onReview = vi.fn().mockResolvedValue({
      error: "처리에 실패했습니다. 이미 처리되었거나 링크가 유효하지 않습니다.",
    });
    render(<ApprovalControls token="tok" contentId="c1" onReview={onReview} />);

    fireEvent.click(screen.getByRole("button", { name: "승인" }));

    await waitFor(() => {
      expect(
        screen.getByText("처리에 실패했습니다. 이미 처리되었거나 링크가 유효하지 않습니다.")
      ).toBeInTheDocument();
    });
  });
});
```

`app/sns-approval/[token]/ApprovalControls.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReviewResult } from "./actions";

export default function ApprovalControls({
  token,
  contentId,
  onReview,
}: {
  token: string;
  contentId: string;
  // Injected by the page that mounts this component, rather than imported
  // directly — mirrors SelectionControls in app/applicants/[token]. This
  // component never chooses the actor; the decision strings are the only
  // values it can send and the action re-validates them.
  onReview: (
    token: string,
    contentId: string,
    decision: string,
    comment: string
  ) => Promise<ReviewResult>;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review(decision: "approve" | "request_changes") {
    setPending(true);
    setError(null);
    const result = await onReview(token, contentId, decision, comment);
    setPending(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    // 처리된 콘텐츠는 재조회 시 목록에서 자연히 빠진다 (멱등).
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`comment-${contentId}`} className="text-sm text-textMuted">
        수정요청 코멘트
      </label>
      <textarea
        id={`comment-${contentId}`}
        aria-label="수정요청 코멘트"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        className="rounded-token border border-border bg-surface px-3 py-2 text-text"
        placeholder="수정이 필요하면 내용을 적어주세요"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => review("approve")}
          disabled={pending}
          className="rounded-token bg-accent px-4 py-2 text-sm font-medium text-onAccent disabled:opacity-50"
        >
          승인
        </button>
        <button
          type="button"
          onClick={() => review("request_changes")}
          disabled={pending}
          className="rounded-token border border-border px-4 py-2 text-sm text-text disabled:opacity-50"
        >
          수정요청
        </button>
      </div>
      {error && <p className="text-sm text-critical">{error}</p>}
    </div>
  );
}
```

Run: `npx vitest run "app/sns-approval/[token]/ApprovalControls.test.tsx"`
Expected: PASS

- [ ] **Step 6: Write the failing page test, then implement the page**

`app/sns-approval/[token]/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("./actions", () => ({ reviewSnsContentAsClient: vi.fn() }));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import SnsApprovalPage from "./page";

function mockRpc(data: unknown) {
  (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    rpc: vi.fn().mockResolvedValue({ data, error: null }),
  });
}

describe("SnsApprovalPage", () => {
  test("renders pending contents with caption, hashtags, and schedule", async () => {
    mockRpc({
      company_name: "글로우랩",
      contents: [
        {
          id: "c1",
          title: "9월 신제품 티저",
          caption: "새 세럼이 나왔어요",
          hashtags: "#글로우랩 #신제품",
          scheduled_on: "2026-09-10",
        },
      ],
    });

    render(await SnsApprovalPage({ params: Promise.resolve({ token: "tok" }) }));

    expect(screen.getByText("9월 신제품 티저")).toBeInTheDocument();
    expect(screen.getByText("새 세럼이 나왔어요")).toBeInTheDocument();
    expect(screen.getByText("#글로우랩 #신제품")).toBeInTheDocument();
    expect(screen.getByText(/2026-09-10/)).toBeInTheDocument();
  });

  test("shows the distinct empty-state message when nothing is pending", async () => {
    mockRpc({ company_name: "글로우랩", contents: [] });

    render(await SnsApprovalPage({ params: Promise.resolve({ token: "tok" }) }));

    expect(screen.getByText("지금 승인 대기 중인 콘텐츠가 없습니다.")).toBeInTheDocument();
  });

  test("calls notFound for an unknown token", async () => {
    mockRpc(null);

    await expect(SnsApprovalPage({ params: Promise.resolve({ token: "bad" }) })).rejects.toThrow(
      "NOT_FOUND"
    );
  });
});
```

`app/sns-approval/[token]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import ApprovalControls from "./ApprovalControls";
import { reviewSnsContentAsClient } from "./actions";

type PendingContent = {
  id: string;
  title: string;
  caption: string | null;
  hashtags: string | null;
  scheduled_on: string | null;
};

type ApprovalContext = { company_name: string; contents: PendingContent[] };

export default async function SnsApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc("get_pending_contents", { p_token: token });

  // 잘못된 토큰(404)과 "처리할 항목 없음"(아래 빈 상태 문구)을 구분한다.
  if (!data) notFound();

  const context = data as ApprovalContext;
  const contents = context.contents ?? [];

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-1 text-2xl font-bold text-text">{context.company_name} 콘텐츠 승인</h1>
      <p className="mb-8 text-textMuted">승인 대기 중인 콘텐츠를 확인하고 승인 또는 수정요청해주세요.</p>

      {contents.length === 0 ? (
        <p className="text-textMuted">지금 승인 대기 중인 콘텐츠가 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {contents.map((c) => (
            <li key={c.id} className="rounded-token border border-border bg-surface p-6">
              <p className="font-semibold text-text">{c.title}</p>
              {c.scheduled_on && (
                <p className="mt-1 text-sm text-textMuted">게시 예정일: {c.scheduled_on}</p>
              )}
              {c.caption && <p className="mt-3 whitespace-pre-wrap text-text">{c.caption}</p>}
              {c.hashtags && <p className="mt-2 text-sm text-textMuted">{c.hashtags}</p>}
              <div className="mt-4">
                <ApprovalControls token={token} contentId={c.id} onReview={reviewSnsContentAsClient} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

Run: `npx vitest run "app/sns-approval/[token]/page.test.tsx"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/sns-approval
git commit -m "feat: add public client approval page for pending sns contents

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 13: `/sns/[id]` server actions — content CRUD, status, performance, caption assist

**Files:**
- Create: `app/(dashboard)/sns/[id]/actions.ts`
- Test: `app/(dashboard)/sns/[id]/actions.test.ts`

**Interfaces:**
- Consumes: `requireRole`, `createDashboardSupabaseClient`, `SNS_CONTENT_STATUSES` (Task 8), `generateCaptionDraft` + `CaptionDraft` (Task 6).
- Produces (Task 14's components call these exact names):
  - `type SnsContent = { id: string; account_id: string; title: string; scheduled_on: string | null; assignee: string | null; status: string; caption: string | null; hashtags: string | null; media_note: string | null; client_comment: string | null; post_url: string | null; view_count: number | null; like_count: number | null; comment_count: number | null; status_changed_at: string | null; created_at: string }`
  - `type SnsContentInput = { title: string; scheduledOn?: string; assignee?: string; caption?: string; hashtags?: string; mediaNote?: string }`
  - `type ActionResult = { error: string } | { success: true }`
  - `createSnsContent(accountId: string, input: SnsContentInput): Promise<ActionResult>`
  - `updateSnsContent(accountId: string, contentId: string, input: SnsContentInput): Promise<ActionResult>`
  - `updateSnsContentStatus(accountId: string, contentId: string, status: string): Promise<ActionResult>` — enum re-validation in the action (spec: 에러 처리 및 검증); stamps `status_changed_at`.
  - `deleteSnsContent(accountId: string, contentId: string): Promise<ActionResult>`
  - `savePerformance(accountId: string, contentId: string, input: { postUrl?: string; viewCount?: number; likeCount?: number; commentCount?: number }): Promise<ActionResult>` — rejects negatives/non-integers; the UPDATE carries `.eq("status", "posted")` so non-posted contents can never receive metrics even via a forged call.
  - `getCaptionAssist(input: { title: string; scheduledOn?: string; companyName: string; platform: string }): Promise<{ draft: CaptionDraft } | { error: string }>`

- [ ] **Step 1: Write the failing test**

`app/(dashboard)/sns/[id]/actions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/roles", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/dashboard", () => ({ createDashboardSupabaseClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ai/snsCaptionAssist", () => ({ generateCaptionDraft: vi.fn() }));

import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { generateCaptionDraft } from "@/lib/ai/snsCaptionAssist";
import {
  createSnsContent,
  updateSnsContent,
  updateSnsContentStatus,
  deleteSnsContent,
  savePerformance,
  getCaptionAssist,
} from "./actions";

type Chain = {
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};

// Every write in the implementation ends with .select() (and .single() for
// inserts), so the chain resolves there and we can assert the row scoping.
function mockChain(result: { data: unknown; error: unknown }): Chain {
  const chain = {} as Chain;
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockResolvedValue(result);
  chain.single = vi.fn().mockResolvedValue(result);
  (chain.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
    const p = Promise.resolve(result) as Promise<unknown> & { single: () => Promise<unknown> };
    p.single = () => Promise.resolve(result);
    return p;
  });
  (createDashboardSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    from: vi.fn().mockReturnValue(chain),
  });
  return chain;
}

describe("sns content actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireRole as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1",
      role: "staff",
    });
  });

  test("createSnsContent requires a title", async () => {
    const result = await createSnsContent("acc-1", { title: "   " });
    expect(result).toEqual({ error: "콘텐츠 제목을 입력해주세요." });
  });

  test("createSnsContent inserts snake_case columns", async () => {
    const chain = mockChain({ data: { id: "c1" }, error: null });

    const result = await createSnsContent("acc-1", {
      title: "  9월 신제품 티저  ",
      scheduledOn: "2026-09-10",
      assignee: "김담당",
      caption: "캡션",
      hashtags: "#태그",
      mediaNote: "내부 메모",
    });

    expect(result).toEqual({ success: true });
    expect(chain.insert).toHaveBeenCalledWith({
      account_id: "acc-1",
      title: "9월 신제품 티저",
      scheduled_on: "2026-09-10",
      assignee: "김담당",
      caption: "캡션",
      hashtags: "#태그",
      media_note: "내부 메모",
    });
  });

  test("updateSnsContent scopes the update by id AND account_id", async () => {
    const chain = mockChain({ data: [{ id: "c1" }], error: null });

    const result = await updateSnsContent("acc-1", "c1", { title: "수정된 제목" });

    expect(result).toEqual({ success: true });
    expect(chain.eq).toHaveBeenCalledWith("id", "c1");
    expect(chain.eq).toHaveBeenCalledWith("account_id", "acc-1");
  });

  test("updateSnsContentStatus rejects a value outside the enum without touching the DB", async () => {
    const result = await updateSnsContentStatus("acc-1", "c1", "published");
    expect(result).toEqual({ error: "알 수 없는 상태입니다." });
    expect(createDashboardSupabaseClient).not.toHaveBeenCalled();
  });

  test("updateSnsContentStatus stamps status_changed_at", async () => {
    const chain = mockChain({ data: [{ id: "c1" }], error: null });

    const result = await updateSnsContentStatus("acc-1", "c1", "pending_approval");

    expect(result).toEqual({ success: true });
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending_approval",
        status_changed_at: expect.any(String),
      })
    );
  });

  test("updateSnsContentStatus reports when no row matched", async () => {
    mockChain({ data: [], error: null });
    const result = await updateSnsContentStatus("acc-1", "c1", "approved");
    expect(result).toEqual({ error: "처리에 실패했습니다. 다시 시도해주세요." });
  });

  test("deleteSnsContent scopes by id AND account_id", async () => {
    const chain = mockChain({ data: [{ id: "c1" }], error: null });

    const result = await deleteSnsContent("acc-1", "c1");

    expect(result).toEqual({ success: true });
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith("id", "c1");
    expect(chain.eq).toHaveBeenCalledWith("account_id", "acc-1");
  });

  test("savePerformance rejects negative counts", async () => {
    const result = await savePerformance("acc-1", "c1", { viewCount: -5 });
    expect(result).toEqual({ error: "성과 수치는 0 이상의 정수로 입력해주세요." });
  });

  test("savePerformance rejects non-integer counts", async () => {
    const result = await savePerformance("acc-1", "c1", { likeCount: 3.5 });
    expect(result).toEqual({ error: "성과 수치는 0 이상의 정수로 입력해주세요." });
  });

  test("savePerformance only updates rows still in posted status", async () => {
    const chain = mockChain({ data: [{ id: "c1" }], error: null });

    const result = await savePerformance("acc-1", "c1", {
      postUrl: "https://instagram.com/p/abc",
      viewCount: 1200,
      likeCount: 80,
      commentCount: 6,
    });

    expect(result).toEqual({ success: true });
    expect(chain.update).toHaveBeenCalledWith({
      post_url: "https://instagram.com/p/abc",
      view_count: 1200,
      like_count: 80,
      comment_count: 6,
    });
    expect(chain.eq).toHaveBeenCalledWith("status", "posted");
  });

  test("savePerformance reports when the content is not posted", async () => {
    mockChain({ data: [], error: null });
    const result = await savePerformance("acc-1", "c1", { viewCount: 10 });
    expect(result).toEqual({ error: "게시완료 상태의 콘텐츠만 성과를 입력할 수 있습니다." });
  });

  test("getCaptionAssist returns the draft on success", async () => {
    (generateCaptionDraft as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      caption: "캡션 초안",
      hashtags: "#태그",
    });

    const result = await getCaptionAssist({
      title: "티저",
      scheduledOn: "2026-09-10",
      companyName: "글로우랩",
      platform: "instagram",
    });

    expect(result).toEqual({ draft: { caption: "캡션 초안", hashtags: "#태그" } });
    expect(generateCaptionDraft).toHaveBeenCalledWith({
      title: "티저",
      scheduledOn: "2026-09-10",
      companyName: "글로우랩",
      platform: "instagram",
    });
  });

  test("getCaptionAssist falls back with the standard message on failure", async () => {
    (generateCaptionDraft as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("boom")
    );

    const result = await getCaptionAssist({
      title: "티저",
      companyName: "글로우랩",
      platform: "instagram",
    });
    expect(result).toEqual({ error: "AI 제안 실패 — 직접 입력해주세요." });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/(dashboard)/sns/[id]/actions.test.ts"`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

`app/(dashboard)/sns/[id]/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { generateCaptionDraft, type CaptionDraft } from "@/lib/ai/snsCaptionAssist";
import { SNS_CONTENT_STATUSES, type SnsContentStatus } from "@/lib/sns/labels";

export type SnsContent = {
  id: string;
  account_id: string;
  title: string;
  scheduled_on: string | null;
  assignee: string | null;
  status: string;
  caption: string | null;
  hashtags: string | null;
  media_note: string | null;
  client_comment: string | null;
  post_url: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  status_changed_at: string | null;
  created_at: string;
};

export type SnsContentInput = {
  title: string;
  scheduledOn?: string;
  assignee?: string;
  caption?: string;
  hashtags?: string;
  mediaNote?: string;
};

export type ActionResult = { error: string } | { success: true };

const SAVE_FAILED = "처리에 실패했습니다. 다시 시도해주세요.";

function toRow(input: SnsContentInput) {
  return {
    title: input.title.trim(),
    scheduled_on: (input.scheduledOn ?? "").trim() || null,
    assignee: (input.assignee ?? "").trim() || null,
    caption: (input.caption ?? "").trim() || null,
    hashtags: (input.hashtags ?? "").trim() || null,
    media_note: (input.mediaNote ?? "").trim() || null,
  };
}

export async function createSnsContent(
  accountId: string,
  input: SnsContentInput
): Promise<ActionResult> {
  await requireRole("staff");
  const row = toRow(input);
  if (!row.title) return { error: "콘텐츠 제목을 입력해주세요." };

  const supabase = await createDashboardSupabaseClient();
  const { data, error } = await supabase
    .from("sns_contents")
    .insert({ account_id: accountId, ...row })
    .select()
    .single();

  if (error || !data) return { error: SAVE_FAILED };

  revalidatePath(`/sns/${accountId}`);
  return { success: true } as const;
}

export async function updateSnsContent(
  accountId: string,
  contentId: string,
  input: SnsContentInput
): Promise<ActionResult> {
  await requireRole("staff");
  const row = toRow(input);
  if (!row.title) return { error: "콘텐츠 제목을 입력해주세요." };

  const supabase = await createDashboardSupabaseClient();
  const { data, error } = await supabase
    .from("sns_contents")
    .update(row)
    .eq("id", contentId)
    .eq("account_id", accountId)
    .select();

  if (error || !data || data.length === 0) return { error: SAVE_FAILED };

  revalidatePath(`/sns/${accountId}`);
  return { success: true } as const;
}

export async function updateSnsContentStatus(
  accountId: string,
  contentId: string,
  status: string
): Promise<ActionResult> {
  await requireRole("staff");

  // 정해진 5개 값 외의 전이는 서버 액션에서 재검증해 차단한다 (spec).
  if (!(SNS_CONTENT_STATUSES as readonly string[]).includes(status)) {
    return { error: "알 수 없는 상태입니다." };
  }

  const supabase = await createDashboardSupabaseClient();
  const { data, error } = await supabase
    .from("sns_contents")
    .update({
      status: status as SnsContentStatus,
      // 월별 집계는 이 시각의 연-월로 게시월을 계산한다 (spec 결정).
      status_changed_at: new Date().toISOString(),
    })
    .eq("id", contentId)
    .eq("account_id", accountId)
    .select();

  if (error || !data || data.length === 0) return { error: SAVE_FAILED };

  revalidatePath(`/sns/${accountId}`);
  return { success: true } as const;
}

export async function deleteSnsContent(
  accountId: string,
  contentId: string
): Promise<ActionResult> {
  await requireRole("staff");

  const supabase = await createDashboardSupabaseClient();
  const { data, error } = await supabase
    .from("sns_contents")
    .delete()
    .eq("id", contentId)
    .eq("account_id", accountId)
    .select();

  if (error || !data || data.length === 0) return { error: SAVE_FAILED };

  revalidatePath(`/sns/${accountId}`);
  return { success: true } as const;
}

export async function savePerformance(
  accountId: string,
  contentId: string,
  input: { postUrl?: string; viewCount?: number; likeCount?: number; commentCount?: number }
): Promise<ActionResult> {
  await requireRole("staff");

  const counts = [input.viewCount, input.likeCount, input.commentCount];
  for (const n of counts) {
    if (n !== undefined && (!Number.isInteger(n) || n < 0)) {
      return { error: "성과 수치는 0 이상의 정수로 입력해주세요." };
    }
  }

  const supabase = await createDashboardSupabaseClient();
  const { data, error } = await supabase
    .from("sns_contents")
    .update({
      post_url: (input.postUrl ?? "").trim() || null,
      view_count: input.viewCount ?? null,
      like_count: input.likeCount ?? null,
      comment_count: input.commentCount ?? null,
    })
    .eq("id", contentId)
    .eq("account_id", accountId)
    // 게시완료가 아닌 콘텐츠에는 폼도 안 보이지만, 위조 호출도 여기서 막는다.
    .eq("status", "posted")
    .select();

  if (error || !data || data.length === 0) {
    return { error: "게시완료 상태의 콘텐츠만 성과를 입력할 수 있습니다." };
  }

  revalidatePath(`/sns/${accountId}`);
  return { success: true } as const;
}

export type CaptionAssistActionResult = { draft: CaptionDraft } | { error: string };

export async function getCaptionAssist(input: {
  title: string;
  scheduledOn?: string;
  companyName: string;
  platform: string;
}): Promise<CaptionAssistActionResult> {
  await requireRole("staff");
  try {
    const draft = await generateCaptionDraft({
      title: input.title,
      scheduledOn: input.scheduledOn ?? null,
      companyName: input.companyName,
      platform: input.platform,
    });
    return { draft };
  } catch {
    return { error: "AI 제안 실패 — 직접 입력해주세요." };
  }
}
```

Note: `getCaptionAssist` is called with `scheduledOn` possibly `undefined` from the form; the test asserts the pass-through call with `"2026-09-10"` — the implementation converts `undefined` to `null` before calling the lib, and the test's second case omits `scheduledOn` entirely. If the first assertion fails on `scheduledOn: "2026-09-10"`, check that the implementation forwards the provided value unchanged (it does: `input.scheduledOn ?? null`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "app/(dashboard)/sns/[id]/actions.test.ts"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/sns/[id]/actions.ts" "app/(dashboard)/sns/[id]/actions.test.ts"
git commit -m "feat: add sns content CRUD, status, performance, and caption assist actions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 14: `/sns/[id]` account detail page + components

**Files:**
- Create: `app/(dashboard)/sns/[id]/ShareLinks.tsx`, Test: `app/(dashboard)/sns/[id]/ShareLinks.test.tsx`
- Create: `app/(dashboard)/sns/[id]/ContentForm.tsx`, Test: `app/(dashboard)/sns/[id]/ContentForm.test.tsx`
- Create: `app/(dashboard)/sns/[id]/PerformanceForm.tsx`, Test: `app/(dashboard)/sns/[id]/PerformanceForm.test.tsx`
- Create: `app/(dashboard)/sns/[id]/ContentListView.tsx`, Test: `app/(dashboard)/sns/[id]/ContentListView.test.tsx`
- Create: `app/(dashboard)/sns/[id]/ContentCalendarView.tsx`, Test: `app/(dashboard)/sns/[id]/ContentCalendarView.test.tsx`
- Create: `app/(dashboard)/sns/[id]/MonthlySummaryCard.tsx`, Test: `app/(dashboard)/sns/[id]/MonthlySummaryCard.test.tsx`
- Create: `app/(dashboard)/sns/[id]/ContentBoard.tsx`
- Create: `app/(dashboard)/sns/[id]/page.tsx`, Test: `app/(dashboard)/sns/[id]/page.test.tsx`

**Interfaces:**
- Consumes: every action + `SnsContent` from Task 13, `buildMonthGrid` / `summarizeByMonth` / `STATUS_LABEL` / `STATUS_CLASS` / `SNS_CONTENT_STATUSES` / `PLATFORM_LABEL` (Task 8).
- Produces: the assembled `/sns/[id]` screen: 캘린더/목록 tabs, content create/edit with "AI 문안", status dropdown, posted-only performance entry, monthly summary card, intake results block, both public share links with copy buttons.

These are dashboard-only components, so they import their actions directly (the prop-injection rule exists to keep public-actor and agency-actor actions out of one shared client bundle — here there is only one actor).

- [ ] **Step 1: ShareLinks — failing test, then implement**

`app/(dashboard)/sns/[id]/ShareLinks.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import ShareLinks from "./ShareLinks";

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  writeText.mockClear();
  Object.assign(navigator, { clipboard: { writeText } });
});

describe("ShareLinks", () => {
  test("shows both public paths and copies the full URL on click", async () => {
    render(<ShareLinks intakePath="/sns-intake/tok-a" approvalPath="/sns-approval/tok-b" />);

    expect(screen.getByText("/sns-intake/tok-a")).toBeInTheDocument();
    expect(screen.getByText("/sns-approval/tok-b")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "복사" })[0]);
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/sns-intake/tok-a`);
    });
  });
});
```

`app/(dashboard)/sns/[id]/ShareLinks.tsx`:

```tsx
"use client";

import { useState } from "react";

function LinkRow({ label, path }: { label: string; path: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 권한이 없으면 코드 블록에서 수동 복사하면 된다 — 흐름을 막지 않는다.
    }
  }

  return (
    <div className="mb-3">
      <p className="mb-1 text-xs text-textMuted">{label}</p>
      <div className="flex items-center gap-2">
        <code className="block flex-1 overflow-x-auto rounded-token border border-border px-3 py-2 text-sm text-text">
          {path}
        </code>
        <button
          type="button"
          onClick={copy}
          className="rounded-token border border-border px-3 py-2 text-sm text-text"
        >
          복사
        </button>
        {copied && <span className="text-xs text-success">복사됨</span>}
      </div>
    </div>
  );
}

export default function ShareLinks({
  intakePath,
  approvalPath,
}: {
  intakePath: string;
  approvalPath: string;
}) {
  return (
    <section className="rounded-token border border-border bg-surface p-6">
      <h2 className="mb-3 text-lg font-bold text-text">공유 링크</h2>
      <LinkRow label="자료요청 설문 링크 (업체 공유)" path={intakePath} />
      <LinkRow label="콘텐츠 승인 링크 (업체 공유)" path={approvalPath} />
    </section>
  );
}
```

Run: `npx vitest run "app/(dashboard)/sns/[id]/ShareLinks.test.tsx"` → PASS

- [ ] **Step 2: ContentForm — failing test, then implement**

`app/(dashboard)/sns/[id]/ContentForm.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./actions", () => ({
  createSnsContent: vi.fn(),
  updateSnsContent: vi.fn(),
  getCaptionAssist: vi.fn(),
}));

import { createSnsContent, updateSnsContent, getCaptionAssist } from "./actions";
import ContentForm from "./ContentForm";

describe("ContentForm", () => {
  beforeEach(() => vi.clearAllMocks());

  test("AI 문안 fills caption and hashtags from the draft", async () => {
    (getCaptionAssist as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      draft: { caption: "AI가 쓴 캡션", hashtags: "#글로우랩 #신제품" },
    });

    render(
      <ContentForm
        accountId="acc-1"
        companyName="글로우랩"
        platform="instagram"
        content={null}
        onDone={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "9월 티저" } });
    fireEvent.click(screen.getByRole("button", { name: "AI 문안" }));

    await waitFor(() => {
      expect(screen.getByLabelText("캡션")).toHaveValue("AI가 쓴 캡션");
      expect(screen.getByLabelText("해시태그")).toHaveValue("#글로우랩 #신제품");
    });
    expect(getCaptionAssist).toHaveBeenCalledWith({
      title: "9월 티저",
      scheduledOn: "",
      companyName: "글로우랩",
      platform: "instagram",
    });
  });

  test("shows the fallback message when AI assist fails, keeping manual entry usable", async () => {
    (getCaptionAssist as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: "AI 제안 실패 — 직접 입력해주세요.",
    });

    render(
      <ContentForm
        accountId="acc-1"
        companyName="글로우랩"
        platform="instagram"
        content={null}
        onDone={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "AI 문안" }));

    await waitFor(() => {
      expect(screen.getByText("AI 제안 실패 — 직접 입력해주세요.")).toBeInTheDocument();
    });

    const caption = screen.getByLabelText("캡션");
    fireEvent.change(caption, { target: { value: "직접 쓴 캡션" } });
    expect(caption).toHaveValue("직접 쓴 캡션");
  });

  test("create mode calls createSnsContent and onDone", async () => {
    (createSnsContent as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    const onDone = vi.fn();

    render(
      <ContentForm
        accountId="acc-1"
        companyName="글로우랩"
        platform="instagram"
        content={null}
        onDone={onDone}
      />
    );
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "9월 티저" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(createSnsContent).toHaveBeenCalledWith("acc-1", {
        title: "9월 티저",
        scheduledOn: "",
        assignee: "",
        caption: "",
        hashtags: "",
        mediaNote: "",
      });
      expect(onDone).toHaveBeenCalled();
    });
  });

  test("edit mode prefills from the content and calls updateSnsContent", async () => {
    (updateSnsContent as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    render(
      <ContentForm
        accountId="acc-1"
        companyName="글로우랩"
        platform="instagram"
        content={{
          id: "c1",
          account_id: "acc-1",
          title: "기존 제목",
          scheduled_on: "2026-09-10",
          assignee: "김담당",
          status: "planning",
          caption: "기존 캡션",
          hashtags: "#기존",
          media_note: "메모",
          client_comment: null,
          post_url: null,
          view_count: null,
          like_count: null,
          comment_count: null,
          status_changed_at: null,
          created_at: "2026-09-01T00:00:00Z",
        }}
        onDone={vi.fn()}
      />
    );

    expect(screen.getByLabelText("제목")).toHaveValue("기존 제목");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(updateSnsContent).toHaveBeenCalledWith("acc-1", "c1", {
        title: "기존 제목",
        scheduledOn: "2026-09-10",
        assignee: "김담당",
        caption: "기존 캡션",
        hashtags: "#기존",
        mediaNote: "메모",
      });
    });
  });
});
```

`app/(dashboard)/sns/[id]/ContentForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  createSnsContent,
  updateSnsContent,
  getCaptionAssist,
  type SnsContent,
} from "./actions";

export default function ContentForm({
  accountId,
  companyName,
  platform,
  content,
  onDone,
}: {
  accountId: string;
  companyName: string;
  platform: string;
  content: SnsContent | null;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(content?.title ?? "");
  const [scheduledOn, setScheduledOn] = useState(content?.scheduled_on ?? "");
  const [assignee, setAssignee] = useState(content?.assignee ?? "");
  const [caption, setCaption] = useState(content?.caption ?? "");
  const [hashtags, setHashtags] = useState(content?.hashtags ?? "");
  const [mediaNote, setMediaNote] = useState(content?.media_note ?? "");
  const [assistPending, setAssistPending] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAssist() {
    setAssistPending(true);
    setAssistError(null);
    const result = await getCaptionAssist({
      title,
      scheduledOn,
      companyName,
      platform,
    });
    setAssistPending(false);

    if ("error" in result) {
      setAssistError(result.error);
      return;
    }
    setCaption(result.draft.caption);
    setHashtags(result.draft.hashtags);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const input = { title, scheduledOn, assignee, caption, hashtags, mediaNote };
    const result = content
      ? await updateSnsContent(accountId, content.id, input)
      : await createSnsContent(accountId, input);
    setSaving(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    onDone();
  }

  const inputClass = "rounded-token border border-border bg-surface px-3 py-2 text-text";

  return (
    <div className="flex flex-col gap-3 rounded-token border border-border bg-surface p-6">
      <h3 className="text-lg font-bold text-text">{content ? "콘텐츠 수정" : "새 콘텐츠"}</h3>

      <label className="text-sm font-medium text-text" htmlFor="title">제목</label>
      <input id="title" aria-label="제목" value={title}
        onChange={(e) => setTitle(e.target.value)} className={inputClass} />

      <label className="text-sm font-medium text-text" htmlFor="scheduledOn">게시 예정일</label>
      <input id="scheduledOn" aria-label="게시 예정일" type="date" value={scheduledOn}
        onChange={(e) => setScheduledOn(e.target.value)} className={inputClass} />

      <label className="text-sm font-medium text-text" htmlFor="assignee">담당자</label>
      <input id="assignee" aria-label="담당자" value={assignee}
        onChange={(e) => setAssignee(e.target.value)} className={inputClass} />

      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-text" htmlFor="caption">캡션</label>
        <button type="button" onClick={handleAssist} disabled={assistPending}
          className="rounded-token border border-border px-3 py-1.5 text-sm text-textMuted disabled:opacity-60">
          {assistPending ? "생성 중..." : "AI 문안"}
        </button>
      </div>
      <textarea id="caption" aria-label="캡션" rows={3} value={caption}
        onChange={(e) => setCaption(e.target.value)} className={inputClass} />

      <label className="text-sm font-medium text-text" htmlFor="hashtags">해시태그</label>
      <input id="hashtags" aria-label="해시태그" value={hashtags}
        onChange={(e) => setHashtags(e.target.value)} className={inputClass} />

      <label className="text-sm font-medium text-text" htmlFor="mediaNote">내부 제작 메모</label>
      <textarea id="mediaNote" aria-label="내부 제작 메모" rows={2} value={mediaNote}
        onChange={(e) => setMediaNote(e.target.value)} className={inputClass} />
      <p className="text-xs text-textMuted">내부 메모는 업체 승인 화면에 노출되지 않습니다.</p>

      {assistError && <p className="text-sm text-critical">{assistError}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={handleSave} disabled={saving}
          className="rounded-token bg-accent px-4 py-2 font-medium text-onAccent disabled:opacity-60">
          {saving ? "저장 중..." : "저장"}
        </button>
        <button type="button" onClick={onDone}
          className="rounded-token border border-border px-4 py-2 text-text">
          닫기
        </button>
      </div>

      {error && <p className="text-sm text-critical">{error}</p>}
    </div>
  );
}
```

Run: `npx vitest run "app/(dashboard)/sns/[id]/ContentForm.test.tsx"` → PASS

- [ ] **Step 3: PerformanceForm — failing test, then implement**

`app/(dashboard)/sns/[id]/PerformanceForm.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("./actions", () => ({ savePerformance: vi.fn() }));

import { savePerformance } from "./actions";
import PerformanceForm from "./PerformanceForm";

describe("PerformanceForm", () => {
  beforeEach(() => vi.clearAllMocks());

  test("blocks negative numbers client-side", async () => {
    render(
      <PerformanceForm
        accountId="acc-1"
        contentId="c1"
        initial={{ post_url: null, view_count: null, like_count: null, comment_count: null }}
      />
    );
    fireEvent.change(screen.getByLabelText("조회수"), { target: { value: "-3" } });
    fireEvent.click(screen.getByRole("button", { name: "성과 저장" }));

    await waitFor(() => {
      expect(screen.getByText("성과 수치는 0 이상의 정수로 입력해주세요.")).toBeInTheDocument();
    });
    expect(savePerformance).not.toHaveBeenCalled();
  });

  test("submits parsed numbers and the post url", async () => {
    (savePerformance as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    render(
      <PerformanceForm
        accountId="acc-1"
        contentId="c1"
        initial={{ post_url: null, view_count: null, like_count: null, comment_count: null }}
      />
    );
    fireEvent.change(screen.getByLabelText("게시 링크"), {
      target: { value: "https://instagram.com/p/abc" },
    });
    fireEvent.change(screen.getByLabelText("조회수"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText("좋아요"), { target: { value: "80" } });
    fireEvent.change(screen.getByLabelText("댓글"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "성과 저장" }));

    await waitFor(() => {
      expect(savePerformance).toHaveBeenCalledWith("acc-1", "c1", {
        postUrl: "https://instagram.com/p/abc",
        viewCount: 1200,
        likeCount: 80,
        commentCount: 6,
      });
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  test("prefills from the saved metrics", () => {
    render(
      <PerformanceForm
        accountId="acc-1"
        contentId="c1"
        initial={{
          post_url: "https://instagram.com/p/abc",
          view_count: 500,
          like_count: 20,
          comment_count: 2,
        }}
      />
    );
    expect(screen.getByLabelText("조회수")).toHaveValue(500);
  });
});
```

`app/(dashboard)/sns/[id]/PerformanceForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { savePerformance } from "./actions";

const INVALID = "성과 수치는 0 이상의 정수로 입력해주세요.";

function parseCount(raw: string): number | undefined | "invalid" {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return "invalid";
  return n;
}

export default function PerformanceForm({
  accountId,
  contentId,
  initial,
}: {
  accountId: string;
  contentId: string;
  initial: {
    post_url: string | null;
    view_count: number | null;
    like_count: number | null;
    comment_count: number | null;
  };
}) {
  const router = useRouter();
  const [postUrl, setPostUrl] = useState(initial.post_url ?? "");
  const [views, setViews] = useState(initial.view_count?.toString() ?? "");
  const [likes, setLikes] = useState(initial.like_count?.toString() ?? "");
  const [comments, setComments] = useState(initial.comment_count?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSave() {
    const viewCount = parseCount(views);
    const likeCount = parseCount(likes);
    const commentCount = parseCount(comments);
    if (viewCount === "invalid" || likeCount === "invalid" || commentCount === "invalid") {
      setError(INVALID);
      return;
    }

    setPending(true);
    setError(null);
    const result = await savePerformance(accountId, contentId, {
      postUrl,
      viewCount,
      likeCount,
      commentCount,
    });
    setPending(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const numClass =
    "w-24 rounded-token border border-border bg-surface px-2 py-1 font-mono tabular-nums text-text";

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-token border border-border bg-surface2 p-3">
      <label className="text-xs text-textMuted" htmlFor={`url-${contentId}`}>게시 링크</label>
      <input id={`url-${contentId}`} aria-label="게시 링크" value={postUrl}
        onChange={(e) => setPostUrl(e.target.value)}
        className="rounded-token border border-border bg-surface px-2 py-1 text-sm text-text" />

      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-textMuted" htmlFor={`views-${contentId}`}>조회수</label>
          <input id={`views-${contentId}`} aria-label="조회수" type="number" value={views}
            onChange={(e) => setViews(e.target.value)} className={numClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-textMuted" htmlFor={`likes-${contentId}`}>좋아요</label>
          <input id={`likes-${contentId}`} aria-label="좋아요" type="number" value={likes}
            onChange={(e) => setLikes(e.target.value)} className={numClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-textMuted" htmlFor={`comments-${contentId}`}>댓글</label>
          <input id={`comments-${contentId}`} aria-label="댓글" type="number" value={comments}
            onChange={(e) => setComments(e.target.value)} className={numClass} />
        </div>
        <button type="button" onClick={handleSave} disabled={pending}
          className="rounded-token bg-accent px-3 py-1.5 text-sm font-medium text-onAccent disabled:opacity-60">
          성과 저장
        </button>
      </div>

      {error && <p className="text-sm text-critical">{error}</p>}
    </div>
  );
}
```

Run: `npx vitest run "app/(dashboard)/sns/[id]/PerformanceForm.test.tsx"` → PASS

- [ ] **Step 4: ContentListView — failing test, then implement**

`app/(dashboard)/sns/[id]/ContentListView.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("./actions", () => ({
  updateSnsContentStatus: vi.fn(),
  deleteSnsContent: vi.fn(),
  savePerformance: vi.fn(),
}));

import { updateSnsContentStatus } from "./actions";
import ContentListView from "./ContentListView";
import type { SnsContent } from "./actions";

function makeContent(overrides: Partial<SnsContent> = {}): SnsContent {
  return {
    id: "c1",
    account_id: "acc-1",
    title: "9월 티저",
    scheduled_on: "2026-09-10",
    assignee: "김담당",
    status: "planning",
    caption: null,
    hashtags: null,
    media_note: null,
    client_comment: null,
    post_url: null,
    view_count: null,
    like_count: null,
    comment_count: null,
    status_changed_at: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("ContentListView", () => {
  beforeEach(() => vi.clearAllMocks());

  test("changing the status dropdown calls the action and refreshes", async () => {
    (updateSnsContentStatus as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    });

    render(
      <ContentListView accountId="acc-1" contents={[makeContent()]} onEdit={vi.fn()} />
    );
    fireEvent.change(screen.getByLabelText("상태"), { target: { value: "producing" } });

    await waitFor(() => {
      expect(updateSnsContentStatus).toHaveBeenCalledWith("acc-1", "c1", "producing");
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  test("shows the client's change-request comment when present", () => {
    render(
      <ContentListView
        accountId="acc-1"
        contents={[makeContent({ status: "producing", client_comment: "해시태그를 줄여주세요" })]}
        onEdit={vi.fn()}
      />
    );
    expect(screen.getByText(/해시태그를 줄여주세요/)).toBeInTheDocument();
  });

  test("shows the performance form only for posted contents", () => {
    const { rerender } = render(
      <ContentListView accountId="acc-1" contents={[makeContent()]} onEdit={vi.fn()} />
    );
    expect(screen.queryByLabelText("조회수")).not.toBeInTheDocument();

    rerender(
      <ContentListView
        accountId="acc-1"
        contents={[makeContent({ status: "posted" })]}
        onEdit={vi.fn()}
      />
    );
    expect(screen.getByLabelText("조회수")).toBeInTheDocument();
  });

  test("edit button hands the content to onEdit", () => {
    const onEdit = vi.fn();
    const content = makeContent();
    render(<ContentListView accountId="acc-1" contents={[content]} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    expect(onEdit).toHaveBeenCalledWith(content);
  });
});
```

`app/(dashboard)/sns/[id]/ContentListView.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSnsContentStatus, deleteSnsContent, type SnsContent } from "./actions";
import { SNS_CONTENT_STATUSES, STATUS_LABEL, STATUS_CLASS, type SnsContentStatus } from "@/lib/sns/labels";
import PerformanceForm from "./PerformanceForm";

export default function ContentListView({
  accountId,
  contents,
  onEdit,
}: {
  accountId: string;
  contents: SnsContent[];
  onEdit: (content: SnsContent) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function changeStatus(contentId: string, status: string) {
    setError(null);
    const result = await updateSnsContentStatus(accountId, contentId, status);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function remove(contentId: string) {
    setError(null);
    const result = await deleteSnsContent(accountId, contentId);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (contents.length === 0) {
    return <p className="text-textMuted">아직 콘텐츠가 없습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-critical">{error}</p>}
      {contents.map((c) => (
        <div key={c.id} className="rounded-token border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`text-xs ${STATUS_CLASS[c.status as SnsContentStatus] ?? "text-textMuted"}`}>
              {STATUS_LABEL[c.status as SnsContentStatus] ?? c.status}
            </span>
            <p className="flex-1 font-semibold text-text">{c.title}</p>
            <p className="text-sm text-textMuted">
              {c.scheduled_on ?? "일정 미정"} {c.assignee ? `· ${c.assignee}` : ""}
            </p>
            <select
              aria-label="상태"
              value={c.status}
              onChange={(e) => changeStatus(c.id, e.target.value)}
              className="rounded-token border border-border bg-surface px-2 py-1 text-sm text-text"
            >
              {SNS_CONTENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => onEdit(c)}
              className="rounded-token border border-border px-3 py-1.5 text-sm text-text">
              수정
            </button>
            <button type="button" onClick={() => remove(c.id)}
              className="rounded-token border border-border px-3 py-1.5 text-sm text-critical">
              삭제
            </button>
          </div>

          {c.client_comment && (
            <p className="mt-2 text-sm text-warning">업체 수정요청: {c.client_comment}</p>
          )}

          {c.status === "posted" && (
            <PerformanceForm
              accountId={accountId}
              contentId={c.id}
              initial={{
                post_url: c.post_url,
                view_count: c.view_count,
                like_count: c.like_count,
                comment_count: c.comment_count,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
```

Run: `npx vitest run "app/(dashboard)/sns/[id]/ContentListView.test.tsx"` → PASS

- [ ] **Step 5: ContentCalendarView — failing test, then implement**

`app/(dashboard)/sns/[id]/ContentCalendarView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import ContentCalendarView from "./ContentCalendarView";
import type { SnsContent } from "./actions";

const content: SnsContent = {
  id: "c1",
  account_id: "acc-1",
  title: "9월 티저",
  scheduled_on: "2026-09-10",
  assignee: null,
  status: "pending_approval",
  caption: null,
  hashtags: null,
  media_note: null,
  client_comment: null,
  post_url: null,
  view_count: null,
  like_count: null,
  comment_count: null,
  status_changed_at: null,
  created_at: "2026-09-01T00:00:00Z",
};

describe("ContentCalendarView", () => {
  test("renders the month heading and places the content on its scheduled day", () => {
    render(<ContentCalendarView contents={[content]} initialYear={2026} initialMonth={9} />);

    expect(screen.getByText("2026년 9월")).toBeInTheDocument();
    expect(screen.getByText("9월 티저")).toBeInTheDocument();
    // 7 weekday headers.
    expect(screen.getByText("일")).toBeInTheDocument();
    expect(screen.getByText("토")).toBeInTheDocument();
  });

  test("month navigation moves to the next month", () => {
    render(<ContentCalendarView contents={[]} initialYear={2026} initialMonth={12} />);
    screen.getByRole("button", { name: "다음 달" }).click();
    // December -> January of the next year.
    expect(screen.getByText("2027년 1월")).toBeInTheDocument();
  });
});
```

Note: the second test uses `.click()` directly on the element; if it does not flush the state update in your React version, wrap it with `fireEvent.click(...)` from `@testing-library/react` — that is the pattern used elsewhere in this repo.

`app/(dashboard)/sns/[id]/ContentCalendarView.tsx`:

```tsx
"use client";

import { useState } from "react";
import { buildMonthGrid } from "@/lib/sns/calendar";
import { STATUS_CLASS, type SnsContentStatus } from "@/lib/sns/labels";
import type { SnsContent } from "./actions";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function ContentCalendarView({
  contents,
  initialYear,
  initialMonth,
}: {
  contents: SnsContent[];
  initialYear?: number;
  initialMonth?: number;
}) {
  const now = new Date();
  const [year, setYear] = useState(initialYear ?? now.getFullYear());
  const [month, setMonth] = useState(initialMonth ?? now.getMonth() + 1);

  const byDate = new Map<string, SnsContent[]>();
  for (const c of contents) {
    if (!c.scheduled_on) continue;
    const list = byDate.get(c.scheduled_on) ?? [];
    list.push(c);
    byDate.set(c.scheduled_on, list);
  }

  function shift(delta: number) {
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth() + 1);
  }

  const grid = buildMonthGrid(year, month);

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <button type="button" aria-label="이전 달" onClick={() => shift(-1)}
          className="rounded-token border border-border px-3 py-1.5 text-sm text-text">
          ←
        </button>
        <p className="font-semibold text-text">{year}년 {month}월</p>
        <button type="button" aria-label="다음 달" onClick={() => shift(1)}
          className="rounded-token border border-border px-3 py-1.5 text-sm text-text">
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <p key={d} className="px-2 py-1 text-center text-xs text-textMuted">{d}</p>
        ))}
        {grid.flat().map((cell) => (
          <div
            key={cell.date}
            className={`min-h-20 rounded-token border border-border p-1 ${
              cell.inMonth ? "bg-surface" : "bg-surface2"
            }`}
          >
            <p className={`text-xs ${cell.inMonth ? "text-text" : "text-textMuted"}`}>{cell.day}</p>
            {(byDate.get(cell.date) ?? []).map((c) => (
              <p
                key={c.id}
                className={`mt-1 truncate text-xs ${
                  STATUS_CLASS[c.status as SnsContentStatus] ?? "text-textMuted"
                }`}
              >
                {c.title}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

Run: `npx vitest run "app/(dashboard)/sns/[id]/ContentCalendarView.test.tsx"` → PASS

- [ ] **Step 6: MonthlySummaryCard — failing test, then implement**

`app/(dashboard)/sns/[id]/MonthlySummaryCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import MonthlySummaryCard from "./MonthlySummaryCard";

describe("MonthlySummaryCard", () => {
  test("renders one row per month with counts", () => {
    render(
      <MonthlySummaryCard
        rows={[
          { month: "2026-09", postCount: 1, viewCount: 300, likeCount: 30, commentCount: 3 },
          { month: "2026-08", postCount: 2, viewCount: 3000, likeCount: 200, commentCount: 20 },
        ]}
      />
    );

    expect(screen.getByText("2026-09")).toBeInTheDocument();
    expect(screen.getByText("3,000")).toBeInTheDocument();
  });

  test("shows an empty state when nothing is posted yet", () => {
    render(<MonthlySummaryCard rows={[]} />);
    expect(screen.getByText("아직 게시완료된 콘텐츠가 없습니다.")).toBeInTheDocument();
  });
});
```

`app/(dashboard)/sns/[id]/MonthlySummaryCard.tsx` (server-safe, no client hooks):

```tsx
import type { MonthlySummaryRow } from "@/lib/sns/monthlySummary";

export default function MonthlySummaryCard({ rows }: { rows: MonthlySummaryRow[] }) {
  return (
    <section className="rounded-token border border-border bg-surface p-6">
      <h2 className="mb-3 text-lg font-bold text-text">월별 성과 요약</h2>
      {rows.length === 0 ? (
        <p className="text-textMuted">아직 게시완료된 콘텐츠가 없습니다.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-textMuted">
              <th className="py-1 font-normal">월</th>
              <th className="py-1 text-right font-normal">게시물</th>
              <th className="py-1 text-right font-normal">조회수</th>
              <th className="py-1 text-right font-normal">좋아요</th>
              <th className="py-1 text-right font-normal">댓글</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="border-t border-border text-text">
                <td className="py-1 font-mono tabular-nums">{r.month}</td>
                <td className="py-1 text-right font-mono tabular-nums">{r.postCount.toLocaleString()}</td>
                <td className="py-1 text-right font-mono tabular-nums">{r.viewCount.toLocaleString()}</td>
                <td className="py-1 text-right font-mono tabular-nums">{r.likeCount.toLocaleString()}</td>
                <td className="py-1 text-right font-mono tabular-nums">{r.commentCount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

Run: `npx vitest run "app/(dashboard)/sns/[id]/MonthlySummaryCard.test.tsx"` → PASS

- [ ] **Step 7: ContentBoard (orchestration, no dedicated test — its parts are tested above)**

`app/(dashboard)/sns/[id]/ContentBoard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SnsContent } from "./actions";
import ContentForm from "./ContentForm";
import ContentListView from "./ContentListView";
import ContentCalendarView from "./ContentCalendarView";

export default function ContentBoard({
  accountId,
  companyName,
  platform,
  contents,
}: {
  accountId: string;
  companyName: string;
  platform: string;
  contents: SnsContent[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"calendar" | "list">("calendar");
  const [editing, setEditing] = useState<SnsContent | null>(null);
  const [creating, setCreating] = useState(false);

  function done() {
    setCreating(false);
    setEditing(null);
    router.refresh();
  }

  const tabClass = (active: boolean) =>
    active
      ? "rounded-token bg-accent px-4 py-2 text-sm font-medium text-onAccent"
      : "rounded-token border border-border px-4 py-2 text-sm text-text";

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <button type="button" onClick={() => setTab("calendar")} className={tabClass(tab === "calendar")}>
          캘린더
        </button>
        <button type="button" onClick={() => setTab("list")} className={tabClass(tab === "list")}>
          목록
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setCreating(true);
          }}
          className="rounded-token bg-accent px-4 py-2 text-sm font-medium text-onAccent"
        >
          새 콘텐츠
        </button>
      </div>

      {tab === "calendar" ? (
        <ContentCalendarView contents={contents} />
      ) : (
        <ContentListView
          accountId={accountId}
          contents={contents}
          onEdit={(c) => {
            setCreating(false);
            setEditing(c);
          }}
        />
      )}

      {(creating || editing) && (
        <div className="mt-6">
          <ContentForm
            accountId={accountId}
            companyName={companyName}
            platform={platform}
            content={editing}
            onDone={done}
          />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 8: The page — failing test, then implement**

`app/(dashboard)/sns/[id]/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/dashboard", () => ({ createDashboardSupabaseClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import SnsAccountDetailPage from "./page";

const account = {
  id: "acc-1",
  company_name: "글로우랩",
  platform: "instagram",
  handle: "@glowlab",
  status: "active",
  starts_on: null,
  ends_on: null,
  intake_token: "tok-a",
  approval_token: "tok-b",
};

function mockDb({ accountRow = account as unknown, intake = null as unknown } = {}) {
  (createDashboardSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    from: (table: string) => {
      if (table === "sns_accounts") {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: accountRow, error: null }) }),
          }),
        };
      }
      if (table === "sns_contents") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  {
                    id: "c1",
                    account_id: "acc-1",
                    title: "9월 티저",
                    scheduled_on: "2026-09-10",
                    assignee: null,
                    status: "posted",
                    caption: null,
                    hashtags: null,
                    media_note: null,
                    client_comment: null,
                    post_url: null,
                    view_count: 1200,
                    like_count: 80,
                    comment_count: 6,
                    status_changed_at: "2026-09-12T09:00:00.000Z",
                    created_at: "2026-09-01T00:00:00Z",
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "sns_intake_template") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { questions: [{ id: "q1", label: "브랜드 톤앤매너를 알려주세요" }] },
                error: null,
              }),
            }),
          }),
        };
      }
      // sns_intake_responses
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: intake, error: null }) }),
        }),
      };
    },
  });
}

describe("SnsAccountDetailPage", () => {
  test("renders the account header, share links, board, and monthly summary", async () => {
    mockDb();

    render(await SnsAccountDetailPage({ params: Promise.resolve({ id: "acc-1" }) }));

    expect(screen.getByText("글로우랩")).toBeInTheDocument();
    expect(screen.getByText("/sns-intake/tok-a")).toBeInTheDocument();
    expect(screen.getByText("/sns-approval/tok-b")).toBeInTheDocument();
    expect(screen.getByText("2026-09")).toBeInTheDocument(); // monthly summary row
    expect(screen.getByText("사전설문 결과")).toBeInTheDocument();
    expect(screen.getByText("아직 제출된 설문이 없습니다.")).toBeInTheDocument();
  });

  test("renders intake answers labeled by their question", async () => {
    mockDb({
      intake: {
        answers: { q1: "차분하고 신뢰감 있는 톤" },
        submitted_at: "2026-09-02T00:00:00Z",
      },
    });

    render(await SnsAccountDetailPage({ params: Promise.resolve({ id: "acc-1" }) }));

    expect(screen.getByText("브랜드 톤앤매너를 알려주세요")).toBeInTheDocument();
    expect(screen.getByText("차분하고 신뢰감 있는 톤")).toBeInTheDocument();
  });

  test("calls notFound for a missing account", async () => {
    mockDb({ accountRow: null });

    await expect(
      SnsAccountDetailPage({ params: Promise.resolve({ id: "missing" }) })
    ).rejects.toThrow("NOT_FOUND");
  });
});
```

`app/(dashboard)/sns/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { PLATFORM_LABEL } from "@/lib/sns/labels";
import { summarizeByMonth } from "@/lib/sns/monthlySummary";
import type { SnsContent } from "./actions";
import ContentBoard from "./ContentBoard";
import MonthlySummaryCard from "./MonthlySummaryCard";
import ShareLinks from "./ShareLinks";

type IntakeQuestion = { id: string; label: string };

export default async function SnsAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createDashboardSupabaseClient();

  const { data: account } = await supabase
    .from("sns_accounts")
    .select("id, company_name, platform, handle, status, starts_on, ends_on, intake_token, approval_token")
    .eq("id", id)
    .single();

  if (!account) notFound();

  const { data: contentRows } = await supabase
    .from("sns_contents")
    .select("*")
    .eq("account_id", id)
    .order("scheduled_on", { ascending: true });

  const contents = (contentRows ?? []) as SnsContent[];

  const { data: template } = await supabase
    .from("sns_intake_template")
    .select("questions")
    .eq("id", 1)
    .single();

  const { data: intake } = await supabase
    .from("sns_intake_responses")
    .select("answers, submitted_at")
    .eq("account_id", id)
    .maybeSingle();

  const questions = (template?.questions ?? []) as IntakeQuestion[];
  const answers = (intake?.answers ?? {}) as Record<string, string>;
  const summaryRows = summarizeByMonth(contents);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-text">{account.company_name}</h1>
        <p className="text-textMuted">
          {PLATFORM_LABEL[account.platform] ?? account.platform} · {account.handle} ·{" "}
          {account.status === "active" ? "운영중" : "종료"}
        </p>
        <Link
          href={`/sns/${account.id}/plan`}
          className="mt-3 inline-block rounded-token bg-accent px-4 py-2 text-sm font-medium text-onAccent"
        >
          운영안 열기
        </Link>
      </div>

      <ShareLinks
        intakePath={`/sns-intake/${account.intake_token}`}
        approvalPath={`/sns-approval/${account.approval_token}`}
      />

      <ContentBoard
        accountId={account.id}
        companyName={account.company_name}
        platform={account.platform}
        contents={contents}
      />

      <MonthlySummaryCard rows={summaryRows} />

      <section className="rounded-token border border-border bg-surface p-6">
        <h2 className="mb-3 text-lg font-bold text-text">사전설문 결과</h2>
        {!intake ? (
          <p className="text-textMuted">아직 제출된 설문이 없습니다.</p>
        ) : (
          <dl className="flex flex-col gap-3">
            {questions.map((q) => (
              <div key={q.id}>
                <dt className="text-sm font-medium text-text">{q.label}</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm text-textMuted">
                  {answers[q.id] ?? "(답변 없음)"}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}
```

Run: `npx vitest run "app/(dashboard)/sns/[id]/page.test.tsx"`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add "app/(dashboard)/sns/[id]"
git commit -m "feat: add sns account detail with calendar, statuses, performance, and intake results

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 15: `/sns/[id]/plan` — SNS 운영안 web screen

**Files:**
- Create: `app/(dashboard)/sns/[id]/plan/actions.ts`, Test: `app/(dashboard)/sns/[id]/plan/actions.test.ts`
- Create: `app/(dashboard)/sns/[id]/plan/PlanEditor.tsx`, Test: `app/(dashboard)/sns/[id]/plan/PlanEditor.test.tsx`
- Create: `app/(dashboard)/sns/[id]/plan/page.tsx` (no dedicated test — pure data-load-then-props orchestration, same rationale as Task 14's `ContentBoard.tsx`; its behavior is exercised through `PlanEditor`'s tests)

**Interfaces:**
- Consumes: `requireRole` (`@/lib/auth/roles`), `createDashboardSupabaseClient` (`@/lib/supabase/dashboard`), `generatePlanFieldDraft` + `type PlanAssistInput` (Task 7, `@/lib/ai/snsPlanAssist`), the shared `public.ppt_templates` table (columns `id`, `kind`, `name`, `placeholders` — Task 5 of `2026-09-01-ppt-template-engine.md`), `public.sns_plans` (Task 3), `public.sns_accounts` (Task 1), `public.sns_intake_template` / `public.sns_intake_responses` (Task 2).
- Produces:
  - `type SnsPlanTemplateOption = { id: string; name: string; placeholders: string[] }`
  - `type SnsPlanRow = { id: string; account_id: string; template_id: string | null; field_values: Record<string, string>; updated_at: string }`
  - `type PlanActionResult = { error: string } | { success: true }`
  - `type FieldDraftResult = { draft: string } | { error: string }`
  - `saveSnsPlan(accountId: string, templateId: string, fieldValues: Record<string, string>): Promise<PlanActionResult>` — upserts `sns_plans` on `account_id` (unique); an empty `templateId` string is stored as `null`.
  - `getPlanAssist(accountId: string, placeholder: string): Promise<FieldDraftResult>` — loads the account, joins `sns_intake_template.questions` (id→label) against the account's row in `sns_intake_responses.answers`, then calls `generatePlanFieldDraft` with `intakeAnswers` keyed by **label** (matching Task 7's `PlanAssistInput` contract exactly). Falls back to the standard AI failure message; never throws.
  - Default export `PlanEditor`, consumed by `page.tsx`.

These are dashboard-only components (single actor), so `PlanEditor.tsx` imports its actions directly — same as Task 14's components.

- [ ] **Step 1: `actions.ts` — write the failing test**

`app/(dashboard)/sns/[id]/plan/actions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/roles", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/dashboard", () => ({ createDashboardSupabaseClient: vi.fn() }));
vi.mock("@/lib/ai/snsPlanAssist", () => ({ generatePlanFieldDraft: vi.fn() }));

import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { generatePlanFieldDraft } from "@/lib/ai/snsPlanAssist";
import { getPlanAssist, saveSnsPlan } from "./actions";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocked(requireRole).mockResolvedValue({ id: "u1", role: "staff" });
});

describe("saveSnsPlan", () => {
  test("upserts the plan keyed on account_id, storing an empty templateId as null", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocked(createDashboardSupabaseClient).mockResolvedValue({ from: () => ({ upsert }) });

    const result = await saveSnsPlan("acc-1", "", { operation_goal: "월 12회 게시" });

    expect(result).toEqual({ success: true });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: "acc-1",
        template_id: null,
        field_values: { operation_goal: "월 12회 게시" },
      }),
      { onConflict: "account_id" }
    );
  });

  test("stores the selected template id", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocked(createDashboardSupabaseClient).mockResolvedValue({ from: () => ({ upsert }) });

    await saveSnsPlan("acc-1", "tpl-1", {});

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ template_id: "tpl-1" }),
      { onConflict: "account_id" }
    );
  });

  test("returns the standard failure message on a DB error", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    mocked(createDashboardSupabaseClient).mockResolvedValue({ from: () => ({ upsert }) });

    const result = await saveSnsPlan("acc-1", "tpl-1", {});
    expect(result).toEqual({ error: "저장에 실패했습니다. 다시 시도해주세요." });
  });
});

describe("getPlanAssist", () => {
  function mockContext({
    account = { id: "acc-1", company_name: "글로우랩", platform: "instagram", handle: "@glowlab" },
    intake = { answers: { q1: "차분하고 신뢰감 있는 톤" } },
  }: {
    account?: Record<string, unknown> | null;
    intake?: Record<string, unknown> | null;
  } = {}) {
    mocked(createDashboardSupabaseClient).mockResolvedValue({
      from: (table: string) => {
        if (table === "sns_accounts") {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: account }) }) }) };
        }
        if (table === "sns_intake_template") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { questions: [{ id: "q1", label: "브랜드 톤앤매너를 알려주세요" }] },
                }),
              }),
            }),
          };
        }
        // sns_intake_responses
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: intake }) }) }),
        };
      },
    });
  }

  test("maps intake answers from question id to question label before calling the assist", async () => {
    mockContext();
    mocked(generatePlanFieldDraft).mockResolvedValue("월 12회 게시로 팔로워 20% 성장");

    const result = await getPlanAssist("acc-1", "operation_goal");

    expect(result).toEqual({ draft: "월 12회 게시로 팔로워 20% 성장" });
    expect(generatePlanFieldDraft).toHaveBeenCalledWith({
      placeholder: "operation_goal",
      account: { companyName: "글로우랩", platform: "instagram", handle: "@glowlab" },
      intakeAnswers: { "브랜드 톤앤매너를 알려주세요": "차분하고 신뢰감 있는 톤" },
    });
  });

  test("falls back to manual entry when generation fails", async () => {
    mockContext({ intake: null });
    mocked(generatePlanFieldDraft).mockRejectedValue(new Error("boom"));

    const result = await getPlanAssist("acc-1", "operation_goal");
    expect(result).toEqual({ error: "AI 제안 실패 — 직접 입력해주세요." });
  });

  test("returns the fallback when the account does not exist", async () => {
    mockContext({ account: null });

    const result = await getPlanAssist("missing", "operation_goal");
    expect(result).toEqual({ error: "AI 제안 실패 — 직접 입력해주세요." });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/(dashboard)/sns/[id]/plan/actions.test.ts"`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `actions.ts`**

`app/(dashboard)/sns/[id]/plan/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { generatePlanFieldDraft } from "@/lib/ai/snsPlanAssist";

export type SnsPlanTemplateOption = { id: string; name: string; placeholders: string[] };

export type SnsPlanRow = {
  id: string;
  account_id: string;
  template_id: string | null;
  field_values: Record<string, string>;
  updated_at: string;
};

export type PlanActionResult = { error: string } | { success: true };
export type FieldDraftResult = { draft: string } | { error: string };

const SAVE_FAILED = "저장에 실패했습니다. 다시 시도해주세요.";
const ASSIST_FAILED = "AI 제안 실패 — 직접 입력해주세요.";

export async function saveSnsPlan(
  accountId: string,
  templateId: string,
  fieldValues: Record<string, string>
): Promise<PlanActionResult> {
  await requireRole("staff");

  const supabase = await createDashboardSupabaseClient();
  const { error } = await supabase.from("sns_plans").upsert(
    {
      account_id: accountId,
      template_id: templateId || null,
      field_values: fieldValues,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_id" }
  );

  if (error) return { error: SAVE_FAILED };

  revalidatePath(`/sns/${accountId}/plan`);
  return { success: true } as const;
}

/**
 * Drafts a single placeholder's value at a time (the "AI 초안" button sits next
 * to each field, matching Task 14's per-field "AI 문안" pattern and B's
 * getEventPlanFieldDraft). intakeAnswers is keyed by question LABEL, not id —
 * this is the label-mapping join the Task 7 contract calls out: Task 7 only
 * knows about labels (prose the model can read), so this action is the one
 * place that resolves sns_intake_template.questions (id -> label) against the
 * account's sns_intake_responses.answers (keyed by id) before calling the assist.
 */
export async function getPlanAssist(
  accountId: string,
  placeholder: string
): Promise<FieldDraftResult> {
  await requireRole("staff");

  const supabase = await createDashboardSupabaseClient();

  const { data: account } = await supabase
    .from("sns_accounts")
    .select("id, company_name, platform, handle")
    .eq("id", accountId)
    .single();

  if (!account) return { error: ASSIST_FAILED };

  const { data: template } = await supabase
    .from("sns_intake_template")
    .select("questions")
    .eq("id", 1)
    .single();

  const { data: response } = await supabase
    .from("sns_intake_responses")
    .select("answers")
    .eq("account_id", accountId)
    .maybeSingle();

  const questions = (template?.questions ?? []) as { id: string; label: string }[];
  const answers = (response?.answers ?? {}) as Record<string, string>;
  const intakeAnswers: Record<string, string> = {};
  for (const q of questions) {
    const answer = answers[q.id];
    if (answer && answer.trim().length > 0) intakeAnswers[q.label] = answer;
  }

  try {
    const draft = await generatePlanFieldDraft({
      placeholder,
      account: {
        companyName: account.company_name,
        platform: account.platform,
        handle: account.handle,
      },
      intakeAnswers,
    });
    return { draft };
  } catch {
    return { error: ASSIST_FAILED };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "app/(dashboard)/sns/[id]/plan/actions.test.ts"`
Expected: PASS

- [ ] **Step 5: `PlanEditor.tsx` — write the failing test**

`app/(dashboard)/sns/[id]/plan/PlanEditor.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./actions", () => ({
  getPlanAssist: vi.fn(),
  saveSnsPlan: vi.fn(),
}));

import { getPlanAssist, saveSnsPlan } from "./actions";
import PlanEditor from "./PlanEditor";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

const TEMPLATES = [
  { id: "tpl-1", name: "SNS 운영안 템플릿", placeholders: ["operation_goal", "target_audience"] },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PlanEditor", () => {
  test("prompts to upload a template when none exist yet", () => {
    render(<PlanEditor accountId="acc-1" templates={[]} initialPlan={null} />);

    expect(
      screen.getByText("등록된 SNS용 PPT 템플릿이 없습니다. 설정에서 먼저 템플릿을 업로드해주세요.")
    ).toBeInTheDocument();
  });

  test("opens one input per placeholder once a template is selected", () => {
    render(<PlanEditor accountId="acc-1" templates={TEMPLATES} initialPlan={null} />);

    fireEvent.change(screen.getByLabelText("템플릿"), { target: { value: "tpl-1" } });

    expect(screen.getByLabelText("operation_goal")).toBeInTheDocument();
    expect(screen.getByLabelText("target_audience")).toBeInTheDocument();
  });

  test("restores a saved plan's template and field values", () => {
    render(
      <PlanEditor
        accountId="acc-1"
        templates={TEMPLATES}
        initialPlan={{
          id: "p1",
          account_id: "acc-1",
          template_id: "tpl-1",
          field_values: { operation_goal: "월 12회 게시로 팔로워 20% 성장" },
          updated_at: "2026-09-01T00:00:00Z",
        }}
      />
    );

    expect(screen.getByLabelText("operation_goal")).toHaveValue("월 12회 게시로 팔로워 20% 성장");
  });

  test("fills a field's AI draft without touching the others", async () => {
    mocked(getPlanAssist).mockResolvedValue({ draft: "월 12회 게시로 팔로워 20% 성장" });

    render(<PlanEditor accountId="acc-1" templates={TEMPLATES} initialPlan={null} />);
    fireEvent.change(screen.getByLabelText("템플릿"), { target: { value: "tpl-1" } });
    fireEvent.click(screen.getAllByRole("button", { name: "AI 초안" })[0]);

    await waitFor(() => {
      expect(screen.getByLabelText("operation_goal")).toHaveValue("월 12회 게시로 팔로워 20% 성장");
    });
    expect(getPlanAssist).toHaveBeenCalledWith("acc-1", "operation_goal");
    expect(screen.getByLabelText("target_audience")).toHaveValue("");
  });

  test("shows the fallback message on AI failure without clearing the field", async () => {
    mocked(getPlanAssist).mockResolvedValue({ error: "AI 제안 실패 — 직접 입력해주세요." });

    render(<PlanEditor accountId="acc-1" templates={TEMPLATES} initialPlan={null} />);
    fireEvent.change(screen.getByLabelText("템플릿"), { target: { value: "tpl-1" } });
    fireEvent.click(screen.getAllByRole("button", { name: "AI 초안" })[0]);

    await waitFor(() => {
      expect(screen.getByText("AI 제안 실패 — 직접 입력해주세요.")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("operation_goal")).toHaveValue("");
  });

  test("saves the template and field values", async () => {
    mocked(saveSnsPlan).mockResolvedValue({ success: true });

    render(<PlanEditor accountId="acc-1" templates={TEMPLATES} initialPlan={null} />);
    fireEvent.change(screen.getByLabelText("템플릿"), { target: { value: "tpl-1" } });
    fireEvent.change(screen.getByLabelText("operation_goal"), {
      target: { value: "월 12회 게시" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(saveSnsPlan).toHaveBeenCalledWith("acc-1", "tpl-1", { operation_goal: "월 12회 게시" });
    });
    expect(screen.getByText("저장되었습니다.")).toBeInTheDocument();
  });

  test("disables PPT download until a template is chosen, then links to the export route", () => {
    render(<PlanEditor accountId="acc-1" templates={TEMPLATES} initialPlan={null} />);

    expect(screen.getByRole("button", { name: "PPT 다운로드" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("템플릿"), { target: { value: "tpl-1" } });

    expect(screen.getByRole("link", { name: "PPT 다운로드" })).toHaveAttribute(
      "href",
      "/sns/acc-1/plan/export"
    );
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run "app/(dashboard)/sns/[id]/plan/PlanEditor.test.tsx"`
Expected: FAIL — module doesn't exist.

- [ ] **Step 7: Implement `PlanEditor.tsx`**

`app/(dashboard)/sns/[id]/plan/PlanEditor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { getPlanAssist, saveSnsPlan, type SnsPlanRow, type SnsPlanTemplateOption } from "./actions";

export default function PlanEditor({
  accountId,
  templates,
  initialPlan,
}: {
  accountId: string;
  templates: SnsPlanTemplateOption[];
  initialPlan: SnsPlanRow | null;
}) {
  const [templateId, setTemplateId] = useState(initialPlan?.template_id ?? "");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    initialPlan?.field_values ?? {}
  );
  const [assistLoadingField, setAssistLoadingField] = useState<string | null>(null);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;

  function handleSelectTemplate(value: string) {
    setTemplateId(value);
    setSaved(false);
  }

  function handleFieldChange(placeholder: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [placeholder]: value }));
    setSaved(false);
  }

  async function handleAssist(placeholder: string) {
    setAssistLoadingField(placeholder);
    setAssistError(null);
    const result = await getPlanAssist(accountId, placeholder);
    setAssistLoadingField(null);

    if ("error" in result) {
      setAssistError(result.error);
      return;
    }
    setFieldValues((prev) => ({ ...prev, [placeholder]: result.draft }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    const result = await saveSnsPlan(accountId, templateId, fieldValues);
    setSaving(false);

    if ("error" in result) {
      setSaveError(result.error);
      return;
    }
    setSaved(true);
  }

  if (templates.length === 0) {
    return (
      <section className="rounded-token border border-border bg-surface p-6">
        <h2 className="mb-1 text-lg font-bold text-text">운영안</h2>
        <p className="text-textMuted">
          등록된 SNS용 PPT 템플릿이 없습니다. 설정에서 먼저 템플릿을 업로드해주세요.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-token border border-border bg-surface p-6">
      <div className="mb-6 flex flex-col gap-2">
        <label htmlFor="plan-template" className="text-sm font-medium text-text">
          템플릿
        </label>
        <select
          id="plan-template"
          value={templateId}
          onChange={(e) => handleSelectTemplate(e.target.value)}
          className="max-w-xs rounded-token border border-border bg-surface2 px-3 py-2 text-text"
        >
          <option value="">템플릿을 선택하세요 (선택하지 않아도 저장할 수 있습니다)</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {selectedTemplate && (
        <div className="flex flex-col gap-6">
          {selectedTemplate.placeholders.map((placeholder) => (
            <div key={placeholder} className="flex flex-col gap-2">
              <label htmlFor={`field-${placeholder}`} className="text-sm font-medium text-text">
                {placeholder}
              </label>
              <textarea
                id={`field-${placeholder}`}
                aria-label={placeholder}
                value={fieldValues[placeholder] ?? ""}
                onChange={(e) => handleFieldChange(placeholder, e.target.value)}
                rows={3}
                className="rounded-token border border-border bg-surface2 px-3 py-2 text-text"
              />
              <button
                type="button"
                onClick={() => handleAssist(placeholder)}
                disabled={assistLoadingField === placeholder}
                className="self-start rounded-token border border-border px-3 py-1.5 text-sm text-textMuted disabled:opacity-60"
              >
                {assistLoadingField === placeholder ? "생성 중..." : "AI 초안"}
              </button>
            </div>
          ))}

          {assistError && <p className="text-sm text-critical">{assistError}</p>}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-token bg-accent px-4 py-2 font-medium text-onAccent disabled:opacity-60"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>

          {saved && <p className="text-sm text-success">저장되었습니다.</p>}
          {saveError && <p className="text-sm text-critical">{saveError}</p>}
        </div>
      )}

      <div className="mt-6">
        {templateId ? (
          <a
            href={`/sns/${accountId}/plan/export`}
            className="rounded-token border border-border px-4 py-2 text-sm text-text"
          >
            PPT 다운로드
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="템플릿을 선택해야 PPT를 다운로드할 수 있습니다."
            className="rounded-token border border-border px-4 py-2 text-sm text-textMuted opacity-60"
          >
            PPT 다운로드
          </button>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run "app/(dashboard)/sns/[id]/plan/PlanEditor.test.tsx"`
Expected: PASS

- [ ] **Step 9: Implement `page.tsx` (server load → props, no dedicated test)**

`app/(dashboard)/sns/[id]/plan/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import PlanEditor from "./PlanEditor";
import type { SnsPlanRow, SnsPlanTemplateOption } from "./actions";

export default async function SnsPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createDashboardSupabaseClient();

  const { data: account } = await supabase
    .from("sns_accounts")
    .select("id, company_name")
    .eq("id", id)
    .single();

  if (!account) notFound();

  const { data: templateRows } = await supabase
    .from("ppt_templates")
    .select("id, name, placeholders")
    .eq("kind", "sns");

  const templates = (templateRows ?? []) as SnsPlanTemplateOption[];

  const { data: plan } = await supabase
    .from("sns_plans")
    .select("id, account_id, template_id, field_values, updated_at")
    .eq("account_id", id)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/sns/${id}`} className="text-sm text-textMuted">
          ← 계정 상세로
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-text">{account.company_name} 운영안</h1>
      </div>

      <PlanEditor
        accountId={id}
        templates={templates}
        initialPlan={(plan as SnsPlanRow | null) ?? null}
      />
    </div>
  );
}
```

Manual smoke check (no automated test for this file, per the note above): after Task 5's SQL bundle is applied and a `kind='sns'` template exists, follow the "운영안 열기" link from `/sns/[id]` (added in Task 14) and confirm the template select, fields, and saved values round-trip.

- [ ] **Step 10: Commit**

```bash
git add "app/(dashboard)/sns/[id]/plan"
git commit -m "feat: add sns operation plan editor with template select and per-field AI drafts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 16: `/sns/[id]/plan/export` — PPT download route handler

**Files:**
- Create: `app/(dashboard)/sns/[id]/plan/export/route.ts`
- Test: `app/(dashboard)/sns/[id]/plan/export/route.test.ts`

**Interfaces:**
- Consumes: `getCurrentProfile` (`@/lib/auth/roles`) — this is a `GET` route handler, not a `"use server"` action, so it checks the session directly rather than via `requireRole`; `createDashboardSupabaseClient` (`@/lib/supabase/dashboard`); `downloadTemplateFile` (`@/lib/ppt/storage`) and `fillTemplate` (`@/lib/ppt/template`) from the pinned PPT-engine contract (both async, both `await`ed).
- Produces: `GET(request, { params }): Promise<Response>` — linked to from Task 15's `PlanEditor` "PPT 다운로드" anchor; not called from any other task's code.

- [ ] **Step 1: Write the failing test**

`app/(dashboard)/sns/[id]/plan/export/route.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/roles", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@/lib/supabase/dashboard", () => ({ createDashboardSupabaseClient: vi.fn() }));
vi.mock("@/lib/ppt/storage", () => ({ downloadTemplateFile: vi.fn() }));
vi.mock("@/lib/ppt/template", () => ({ fillTemplate: vi.fn(), extractPlaceholders: vi.fn() }));

import { getCurrentProfile } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { downloadTemplateFile } from "@/lib/ppt/storage";
import { fillTemplate } from "@/lib/ppt/template";
import { GET } from "./route";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

function mockSupabase({
  account = { id: "acc-1", company_name: "글로우랩" } as Record<string, unknown> | null,
  plan = { template_id: "tpl-1", field_values: { operation_goal: "월 12회 게시" } } as Record<
    string,
    unknown
  > | null,
  template = { storage_path: "sns/tpl-1.pptx" } as Record<string, unknown> | null,
} = {}) {
  mocked(createDashboardSupabaseClient).mockResolvedValue({
    from: (table: string) => {
      if (table === "sns_accounts") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: account }) }) }) };
      }
      if (table === "sns_plans") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: plan }) }) }),
        };
      }
      if (table === "ppt_templates") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: template }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked(getCurrentProfile).mockResolvedValue({ id: "u1", role: "staff" });
});

describe("GET /sns/[id]/plan/export", () => {
  test("returns 401 when nobody is signed in", async () => {
    mocked(getCurrentProfile).mockResolvedValue(null);

    const response = await GET(new Request("http://test/export"), {
      params: Promise.resolve({ id: "acc-1" }),
    });

    expect(response.status).toBe(401);
  });

  test("returns 404 for an unknown account", async () => {
    mockSupabase({ account: null });

    const response = await GET(new Request("http://test/export"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
  });

  test("returns 404 when the account has no template selected yet", async () => {
    mockSupabase({ plan: { template_id: null, field_values: {} } });

    const response = await GET(new Request("http://test/export"), {
      params: Promise.resolve({ id: "acc-1" }),
    });

    expect(response.status).toBe(404);
  });

  test("returns 404 when no plan has been saved yet", async () => {
    mockSupabase({ plan: null });

    const response = await GET(new Request("http://test/export"), {
      params: Promise.resolve({ id: "acc-1" }),
    });

    expect(response.status).toBe(404);
  });

  test("returns the spec's Korean error copy when the template file can't be downloaded", async () => {
    mockSupabase();
    mocked(downloadTemplateFile).mockResolvedValue(null);

    const response = await GET(new Request("http://test/export"), {
      params: Promise.resolve({ id: "acc-1" }),
    });

    expect(response.status).toBe(502);
    expect(await response.text()).toBe("템플릿 파일을 불러오지 못했습니다. 다시 업로드해주세요.");
  });

  test("fills the template and returns a downloadable pptx", async () => {
    mockSupabase();
    mocked(downloadTemplateFile).mockResolvedValue(Buffer.from("original-pptx"));
    mocked(fillTemplate).mockResolvedValue(Buffer.from("filled-pptx"));

    const response = await GET(new Request("http://test/export"), {
      params: Promise.resolve({ id: "acc-1" }),
    });

    expect(fillTemplate).toHaveBeenCalledWith(Buffer.from("original-pptx"), {
      operation_goal: "월 12회 게시",
    });
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    expect(response.headers.get("Content-Disposition")).toContain(
      encodeURIComponent("글로우랩-운영안.pptx")
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes)).toBe("filled-pptx");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/(dashboard)/sns/[id]/plan/export/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement the export route**

`app/(dashboard)/sns/[id]/plan/export/route.ts`:

```ts
import { getCurrentProfile } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { downloadTemplateFile } from "@/lib/ppt/storage";
import { fillTemplate } from "@/lib/ppt/template";

// Same auth/client pattern as the parallel event-management export route
// (campaigns/[id]/events/[eventId]/plan/export/route.ts): a GET route handler
// under app/(dashboard)/ isn't a "use server" action, so it checks the session
// directly with getCurrentProfile rather than requireRole.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("UNAUTHORIZED", { status: 401 });

  const { id } = await params;
  const supabase = await createDashboardSupabaseClient();

  const { data: account } = await supabase
    .from("sns_accounts")
    .select("id, company_name")
    .eq("id", id)
    .single();

  if (!account) return new Response("NOT_FOUND", { status: 404 });

  const { data: plan } = await supabase
    .from("sns_plans")
    .select("template_id, field_values")
    .eq("account_id", id)
    .maybeSingle();

  // No plan saved yet, or a plan saved without ever picking a template
  // (nullable by design — the web view works without a PPT). The "PPT
  // 다운로드" link is disabled client-side in this case too (Task 15), but the
  // route re-validates so a forged request can't reach fillTemplate with a
  // null template_id.
  if (!plan || !plan.template_id) return new Response("PLAN_NOT_FOUND", { status: 404 });

  const { data: template } = await supabase
    .from("ppt_templates")
    .select("storage_path")
    .eq("id", plan.template_id)
    .single();

  if (!template) return new Response("TEMPLATE_NOT_FOUND", { status: 404 });

  const pptx = await downloadTemplateFile(template.storage_path);
  if (!pptx) {
    return new Response("템플릿 파일을 불러오지 못했습니다. 다시 업로드해주세요.", { status: 502 });
  }

  const filled = await fillTemplate(pptx, plan.field_values as Record<string, string>);
  const filename = `${account.company_name}-운영안.pptx`;

  return new Response(filled, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "app/(dashboard)/sns/[id]/plan/export/route.test.ts"`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/sns/[id]/plan/export"
git commit -m "feat: add sns operation plan PPT export route

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-09-01-sns-operation-design.md`):

- 기능 범위 (1) 자료요청·사전체크사항 설문 링크 생성 및 결과 수집: Task 2 (`sns_intake_template`/`sns_intake_responses` + `get_sns_intake_context`/`submit_sns_intake` RPCs), Task 10 (`/settings/sns-intake` admin editor), Task 11 (public `/sns-intake/[token]` form).
- 기능 범위 (2) SNS 운영안 초안 작성 (웹 + PPT): Task 3 (`sns_plans` table), Task 7 (`generatePlanFieldDraft`), Task 15 (`/sns/[id]/plan` template select + per-field inputs + AI 초안 + save), Task 16 (PPT export route).
- 기능 범위 (3) 콘텐츠 캘린더: Task 3 (`sns_contents` table), Task 8 (`buildMonthGrid`), Task 14 (`ContentCalendarView`, `ContentBoard` tabs).
- 기능 범위 (4) 업체 승인 공유 링크: Task 4 (`get_pending_contents`/`review_sns_content` RPCs), Task 12 (public `/sns-approval/[token]` page + `ApprovalControls`).
- 기능 범위 (5) 콘텐츠 문안 AI 초안: Task 6 (`generateCaptionDraft`), Task 13 (`getCaptionAssist` action), Task 14 (`ContentForm`'s "AI 문안" button).
- 기능 범위 (6) 게시 후 성과 기록 (수동 입력 + 월별 집계): Task 3 (`view_count`/`like_count`/`comment_count`/`status_changed_at` columns), Task 13 (`savePerformance`, posted-only guard), Task 14 (`PerformanceForm`, `MonthlySummaryCard`), Task 8 (`summarizeByMonth`).
- 핵심 화면/플로우 1 (`/sns` 목록 + 새 계정 + 사이드바 활성화): Task 9.
- 핵심 화면/플로우 2 (`/sns/[id]` 상세: 캘린더/목록, 상태 변경, AI 문안, 성과 입력, 월별 요약, 사전설문 결과, 공유 링크): Task 14.
- 핵심 화면/플로우 3 (`/sns/[id]/plan` 운영안: 템플릿 선택 nullable, placeholder 입력, AI 초안, 저장, 웹에서 바로 보기, PPT 다운로드 비활성 처리): Task 15 (`PlanEditor` renders every field as a live-editable, immediately-visible input — no separate PPT step required to see the values — and disables the download control until a template is chosen) + Task 16 (export route, which also re-validates the same null-template case server-side).
- 핵심 화면/플로우 4 (사전설문 제출 + 질문틀 admin 수정): Task 10, Task 11.
- 핵심 화면/플로우 5 (콘텐츠 문안 AI 초안): Task 13, Task 14 (same as 기능 범위 5 above).
- 핵심 화면/플로우 6 (업체 승인 + 멱등 재조회): Task 4, Task 12 (same as 기능 범위 4 above).
- 인증 및 권한 (대시보드는 `createDashboardSupabaseClient`/RLS, 공개 라우트는 `createServerSupabaseClient`+RPC, admin/staff 2단계, `/settings/sns-intake` admin 전용): enforced across every action file in Tasks 9–16 via `requireRole`, and Tasks 10/11/12 via the public-route pattern.
- 에러 처리 및 검증 (사전설문 필수항목·잘못된 토큰, 승인 링크 토큰 오류 vs 처리할 항목 없음 + 멱등, AI 폴백 문구, 콘텐츠 제목 필수 + 상태 재검증, 성과 음수 차단 + posted 전용, 공개 액션 재검증): Task 11 (intake form validation + `notFound()`), Task 12 (두 개의 다른 안내 문구), Task 6/7/13/15 (AI fallback), Task 13 (title required, status enum re-validation, negative/non-integer rejection, `.eq("status","posted")` guard), Task 16 (`downloadTemplateFile` null → Korean error message).
- UI/디자인 시스템 (Tailwind 토큰 클래스, 한국어 UI, `font-mono tabular-nums`): followed in every component across Tasks 9–16 (Task 14's `PerformanceForm`/`MonthlySummaryCard`, Task 15's field inputs).
- 제외 범위 (SNS API 자동 게시/자동 수집, 광고 집행 관리, 캠페인 FK): none of the 16 tasks implement any of these — `sns_accounts` (Task 1) carries no `campaign_id` or similar FK, and no task calls an external SNS API; confirmed absent by construction.

**Placeholder scan:** no "TBD" / "implement later" / "similar to Task N" strings appear anywhere in Tasks 1–16; every step carries complete, runnable code and an explicit expected test outcome. Task 14's Step 7 (`ContentBoard.tsx`) and Task 15's Step 9 (`page.tsx`) are the only steps without a dedicated failing-test cycle, and both say so explicitly with the reason (thin orchestration already covered by their child components' tests) rather than silently skipping it.

**Type consistency:**
- `PlanAssistInput` and `generatePlanFieldDraft` are defined once in Task 7 (`lib/ai/snsPlanAssist.ts`) and consumed by name, unchanged, in Task 15's `getPlanAssist` — the `{ placeholder, account: { companyName, platform, handle }, intakeAnswers }` shape matches exactly, including `intakeAnswers` being label-keyed.
- `SnsPlanTemplateOption { id, name, placeholders }` (Task 15) mirrors the shape of the shared `PptTemplate` type from `2026-09-01-ppt-template-engine.md` Task 5 (`id, kind, name, storage_path, placeholders, uploaded_at`) minus the fields Task 15 doesn't need (`kind` is filtered server-side by the `.eq("kind", "sns")` query in `page.tsx`, not carried into the client type; `storage_path`/`uploaded_at` are only needed by the export route, which re-fetches them itself).
- `SnsPlanRow { id, account_id, template_id, field_values, updated_at }` matches the `sns_plans` columns defined in Task 3 exactly (`template_id uuid` nullable, `field_values jsonb`).
- `PlanActionResult`/`FieldDraftResult` (Task 15) follow the same two-branch shape (`{ error: string } | { success: true }` and `{ draft: string } | { error: string }`) as `ActionResult`/`CaptionAssistActionResult` in Task 13 and `PlanAssistInput`'s caller contract in Task 7 — no ad hoc result shapes introduced.
- `saveSnsPlan`/`getPlanAssist` (Task 15) are referenced by exactly those names in `PlanEditor.tsx` (Task 15) and nowhere else — no task calls them `saveSnsPlanAction` or similar.
- The export route (Task 16) imports `downloadTemplateFile` and `fillTemplate` with the exact async signatures pinned in the Prerequisites section (`Promise<Buffer | null>` and `Promise<Buffer>`) and `await`s both, and reproduces the Prerequisites' exact fallback string for a `null` download result.
- `ppt_templates.kind` values are the two-member union `"event" | "sns"` fixed by the ppt-template-engine plan's migration 0015; Task 15's `page.tsx` query (`.eq("kind", "sns")`) and the spec's 화면/플로우 3 (`kind='sns' 목록`) agree.

No spec ambiguity required resolution beyond what the existing Task 1–14 "Design decisions locked in here" list already recorded — Tasks 15 and 16 consume `sns_plans`/`ppt_templates` exactly as those tasks defined them, and the one open question the task brief flagged (whether `intakeAnswers` mapping happens in Task 7 or Task 15) was already answered unambiguously by Task 7's own Interfaces block ("the caller does the label mapping"), which Task 15 implements as written.



