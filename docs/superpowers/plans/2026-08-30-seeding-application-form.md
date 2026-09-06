# Seeding Application Form & Applicant List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 스펙 "핵심 화면/플로우" 2번 — an AI-drafted, staff-edited campaign application form that publishes to a public token link, a public applicant submission route, and the applicant list in both its internal dashboard view and its read-only shared-link view, with Excel/CSV export.

**Architecture:** `campaign_form_config` holds one row per campaign (소개문구 + 커스텀 질문 + 공개 여부). `applicants` stores the six 표준 필드 as real columns plus a `custom_answers` JSONB keyed by custom-question id. Three `SECURITY DEFINER` RPC functions carry every public interaction — `get_apply_form` and `submit_application` scoped by `campaigns.apply_token`, `get_applicant_list` scoped by `campaigns.applicant_list_token` — so `anon` never gets direct table access, mirroring `0005_pre_survey_rpc.sql`. The internal applicant-list page calls the *same* `get_applicant_list` RPC using the campaign's own token, so the internal and shared views are guaranteed identical and there is one read path to audit. The applicant table itself is a single client component reused by both pages.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres RPC + RLS), `@google/genai` (`gemini-3.6-flash`) for the intro draft, Tailwind v4 design tokens, Vitest + React Testing Library.

**Spec:** [docs/superpowers/specs/2026-08-30-influencer-seeding-management-design.md](../specs/2026-08-30-influencer-seeding-management-design.md)

## Prerequisites

Plan 1 (foundation) and [2026-08-30-seeding-pre-survey.md](2026-08-30-seeding-pre-survey.md) (Plan 2) are already implemented, merged, and deployed. This plan reuses verbatim, without redefining any of it:

- `lib/supabase/server.ts` → `createServerSupabaseClient()` (**async — must be awaited**), `lib/supabase/client.ts` → `createBrowserSupabaseClient()`
- `lib/auth/roles.ts` → `getCurrentProfile()`, `requireRole("admin" | "staff")` returning `Profile { id, role, full_name }`
- `lib/ai/preSurveyAssist.ts` → exports `ASSIST_MODEL = "gemini-3.6-flash"` (Task 4 imports this constant)
- Migrations `0001`–`0005`: `profiles`, `campaigns`, `pre_survey_template`, `pre_survey_responses`, pre-survey RPCs
- `campaigns` columns: `id, name, company_name, campaign_type ('shipping'|'visit'), status ('draft'|'active'|'closed'), pre_survey_token, apply_token, applicant_list_token, seeding_sheet_token, created_by, created_at`
- `app/(dashboard)/layout.tsx` (sidebar + auth gate), `app/(dashboard)/campaigns/{page.tsx,new/page.tsx,[id]/page.tsx,actions.ts}`
- Tailwind tokens: `bg-bg bg-surface bg-surface2 border-border text-text text-textMuted bg-accent bg-accentSoft bg-accent2 text-onAccent text-critical text-success text-warning rounded-token font-display font-body font-mono`

## Scope Boundary — Read This Before Starting

This plan builds the form + the *read* side of the applicant list only.

**In scope:** `campaign_form_config`, `applicants` (including the `status` column and its four allowed values), AI intro draft, the internal form-config/publish screen, the public `/apply/[token]` route, the applicant list (internal + shared read view), CSV/Excel export.

**Explicitly NOT in scope — other plans own these. Do not build them here:**
- 최종선정/예비선정 actions and status transitions (Plan 4). Define the `status` column and its check constraint, but write **no** UI, server action, or RPC that mutates `status`, `status_changed_by`, or `status_changed_at`.
- `seeding_records` (Plan 4), 관리시트 (Plan 5), 결과보고서 (Plan 6).

**Migration numbers:** this plan owns **0006, 0007, 0008 only**. Three sibling plans are being written in parallel and own 0009+. Do not renumber and do not take an unlisted number.

## Global Constraints

- All writes to `applicants` in this plan go through the `submit_application` RPC — never a direct `insert()`. Plan 4 will add its own status-change RPC; there is deliberately no `insert`/`update` RLS policy on `applicants` for any role.
- All reads of the applicant list — internal dashboard *and* shared link — go through `get_applicant_list`. The internal page passes the campaign's own `applicant_list_token`. One read path, one shape.
- Public routes get **no** direct table grants. Every RPC is `security definer`, `set search_path = public`, followed by `revoke execute ... from public;` then `grant execute ... to anon, authenticated;` — exactly the shape of `0005_pre_survey_rpc.sql`.
- Server actions are reachable from the unauthenticated public routes. Re-validate untrusted input inside the action even though the RPC validates too.
- Every server action has an explicit `Promise<...>` return type. Without it, TypeScript cannot narrow via `"error" in result` and the build breaks.
- Any action calling `revalidatePath` needs `vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))` in its unit test.
- Pages that load saved config read it server-side and pass it into the client editor as props. Never initialise a client form to empty and let "저장" wipe stored data.
- AI calls are server-side only, model `gemini-3.6-flash` via `@google/genai`, key from `GEMINI_API_KEY`. On any failure fall back to manual entry with the message `"AI 제안 실패 — 직접 입력해주세요."` (spec: 에러 처리 및 검증) — never block the user.
- `applicants.status` is exactly one of `applied` | `selected` | `reserved` | `rejected`, defaulting to `applied`. `status_changed_by` is exactly `agency` | `company` or null.
- 개인정보 수집 동의 (`privacy_consent`) is **required** to submit; 2차활용 동의 (`secondary_use_consent`) is recorded either way and never blocks submission. (Judgment call — the spec says "동의 체크박스 미체크 시 제출 차단" without saying which; blocking on the optional secondary-use consent would make it not a consent.)
- 중복 제출 (same SNS link or contact within one campaign) is **warned, not blocked** (spec: 에러 처리 및 검증). Detection happens on the list side, computed from the loaded rows — the submit path never rejects a duplicate.
- All UI copy in Korean. Commit messages in English, each ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## File Structure

```
marketing/
├── supabase/migrations/
│   ├── 0006_campaign_form_config.sql        # per-campaign intro + custom questions + published flag
│   ├── 0007_applicants.sql                  # standard columns + custom_answers jsonb + status
│   └── 0008_apply_rpc.sql                   # get_apply_form / submit_application / get_applicant_list
├── lib/
│   ├── ai/
│   │   └── formIntroAssist.ts               # generateFormIntroDraft(...) -> string
│   └── applicants/
│       ├── types.ts                         # CustomQuestion, ApplicantStatus, ApplicantRow, ApplicantListContext
│       ├── csv.ts                           # toApplicantsCsv(...) -> string (UTF-8 BOM, Excel-openable)
│       └── duplicates.ts                    # findDuplicateApplicantIds(...) -> Set<string>
└── app/
    ├── apply/
    │   └── [token]/
    │       ├── page.tsx                     # public: RPC-loaded, unpublished -> guidance page
    │       ├── actions.ts                   # submitApplication (single write path)
    │       └── ApplyForm.tsx                # public client form
    ├── applicants/
    │   └── [token]/
    │       └── page.tsx                     # public shared list, read-only (Plan 4 adds actions here)
    └── (dashboard)/campaigns/[id]/
        ├── apply-form/
        │   ├── page.tsx                     # staff: loads saved config, passes as props
        │   ├── actions.ts                   # saveApplyFormConfig, getIntroDraft
        │   └── ApplyFormEditor.tsx          # staff client editor (AI draft -> edit -> 게시)
        └── applicants/
            ├── page.tsx                     # internal list view
            └── ApplicantTable.tsx           # shared client table + export button (both list pages)
```

`ApplicantTable.tsx` lives beside the internal page and is imported by the public shared page (`@/app/(dashboard)/campaigns/[id]/applicants/ApplicantTable`), the same cross-import Plan 2 used for `PreSurveyForm`.

---

## Task 1: `campaign_form_config` Table

**Files:**
- Create: `supabase/migrations/0006_campaign_form_config.sql`
- Test: `supabase/migrations/0006_campaign_form_config.test.ts`

**Interfaces:**
- Consumes: `public.campaigns` (foundation plan).
- Produces: table `public.campaign_form_config (campaign_id uuid primary key references campaigns on delete cascade, intro_text text not null default '', custom_questions jsonb not null default '[]', is_published boolean not null default false, updated_at timestamptz not null default now())`. Authenticated users may `select`, `insert`, `update`. `anon` gets nothing — the public route reads it only through the Task 3 RPC.

- [ ] **Step 1: Write the failing test**

`supabase/migrations/0006_campaign_form_config.test.ts`:

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

async function makeCampaign() {
  const { data, error } = await admin
    .from("campaigns")
    .insert({ name: "폼설정 캠페인", company_name: "글로우랩", campaign_type: "shipping" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

test("a config row defaults to empty intro, no questions, and unpublished", async () => {
  const campaign = await makeCampaign();

  const { error: insertError } = await admin
    .from("campaign_form_config")
    .insert({ campaign_id: campaign.id });
  expect(insertError).toBeNull();

  const { data, error } = await admin
    .from("campaign_form_config")
    .select("campaign_id, intro_text, custom_questions, is_published")
    .eq("campaign_id", campaign.id)
    .single();

  expect(error).toBeNull();
  expect(data).toEqual({
    campaign_id: campaign.id,
    intro_text: "",
    custom_questions: [],
    is_published: false,
  });
});

test("only one config row can exist per campaign", async () => {
  const campaign = await makeCampaign();
  await admin.from("campaign_form_config").insert({ campaign_id: campaign.id });

  const { error } = await admin
    .from("campaign_form_config")
    .insert({ campaign_id: campaign.id });

  expect(error).not.toBeNull();
});

test("custom questions round-trip as JSONB", async () => {
  const campaign = await makeCampaign();
  await admin.from("campaign_form_config").insert({
    campaign_id: campaign.id,
    intro_text: "글로우랩 세럼 체험단을 모집합니다.",
    custom_questions: [{ id: "cq1", label: "피부 타입을 알려주세요" }],
    is_published: true,
  });

  const { data } = await admin
    .from("campaign_form_config")
    .select("intro_text, custom_questions, is_published")
    .eq("campaign_id", campaign.id)
    .single();

  expect(data).toEqual({
    intro_text: "글로우랩 세럼 체험단을 모집합니다.",
    custom_questions: [{ id: "cq1", label: "피부 타입을 알려주세요" }],
    is_published: true,
  });
});

test("the anon client cannot read the config directly", async () => {
  const campaign = await makeCampaign();
  await admin.from("campaign_form_config").insert({ campaign_id: campaign.id });

  const { data } = await anon
    .from("campaign_form_config")
    .select("campaign_id")
    .eq("campaign_id", campaign.id);

  expect(data ?? []).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- 0006_campaign_form_config`
Expected: FAIL — `relation "public.campaign_form_config" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0006_campaign_form_config.sql`:

```sql
-- One application-form configuration per campaign: the AI-drafted-then-staff-edited
-- 소개문구, the campaign's custom questions, and whether the public /apply link is live.
-- campaign_id is the primary key, which enforces the 1:1 relationship for free.
create table public.campaign_form_config (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  intro_text text not null default '',
  custom_questions jsonb not null default '[]'::jsonb,
  is_published boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.campaign_form_config enable row level security;

-- No anon policy on purpose: the public /apply route reads this only through the
-- token-scoped get_apply_form RPC in 0008.
create policy "authenticated users can read form config"
  on public.campaign_form_config for select
  to authenticated
  using (true);

create policy "authenticated users can create form config"
  on public.campaign_form_config for insert
  to authenticated
  with check (true);

create policy "authenticated users can update form config"
  on public.campaign_form_config for update
  to authenticated
  using (true)
  with check (true);
```

- [ ] **Step 4: Apply the migration and run test to verify it passes**

Run: `npx supabase migration up`
Run: `npm test -- 0006_campaign_form_config`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_campaign_form_config.sql supabase/migrations/0006_campaign_form_config.test.ts
git commit -m "feat: add campaign_form_config table for per-campaign application forms

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: `applicants` Table

**Files:**
- Create: `supabase/migrations/0007_applicants.sql`
- Test: `supabase/migrations/0007_applicants.test.ts`

**Interfaces:**
- Consumes: `public.campaigns` (foundation plan).
- Produces: table `public.applicants` with columns `id uuid pk`, `campaign_id uuid fk`, `name text`, `sns_url text`, `nationality text`, `contact text`, `privacy_consent boolean` (must be true), `secondary_use_consent boolean`, `custom_answers jsonb default '{}'`, `status text default 'applied' check in ('applied','selected','reserved','rejected')`, `applied_at timestamptz default now()`, `status_changed_by text check in ('agency','company')` nullable, `status_changed_at timestamptz` nullable. Authenticated users may `select` only; there is no `insert`/`update` policy for anyone — inserts happen through the Task 3 RPC, and Plan 4 will add its own status-change RPC.

- [ ] **Step 1: Write the failing test**

`supabase/migrations/0007_applicants.test.ts`:

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

async function makeCampaign() {
  const { data, error } = await admin
    .from("campaigns")
    .insert({ name: "지원자 캠페인", company_name: "글로우랩", campaign_type: "shipping" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

const baseApplicant = {
  name: "김서연",
  sns_url: "https://instagram.com/seoyeon",
  nationality: "대한민국",
  contact: "010-1234-5678",
  privacy_consent: true,
  secondary_use_consent: false,
};

test("an applicant row stores the standard fields and defaults to applied", async () => {
  const campaign = await makeCampaign();

  const { error: insertError } = await admin
    .from("applicants")
    .insert({ campaign_id: campaign.id, ...baseApplicant });
  expect(insertError).toBeNull();

  const { data, error } = await admin
    .from("applicants")
    .select(
      "campaign_id, name, sns_url, nationality, contact, privacy_consent, secondary_use_consent, custom_answers, status, status_changed_by, status_changed_at"
    )
    .eq("campaign_id", campaign.id)
    .single();

  expect(error).toBeNull();
  expect(data).toEqual({
    campaign_id: campaign.id,
    ...baseApplicant,
    custom_answers: {},
    status: "applied",
    status_changed_by: null,
    status_changed_at: null,
  });
});

test("status only accepts the four spec values", async () => {
  const campaign = await makeCampaign();

  for (const status of ["applied", "selected", "reserved", "rejected"]) {
    const { error } = await admin
      .from("applicants")
      .insert({ campaign_id: campaign.id, ...baseApplicant, status });
    expect(error).toBeNull();
  }

  const { error } = await admin
    .from("applicants")
    .insert({ campaign_id: campaign.id, ...baseApplicant, status: "shortlisted" });
  expect(error).not.toBeNull();
});

test("status_changed_by only accepts agency or company", async () => {
  const campaign = await makeCampaign();
  const { error } = await admin
    .from("applicants")
    .insert({ campaign_id: campaign.id, ...baseApplicant, status_changed_by: "robot" });
  expect(error).not.toBeNull();
});

test("privacy consent is mandatory at the database level", async () => {
  const campaign = await makeCampaign();
  const { error } = await admin
    .from("applicants")
    .insert({ campaign_id: campaign.id, ...baseApplicant, privacy_consent: false });
  expect(error).not.toBeNull();
});

test("custom answers round-trip as JSONB keyed by question id", async () => {
  const campaign = await makeCampaign();
  await admin.from("applicants").insert({
    campaign_id: campaign.id,
    ...baseApplicant,
    custom_answers: { cq1: "지성 피부입니다" },
  });

  const { data } = await admin
    .from("applicants")
    .select("custom_answers")
    .eq("campaign_id", campaign.id)
    .single();

  expect(data?.custom_answers).toEqual({ cq1: "지성 피부입니다" });
});

test("the anon client cannot insert directly (must go through the RPC)", async () => {
  const campaign = await makeCampaign();
  const { error } = await anon
    .from("applicants")
    .insert({ campaign_id: campaign.id, ...baseApplicant });
  expect(error).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- 0007_applicants`
Expected: FAIL — `relation "public.applicants" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0007_applicants.sql`:

```sql
-- The six 표준 필드 from the spec are real columns so they can be indexed, exported,
-- and duplicate-checked; only the per-campaign custom questions live in JSONB.
create table public.applicants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  sns_url text not null,
  nationality text not null,
  contact text not null,
  -- 개인정보 수집 동의는 필수. 2차활용 동의는 선택이라 값만 기록한다.
  privacy_consent boolean not null check (privacy_consent),
  secondary_use_consent boolean not null default false,
  custom_answers jsonb not null default '{}'::jsonb,
  status text not null default 'applied'
    check (status in ('applied', 'selected', 'reserved', 'rejected')),
  applied_at timestamptz not null default now(),
  -- 최종선정/예비선정 감사 추적용. 이 계획서는 값을 쓰지 않는다 (Plan 4 담당).
  status_changed_by text check (status_changed_by in ('agency', 'company')),
  status_changed_at timestamptz
);

create index applicants_campaign_id_applied_at_idx
  on public.applicants (campaign_id, applied_at);

alter table public.applicants enable row level security;

-- Read-only for authenticated users. There is deliberately no insert or update
-- policy for any role: submissions go through submit_application (0008), and the
-- 최종선정/예비선정 write path is a separate RPC owned by the selection plan.
create policy "authenticated users can read applicants"
  on public.applicants for select
  to authenticated
  using (true);
```

- [ ] **Step 4: Apply the migration and run test to verify it passes**

Run: `npx supabase migration up`
Run: `npm test -- 0007_applicants`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0007_applicants.sql supabase/migrations/0007_applicants.test.ts
git commit -m "feat: add applicants table with standard columns and status values

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Token-Scoped Apply RPC Functions

**Files:**
- Create: `supabase/migrations/0008_apply_rpc.sql`
- Test: `supabase/migrations/0008_apply_rpc.test.ts`

**Interfaces:**
- Consumes: `public.campaigns` (`apply_token`, `applicant_list_token`), `public.campaign_form_config` (Task 1), `public.applicants` (Task 2).
- Produces, all granted to `anon, authenticated`:
  - `get_apply_form(p_token uuid) returns json` — `null` if no campaign has that `apply_token`; otherwise `{ campaign_id, campaign_name, company_name, campaign_type, is_published, intro_text, custom_questions }`. When unpublished, `intro_text` is `null` and `custom_questions` is `[]` so an unpublished draft never leaks.
  - `submit_application(p_token uuid, p_name text, p_sns_url text, p_nationality text, p_contact text, p_privacy_consent boolean, p_secondary_use_consent boolean, p_custom_answers jsonb) returns boolean` — `false` when the token matches nothing or the form is unpublished; raises `MISSING_REQUIRED_FIELD` / `PRIVACY_CONSENT_REQUIRED` on bad input; otherwise inserts and returns `true`.
  - `get_applicant_list(p_token uuid) returns json` — `null` if no campaign has that `applicant_list_token`; otherwise `{ campaign_id, campaign_name, company_name, campaign_type, custom_questions, applicants: [...] }` ordered by `applied_at` ascending (append-only ordering keeps row numbers stable as new applications arrive).

- [ ] **Step 1: Write the failing test**

`supabase/migrations/0008_apply_rpc.test.ts`:

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

const QUESTIONS = [{ id: "cq1", label: "피부 타입을 알려주세요" }];

async function makeCampaign(published: boolean) {
  const { data, error } = await admin
    .from("campaigns")
    .insert({ name: "글로우랩 세럼", company_name: "글로우랩", campaign_type: "shipping" })
    .select()
    .single();
  if (error) throw error;

  await admin.from("campaign_form_config").insert({
    campaign_id: data.id,
    intro_text: "글로우랩 세럼 체험단을 모집합니다.",
    custom_questions: QUESTIONS,
    is_published: published,
  });

  return data;
}

const VALID_SUBMISSION = {
  p_name: "김서연",
  p_sns_url: "https://instagram.com/seoyeon",
  p_nationality: "대한민국",
  p_contact: "010-1234-5678",
  p_privacy_consent: true,
  p_secondary_use_consent: true,
  p_custom_answers: { cq1: "지성 피부입니다" },
};

test("get_apply_form returns the published form for a valid token, as anon", async () => {
  const campaign = await makeCampaign(true);

  const { data, error } = await anon.rpc("get_apply_form", { p_token: campaign.apply_token });

  expect(error).toBeNull();
  expect(data).toEqual({
    campaign_id: campaign.id,
    campaign_name: "글로우랩 세럼",
    company_name: "글로우랩",
    campaign_type: "shipping",
    is_published: true,
    intro_text: "글로우랩 세럼 체험단을 모집합니다.",
    custom_questions: QUESTIONS,
  });
});

test("get_apply_form hides the draft content of an unpublished form", async () => {
  const campaign = await makeCampaign(false);

  const { data } = await anon.rpc("get_apply_form", { p_token: campaign.apply_token });

  expect(data.is_published).toBe(false);
  expect(data.intro_text).toBeNull();
  expect(data.custom_questions).toEqual([]);
});

test("get_apply_form returns null for an unknown token", async () => {
  const { data, error } = await anon.rpc("get_apply_form", {
    p_token: "00000000-0000-0000-0000-000000000000",
  });
  expect(error).toBeNull();
  expect(data).toBeNull();
});

test("submit_application inserts an applicant and returns true, as anon", async () => {
  const campaign = await makeCampaign(true);

  const { data, error } = await anon.rpc("submit_application", {
    p_token: campaign.apply_token,
    ...VALID_SUBMISSION,
  });

  expect(error).toBeNull();
  expect(data).toBe(true);

  const { data: row } = await admin
    .from("applicants")
    .select("name, sns_url, nationality, contact, secondary_use_consent, custom_answers, status")
    .eq("campaign_id", campaign.id)
    .single();

  expect(row).toEqual({
    name: "김서연",
    sns_url: "https://instagram.com/seoyeon",
    nationality: "대한민국",
    contact: "010-1234-5678",
    secondary_use_consent: true,
    custom_answers: { cq1: "지성 피부입니다" },
    status: "applied",
  });
});

test("submit_application returns false for an unpublished form", async () => {
  const campaign = await makeCampaign(false);

  const { data } = await anon.rpc("submit_application", {
    p_token: campaign.apply_token,
    ...VALID_SUBMISSION,
  });

  expect(data).toBe(false);
});

test("submit_application returns false for an unknown token", async () => {
  const { data } = await anon.rpc("submit_application", {
    p_token: "00000000-0000-0000-0000-000000000000",
    ...VALID_SUBMISSION,
  });
  expect(data).toBe(false);
});

test("submit_application rejects a missing privacy consent", async () => {
  const campaign = await makeCampaign(true);

  const { error } = await anon.rpc("submit_application", {
    p_token: campaign.apply_token,
    ...VALID_SUBMISSION,
    p_privacy_consent: false,
  });

  expect(error?.message).toContain("PRIVACY_CONSENT_REQUIRED");
});

test("submit_application rejects a blank required field", async () => {
  const campaign = await makeCampaign(true);

  const { error } = await anon.rpc("submit_application", {
    p_token: campaign.apply_token,
    ...VALID_SUBMISSION,
    p_name: "   ",
  });

  expect(error?.message).toContain("MISSING_REQUIRED_FIELD");
});

test("submit_application accepts a submission without the optional secondary-use consent", async () => {
  const campaign = await makeCampaign(true);

  const { data } = await anon.rpc("submit_application", {
    p_token: campaign.apply_token,
    ...VALID_SUBMISSION,
    p_secondary_use_consent: false,
  });

  expect(data).toBe(true);
});

test("get_applicant_list returns the campaign, questions and applicants in application order", async () => {
  const campaign = await makeCampaign(true);

  await anon.rpc("submit_application", {
    p_token: campaign.apply_token,
    ...VALID_SUBMISSION,
    p_name: "먼저 신청",
  });
  await anon.rpc("submit_application", {
    p_token: campaign.apply_token,
    ...VALID_SUBMISSION,
    p_name: "나중 신청",
  });

  const { data, error } = await anon.rpc("get_applicant_list", {
    p_token: campaign.applicant_list_token,
  });

  expect(error).toBeNull();
  expect(data.campaign_id).toBe(campaign.id);
  expect(data.campaign_name).toBe("글로우랩 세럼");
  expect(data.company_name).toBe("글로우랩");
  expect(data.campaign_type).toBe("shipping");
  expect(data.custom_questions).toEqual(QUESTIONS);
  expect(data.applicants.map((a: { name: string }) => a.name)).toEqual([
    "먼저 신청",
    "나중 신청",
  ]);
  expect(data.applicants[0]).toEqual(
    expect.objectContaining({
      sns_url: "https://instagram.com/seoyeon",
      nationality: "대한민국",
      contact: "010-1234-5678",
      privacy_consent: true,
      secondary_use_consent: true,
      custom_answers: { cq1: "지성 피부입니다" },
      status: "applied",
    })
  );
});

test("get_applicant_list returns an empty applicant array before anyone applies", async () => {
  const campaign = await makeCampaign(true);

  const { data } = await anon.rpc("get_applicant_list", {
    p_token: campaign.applicant_list_token,
  });

  expect(data.applicants).toEqual([]);
});

test("get_applicant_list returns null for an unknown token", async () => {
  const { data, error } = await anon.rpc("get_applicant_list", {
    p_token: "00000000-0000-0000-0000-000000000000",
  });
  expect(error).toBeNull();
  expect(data).toBeNull();
});

test("the apply_token cannot be used to read the applicant list", async () => {
  const campaign = await makeCampaign(true);

  const { data } = await anon.rpc("get_applicant_list", { p_token: campaign.apply_token });

  expect(data).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- 0008_apply_rpc`
Expected: FAIL — `function get_apply_form(uuid) does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0008_apply_rpc.sql`:

```sql
-- All three functions are SECURITY DEFINER so the public /apply and /applicants
-- links can work scoped strictly by their own campaign token, without granting
-- anon any direct table access. Each token is single-purpose: apply_token can
-- never read the applicant list, and applicant_list_token can never submit.

create or replace function public.get_apply_form(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  select json_build_object(
    'campaign_id', c.id,
    'campaign_name', c.name,
    'company_name', c.company_name,
    'campaign_type', c.campaign_type,
    'is_published', coalesce(f.is_published, false),
    -- An unpublished draft must not leak through the public link.
    'intro_text', case when coalesce(f.is_published, false) then f.intro_text else null end,
    'custom_questions', case
      when coalesce(f.is_published, false) then f.custom_questions
      else '[]'::jsonb
    end
  )
  into result
  from public.campaigns c
  left join public.campaign_form_config f on f.campaign_id = c.id
  where c.apply_token = p_token;

  return result;
end;
$$;

revoke execute on function public.get_apply_form(uuid) from public;
grant execute on function public.get_apply_form(uuid) to anon, authenticated;

create or replace function public.submit_application(
  p_token uuid,
  p_name text,
  p_sns_url text,
  p_nationality text,
  p_contact text,
  p_privacy_consent boolean,
  p_secondary_use_consent boolean,
  p_custom_answers jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
begin
  if coalesce(btrim(p_name), '') = ''
     or coalesce(btrim(p_sns_url), '') = ''
     or coalesce(btrim(p_nationality), '') = ''
     or coalesce(btrim(p_contact), '') = '' then
    raise exception 'MISSING_REQUIRED_FIELD';
  end if;

  if p_privacy_consent is not true then
    raise exception 'PRIVACY_CONSENT_REQUIRED';
  end if;

  select c.id into v_campaign_id
  from public.campaigns c
  join public.campaign_form_config f on f.campaign_id = c.id
  where c.apply_token = p_token
    and f.is_published;

  if v_campaign_id is null then
    return false;
  end if;

  insert into public.applicants (
    campaign_id, name, sns_url, nationality, contact,
    privacy_consent, secondary_use_consent, custom_answers
  )
  values (
    v_campaign_id,
    btrim(p_name),
    btrim(p_sns_url),
    btrim(p_nationality),
    btrim(p_contact),
    true,
    coalesce(p_secondary_use_consent, false),
    coalesce(p_custom_answers, '{}'::jsonb)
  );

  return true;
end;
$$;

revoke execute on function public.submit_application(uuid, text, text, text, text, boolean, boolean, jsonb) from public;
grant execute on function public.submit_application(uuid, text, text, text, text, boolean, boolean, jsonb) to anon, authenticated;

create or replace function public.get_applicant_list(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  select json_build_object(
    'campaign_id', c.id,
    'campaign_name', c.name,
    'company_name', c.company_name,
    'campaign_type', c.campaign_type,
    'custom_questions', coalesce(f.custom_questions, '[]'::jsonb),
    'applicants', coalesce(
      (
        select json_agg(
          json_build_object(
            'id', a.id,
            'name', a.name,
            'sns_url', a.sns_url,
            'nationality', a.nationality,
            'contact', a.contact,
            'privacy_consent', a.privacy_consent,
            'secondary_use_consent', a.secondary_use_consent,
            'custom_answers', a.custom_answers,
            'status', a.status,
            'applied_at', a.applied_at,
            'status_changed_by', a.status_changed_by,
            'status_changed_at', a.status_changed_at
          )
          -- Ascending so existing row numbers stay put as new applications arrive.
          order by a.applied_at, a.id
        )
        from public.applicants a
        where a.campaign_id = c.id
      ),
      '[]'::json
    )
  )
  into result
  from public.campaigns c
  left join public.campaign_form_config f on f.campaign_id = c.id
  where c.applicant_list_token = p_token;

  return result;
end;
$$;

revoke execute on function public.get_applicant_list(uuid) from public;
grant execute on function public.get_applicant_list(uuid) to anon, authenticated;
```

- [ ] **Step 4: Apply the migration and run test to verify it passes**

Run: `npx supabase migration up`
Run: `npm test -- 0008_apply_rpc`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_apply_rpc.sql supabase/migrations/0008_apply_rpc.test.ts
git commit -m "feat: add token-scoped RPCs for the public apply form and applicant list

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: AI 소개문구 초안 생성

**Files:**
- Create: `lib/ai/formIntroAssist.ts`
- Test: `lib/ai/formIntroAssist.test.ts`

**Interfaces:**
- Consumes: `ASSIST_MODEL` exported from `lib/ai/preSurveyAssist.ts` (Plan 2) — same model, one place to change it.
- Produces: `generateFormIntroDraft(input: { campaignName: string; companyName: string; campaignType: "shipping" | "visit"; preSurveyAnswers: Record<string, string> }): Promise<string>` — throws `UNEXPECTED_RESPONSE` on empty output, propagates API errors. Task 5's `getIntroDraft` catches both and falls back.

No new dependency is needed: `@google/genai` is already installed and `GEMINI_API_KEY` is already in the environment.

- [ ] **Step 1: Write the failing test**

`lib/ai/formIntroAssist.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockGenerateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
  ThinkingLevel: { MINIMAL: "MINIMAL", LOW: "LOW", HIGH: "HIGH" },
}));

import { generateFormIntroDraft } from "./formIntroAssist";

const INPUT = {
  campaignName: "글로우랩 세럼 체험단",
  companyName: "글로우랩",
  campaignType: "shipping" as const,
  preSurveyAnswers: { "브랜드 소개를 부탁드립니다": "20대 여성 타겟 스킨케어 브랜드입니다" },
};

describe("generateFormIntroDraft", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  test("returns the trimmed draft text", async () => {
    mockGenerateContent.mockResolvedValue({ text: "  글로우랩 세럼 체험단을 모집합니다.  " });

    const result = await generateFormIntroDraft(INPUT);

    expect(result).toBe("글로우랩 세럼 체험단을 모집합니다.");
  });

  test("sends the campaign name, company name and pre-survey answers as context", async () => {
    mockGenerateContent.mockResolvedValue({ text: "초안" });

    await generateFormIntroDraft(INPUT);

    const call = mockGenerateContent.mock.calls[0][0];
    expect(call.model).toBe("gemini-3.6-flash");
    expect(call.contents).toContain("글로우랩 세럼 체험단");
    expect(call.contents).toContain("글로우랩");
    expect(call.contents).toContain("20대 여성 타겟 스킨케어 브랜드입니다");
  });

  test("tells the model the campaign is a shipping campaign", async () => {
    mockGenerateContent.mockResolvedValue({ text: "초안" });

    await generateFormIntroDraft(INPUT);

    expect(mockGenerateContent.mock.calls[0][0].contents).toContain("제품배송형");
  });

  test("tells the model the campaign is a visit campaign", async () => {
    mockGenerateContent.mockResolvedValue({ text: "초안" });

    await generateFormIntroDraft({ ...INPUT, campaignType: "visit" });

    expect(mockGenerateContent.mock.calls[0][0].contents).toContain("현장방문형");
  });

  test("marks the context as absent when there are no pre-survey answers", async () => {
    mockGenerateContent.mockResolvedValue({ text: "초안" });

    await generateFormIntroDraft({ ...INPUT, preSurveyAnswers: { q1: "  " } });

    expect(mockGenerateContent.mock.calls[0][0].contents).toContain("(없음)");
  });

  test("keeps thinking minimal and caps the output length", async () => {
    mockGenerateContent.mockResolvedValue({ text: "초안" });

    await generateFormIntroDraft(INPUT);

    expect(mockGenerateContent.mock.calls[0][0].config).toEqual(
      expect.objectContaining({
        maxOutputTokens: expect.any(Number),
        thinkingConfig: { thinkingLevel: "MINIMAL" },
      })
    );
  });

  test("throws when the response carries no usable text", async () => {
    mockGenerateContent.mockResolvedValue({ text: "   " });

    await expect(generateFormIntroDraft(INPUT)).rejects.toThrow("UNEXPECTED_RESPONSE");
  });

  test("propagates API errors", async () => {
    mockGenerateContent.mockRejectedValue(new Error("rate limited"));

    await expect(generateFormIntroDraft(INPUT)).rejects.toThrow("rate limited");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- formIntroAssist`
Expected: FAIL — `lib/ai/formIntroAssist.ts` doesn't exist.

- [ ] **Step 3: Implement**

`lib/ai/formIntroAssist.ts`:

```ts
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { ASSIST_MODEL } from "./preSurveyAssist";

export type IntroAssistInput = {
  campaignName: string;
  companyName: string;
  campaignType: "shipping" | "visit";
  preSurveyAnswers: Record<string, string>;
};

const TYPE_LABEL: Record<IntroAssistInput["campaignType"], string> = {
  shipping: "제품배송형 (제품을 인플루언서에게 배송)",
  visit: "현장방문형 (인플루언서가 매장/현장을 방문)",
};

// Same reasoning as preSurveyAssist: this model always reasons before answering
// and those tokens count against maxOutputTokens. A 4-5 sentence recruitment
// blurb needs no deliberation, so MINIMAL is right; the budget is larger than the
// pre-survey helper's because the intro is a longer piece of copy.
const INTRO_CONFIG = {
  maxOutputTokens: 1200,
  thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
};

export async function generateFormIntroDraft(input: IntroAssistInput): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const contextLines = Object.entries(input.preSurveyAnswers)
    .filter(([, value]) => value.trim().length > 0)
    .map(([question, answer]) => `- ${question}: ${answer}`)
    .join("\n");

  const response = await ai.models.generateContent({
    model: ASSIST_MODEL,
    contents: `당신은 인플루언서 마케팅 에이전시의 카피라이터입니다. 아래 업체 사전조사 내용을 바탕으로, 인플루언서 모집 신청폼 맨 위에 들어갈 소개문구 초안을 써주세요.

규칙:
- 4~5문장의 평문으로만 작성한다.
- 인플루언서(지원자)에게 말하는 톤으로, 어떤 브랜드의 어떤 캠페인인지와 참여하면 무엇을 받는지가 드러나게 쓴다.
- 사전조사에 없는 보상 금액, 일정, 인원 같은 구체 조건을 지어내지 않는다.
- 머리말, 제목, 마크다운 서식, 이모지, 해시태그를 쓰지 않는다.
- 소개문구 본문만 출력한다.

캠페인명: ${input.campaignName}
업체명: ${input.companyName}
캠페인 유형: ${TYPE_LABEL[input.campaignType]}

업체 사전조사 답변:
${contextLines || "(없음)"}`,
    config: INTRO_CONFIG,
  });

  const draft = response.text?.trim();
  if (!draft) throw new Error("UNEXPECTED_RESPONSE");
  return draft;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- formIntroAssist`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ai/formIntroAssist.ts lib/ai/formIntroAssist.test.ts
git commit -m "feat: add AI application-form intro draft generation from pre-survey answers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: Internal Application-Form Config & Publish Screen

**Files:**
- Create: `lib/applicants/types.ts`
- Create: `app/(dashboard)/campaigns/[id]/apply-form/actions.ts`
- Create: `app/(dashboard)/campaigns/[id]/apply-form/ApplyFormEditor.tsx`
- Create: `app/(dashboard)/campaigns/[id]/apply-form/page.tsx`
- Test: `app/(dashboard)/campaigns/[id]/apply-form/actions.test.ts`
- Test: `app/(dashboard)/campaigns/[id]/apply-form/ApplyFormEditor.test.tsx`

**Interfaces:**
- Consumes: `requireRole("staff")`, `createServerSupabaseClient()`, `generateFormIntroDraft()` (Task 4), tables from Tasks 1–2.
- Produces:
  - `lib/applicants/types.ts`:
    - `type CustomQuestion = { id: string; label: string }`
    - `type ApplicantStatus = "applied" | "selected" | "reserved" | "rejected"`
    - `type ApplicantRow = { id, name, sns_url, nationality, contact, privacy_consent, secondary_use_consent, custom_answers: Record<string,string>, status: ApplicantStatus, applied_at: string, status_changed_by: "agency" | "company" | null, status_changed_at: string | null }`
    - `type ApplicantListContext = { campaign_id, campaign_name, company_name, campaign_type: "shipping" | "visit", custom_questions: CustomQuestion[], applicants: ApplicantRow[] }`
  - `saveApplyFormConfig(campaignId: string, introText: string, questions: CustomQuestion[], isPublished: boolean): Promise<ActionResult>` where `ActionResult = { error: string } | { success: true }` — trims, drops blank questions, refuses to publish with a blank intro, upserts on `campaign_id`.
  - `getIntroDraft(campaignId: string): Promise<{ draft: string } | { error: string }>`
  - `<ApplyFormEditor campaignId applyToken initialIntro initialQuestions initialPublished />`

All custom questions are optional free-text (judgment call — the spec's "필수항목" refers to the 표준 필드; a per-question required flag is not specified and is left out to keep the shape identical to `PreSurveyQuestion`).

- [ ] **Step 1: Write the shared types file**

`lib/applicants/types.ts`:

```ts
export type CustomQuestion = { id: string; label: string };

export type ApplicantStatus = "applied" | "selected" | "reserved" | "rejected";

export type ApplicantRow = {
  id: string;
  name: string;
  sns_url: string;
  nationality: string;
  contact: string;
  privacy_consent: boolean;
  secondary_use_consent: boolean;
  custom_answers: Record<string, string>;
  status: ApplicantStatus;
  applied_at: string;
  status_changed_by: "agency" | "company" | null;
  status_changed_at: string | null;
};

export type ApplicantListContext = {
  campaign_id: string;
  campaign_name: string;
  company_name: string;
  campaign_type: "shipping" | "visit";
  custom_questions: CustomQuestion[];
  applicants: ApplicantRow[];
};

export const STATUS_LABEL: Record<ApplicantStatus, string> = {
  applied: "지원",
  selected: "최종선정",
  reserved: "예비선정",
  rejected: "미선정",
};
```

- [ ] **Step 2: Write the failing test for the actions**

`app/(dashboard)/campaigns/[id]/apply-form/actions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/roles", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/ai/formIntroAssist", () => ({ generateFormIntroDraft: vi.fn() }));

import { requireRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateFormIntroDraft } from "@/lib/ai/formIntroAssist";
import { saveApplyFormConfig, getIntroDraft } from "./actions";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocked(requireRole).mockResolvedValue({ id: "u1", role: "staff", full_name: "담당자" });
});

describe("saveApplyFormConfig", () => {
  function mockUpsert(result: { error: unknown } = { error: null }) {
    const upsert = vi.fn().mockResolvedValue(result);
    mocked(createServerSupabaseClient).mockResolvedValue({ from: () => ({ upsert }) });
    return upsert;
  }

  test("refuses to publish with a blank intro", async () => {
    mockUpsert();

    const result = await saveApplyFormConfig("c1", "   ", [], true);

    expect(result).toEqual({ error: "게시하려면 소개문구를 입력해주세요." });
  });

  test("allows saving an unpublished draft with a blank intro", async () => {
    const upsert = mockUpsert();

    const result = await saveApplyFormConfig("c1", "", [], false);

    expect(result).toEqual({ success: true });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ campaign_id: "c1", intro_text: "", is_published: false }),
      { onConflict: "campaign_id" }
    );
  });

  test("trims the intro, trims question labels and drops blank ones", async () => {
    const upsert = mockUpsert();

    const result = await saveApplyFormConfig(
      "c1",
      "  체험단을 모집합니다.  ",
      [
        { id: "cq1", label: "  피부 타입을 알려주세요  " },
        { id: "cq2", label: "   " },
      ],
      true
    );

    expect(result).toEqual({ success: true });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        campaign_id: "c1",
        intro_text: "체험단을 모집합니다.",
        custom_questions: [{ id: "cq1", label: "피부 타입을 알려주세요" }],
        is_published: true,
      }),
      { onConflict: "campaign_id" }
    );
  });

  test("returns an error message when the database write fails", async () => {
    mockUpsert({ error: { message: "boom" } });

    const result = await saveApplyFormConfig("c1", "체험단을 모집합니다.", [], true);

    expect(result).toEqual({ error: "저장에 실패했습니다. 다시 시도해주세요." });
  });

  test("requires a signed-in staff member", async () => {
    mockUpsert();
    await saveApplyFormConfig("c1", "체험단을 모집합니다.", [], false);
    expect(requireRole).toHaveBeenCalledWith("staff");
  });
});

describe("getIntroDraft", () => {
  function mockCampaignAndPreSurvey(response: unknown) {
    mocked(createServerSupabaseClient).mockResolvedValue({
      from: (table: string) => {
        if (table === "campaigns") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    name: "글로우랩 세럼 체험단",
                    company_name: "글로우랩",
                    campaign_type: "shipping",
                  },
                }),
              }),
            }),
          };
        }
        if (table === "pre_survey_template") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { questions: [{ id: "q1", label: "브랜드 소개를 부탁드립니다" }] },
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: response }) }) }),
            }),
          }),
        };
      },
    });
  }

  test("passes the campaign info and label-keyed pre-survey answers to the model", async () => {
    mockCampaignAndPreSurvey({ answers: { q1: "20대 여성 타겟 스킨케어 브랜드입니다" } });
    mocked(generateFormIntroDraft).mockResolvedValue("글로우랩 세럼 체험단을 모집합니다.");

    const result = await getIntroDraft("c1");

    expect(result).toEqual({ draft: "글로우랩 세럼 체험단을 모집합니다." });
    expect(generateFormIntroDraft).toHaveBeenCalledWith({
      campaignName: "글로우랩 세럼 체험단",
      companyName: "글로우랩",
      campaignType: "shipping",
      preSurveyAnswers: { "브랜드 소개를 부탁드립니다": "20대 여성 타겟 스킨케어 브랜드입니다" },
    });
  });

  test("still generates a draft when no pre-survey has been submitted", async () => {
    mockCampaignAndPreSurvey(null);
    mocked(generateFormIntroDraft).mockResolvedValue("초안");

    const result = await getIntroDraft("c1");

    expect(result).toEqual({ draft: "초안" });
    expect(generateFormIntroDraft).toHaveBeenCalledWith(
      expect.objectContaining({ preSurveyAnswers: {} })
    );
  });

  test("falls back to manual entry when generation fails", async () => {
    mockCampaignAndPreSurvey({ answers: {} });
    mocked(generateFormIntroDraft).mockRejectedValue(new Error("boom"));

    const result = await getIntroDraft("c1");

    expect(result).toEqual({ error: "AI 제안 실패 — 직접 입력해주세요." });
  });

  test("returns an error when the campaign does not exist", async () => {
    mocked(createServerSupabaseClient).mockResolvedValue({
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }),
    });

    const result = await getIntroDraft("missing");

    expect(result).toEqual({ error: "AI 제안 실패 — 직접 입력해주세요." });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- "apply-form/actions"`
Expected: FAIL — the actions module doesn't exist.

- [ ] **Step 4: Implement the actions**

`app/(dashboard)/campaigns/[id]/apply-form/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateFormIntroDraft } from "@/lib/ai/formIntroAssist";
import type { CustomQuestion } from "@/lib/applicants/types";

export type ActionResult = { error: string } | { success: true };
export type IntroDraftResult = { draft: string } | { error: string };

const ASSIST_FAILED = "AI 제안 실패 — 직접 입력해주세요.";

export async function saveApplyFormConfig(
  campaignId: string,
  introText: string,
  questions: CustomQuestion[],
  isPublished: boolean
): Promise<ActionResult> {
  await requireRole("staff");

  const intro = introText.trim();
  const cleaned = questions
    .map((q) => ({ id: q.id, label: q.label.trim() }))
    .filter((q) => q.label.length > 0);

  if (isPublished && intro.length === 0) {
    return { error: "게시하려면 소개문구를 입력해주세요." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("campaign_form_config").upsert(
    {
      campaign_id: campaignId,
      intro_text: intro,
      custom_questions: cleaned,
      is_published: isPublished,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "campaign_id" }
  );

  if (error) return { error: "저장에 실패했습니다. 다시 시도해주세요." };

  revalidatePath(`/campaigns/${campaignId}/apply-form`);
  return { success: true } as const;
}

export async function getIntroDraft(campaignId: string): Promise<IntroDraftResult> {
  await requireRole("staff");

  const supabase = await createServerSupabaseClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("name, company_name, campaign_type")
    .eq("id", campaignId)
    .single();

  if (!campaign) return { error: ASSIST_FAILED };

  const { data: template } = await supabase
    .from("pre_survey_template")
    .select("questions")
    .eq("id", 1)
    .single();

  const { data: response } = await supabase
    .from("pre_survey_responses")
    .select("answers")
    .eq("campaign_id", campaignId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Key the context by question label, not id — the model reads it as prose.
  const questions = (template?.questions ?? []) as CustomQuestion[];
  const answers = (response?.answers ?? {}) as Record<string, string>;
  const preSurveyAnswers: Record<string, string> = {};
  for (const q of questions) {
    const answer = answers[q.id];
    if (answer && answer.trim().length > 0) preSurveyAnswers[q.label] = answer;
  }

  try {
    const draft = await generateFormIntroDraft({
      campaignName: campaign.name,
      companyName: campaign.company_name,
      campaignType: campaign.campaign_type as "shipping" | "visit",
      preSurveyAnswers,
    });
    return { draft };
  } catch {
    return { error: ASSIST_FAILED };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- "apply-form/actions"`
Expected: PASS

- [ ] **Step 6: Write the failing test for the editor component**

`app/(dashboard)/campaigns/[id]/apply-form/ApplyFormEditor.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./actions", () => ({
  saveApplyFormConfig: vi.fn(),
  getIntroDraft: vi.fn(),
}));

import { saveApplyFormConfig, getIntroDraft } from "./actions";
import ApplyFormEditor from "./ApplyFormEditor";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

const PROPS = {
  campaignId: "c1",
  applyToken: "tok-apply",
  initialIntro: "저장된 소개문구입니다.",
  initialQuestions: [{ id: "cq1", label: "피부 타입을 알려주세요" }],
  initialPublished: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked(saveApplyFormConfig).mockResolvedValue({ success: true });
});

describe("ApplyFormEditor", () => {
  test("renders the saved intro and questions rather than empty fields", () => {
    render(<ApplyFormEditor {...PROPS} />);

    expect(screen.getByLabelText("소개문구")).toHaveValue("저장된 소개문구입니다.");
    expect(screen.getByLabelText("커스텀 질문 1")).toHaveValue("피부 타입을 알려주세요");
  });

  test("fills the AI draft into the intro field", async () => {
    mocked(getIntroDraft).mockResolvedValue({ draft: "AI가 쓴 소개문구입니다." });

    render(<ApplyFormEditor {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "AI 초안 생성" }));

    await waitFor(() => {
      expect(screen.getByLabelText("소개문구")).toHaveValue("AI가 쓴 소개문구입니다.");
    });
    expect(getIntroDraft).toHaveBeenCalledWith("c1");
  });

  test("shows the fallback message on AI failure without clearing the intro", async () => {
    mocked(getIntroDraft).mockResolvedValue({ error: "AI 제안 실패 — 직접 입력해주세요." });

    render(<ApplyFormEditor {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "AI 초안 생성" }));

    await waitFor(() => {
      expect(screen.getByText("AI 제안 실패 — 직접 입력해주세요.")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("소개문구")).toHaveValue("저장된 소개문구입니다.");
  });

  test("saving an unpublished form keeps it unpublished", async () => {
    render(<ApplyFormEditor {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(saveApplyFormConfig).toHaveBeenCalledWith(
        "c1",
        "저장된 소개문구입니다.",
        [{ id: "cq1", label: "피부 타입을 알려주세요" }],
        false
      );
    });
  });

  test("게시하기 saves with isPublished true and then shows the public link", async () => {
    render(<ApplyFormEditor {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "게시하기" }));

    await waitFor(() => {
      expect(saveApplyFormConfig).toHaveBeenCalledWith(
        "c1",
        "저장된 소개문구입니다.",
        [{ id: "cq1", label: "피부 타입을 알려주세요" }],
        true
      );
    });
    await waitFor(() => {
      expect(screen.getByText("/apply/tok-apply")).toBeInTheDocument();
    });
  });

  test("an already published form offers 게시 취소 and shows the link up front", () => {
    render(<ApplyFormEditor {...PROPS} initialPublished={true} />);

    expect(screen.getByText("/apply/tok-apply")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "게시 취소" })).toBeInTheDocument();
  });

  test("shows the server error and stays unpublished when publishing is rejected", async () => {
    mocked(saveApplyFormConfig).mockResolvedValue({ error: "게시하려면 소개문구를 입력해주세요." });

    render(<ApplyFormEditor {...PROPS} initialIntro="" />);
    fireEvent.click(screen.getByRole("button", { name: "게시하기" }));

    await waitFor(() => {
      expect(screen.getByText("게시하려면 소개문구를 입력해주세요.")).toBeInTheDocument();
    });
    expect(screen.queryByText("/apply/tok-apply")).not.toBeInTheDocument();
  });

  test("adds and removes custom questions", async () => {
    render(<ApplyFormEditor {...PROPS} />);

    fireEvent.click(screen.getByRole("button", { name: "질문 추가" }));
    fireEvent.change(screen.getByLabelText("커스텀 질문 2"), {
      target: { value: "선호 제품을 알려주세요" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "삭제" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(saveApplyFormConfig).toHaveBeenCalledWith(
        "c1",
        "저장된 소개문구입니다.",
        [expect.objectContaining({ label: "선호 제품을 알려주세요" })],
        false
      );
    });
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- ApplyFormEditor`
Expected: FAIL — `ApplyFormEditor.tsx` doesn't exist.

- [ ] **Step 8: Implement the editor component**

`app/(dashboard)/campaigns/[id]/apply-form/ApplyFormEditor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { saveApplyFormConfig, getIntroDraft } from "./actions";
import type { CustomQuestion } from "@/lib/applicants/types";

let idCounter = 0;
function newQuestionId() {
  idCounter += 1;
  return `cq-${Date.now()}-${idCounter}`;
}

export default function ApplyFormEditor({
  campaignId,
  applyToken,
  initialIntro,
  initialQuestions,
  initialPublished,
}: {
  campaignId: string;
  applyToken: string;
  initialIntro: string;
  initialQuestions: CustomQuestion[];
  initialPublished: boolean;
}) {
  const [intro, setIntro] = useState(initialIntro);
  const [questions, setQuestions] = useState<CustomQuestion[]>(initialQuestions);
  const [published, setPublished] = useState(initialPublished);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [assistLoading, setAssistLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

  async function handleAssist() {
    setAssistLoading(true);
    setAssistError(null);
    const result = await getIntroDraft(campaignId);
    setAssistLoading(false);

    if ("error" in result) {
      setAssistError(result.error);
      return;
    }
    setIntro(result.draft);
  }

  async function handleSave(nextPublished: boolean) {
    setSaving(true);
    setStatus(null);
    const result = await saveApplyFormConfig(campaignId, intro, questions, nextPublished);
    setSaving(false);

    if ("error" in result) {
      setStatus({ kind: "error", message: result.error });
      return;
    }
    setPublished(nextPublished);
    setStatus({
      kind: "ok",
      message: nextPublished ? "게시되었습니다." : "저장되었습니다.",
    });
  }

  return (
    <div className="max-w-2xl">
      <div className="flex flex-col gap-2">
        <label htmlFor="intro" className="text-sm font-medium text-text">
          소개문구
        </label>
        <textarea
          id="intro"
          aria-label="소개문구"
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          rows={6}
          placeholder="지원자에게 보여줄 캠페인 소개문구"
          className="rounded-token border border-border bg-surface px-3 py-2 text-text"
        />
        <button
          type="button"
          onClick={handleAssist}
          disabled={assistLoading}
          className="self-start rounded-token border border-border px-3 py-1.5 text-sm text-textMuted disabled:opacity-60"
        >
          {assistLoading ? "생성 중..." : "AI 초안 생성"}
        </button>
        {assistError && <p className="text-sm text-critical">{assistError}</p>}
      </div>

      <h2 className="mt-10 mb-1 text-lg font-bold text-text">커스텀 질문</h2>
      <p className="mb-3 text-sm text-textMuted">
        이름·SNS 링크·국적·연락처·동의 항목은 모든 캠페인에 기본으로 들어갑니다. 이 캠페인에만
        추가로 물어볼 항목을 적어주세요.
      </p>
      <div className="flex flex-col gap-3">
        {questions.map((q, i) => (
          <div key={q.id} className="flex gap-2">
            <input
              value={q.label}
              aria-label={`커스텀 질문 ${i + 1}`}
              onChange={(e) => {
                const next = [...questions];
                next[i] = { ...next[i], label: e.target.value };
                setQuestions(next);
              }}
              placeholder="질문 내용"
              className="flex-1 rounded-token border border-border bg-surface px-3 py-2 text-text"
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
      <button
        type="button"
        onClick={() => setQuestions([...questions, { id: newQuestionId(), label: "" }])}
        className="mt-3 rounded-token border border-border px-4 py-2 text-text"
      >
        질문 추가
      </button>

      <div className="mt-10 flex gap-2">
        <button
          type="button"
          onClick={() => handleSave(published)}
          disabled={saving}
          className="rounded-token border border-border px-4 py-2 text-text disabled:opacity-60"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        {published ? (
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            className="rounded-token border border-border px-4 py-2 text-critical disabled:opacity-60"
          >
            게시 취소
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving}
            className="rounded-token bg-accent px-4 py-2 font-medium text-onAccent disabled:opacity-60"
          >
            게시하기
          </button>
        )}
      </div>

      {status && (
        <p className={`mt-3 text-sm ${status.kind === "error" ? "text-critical" : "text-text"}`}>
          {status.message}
        </p>
      )}

      {published && (
        <div className="mt-6 rounded-token border border-border bg-surface p-4">
          <p className="mb-1 text-xs text-textMuted">지원자 신청 링크</p>
          <code className="block overflow-x-auto text-sm text-text">/apply/{applyToken}</code>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- ApplyFormEditor`
Expected: PASS

- [ ] **Step 10: Implement the page**

The page reads the stored config server-side and hands it to the editor as props — never let the editor start empty and overwrite saved data on 저장.

`app/(dashboard)/campaigns/[id]/apply-form/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import ApplyFormEditor from "./ApplyFormEditor";
import type { CustomQuestion } from "@/lib/applicants/types";

export default async function ApplyFormConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("staff");

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, company_name, apply_token")
    .eq("id", id)
    .single();

  if (!campaign) notFound();

  const { data: config } = await supabase
    .from("campaign_form_config")
    .select("intro_text, custom_questions, is_published")
    .eq("campaign_id", id)
    .maybeSingle();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-text">{campaign.name}</h1>
      <p className="mb-8 text-textMuted">{campaign.company_name} · 신청폼 설정</p>
      <ApplyFormEditor
        campaignId={campaign.id}
        applyToken={campaign.apply_token}
        initialIntro={config?.intro_text ?? ""}
        initialQuestions={(config?.custom_questions ?? []) as CustomQuestion[]}
        initialPublished={config?.is_published ?? false}
      />
    </div>
  );
}
```

- [ ] **Step 11: Commit**

```bash
git add lib/applicants/types.ts "app/(dashboard)/campaigns/[id]/apply-form"
git commit -m "feat: add internal application-form config screen with AI intro draft

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: Public Application Form at `/apply/[token]`

**Files:**
- Create: `app/apply/[token]/actions.ts`
- Create: `app/apply/[token]/ApplyForm.tsx`
- Create: `app/apply/[token]/page.tsx`
- Test: `app/apply/[token]/actions.test.ts`
- Test: `app/apply/[token]/ApplyForm.test.tsx`

**Interfaces:**
- Consumes: `createServerSupabaseClient()`, `submit_application` RPC (Task 3), `CustomQuestion` (Task 5).
- Produces:
  - `type ApplicationInput = { name: string; snsUrl: string; nationality: string; contact: string; privacyConsent: boolean; secondaryUseConsent: boolean; customAnswers: Record<string, string> }`
  - `submitApplication(token: string, input: ApplicationInput): Promise<{ error: string } | { success: true }>` — re-validates required fields and the privacy consent before calling the RPC, because this action is reachable from the unauthenticated route.
  - `<ApplyForm token={string} questions={CustomQuestion[]} />`

- [ ] **Step 1: Write the failing test for the action**

`app/apply/[token]/actions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { submitApplication, type ApplicationInput } from "./actions";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

const VALID: ApplicationInput = {
  name: "김서연",
  snsUrl: "https://instagram.com/seoyeon",
  nationality: "대한민국",
  contact: "010-1234-5678",
  privacyConsent: true,
  secondaryUseConsent: false,
  customAnswers: { cq1: "지성 피부입니다" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitApplication", () => {
  test("passes the trimmed fields to the RPC and returns success", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocked(createServerSupabaseClient).mockResolvedValue({ rpc });

    const result = await submitApplication("tok", { ...VALID, name: "  김서연  " });

    expect(result).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("submit_application", {
      p_token: "tok",
      p_name: "김서연",
      p_sns_url: "https://instagram.com/seoyeon",
      p_nationality: "대한민국",
      p_contact: "010-1234-5678",
      p_privacy_consent: true,
      p_secondary_use_consent: false,
      p_custom_answers: { cq1: "지성 피부입니다" },
    });
  });

  test("rejects a blank required field before touching the database", async () => {
    const rpc = vi.fn();
    mocked(createServerSupabaseClient).mockResolvedValue({ rpc });

    const result = await submitApplication("tok", { ...VALID, contact: "   " });

    expect(result).toEqual({ error: "필수 항목을 모두 입력해주세요." });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("rejects a missing privacy consent before touching the database", async () => {
    const rpc = vi.fn();
    mocked(createServerSupabaseClient).mockResolvedValue({ rpc });

    const result = await submitApplication("tok", { ...VALID, privacyConsent: false });

    expect(result).toEqual({ error: "개인정보 수집 및 이용에 동의해주세요." });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("accepts a submission without the optional secondary-use consent", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocked(createServerSupabaseClient).mockResolvedValue({ rpc });

    const result = await submitApplication("tok", { ...VALID, secondaryUseConsent: false });

    expect(result).toEqual({ success: true });
  });

  test("returns an error when the RPC reports an unknown or unpublished form", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    mocked(createServerSupabaseClient).mockResolvedValue({ rpc });

    const result = await submitApplication("bad-token", VALID);

    expect(result).toEqual({ error: "제출에 실패했습니다. 링크가 유효한지 확인해주세요." });
  });

  test("returns an error when the RPC itself fails", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    mocked(createServerSupabaseClient).mockResolvedValue({ rpc });

    const result = await submitApplication("tok", VALID);

    expect(result).toEqual({ error: "제출에 실패했습니다. 링크가 유효한지 확인해주세요." });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "app/apply/\[token\]/actions"`
Expected: FAIL — the actions module doesn't exist.

- [ ] **Step 3: Implement the action**

`app/apply/[token]/actions.ts`:

```ts
"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ApplicationInput = {
  name: string;
  snsUrl: string;
  nationality: string;
  contact: string;
  privacyConsent: boolean;
  secondaryUseConsent: boolean;
  customAnswers: Record<string, string>;
};

export type SubmitApplicationResult = { error: string } | { success: true };

const SUBMIT_FAILED = "제출에 실패했습니다. 링크가 유효한지 확인해주세요.";

export async function submitApplication(
  token: string,
  input: ApplicationInput
): Promise<SubmitApplicationResult> {
  // Re-validated here as well as in the RPC: this action is reachable from the
  // unauthenticated public route, so every field is untrusted input.
  const name = input.name.trim();
  const snsUrl = input.snsUrl.trim();
  const nationality = input.nationality.trim();
  const contact = input.contact.trim();

  if (!name || !snsUrl || !nationality || !contact) {
    return { error: "필수 항목을 모두 입력해주세요." };
  }
  if (input.privacyConsent !== true) {
    return { error: "개인정보 수집 및 이용에 동의해주세요." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("submit_application", {
    p_token: token,
    p_name: name,
    p_sns_url: snsUrl,
    p_nationality: nationality,
    p_contact: contact,
    p_privacy_consent: true,
    p_secondary_use_consent: input.secondaryUseConsent === true,
    p_custom_answers: input.customAnswers ?? {},
  });

  if (error || data !== true) return { error: SUBMIT_FAILED };

  return { success: true } as const;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- "app/apply/\[token\]/actions"`
Expected: PASS

- [ ] **Step 5: Write the failing test for the form component**

`app/apply/[token]/ApplyForm.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./actions", () => ({ submitApplication: vi.fn() }));

import { submitApplication } from "./actions";
import ApplyForm from "./ApplyForm";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

const QUESTIONS = [{ id: "cq1", label: "피부 타입을 알려주세요" }];

function fillStandardFields() {
  fireEvent.change(screen.getByLabelText("이름"), { target: { value: "김서연" } });
  fireEvent.change(screen.getByLabelText("SNS 계정 링크"), {
    target: { value: "https://instagram.com/seoyeon" },
  });
  fireEvent.change(screen.getByLabelText("국적"), { target: { value: "대한민국" } });
  fireEvent.change(screen.getByLabelText("연락처"), { target: { value: "010-1234-5678" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked(submitApplication).mockResolvedValue({ success: true });
});

describe("ApplyForm", () => {
  test("submits every standard field, the consents, and the custom answers", async () => {
    render(<ApplyForm token="tok" questions={QUESTIONS} />);

    fillStandardFields();
    fireEvent.change(screen.getByLabelText("피부 타입을 알려주세요"), {
      target: { value: "지성 피부입니다" },
    });
    fireEvent.click(screen.getByLabelText("개인정보 수집 및 이용에 동의합니다. (필수)"));
    fireEvent.click(screen.getByLabelText("촬영물의 2차 활용에 동의합니다. (선택)"));
    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));

    await waitFor(() => {
      expect(submitApplication).toHaveBeenCalledWith("tok", {
        name: "김서연",
        snsUrl: "https://instagram.com/seoyeon",
        nationality: "대한민국",
        contact: "010-1234-5678",
        privacyConsent: true,
        secondaryUseConsent: true,
        customAnswers: { cq1: "지성 피부입니다" },
      });
    });
  });

  test("blocks submission when the required consent is unchecked", async () => {
    render(<ApplyForm token="tok" questions={QUESTIONS} />);

    fillStandardFields();
    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));

    await waitFor(() => {
      expect(screen.getByText("개인정보 수집 및 이용에 동의해주세요.")).toBeInTheDocument();
    });
    expect(submitApplication).not.toHaveBeenCalled();
  });

  test("blocks submission when a required field is empty", async () => {
    render(<ApplyForm token="tok" questions={QUESTIONS} />);

    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "김서연" } });
    fireEvent.click(screen.getByLabelText("개인정보 수집 및 이용에 동의합니다. (필수)"));
    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));

    await waitFor(() => {
      expect(screen.getByText("필수 항목을 모두 입력해주세요.")).toBeInTheDocument();
    });
    expect(submitApplication).not.toHaveBeenCalled();
  });

  test("submits without the optional secondary-use consent", async () => {
    render(<ApplyForm token="tok" questions={QUESTIONS} />);

    fillStandardFields();
    fireEvent.click(screen.getByLabelText("개인정보 수집 및 이용에 동의합니다. (필수)"));
    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));

    await waitFor(() => {
      expect(submitApplication).toHaveBeenCalledWith(
        "tok",
        expect.objectContaining({ secondaryUseConsent: false })
      );
    });
  });

  test("shows a thank-you message after a successful submission", async () => {
    render(<ApplyForm token="tok" questions={QUESTIONS} />);

    fillStandardFields();
    fireEvent.click(screen.getByLabelText("개인정보 수집 및 이용에 동의합니다. (필수)"));
    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));

    await waitFor(() => {
      expect(screen.getByText("신청이 접수되었습니다. 감사합니다.")).toBeInTheDocument();
    });
  });

  test("shows the server error and keeps the form open", async () => {
    mocked(submitApplication).mockResolvedValue({
      error: "제출에 실패했습니다. 링크가 유효한지 확인해주세요.",
    });

    render(<ApplyForm token="tok" questions={QUESTIONS} />);

    fillStandardFields();
    fireEvent.click(screen.getByLabelText("개인정보 수집 및 이용에 동의합니다. (필수)"));
    fireEvent.click(screen.getByRole("button", { name: "신청하기" }));

    await waitFor(() => {
      expect(
        screen.getByText("제출에 실패했습니다. 링크가 유효한지 확인해주세요.")
      ).toBeInTheDocument();
    });
    expect(screen.getByLabelText("이름")).toHaveValue("김서연");
  });

  test("renders without custom questions", () => {
    render(<ApplyForm token="tok" questions={[]} />);

    expect(screen.getByLabelText("이름")).toBeInTheDocument();
    expect(screen.queryByText("추가 질문")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- ApplyForm.test`
Expected: FAIL — `ApplyForm.tsx` doesn't exist.

- [ ] **Step 7: Implement the form component**

`app/apply/[token]/ApplyForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { submitApplication } from "./actions";
import type { CustomQuestion } from "@/lib/applicants/types";

const FIELD_CLASS =
  "rounded-token border border-border bg-surface px-3 py-2 text-text";

export default function ApplyForm({
  token,
  questions,
}: {
  token: string;
  questions: CustomQuestion[];
}) {
  const [name, setName] = useState("");
  const [snsUrl, setSnsUrl] = useState("");
  const [nationality, setNationality] = useState("");
  const [contact, setContact] = useState("");
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [secondaryUseConsent, setSecondaryUseConsent] = useState(false);
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    setError(null);

    if (!name.trim() || !snsUrl.trim() || !nationality.trim() || !contact.trim()) {
      setError("필수 항목을 모두 입력해주세요.");
      return;
    }
    if (!privacyConsent) {
      setError("개인정보 수집 및 이용에 동의해주세요.");
      return;
    }

    setSubmitting(true);
    const result = await submitApplication(token, {
      name,
      snsUrl,
      nationality,
      contact,
      privacyConsent,
      secondaryUseConsent,
      customAnswers,
    });
    setSubmitting(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return <p className="text-text">신청이 접수되었습니다. 감사합니다.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="name" className="text-sm font-medium text-text">
          이름
        </label>
        <input
          id="name"
          aria-label="이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="snsUrl" className="text-sm font-medium text-text">
          SNS 계정 링크
        </label>
        <input
          id="snsUrl"
          aria-label="SNS 계정 링크"
          value={snsUrl}
          onChange={(e) => setSnsUrl(e.target.value)}
          placeholder="https://instagram.com/..."
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="nationality" className="text-sm font-medium text-text">
          국적
        </label>
        <input
          id="nationality"
          aria-label="국적"
          value={nationality}
          onChange={(e) => setNationality(e.target.value)}
          placeholder="대한민국"
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="contact" className="text-sm font-medium text-text">
          연락처
        </label>
        <input
          id="contact"
          aria-label="연락처"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="010-0000-0000"
          className={FIELD_CLASS}
        />
      </div>

      {questions.length > 0 && (
        <>
          <h2 className="mt-4 text-lg font-bold text-text">추가 질문</h2>
          {questions.map((q) => (
            <div key={q.id} className="flex flex-col gap-2">
              <label htmlFor={q.id} className="text-sm font-medium text-text">
                {q.label}
              </label>
              <textarea
                id={q.id}
                aria-label={q.label}
                value={customAnswers[q.id] ?? ""}
                onChange={(e) =>
                  setCustomAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                }
                rows={3}
                className={FIELD_CLASS}
              />
            </div>
          ))}
        </>
      )}

      <div className="mt-4 flex flex-col gap-3 rounded-token border border-border bg-surface p-4">
        <label htmlFor="privacyConsent" className="flex items-start gap-2 text-sm text-text">
          <input
            id="privacyConsent"
            type="checkbox"
            aria-label="개인정보 수집 및 이용에 동의합니다. (필수)"
            checked={privacyConsent}
            onChange={(e) => setPrivacyConsent(e.target.checked)}
            className="mt-0.5"
          />
          개인정보 수집 및 이용에 동의합니다. (필수)
        </label>
        <label htmlFor="secondaryUseConsent" className="flex items-start gap-2 text-sm text-text">
          <input
            id="secondaryUseConsent"
            type="checkbox"
            aria-label="촬영물의 2차 활용에 동의합니다. (선택)"
            checked={secondaryUseConsent}
            onChange={(e) => setSecondaryUseConsent(e.target.checked)}
            className="mt-0.5"
          />
          촬영물의 2차 활용에 동의합니다. (선택)
        </label>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="self-start rounded-token bg-accent px-4 py-2 font-medium text-onAccent disabled:opacity-60"
      >
        {submitting ? "제출 중..." : "신청하기"}
      </button>

      {error && <p className="text-sm text-critical">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- ApplyForm.test`
Expected: PASS

- [ ] **Step 9: Implement the public page**

An unknown token gets `notFound()`; a known-but-unpublished form gets its own guidance page (spec: 잘못되거나 비활성화된 토큰 접근 시 안내 페이지).

`app/apply/[token]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import ApplyForm from "./ApplyForm";
import type { CustomQuestion } from "@/lib/applicants/types";

type ApplyFormContext = {
  campaign_id: string;
  campaign_name: string;
  company_name: string;
  campaign_type: "shipping" | "visit";
  is_published: boolean;
  intro_text: string | null;
  custom_questions: CustomQuestion[];
};

export default async function PublicApplyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc("get_apply_form", { p_token: token });

  if (!data) notFound();

  const context = data as ApplyFormContext;

  if (!context.is_published) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="mb-2 text-2xl font-bold text-text">아직 열리지 않은 신청폼입니다</h1>
        <p className="text-textMuted">
          이 캠페인의 신청폼은 아직 공개되지 않았거나 마감되었습니다. 링크를 보내주신 담당자에게
          문의해주세요.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-1 text-2xl font-bold text-text">{context.campaign_name}</h1>
      <p className="mb-6 text-textMuted">{context.company_name}</p>
      {context.intro_text && (
        <p className="mb-8 whitespace-pre-wrap rounded-token border border-border bg-surface p-4 text-text">
          {context.intro_text}
        </p>
      )}
      <ApplyForm token={token} questions={context.custom_questions ?? []} />
    </main>
  );
}
```

- [ ] **Step 10: Commit**

```bash
git add app/apply
git commit -m "feat: add public application form route at /apply/[token]

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: Applicant List Helpers — CSV Export and Duplicate Detection

**Files:**
- Create: `lib/applicants/csv.ts`
- Create: `lib/applicants/duplicates.ts`
- Test: `lib/applicants/csv.test.ts`
- Test: `lib/applicants/duplicates.test.ts`

**Interfaces:**
- Consumes: `ApplicantRow`, `CustomQuestion`, `STATUS_LABEL` from `lib/applicants/types.ts` (Task 5).
- Produces:
  - `toApplicantsCsv(applicants: ApplicantRow[], customQuestions: CustomQuestion[]): string` — a UTF-8 BOM-prefixed CSV whose header is `번호,이름,SNS 링크,국적,연락처,개인정보 동의,2차활용 동의,상태,신청일시` followed by one column per custom question label. Excel opens this directly with Korean intact, which is why no `xlsx` dependency is added (judgment call on the spec's "Excel/CSV 내보내기").
  - `findDuplicateApplicantIds(applicants: ApplicantRow[]): Set<string>` — ids of applicants sharing a normalised SNS link or contact number with another applicant in the same list. Detection only; nothing is blocked (spec: 중복 감지 시 담당자에게 경고 표시, 차단 아님).

- [ ] **Step 1: Write the failing test for the CSV helper**

`lib/applicants/csv.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { toApplicantsCsv } from "./csv";
import type { ApplicantRow } from "./types";

function applicant(overrides: Partial<ApplicantRow> = {}): ApplicantRow {
  return {
    id: "a1",
    name: "김서연",
    sns_url: "https://instagram.com/seoyeon",
    nationality: "대한민국",
    contact: "010-1234-5678",
    privacy_consent: true,
    secondary_use_consent: false,
    custom_answers: { cq1: "지성 피부입니다" },
    status: "applied",
    applied_at: "2026-08-30T02:30:00.000Z",
    status_changed_by: null,
    status_changed_at: null,
    ...overrides,
  };
}

const QUESTIONS = [{ id: "cq1", label: "피부 타입을 알려주세요" }];

describe("toApplicantsCsv", () => {
  test("starts with a UTF-8 BOM so Excel reads Korean correctly", () => {
    expect(toApplicantsCsv([applicant()], QUESTIONS).startsWith("﻿")).toBe(true);
  });

  test("writes the standard header followed by one column per custom question", () => {
    const [header] = toApplicantsCsv([], QUESTIONS).replace("﻿", "").split("\r\n");

    expect(header).toBe(
      "번호,이름,SNS 링크,국적,연락처,개인정보 동의,2차활용 동의,상태,신청일시,피부 타입을 알려주세요"
    );
  });

  test("numbers rows from 1 and renders consents and status in Korean", () => {
    const csv = toApplicantsCsv([applicant(), applicant({ id: "a2", name: "이지훈" })], QUESTIONS);
    const rows = csv.replace("﻿", "").split("\r\n");

    expect(rows[1]).toContain("1,김서연");
    expect(rows[1]).toContain("동의,미동의,지원");
    expect(rows[2]).toContain("2,이지훈");
  });

  test("maps each custom answer under its own question column", () => {
    const csv = toApplicantsCsv(
      [applicant({ custom_answers: { cq1: "건성 피부입니다", cq2: "무시됨" } })],
      QUESTIONS
    );

    expect(csv).toContain("건성 피부입니다");
    expect(csv).not.toContain("무시됨");
  });

  test("leaves an unanswered custom question blank", () => {
    const csv = toApplicantsCsv([applicant({ custom_answers: {} })], QUESTIONS);
    const dataRow = csv.replace("﻿", "").split("\r\n")[1];

    expect(dataRow.endsWith(",")).toBe(true);
  });

  test("quotes and escapes fields containing commas, quotes or newlines", () => {
    const csv = toApplicantsCsv(
      [applicant({ name: '김"서연", 님', custom_answers: { cq1: "첫줄\n둘째줄" } })],
      QUESTIONS
    );

    expect(csv).toContain('"김""서연"", 님"');
    expect(csv).toContain('"첫줄\n둘째줄"');
  });

  test("renders the selected and reserved statuses in Korean", () => {
    const csv = toApplicantsCsv(
      [applicant({ status: "selected" }), applicant({ id: "a2", status: "reserved" })],
      []
    );

    expect(csv).toContain("최종선정");
    expect(csv).toContain("예비선정");
  });

  test("produces a header-only file for an empty list", () => {
    const rows = toApplicantsCsv([], []).replace("﻿", "").split("\r\n");

    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- applicants/csv`
Expected: FAIL — `lib/applicants/csv.ts` doesn't exist.

- [ ] **Step 3: Implement the CSV helper**

`lib/applicants/csv.ts`:

```ts
import { STATUS_LABEL, type ApplicantRow, type CustomQuestion } from "./types";

const STANDARD_HEADER = [
  "번호",
  "이름",
  "SNS 링크",
  "국적",
  "연락처",
  "개인정보 동의",
  "2차활용 동의",
  "상태",
  "신청일시",
];

function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatAppliedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function toApplicantsCsv(
  applicants: ApplicantRow[],
  customQuestions: CustomQuestion[]
): string {
  const header = [...STANDARD_HEADER, ...customQuestions.map((q) => q.label)];

  const rows = applicants.map((a, index) => [
    String(index + 1),
    a.name,
    a.sns_url,
    a.nationality,
    a.contact,
    a.privacy_consent ? "동의" : "미동의",
    a.secondary_use_consent ? "동의" : "미동의",
    STATUS_LABEL[a.status],
    formatAppliedAt(a.applied_at),
    ...customQuestions.map((q) => a.custom_answers?.[q.id] ?? ""),
  ]);

  const body = [header, ...rows]
    .map((row) => row.map(escapeCell).join(","))
    .join("\r\n");

  // The BOM is what makes Excel open the file as UTF-8 instead of mangling Korean.
  return `﻿${body}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- applicants/csv`
Expected: PASS

- [ ] **Step 5: Write the failing test for duplicate detection**

`lib/applicants/duplicates.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { findDuplicateApplicantIds } from "./duplicates";
import type { ApplicantRow } from "./types";

function applicant(overrides: Partial<ApplicantRow> & { id: string }): ApplicantRow {
  return {
    name: "김서연",
    sns_url: "https://instagram.com/seoyeon",
    nationality: "대한민국",
    contact: "010-1234-5678",
    privacy_consent: true,
    secondary_use_consent: false,
    custom_answers: {},
    status: "applied",
    applied_at: "2026-08-30T02:30:00.000Z",
    status_changed_by: null,
    status_changed_at: null,
    ...overrides,
  };
}

describe("findDuplicateApplicantIds", () => {
  test("returns an empty set when every applicant is distinct", () => {
    const result = findDuplicateApplicantIds([
      applicant({ id: "a1" }),
      applicant({ id: "a2", sns_url: "https://instagram.com/jihoon", contact: "010-9999-0000" }),
    ]);

    expect(result.size).toBe(0);
  });

  test("flags both applicants sharing an SNS link", () => {
    const result = findDuplicateApplicantIds([
      applicant({ id: "a1", contact: "010-1111-1111" }),
      applicant({ id: "a2", contact: "010-2222-2222" }),
    ]);

    expect([...result].sort()).toEqual(["a1", "a2"]);
  });

  test("flags both applicants sharing a contact number", () => {
    const result = findDuplicateApplicantIds([
      applicant({ id: "a1", sns_url: "https://instagram.com/one" }),
      applicant({ id: "a2", sns_url: "https://instagram.com/two" }),
    ]);

    expect([...result].sort()).toEqual(["a1", "a2"]);
  });

  test("ignores case, surrounding whitespace and a trailing slash on SNS links", () => {
    const result = findDuplicateApplicantIds([
      applicant({ id: "a1", sns_url: "https://Instagram.com/Seoyeon/", contact: "010-1111-1111" }),
      applicant({ id: "a2", sns_url: "  https://instagram.com/seoyeon ", contact: "010-2222-2222" }),
    ]);

    expect([...result].sort()).toEqual(["a1", "a2"]);
  });

  test("ignores formatting differences in contact numbers", () => {
    const result = findDuplicateApplicantIds([
      applicant({ id: "a1", sns_url: "https://instagram.com/one", contact: "010-1234-5678" }),
      applicant({ id: "a2", sns_url: "https://instagram.com/two", contact: "01012345678" }),
    ]);

    expect([...result].sort()).toEqual(["a1", "a2"]);
  });

  test("flags every member of a group of three", () => {
    const result = findDuplicateApplicantIds([
      applicant({ id: "a1", contact: "010-1111-1111" }),
      applicant({ id: "a2", contact: "010-2222-2222" }),
      applicant({ id: "a3", contact: "010-3333-3333" }),
    ]);

    expect(result.size).toBe(3);
  });

  test("handles an empty list", () => {
    expect(findDuplicateApplicantIds([]).size).toBe(0);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- applicants/duplicates`
Expected: FAIL — `lib/applicants/duplicates.ts` doesn't exist.

- [ ] **Step 7: Implement duplicate detection**

`lib/applicants/duplicates.ts`:

```ts
import type { ApplicantRow } from "./types";

function normaliseSnsUrl(value: string): string {
  return value.trim().toLowerCase().replace(/\/+$/, "");
}

function normaliseContact(value: string): string {
  return value.replace(/\D/g, "");
}

function collectRepeats(
  applicants: ApplicantRow[],
  key: (a: ApplicantRow) => string,
  into: Set<string>
) {
  const byKey = new Map<string, string[]>();
  for (const a of applicants) {
    const k = key(a);
    if (!k) continue;
    byKey.set(k, [...(byKey.get(k) ?? []), a.id]);
  }
  for (const ids of byKey.values()) {
    if (ids.length > 1) ids.forEach((id) => into.add(id));
  }
}

/**
 * Ids of applicants sharing an SNS link or a contact number with someone else in
 * the same campaign. This is a warning signal for the 담당자 only — submission is
 * never blocked on it (spec: 에러 처리 및 검증).
 */
export function findDuplicateApplicantIds(applicants: ApplicantRow[]): Set<string> {
  const duplicates = new Set<string>();
  collectRepeats(applicants, (a) => normaliseSnsUrl(a.sns_url), duplicates);
  collectRepeats(applicants, (a) => normaliseContact(a.contact), duplicates);
  return duplicates;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- applicants/duplicates`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add lib/applicants/csv.ts lib/applicants/csv.test.ts lib/applicants/duplicates.ts lib/applicants/duplicates.test.ts
git commit -m "feat: add applicant CSV export and duplicate-detection helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: Applicant Table Component and Internal List Page

**Files:**
- Create: `app/(dashboard)/campaigns/[id]/applicants/ApplicantTable.tsx`
- Create: `app/(dashboard)/campaigns/[id]/applicants/page.tsx`
- Test: `app/(dashboard)/campaigns/[id]/applicants/ApplicantTable.test.tsx`
- Test: `app/(dashboard)/campaigns/[id]/applicants/page.test.tsx`

**Interfaces:**
- Consumes: `createServerSupabaseClient()`, `get_applicant_list` RPC (Task 3), `ApplicantRow`/`CustomQuestion`/`ApplicantListContext`/`STATUS_LABEL` (Task 5), `toApplicantsCsv` and `findDuplicateApplicantIds` (Task 7).
- Produces: `<ApplicantTable applicants={ApplicantRow[]} customQuestions={CustomQuestion[]} campaignName={string} />` — a client component rendering the list, a duplicate warning banner, and an "Excel/CSV 내보내기" button. Task 9's public shared page imports this exact component.

**Note for Plan 4:** the 최종선정/예비선정 buttons will be added to this component so both list surfaces get them at once. Do not add them here.

- [ ] **Step 1: Write the failing test for the table**

`app/(dashboard)/campaigns/[id]/applicants/ApplicantTable.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import ApplicantTable from "./ApplicantTable";
import type { ApplicantRow } from "@/lib/applicants/types";

function applicant(overrides: Partial<ApplicantRow> & { id: string }): ApplicantRow {
  return {
    name: "김서연",
    sns_url: "https://instagram.com/seoyeon",
    nationality: "대한민국",
    contact: "010-1234-5678",
    privacy_consent: true,
    secondary_use_consent: false,
    custom_answers: { cq1: "지성 피부입니다" },
    status: "applied",
    applied_at: "2026-08-30T02:30:00.000Z",
    status_changed_by: null,
    status_changed_at: null,
    ...overrides,
  };
}

const QUESTIONS = [{ id: "cq1", label: "피부 타입을 알려주세요" }];

describe("ApplicantTable", () => {
  test("renders one row per applicant with the standard fields", () => {
    render(
      <ApplicantTable
        applicants={[applicant({ id: "a1" }), applicant({ id: "a2", name: "이지훈" })]}
        customQuestions={QUESTIONS}
        campaignName="글로우랩 세럼"
      />
    );

    expect(screen.getByText("김서연")).toBeInTheDocument();
    expect(screen.getByText("이지훈")).toBeInTheDocument();
    expect(screen.getAllByText("대한민국")).toHaveLength(2);
  });

  test("renders a column for each custom question and its answers", () => {
    render(
      <ApplicantTable
        applicants={[applicant({ id: "a1" })]}
        customQuestions={QUESTIONS}
        campaignName="글로우랩 세럼"
      />
    );

    expect(screen.getByText("피부 타입을 알려주세요")).toBeInTheDocument();
    expect(screen.getByText("지성 피부입니다")).toBeInTheDocument();
  });

  test("renders statuses in Korean", () => {
    render(
      <ApplicantTable
        applicants={[
          applicant({ id: "a1", status: "selected" }),
          applicant({ id: "a2", status: "reserved", sns_url: "x", contact: "1" }),
        ]}
        customQuestions={[]}
        campaignName="글로우랩 세럼"
      />
    );

    expect(screen.getByText("최종선정")).toBeInTheDocument();
    expect(screen.getByText("예비선정")).toBeInTheDocument();
  });

  test("warns about duplicate applications without hiding them", () => {
    render(
      <ApplicantTable
        applicants={[
          applicant({ id: "a1", contact: "010-1111-1111" }),
          applicant({ id: "a2", name: "이지훈", contact: "010-2222-2222" }),
        ]}
        customQuestions={[]}
        campaignName="글로우랩 세럼"
      />
    );

    expect(screen.getByText(/중복 신청이 2건 감지되었습니다/)).toBeInTheDocument();
    expect(screen.getAllByText("중복")).toHaveLength(2);
    expect(screen.getByText("이지훈")).toBeInTheDocument();
  });

  test("shows no duplicate warning when everyone is distinct", () => {
    render(
      <ApplicantTable
        applicants={[
          applicant({ id: "a1" }),
          applicant({ id: "a2", sns_url: "https://instagram.com/jihoon", contact: "010-9999-0000" }),
        ]}
        customQuestions={[]}
        campaignName="글로우랩 세럼"
      />
    );

    expect(screen.queryByText(/중복 신청이/)).not.toBeInTheDocument();
  });

  test("shows an empty-state message and no export button with no applicants", () => {
    render(
      <ApplicantTable applicants={[]} customQuestions={[]} campaignName="글로우랩 세럼" />
    );

    expect(screen.getByText("아직 신청자가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excel/CSV 내보내기" })).not.toBeInTheDocument();
  });

  test("offers an export button when there are applicants", () => {
    render(
      <ApplicantTable
        applicants={[applicant({ id: "a1" })]}
        customQuestions={QUESTIONS}
        campaignName="글로우랩 세럼"
      />
    );

    expect(screen.getByRole("button", { name: "Excel/CSV 내보내기" })).toBeInTheDocument();
  });

  test("shows the total applicant count", () => {
    render(
      <ApplicantTable
        applicants={[
          applicant({ id: "a1" }),
          applicant({ id: "a2", sns_url: "https://instagram.com/jihoon", contact: "010-9999-0000" }),
        ]}
        customQuestions={[]}
        campaignName="글로우랩 세럼"
      />
    );

    expect(screen.getByText("총 2명")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ApplicantTable`
Expected: FAIL — `ApplicantTable.tsx` doesn't exist.

- [ ] **Step 3: Implement the table component**

`app/(dashboard)/campaigns/[id]/applicants/ApplicantTable.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { toApplicantsCsv } from "@/lib/applicants/csv";
import { findDuplicateApplicantIds } from "@/lib/applicants/duplicates";
import { STATUS_LABEL, type ApplicantRow, type CustomQuestion } from "@/lib/applicants/types";

const CELL = "px-3 py-2 align-top text-sm text-text";
const HEAD = "px-3 py-2 text-left text-xs font-medium text-textMuted";

function formatAppliedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export default function ApplicantTable({
  applicants,
  customQuestions,
  campaignName,
}: {
  applicants: ApplicantRow[];
  customQuestions: CustomQuestion[];
  campaignName: string;
}) {
  const duplicates = useMemo(() => findDuplicateApplicantIds(applicants), [applicants]);

  function handleExport() {
    const csv = toApplicantsCsv(applicants, customQuestions);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${campaignName}_지원자리스트_${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (applicants.length === 0) {
    return <p className="text-textMuted">아직 신청자가 없습니다.</p>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="font-mono text-sm tabular-nums text-textMuted">총 {applicants.length}명</p>
        <button
          type="button"
          onClick={handleExport}
          className="rounded-token border border-border px-4 py-2 text-sm text-text"
        >
          Excel/CSV 내보내기
        </button>
      </div>

      {duplicates.size > 0 && (
        <p className="mb-4 rounded-token border border-border bg-surface2 px-4 py-3 text-sm text-warning">
          중복 신청이 {duplicates.size}건 감지되었습니다. SNS 링크 또는 연락처가 같은 신청자를
          확인해주세요.
        </p>
      )}

      <div className="overflow-x-auto rounded-token border border-border">
        <table className="w-full border-collapse">
          <thead className="bg-surface2">
            <tr>
              <th className={HEAD}>번호</th>
              <th className={HEAD}>이름</th>
              <th className={HEAD}>SNS 링크</th>
              <th className={HEAD}>국적</th>
              <th className={HEAD}>연락처</th>
              <th className={HEAD}>2차활용 동의</th>
              <th className={HEAD}>상태</th>
              <th className={HEAD}>신청일시</th>
              {customQuestions.map((q) => (
                <th key={q.id} className={HEAD}>
                  {q.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-surface">
            {applicants.map((a, index) => (
              <tr key={a.id} className="border-t border-border">
                <td className={`${CELL} font-mono tabular-nums`}>{index + 1}</td>
                <td className={CELL}>
                  {a.name}
                  {duplicates.has(a.id) && (
                    <span className="ml-2 rounded-token bg-accentSoft px-1.5 py-0.5 text-xs text-warning">
                      중복
                    </span>
                  )}
                </td>
                <td className={CELL}>
                  <a href={a.sns_url} target="_blank" rel="noreferrer" className="underline">
                    {a.sns_url}
                  </a>
                </td>
                <td className={CELL}>{a.nationality}</td>
                <td className={`${CELL} font-mono tabular-nums`}>{a.contact}</td>
                <td className={CELL}>{a.secondary_use_consent ? "동의" : "미동의"}</td>
                <td className={CELL}>{STATUS_LABEL[a.status]}</td>
                <td className={`${CELL} font-mono tabular-nums`}>
                  {formatAppliedAt(a.applied_at)}
                </td>
                {customQuestions.map((q) => (
                  <td key={q.id} className={CELL}>
                    {a.custom_answers?.[q.id] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ApplicantTable`
Expected: PASS

- [ ] **Step 5: Write the failing test for the internal page**

`app/(dashboard)/campaigns/[id]/applicants/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/roles", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

import { requireRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import InternalApplicantsPage from "./page";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocked(requireRole).mockResolvedValue({ id: "u1", role: "staff", full_name: "담당자" });
});

describe("InternalApplicantsPage", () => {
  test("loads the list through get_applicant_list using the campaign's own token", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        campaign_id: "c1",
        campaign_name: "글로우랩 세럼",
        company_name: "글로우랩",
        campaign_type: "shipping",
        custom_questions: [{ id: "cq1", label: "피부 타입을 알려주세요" }],
        applicants: [
          {
            id: "a1",
            name: "김서연",
            sns_url: "https://instagram.com/seoyeon",
            nationality: "대한민국",
            contact: "010-1234-5678",
            privacy_consent: true,
            secondary_use_consent: false,
            custom_answers: { cq1: "지성 피부입니다" },
            status: "applied",
            applied_at: "2026-08-30T02:30:00.000Z",
            status_changed_by: null,
            status_changed_at: null,
          },
        ],
      },
    });

    mocked(createServerSupabaseClient).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: "c1", name: "글로우랩 세럼", applicant_list_token: "tok-list" },
            }),
          }),
        }),
      }),
      rpc,
    });

    const ui = await InternalApplicantsPage({ params: Promise.resolve({ id: "c1" }) });
    render(ui);

    expect(rpc).toHaveBeenCalledWith("get_applicant_list", { p_token: "tok-list" });
    expect(screen.getByText("김서연")).toBeInTheDocument();
    expect(screen.getByText("피부 타입을 알려주세요")).toBeInTheDocument();
  });

  test("shows the shareable list link", async () => {
    mocked(createServerSupabaseClient).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: "c1", name: "글로우랩 세럼", applicant_list_token: "tok-list" },
            }),
          }),
        }),
      }),
      rpc: async () => ({
        data: {
          campaign_id: "c1",
          campaign_name: "글로우랩 세럼",
          company_name: "글로우랩",
          campaign_type: "shipping",
          custom_questions: [],
          applicants: [],
        },
      }),
    });

    const ui = await InternalApplicantsPage({ params: Promise.resolve({ id: "c1" }) });
    render(ui);

    expect(screen.getByText("/applicants/tok-list")).toBeInTheDocument();
  });

  test("calls notFound when the campaign does not exist", async () => {
    mocked(createServerSupabaseClient).mockResolvedValue({
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }),
      rpc: vi.fn(),
    });

    await expect(
      InternalApplicantsPage({ params: Promise.resolve({ id: "missing" }) })
    ).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- "campaigns/\[id\]/applicants/page"`
Expected: FAIL — the page doesn't exist.

- [ ] **Step 7: Implement the internal page**

`app/(dashboard)/campaigns/[id]/applicants/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import ApplicantTable from "./ApplicantTable";
import type { ApplicantListContext } from "@/lib/applicants/types";

export default async function InternalApplicantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("staff");

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, applicant_list_token")
    .eq("id", id)
    .single();

  if (!campaign) notFound();

  // Deliberately the same RPC the public shared page uses, called with this
  // campaign's own token — one read path, one shape, no drift between the views.
  const { data } = await supabase.rpc("get_applicant_list", {
    p_token: campaign.applicant_list_token,
  });

  const context = (data ?? {
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    company_name: "",
    campaign_type: "shipping",
    custom_questions: [],
    applicants: [],
  }) as ApplicantListContext;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-text">{context.campaign_name}</h1>
      <p className="mb-6 text-textMuted">{context.company_name} · 지원자 리스트</p>

      <div className="mb-8 rounded-token border border-border bg-surface p-4">
        <p className="mb-1 text-xs text-textMuted">업체 공유 링크 (로그인 불필요)</p>
        <code className="block overflow-x-auto text-sm text-text">
          /applicants/{campaign.applicant_list_token}
        </code>
      </div>

      <ApplicantTable
        applicants={context.applicants ?? []}
        customQuestions={context.custom_questions ?? []}
        campaignName={context.campaign_name}
      />
    </div>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- "campaigns/\[id\]/applicants/page"`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add "app/(dashboard)/campaigns/[id]/applicants"
git commit -m "feat: add internal applicant list with duplicate warnings and CSV export

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 9: Public Shared Applicant List and Campaign Entry Points

**Files:**
- Create: `app/applicants/[token]/page.tsx`
- Test: `app/applicants/[token]/page.test.tsx`
- Modify: `app/(dashboard)/campaigns/[id]/page.tsx` (add the 신청폼 / 지원자 리스트 sections)

**⚠️ SHARED FILE WARNING:** `app/(dashboard)/campaigns/[id]/page.tsx` is the entry-point hub for every flow in this project. The 최종선정 (Plan 4), 관리시트 (Plan 5), and 결과보고서 (Plan 6) plans each add their own section to this same file. Expect a merge conflict here; resolve it by keeping **all** sections — they are additive `<section>` blocks, and the `select(...)` column list is a union. Do not delete another plan's section to make the conflict go away.

**Interfaces:**
- Consumes: `createServerSupabaseClient()`, `get_applicant_list` RPC (Task 3), `<ApplicantTable>` (Task 8), `ApplicantListContext` (Task 5).
- Produces: a public read-only page at `/applicants/[token]`, and links from the campaign detail page to `/campaigns/[id]/apply-form` and `/campaigns/[id]/applicants`.

**Note for Plan 4:** this page is where the 최종선정/예비선정 buttons for the 업체 담당자 will land. It stays read-only in this plan.

- [ ] **Step 1: Write the failing test**

`app/applicants/[token]/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import SharedApplicantsPage from "./page";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

const CONTEXT = {
  campaign_id: "c1",
  campaign_name: "글로우랩 세럼",
  company_name: "글로우랩",
  campaign_type: "shipping",
  custom_questions: [{ id: "cq1", label: "피부 타입을 알려주세요" }],
  applicants: [
    {
      id: "a1",
      name: "김서연",
      sns_url: "https://instagram.com/seoyeon",
      nationality: "대한민국",
      contact: "010-1234-5678",
      privacy_consent: true,
      secondary_use_consent: false,
      custom_answers: { cq1: "지성 피부입니다" },
      status: "applied",
      applied_at: "2026-08-30T02:30:00.000Z",
      status_changed_by: null,
      status_changed_at: null,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SharedApplicantsPage", () => {
  test("renders the applicant list for a valid token", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: CONTEXT });
    mocked(createServerSupabaseClient).mockResolvedValue({ rpc });

    const ui = await SharedApplicantsPage({ params: Promise.resolve({ token: "tok-list" }) });
    render(ui);

    expect(rpc).toHaveBeenCalledWith("get_applicant_list", { p_token: "tok-list" });
    expect(screen.getByText("글로우랩 세럼")).toBeInTheDocument();
    expect(screen.getByText("김서연")).toBeInTheDocument();
    expect(screen.getByText("지성 피부입니다")).toBeInTheDocument();
  });

  test("offers the same export button as the internal view", async () => {
    mocked(createServerSupabaseClient).mockResolvedValue({
      rpc: async () => ({ data: CONTEXT }),
    });

    const ui = await SharedApplicantsPage({ params: Promise.resolve({ token: "tok-list" }) });
    render(ui);

    expect(screen.getByRole("button", { name: "Excel/CSV 내보내기" })).toBeInTheDocument();
  });

  test("calls notFound for an unknown token", async () => {
    mocked(createServerSupabaseClient).mockResolvedValue({
      rpc: async () => ({ data: null }),
    });

    await expect(
      SharedApplicantsPage({ params: Promise.resolve({ token: "nope" }) })
    ).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  test("renders the empty state when nobody has applied yet", async () => {
    mocked(createServerSupabaseClient).mockResolvedValue({
      rpc: async () => ({ data: { ...CONTEXT, applicants: [] } }),
    });

    const ui = await SharedApplicantsPage({ params: Promise.resolve({ token: "tok-list" }) });
    render(ui);

    expect(screen.getByText("아직 신청자가 없습니다.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "app/applicants/\[token\]/page"`
Expected: FAIL — the page doesn't exist.

- [ ] **Step 3: Implement the public shared page**

`app/applicants/[token]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import ApplicantTable from "@/app/(dashboard)/campaigns/[id]/applicants/ApplicantTable";
import type { ApplicantListContext } from "@/lib/applicants/types";

export default async function SharedApplicantsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc("get_applicant_list", { p_token: token });

  if (!data) notFound();

  const context = data as ApplicantListContext;

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="mb-1 text-2xl font-bold text-text">{context.campaign_name}</h1>
      <p className="mb-8 text-textMuted">{context.company_name} · 지원자 리스트</p>
      <ApplicantTable
        applicants={context.applicants ?? []}
        customQuestions={context.custom_questions ?? []}
        campaignName={context.campaign_name}
      />
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- "app/applicants/\[token\]/page"`
Expected: PASS

- [ ] **Step 5: Add the entry points to the campaign detail page**

Without this step both new screens are unreachable dead UI. Two edits to `app/(dashboard)/campaigns/[id]/page.tsx`.

Edit 1 — widen the column selection so the two tokens are available:

```tsx
    .select(
      "id, name, company_name, campaign_type, status, pre_survey_token, apply_token, applicant_list_token"
    )
```

Edit 2 — append two sections after the existing 사전조사 `<section>`, immediately before the closing `</div>`:

```tsx
      <section className="mt-6 max-w-2xl rounded-token border border-border bg-surface p-6">
        <h2 className="mb-1 text-lg font-bold text-text">신청폼</h2>
        <p className="mb-4 text-sm text-textMuted">
          사전조사 답변을 바탕으로 AI가 소개문구 초안을 만들고, 담당자가 검토·수정한 뒤 게시하면
          아래 신청 링크가 열립니다.
        </p>

        <div className="mb-4">
          <p className="mb-1 text-xs text-textMuted">지원자 신청 링크</p>
          <code className="block overflow-x-auto rounded-token border border-border px-3 py-2 text-sm text-text">
            /apply/{campaign.apply_token}
          </code>
        </div>

        <Link
          href={`/campaigns/${campaign.id}/apply-form`}
          className="inline-block rounded-token bg-accent px-4 py-2 text-sm font-medium text-onAccent"
        >
          신청폼 설정
        </Link>
      </section>

      <section className="mt-6 max-w-2xl rounded-token border border-border bg-surface p-6">
        <h2 className="mb-1 text-lg font-bold text-text">지원자 리스트</h2>
        <p className="mb-4 text-sm text-textMuted">
          제출된 신청 내역을 확인하고 Excel/CSV로 내보낼 수 있습니다. 아래 링크는 업체 담당자가
          로그인 없이 볼 수 있는 공유 페이지입니다.
        </p>

        <div className="mb-4">
          <p className="mb-1 text-xs text-textMuted">업체 공유 링크</p>
          <code className="block overflow-x-auto rounded-token border border-border px-3 py-2 text-sm text-text">
            /applicants/{campaign.applicant_list_token}
          </code>
        </div>

        <Link
          href={`/campaigns/${campaign.id}/applicants`}
          className="inline-block rounded-token bg-accent px-4 py-2 text-sm font-medium text-onAccent"
        >
          지원자 리스트 보기
        </Link>
      </section>
```

- [ ] **Step 6: Verify the whole suite, types, and lint**

Run: `npm test`
Expected: PASS (all suites, including the pre-existing Plan 1/2 tests)

Run: `npx tsc --noEmit`
Expected: no errors — in particular, every server action here returns an explicit `Promise<...>` union so `"error" in result` narrows correctly.

Run: `npm run lint`
Expected: no errors

- [ ] **Step 7: Manually verify the end-to-end flow**

Run: `npm run dev`

1. Open an existing campaign, click 신청폼 설정, click "AI 초안 생성" — the 소개문구 box fills in (or shows "AI 제안 실패 — 직접 입력해주세요." without clearing the box).
2. Add a custom question, click 게시하기 — the `/apply/<token>` link appears.
3. Open `/apply/<token>` in a private window. Submit with the 개인정보 checkbox unchecked — blocked. Check it and submit — the thank-you message appears.
4. Reload the campaign's 지원자 리스트 — the applicant is there. Click "Excel/CSV 내보내기" and open the file in Excel; Korean must render correctly.
5. Submit a second application with the same 연락처 — the 중복 warning banner appears and both rows are tagged 중복.
6. Open `/applicants/<applicant_list_token>` in a private window — the same list renders, with no login.
7. Back in 신청폼 설정, click 게시 취소, then reload `/apply/<token>` — the "아직 열리지 않은 신청폼입니다" page appears.

- [ ] **Step 8: Commit**

```bash
git add app/applicants "app/(dashboard)/campaigns/[id]/page.tsx"
git commit -m "feat: add public shared applicant list and campaign entry points

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

**1. Spec coverage.** Every in-scope line of 핵심 화면/플로우 2번 maps to a task:

- `campaign_form_config` (campaign_id FK, 소개문구, 커스텀 질문 JSONB, 공개 여부) → Task 1.
- `applicants` with the six 표준 필드 as real columns, custom answers JSONB, the four status values, `applied_at`, `status_changed_by`, `status_changed_at` → Task 2.
- 사전조사 답변 기반 AI 소개문구 초안 → Task 4 (`generateFormIntroDraft`) + Task 5 (`getIntroDraft` loads the latest `pre_survey_responses` row and maps answers onto template question labels).
- 담당자 검토/수정 → 게시 → 공개 신청 링크 활성화 → Task 5 editor + `is_published` gate enforced in both `get_apply_form` and `submit_application` (Task 3).
- 공개 신청 폼 `/apply/[token]`, 로그인 불필요, 표준 항목 + 커스텀 문항 → Task 6.
- 제출 즉시 지원자 리스트에 반영 → Task 8 reads live through `get_applicant_list`.
- 지원자 리스트 내부 화면 + 공유 페이지 `/applicants/[token]` 조회 → Tasks 8 and 9.
- Excel/CSV 내보내기 → Task 7 + the export button in Task 8's component, available on both surfaces.
- 에러 처리: 필수항목·동의 미체크 시 제출 차단 (Task 6 client + action + Task 3 RPC + Task 2 check constraint), 잘못된/비활성 토큰 안내 페이지 (Task 6 page), 중복 감지 경고 (Task 7 + Task 8), AI 실패 폴백 (Tasks 4–5).
- 인증: 공개 라우트는 토큰만으로 접근, anon has zero direct table grants (Tasks 1–3).

Deliberately absent and owned elsewhere: 상태 전이 UI/actions/RPC, `seeding_records`, 관리시트, 결과보고서.

**2. Placeholder scan.** No TBD/TODO/"handle edge cases"/"similar to Task N". Every code step carries runnable code; every test step carries real assertions.

**3. Type consistency.** `CustomQuestion = { id: string; label: string }` is defined once in Task 5's `lib/applicants/types.ts` and is the shape stored in `campaign_form_config.custom_questions` (Task 1), returned by `get_apply_form`/`get_applicant_list` (Task 3), consumed by `ApplyFormEditor` (Task 5), `ApplyForm` (Task 6), `toApplicantsCsv` (Task 7), and `ApplicantTable` (Task 8). `ApplicantStatus` matches the Task 2 check constraint exactly. `ApplicantRow` field names are snake_case throughout because they come straight off `json_build_object` in Task 3 — the client components and CSV helper all read the same snake_case keys, while the *action input* type `ApplicationInput` is camelCase and is mapped to `p_*` parameters in one place (Task 6's `submitApplication`). `ASSIST_MODEL` is imported from `preSurveyAssist.ts` rather than redeclared. Action names — `saveApplyFormConfig`, `getIntroDraft`, `submitApplication` — match between definition, tests, and every consumer.

**4. Judgment calls made where the spec was silent.**

- 개인정보 수집 동의 required, 2차활용 동의 optional. The spec says "동의 체크박스 미체크 시 제출 차단" without naming which; blocking on an optional secondary-use consent would make it not optional. Enforced at three layers (client, action, DB check constraint) for the required one.
- Custom questions are plain `{id, label}` free-text with no per-question required flag — not specified, and keeping the shape identical to `PreSurveyQuestion` avoids a second question model.
- "Excel/CSV 내보내기" is satisfied by a single UTF-8-BOM CSV, which Excel opens natively. No `xlsx` dependency is added; if a true `.xlsx` binary is later required it is an additive change to `lib/applicants/csv.ts`'s neighbours.
- 중복 감지 is computed client-side from the already-loaded list rather than at submit time, because the spec places the warning with the 담당자 and explicitly does not block the applicant.
- The applicant list sorts ascending by `applied_at` so displayed row numbers stay stable as new applications arrive.
- Unpublishing a form hides the intro and questions from `get_apply_form` and makes `submit_application` return false, so 게시 취소 doubles as the 마감 mechanism the spec's "비활성화된 토큰" wording implies.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-30-seeding-application-form.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
