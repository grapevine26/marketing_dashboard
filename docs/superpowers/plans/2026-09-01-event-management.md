# Influencer Event Management (서브 프로젝트 B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 서브 프로젝트 B — agency-hosted event management inside a campaign: event CRUD, a PPT 운영안 editor with AI drafts and .pptx export, invitee/RSVP/attendance tracking snapshot-copied from campaign applicants, and a checklist with server-computed KST D-days.

**Architecture:** Events belong to a campaign (`events.campaign_id` FK); every screen lives under `/campaigns/[id]/events` in the authenticated dashboard — there are **no public routes, no anon policies, and no token-scoped RPCs** in this plan. All reads/writes go straight through `createDashboardSupabaseClient()` with plain table access under `to authenticated` RLS. The 운영안 flow consumes the shared PPT template engine (`lib/ppt/`) owned by a separate plan and only stores `{placeholder: value}` maps plus a template reference.

**Tech Stack:** Next.js App Router, Supabase (Postgres + Storage), `@google/genai` (already installed) for AI drafts, Vitest + React Testing Library.

**Spec:** [docs/superpowers/specs/2026-09-01-influencer-event-management-design.md](../specs/2026-09-01-influencer-event-management-design.md)

## Prerequisite — the PPT template engine plan lands FIRST

The parallel plan [2026-09-01-ppt-template-engine.md](2026-09-01-ppt-template-engine.md) **must be implemented and merged before Task 2 and Tasks 7–9 of this plan.** It owns, and this plan must NOT redefine:

- migration **0015** — the `ppt_templates` table (`id uuid pk, kind text check in ('event','sns'), name text not null, storage_path text not null, placeholders jsonb not null default '[]', uploaded_at timestamptz`) and the private `ppt-templates` storage bucket
- `lib/ppt/template.ts` — `extractPlaceholders` / `fillTemplate`
- `lib/ppt/storage.ts` — upload/download helpers for the `ppt-templates` bucket
- the `/settings/ppt-templates` admin screen

The engine plan's public API is settled; this plan consumes these exact signatures (all async — do not forget the `await`s):

```ts
// from @/lib/ppt/template
extractPlaceholders(pptx: Buffer): Promise<string[]>
fillTemplate(pptx: Buffer, values: Record<string, string>): Promise<Buffer>

// from @/lib/ppt/storage
uploadTemplateFile(...)   // not used by this plan
removeTemplateFile(...)   // not used by this plan
downloadTemplateFile(storagePath: string): Promise<Buffer | null>
// returns null when the file cannot be fetched — Task 9 maps that null to the
// spec's error copy "템플릿 파일을 불러오지 못했습니다. 다시 업로드해주세요."

// The template row type PptTemplate is exported (type-only) from
// app/(dashboard)/settings/ppt-templates/actions.ts (engine plan).
// This plan defines its own narrower read shape PptTemplateOption in
// lib/events/types.ts and does not import the engine's row type.
```

## Global Constraints

Every task's requirements implicitly include this section. These are repo conventions from STATUS.md ("코드 규약") and the spec — copied concretely because the executor has no other context.

- **Supabase client choice (there are two — the wrong one passes tests and breaks only at runtime):** every page, server action, and route handler in this plan lives under `app/(dashboard)/**`, so ALL of them use `createDashboardSupabaseClient()` imported from `@/lib/supabase/dashboard`. Never `createServerSupabaseClient` (`@/lib/supabase/server`) — that is the anon client for public token routes, and all B tables' RLS is `to authenticated`, so anon reads return 0 rows silently. Tests mock `@/lib/supabase/dashboard`.
- **No public routes in B.** No anon RLS policies, no `grant ... to anon`, no `SECURITY DEFINER` RPCs. RSVP is recorded manually by staff in the dashboard (spec decision).
- **Every server action has an explicit return type annotation** such as `Promise<{ error: string } | { success: true }>`. Without it, `"error" in result` narrowing breaks in callers and **the production build fails**.
- **Any action that calls `revalidatePath` needs `vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))` in its test file**, or the test crashes outside the Next.js runtime.
- **Every exported function in a `"use server"` module is a directly callable endpoint.** Each one must start with `await requireRole("staff")` (from `@/lib/auth/roles`) and must re-validate its inputs even when a DB constraint would also catch the problem. Never export a helper from an actions file that accepts trust-bearing values as parameters.
- **Migrations are applied by hand, not by CLI.** The Supabase CLI is NOT authenticated in this repo and there is no DB password — **never instruct or run `supabase migration up` / `supabase db push`.** Migrations are written to `supabase/migrations/`, concatenated into a bundle under `docs/sql/`, and the human pastes the bundle into the Supabase dashboard SQL editor. Until that happens, DB tests fail with `relation "public.events" does not exist` — this is the expected state; write the migration, regenerate the bundle, and move on.
- **DB tests hit the real production Supabase project** (no local stack — Docker is unavailable on this machine). They create real rows. This is a known accepted issue (STATUS.md); keep test data clearly labeled (e.g. names containing "테스트").
- **Never run the full `npm test` during development** — it hits the production DB and overwrites a shared singleton (`pre_survey_template`) that real users see, and it collides with parallel agents. Run only the test files belonging to the current task, e.g. `npm test -- 0016_events`.
- **AI calls are server-side only**, model `gemini-3.6-flash` via `@google/genai` (already in `package.json`), API key from `process.env.GEMINI_API_KEY`, and config `{ maxOutputTokens: 800, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } }`. **MINIMAL is mandatory** — at higher thinking levels this model burns the token budget on reasoning and truncates the answer. Throw `new Error("UNEXPECTED_RESPONSE")` on an empty/blank response.
- **On any AI failure the UI falls back to exactly the string `"AI 제안 실패 — 직접 입력해주세요."`** and never blocks manual entry or saving.
- **All UI copy is Korean.** Commit messages are English.
- **Tailwind: token classes only.** The complete allowed set: `bg-bg` `bg-surface` `bg-surface2` `border-border` `text-text` `text-textMuted` `bg-accent` `text-onAccent` `text-critical` `text-success` `text-warning` `rounded-token`. Plus untinted structural utilities (flex, gap, px/py, text-sm, font-bold, etc.). Never raw palette classes like `bg-white` or `text-gray-500`. D-day values and counts use `font-mono tabular-nums`.
- **D-day is computed server-side in KST** using the existing pure helpers in `lib/seeding/dday.ts` (`toKstDateString`, `formatDday`, `ddayToneClass`) with `todayKst` computed in the server component and passed down as a prop. Client-side `new Date()` date math causes a UTC off-by-one for nine hours a day (Vercel runs UTC, the agency works in Seoul) plus server/client hydration mismatches — do not do it.
- **Migration numbers 0016 and 0017 are reserved for this plan; 0015 belongs to the PPT engine plan.** Do not create any other migration number.
- **Every commit ends with the trailer** (as a separate `-m` argument):

  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  ```

---

## File Structure

```
marketing/
├── supabase/migrations/
│   ├── 0016_events.sql                  # events, event_invitees, event_checklist_items
│   ├── 0016_events.test.ts
│   ├── 0017_event_plans.sql             # event_plans (references ppt_templates from 0015)
│   └── 0017_event_plans.test.ts
├── docs/sql/
│   ├── setup-0016-0017.sql              # dashboard SQL editor bundle (copy of the two above)
│   └── README.md                        # MODIFY: add one table row (shared file — additive edit only)
├── lib/
│   ├── ai/
│   │   ├── eventPlanAssist.ts           # generateEventPlanDraft — mirrors preSurveyAssist.ts
│   │   └── eventPlanAssist.test.ts
│   └── events/
│       ├── types.ts                     # row types, status/RSVP labels, formatEventAt
│       └── types.test.ts
└── app/(dashboard)/campaigns/[id]/
    ├── page.tsx                         # MODIFY: append ONE additive 행사 <section> (shared file!)
    └── events/
        ├── page.tsx                     # event list + create
        ├── page.test.tsx
        ├── actions.ts                   # createEvent
        ├── actions.test.ts
        ├── EventCreateForm.tsx
        ├── EventCreateForm.test.tsx
        └── [eventId]/
            ├── page.tsx                 # detail: 개요 + 운영안 + 초대 + 체크리스트 (assembled last)
            ├── page.test.tsx
            ├── actions.ts               # updateEventStatus
            ├── actions.test.ts
            ├── EventStatusControl.tsx
            ├── EventStatusControl.test.tsx
            ├── InviteeSection.tsx
            ├── InviteeSection.test.tsx
            ├── inviteeActions.ts
            ├── inviteeActions.test.ts
            ├── ChecklistSection.tsx
            ├── ChecklistSection.test.tsx
            ├── checklistActions.ts
            ├── checklistActions.test.ts
            ├── PlanSection.tsx
            ├── PlanSection.test.tsx
            ├── planActions.ts
            ├── planActions.test.ts
            └── plan/export/
                ├── route.ts             # GET → filled .pptx download
                └── route.test.ts
```

Section components (`InviteeSection`, `ChecklistSection`, `PlanSection`) are built and tested standalone in Tasks 5–7; the detail page that composes them is Task 8, so no task ever references a component that does not exist yet.

Two files in this tree are **shared with other features and other concurrent plans**: `app/(dashboard)/campaigns/[id]/page.tsx` (the campaign detail hub — five existing sections; this plan appends exactly one more) and `docs/sql/README.md` (one table row added). Make only the additive edits shown in the tasks; never reformat or restructure the rest of those files.

---

## Task 1: Migration 0016 — events, event_invitees, event_checklist_items

**Files:**
- Create: `supabase/migrations/0016_events.sql`
- Test: `supabase/migrations/0016_events.test.ts`

**Interfaces:**
- Consumes: `public.campaigns` (migration 0002), `public.applicants` (migration 0007 — columns `id, campaign_id, name, sns_url, contact` are what invitee import copies).
- Produces:
  - table `public.events` — `id uuid pk`, `campaign_id uuid not null` FK→campaigns cascade, `name text not null`, `event_at timestamptz`, `venue text`, `memo text`, `status text not null default 'preparing' check in ('preparing','done','canceled')`, `created_at timestamptz`.
  - table `public.event_invitees` — `id uuid pk`, `event_id uuid not null` FK→events cascade, `applicant_id uuid` nullable FK→applicants, snapshot columns `name text not null`, `sns_url text`, `contact text`, `rsvp_status text not null default 'pending' check in ('pending','attending','not_attending')`, `attended boolean not null default false`, `memo text`, `created_at`, `unique (event_id, applicant_id)`.
  - table `public.event_checklist_items` — `id uuid pk`, `event_id uuid not null` FK→events cascade, `label text not null`, `due_date date`, `assignee text`, `done boolean not null default false`, `sort_order integer not null default 0`, `created_at`.
  - RLS on all three: full CRUD `to authenticated`, nothing for anon.

- [ ] **Step 1: Write the failing test**

`supabase/migrations/0016_events.test.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "vitest";

// DB tests talk to the real hosted Supabase project with the service role key
// (same pattern as 0004_pre_survey_responses.test.ts). They fail with
// "relation does not exist" until docs/sql/setup-0016-0017.sql is pasted into
// the dashboard SQL editor — that is expected during development.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function makeCampaign() {
  const { data, error } = await admin
    .from("campaigns")
    .insert({ name: "행사 테스트 캠페인", company_name: "테스트 업체", campaign_type: "visit" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function makeEvent(campaignId: string) {
  const { data, error } = await admin
    .from("events")
    .insert({ campaign_id: campaignId, name: "테스트 런칭 쇼케이스" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function makeApplicant(campaignId: string) {
  const { data, error } = await admin
    .from("applicants")
    .insert({
      campaign_id: campaignId,
      name: "테스트 인플루언서",
      sns_url: "https://instagram.com/test",
      nationality: "KR",
      contact: "010-0000-0000",
      privacy_consent: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

test("an event defaults to preparing status", async () => {
  const campaign = await makeCampaign();
  const event = await makeEvent(campaign.id);
  expect(event.status).toBe("preparing");
  expect(event.event_at).toBeNull();
});

test("events.status rejects values outside preparing/done/canceled", async () => {
  const campaign = await makeCampaign();
  const { error } = await admin
    .from("events")
    .insert({ campaign_id: campaign.id, name: "행사", status: "archived" });
  expect(error).not.toBeNull();
});

test("an invitee defaults to rsvp pending and attended false", async () => {
  const campaign = await makeCampaign();
  const event = await makeEvent(campaign.id);
  const { data, error } = await admin
    .from("event_invitees")
    .insert({ event_id: event.id, name: "테스트 초대자" })
    .select()
    .single();
  expect(error).toBeNull();
  expect(data.rsvp_status).toBe("pending");
  expect(data.attended).toBe(false);
  expect(data.applicant_id).toBeNull();
});

test("rsvp_status rejects unknown values", async () => {
  const campaign = await makeCampaign();
  const event = await makeEvent(campaign.id);
  const { error } = await admin
    .from("event_invitees")
    .insert({ event_id: event.id, name: "테스트", rsvp_status: "maybe" });
  expect(error).not.toBeNull();
});

test("the same applicant cannot be invited twice to one event", async () => {
  const campaign = await makeCampaign();
  const event = await makeEvent(campaign.id);
  const applicant = await makeApplicant(campaign.id);

  const row = { event_id: event.id, applicant_id: applicant.id, name: applicant.name };
  const first = await admin.from("event_invitees").insert(row);
  expect(first.error).toBeNull();
  const second = await admin.from("event_invitees").insert(row);
  expect(second.error).not.toBeNull();
});

test("manually added invitees (applicant_id null) can repeat freely", async () => {
  const campaign = await makeCampaign();
  const event = await makeEvent(campaign.id);
  // Postgres treats NULLs as distinct in unique constraints, so the
  // unique(event_id, applicant_id) guard only bites for imported applicants.
  const a = await admin.from("event_invitees").insert({ event_id: event.id, name: "수기 A" });
  const b = await admin.from("event_invitees").insert({ event_id: event.id, name: "수기 B" });
  expect(a.error).toBeNull();
  expect(b.error).toBeNull();
});

test("a checklist item defaults to done=false, sort_order=0", async () => {
  const campaign = await makeCampaign();
  const event = await makeEvent(campaign.id);
  const { data, error } = await admin
    .from("event_checklist_items")
    .insert({ event_id: event.id, label: "장소 대관 확정" })
    .select()
    .single();
  expect(error).toBeNull();
  expect(data.done).toBe(false);
  expect(data.sort_order).toBe(0);
  expect(data.due_date).toBeNull();
});

test("deleting an event cascades to its invitees and checklist items", async () => {
  const campaign = await makeCampaign();
  const event = await makeEvent(campaign.id);
  await admin.from("event_invitees").insert({ event_id: event.id, name: "테스트" });
  await admin.from("event_checklist_items").insert({ event_id: event.id, label: "테스트" });

  await admin.from("events").delete().eq("id", event.id);

  const invitees = await admin.from("event_invitees").select("id").eq("event_id", event.id);
  const items = await admin.from("event_checklist_items").select("id").eq("event_id", event.id);
  expect(invitees.data).toEqual([]);
  expect(items.data).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- 0016_events`
Expected: FAIL — `relation "public.events" does not exist`. (Never run the bare `npm test`.)

- [ ] **Step 3: Write the migration**

`supabase/migrations/0016_events.sql`:

```sql
-- 서브 프로젝트 B: agency-hosted events. Everything is dashboard-internal —
-- deliberately NO anon policies, NO public grants, NO RPCs (spec: 공개 라우트 없음).

create table public.events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  event_at timestamptz,
  venue text,
  memo text,
  status text not null default 'preparing'
    check (status in ('preparing', 'done', 'canceled')),
  created_at timestamptz not null default now()
);

create index events_campaign_id_created_at_idx
  on public.events (campaign_id, created_at);

alter table public.events enable row level security;

create policy "authenticated users can manage events"
  on public.events for all
  to authenticated
  using (true)
  with check (true);

create table public.event_invitees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  -- Set when imported from the campaign's applicants; null for manual adds.
  applicant_id uuid references public.applicants(id),
  -- Snapshot copies of the applicant's values at import time (spec: 스냅샷;
  -- later edits to the applicant must not change the invite list).
  name text not null,
  sns_url text,
  contact text,
  rsvp_status text not null default 'pending'
    check (rsvp_status in ('pending', 'attending', 'not_attending')),
  attended boolean not null default false,
  memo text,
  created_at timestamptz not null default now(),
  -- Blocks double-inviting the same applicant. NULL applicant_ids are distinct
  -- in Postgres unique constraints, so manual adds are unrestricted.
  unique (event_id, applicant_id)
);

create index event_invitees_event_id_created_at_idx
  on public.event_invitees (event_id, created_at);

alter table public.event_invitees enable row level security;

create policy "authenticated users can manage event invitees"
  on public.event_invitees for all
  to authenticated
  using (true)
  with check (true);

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

create index event_checklist_items_event_id_created_at_idx
  on public.event_checklist_items (event_id, created_at);

alter table public.event_checklist_items enable row level security;

create policy "authenticated users can manage event checklist items"
  on public.event_checklist_items for all
  to authenticated
  using (true)
  with check (true);
```

- [ ] **Step 4: Note the apply state — do NOT try to apply via CLI**

The Supabase CLI is not authenticated here; `supabase migration up` and `supabase db push` will fail and must not be run. The SQL is applied by the human pasting the Task 2 bundle (`docs/sql/setup-0016-0017.sql`) into the Supabase dashboard SQL editor. Until then `npm test -- 0016_events` keeps failing with relation-not-found — that is the expected, correct state. Continue to the commit.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0016_events.sql supabase/migrations/0016_events.test.ts
git commit -m "feat: add events, event_invitees, event_checklist_items tables (0016)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Migration 0017 — event_plans, plus the SQL bundle

**Files:**
- Create: `supabase/migrations/0017_event_plans.sql`
- Test: `supabase/migrations/0017_event_plans.test.ts`
- Create: `docs/sql/setup-0016-0017.sql`
- Modify: `docs/sql/README.md` (additive — add one table row, change nothing else)

**Interfaces:**
- Consumes: `public.events` (0016, this plan), `public.ppt_templates` (0015 — the parallel PPT engine plan; **must already be applied to the target database** or the FK in Step 3 has nothing to reference).
- Produces: table `public.event_plans` — `id uuid pk`, `event_id uuid not null unique` FK→events cascade, `template_id uuid not null` FK→ppt_templates, `field_values jsonb not null default '{}'`, `updated_at timestamptz default now()`.

- [ ] **Step 1: Write the failing test**

`supabase/migrations/0017_event_plans.test.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "vitest";

// Same pattern as 0016_events.test.ts. Additionally requires 0015 (ppt_templates,
// from the parallel PPT template engine plan) to already be applied — until both
// 0015 and this migration are pasted into the dashboard SQL editor, every test
// here fails with "relation does not exist". That is expected during development.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function makeCampaign() {
  const { data, error } = await admin
    .from("campaigns")
    .insert({ name: "운영안 테스트 캠페인", company_name: "테스트 업체", campaign_type: "visit" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function makeEvent(campaignId: string) {
  const { data, error } = await admin
    .from("events")
    .insert({ campaign_id: campaignId, name: "테스트 행사" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function makeTemplate() {
  const { data, error } = await admin
    .from("ppt_templates")
    .insert({
      kind: "event",
      name: "테스트 운영안 템플릿",
      storage_path: "event/test-template.pptx",
      placeholders: ["행사명", "행사일시"],
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

test("an event plan defaults field_values to an empty object", async () => {
  const campaign = await makeCampaign();
  const event = await makeEvent(campaign.id);
  const template = await makeTemplate();

  const { data, error } = await admin
    .from("event_plans")
    .insert({ event_id: event.id, template_id: template.id })
    .select()
    .single();

  expect(error).toBeNull();
  expect(data.field_values).toEqual({});
});

test("an event can have only one plan", async () => {
  const campaign = await makeCampaign();
  const event = await makeEvent(campaign.id);
  const template = await makeTemplate();

  const first = await admin
    .from("event_plans")
    .insert({ event_id: event.id, template_id: template.id });
  expect(first.error).toBeNull();

  const second = await admin
    .from("event_plans")
    .insert({ event_id: event.id, template_id: template.id });
  expect(second.error).not.toBeNull();
});

test("rejects a template_id that does not exist", async () => {
  const campaign = await makeCampaign();
  const event = await makeEvent(campaign.id);

  const { error } = await admin
    .from("event_plans")
    .insert({ event_id: event.id, template_id: "00000000-0000-0000-0000-000000000000" });

  expect(error).not.toBeNull();
});

test("deleting an event cascades to its plan", async () => {
  const campaign = await makeCampaign();
  const event = await makeEvent(campaign.id);
  const template = await makeTemplate();
  await admin.from("event_plans").insert({ event_id: event.id, template_id: template.id });

  await admin.from("events").delete().eq("id", event.id);

  const plans = await admin.from("event_plans").select("id").eq("event_id", event.id);
  expect(plans.data).toEqual([]);
});

test("field_values can be updated with a placeholder map", async () => {
  const campaign = await makeCampaign();
  const event = await makeEvent(campaign.id);
  const template = await makeTemplate();
  const created = await admin
    .from("event_plans")
    .insert({ event_id: event.id, template_id: template.id })
    .select()
    .single();

  const { data, error } = await admin
    .from("event_plans")
    .update({ field_values: { 행사명: "글로우랩 팝업" } })
    .eq("id", created.data!.id)
    .select()
    .single();

  expect(error).toBeNull();
  expect(data.field_values).toEqual({ 행사명: "글로우랩 팝업" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- 0017_event_plans`
Expected: FAIL — `relation "public.events" does not exist` (or `ppt_templates`, depending on which prerequisite bundle hasn't been pasted in yet). Never run the bare `npm test`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0017_event_plans.sql`:

```sql
-- 서브 프로젝트 B: 행사 운영안(PPT) 1건을 행사당 하나씩 보관한다. template_id는
-- PPT 엔진 계획(0015)의 ppt_templates를 참조하므로, 0015가 먼저 적용되어 있어야
-- 이 파일의 FK가 성립한다.

create table public.event_plans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  template_id uuid not null references public.ppt_templates(id),
  field_values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.event_plans enable row level security;

create policy "authenticated users can manage event plans"
  on public.event_plans for all
  to authenticated
  using (true)
  with check (true);
```

- [ ] **Step 4: Note the apply state — do NOT try to apply via CLI**

Same constraint as Task 1: the Supabase CLI is not authenticated here, so never run `supabase migration up` / `supabase db push`. This migration additionally depends on 0015 (a different plan) already being applied — if the human pastes this bundle before that one, table creation fails outright on the `references public.ppt_templates(id)` line with `relation "public.ppt_templates" does not exist`. Note this dependency when handing off the bundle. Continue to the next step regardless of apply state.

- [ ] **Step 5: Regenerate the SQL bundle and add the README row**

Create `docs/sql/setup-0016-0017.sql` — same header-comment style as `docs/sql/setup-0006-0014.sql`, concatenating the two migrations from this plan (0015 is a separate plan's bundle and is deliberately NOT included here):

```sql
-- 신규 마이그레이션 0016~0017 통합본
-- Supabase 대시보드 → SQL Editor에 전체 붙여넣고 실행하세요.
-- 0015(ppt_templates, storage 버킷 ppt-templates)는 별도 계획(PPT 템플릿 엔진)에서
-- 관리하며, 이 파일보다 먼저 적용되어 있어야 event_plans.template_id의 FK가
-- 성립합니다. 이 파일은 0016~0017만 담고 있습니다.

-- ============================================
-- 0016_events.sql
-- ============================================
-- 서브 프로젝트 B: agency-hosted events. Everything is dashboard-internal —
-- deliberately NO anon policies, NO public grants, NO RPCs (spec: 공개 라우트 없음).

create table public.events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  event_at timestamptz,
  venue text,
  memo text,
  status text not null default 'preparing'
    check (status in ('preparing', 'done', 'canceled')),
  created_at timestamptz not null default now()
);

create index events_campaign_id_created_at_idx
  on public.events (campaign_id, created_at);

alter table public.events enable row level security;

create policy "authenticated users can manage events"
  on public.events for all
  to authenticated
  using (true)
  with check (true);

create table public.event_invitees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  -- Set when imported from the campaign's applicants; null for manual adds.
  applicant_id uuid references public.applicants(id),
  -- Snapshot copies of the applicant's values at import time (spec: 스냅샷;
  -- later edits to the applicant must not change the invite list).
  name text not null,
  sns_url text,
  contact text,
  rsvp_status text not null default 'pending'
    check (rsvp_status in ('pending', 'attending', 'not_attending')),
  attended boolean not null default false,
  memo text,
  created_at timestamptz not null default now(),
  -- Blocks double-inviting the same applicant. NULL applicant_ids are distinct
  -- in Postgres unique constraints, so manual adds are unrestricted.
  unique (event_id, applicant_id)
);

create index event_invitees_event_id_created_at_idx
  on public.event_invitees (event_id, created_at);

alter table public.event_invitees enable row level security;

create policy "authenticated users can manage event invitees"
  on public.event_invitees for all
  to authenticated
  using (true)
  with check (true);

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

create index event_checklist_items_event_id_created_at_idx
  on public.event_checklist_items (event_id, created_at);

alter table public.event_checklist_items enable row level security;

create policy "authenticated users can manage event checklist items"
  on public.event_checklist_items for all
  to authenticated
  using (true)
  with check (true);

-- ============================================
-- 0017_event_plans.sql
-- ============================================
-- 서브 프로젝트 B: 행사 운영안(PPT) 1건을 행사당 하나씩 보관한다. template_id는
-- PPT 엔진 계획(0015)의 ppt_templates를 참조하므로, 0015가 먼저 적용되어 있어야
-- 이 파일의 FK가 성립한다.

create table public.event_plans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  template_id uuid not null references public.ppt_templates(id),
  field_values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.event_plans enable row level security;

create policy "authenticated users can manage event plans"
  on public.event_plans for all
  to authenticated
  using (true)
  with check (true);
```

In `docs/sql/README.md`, add exactly one row to the existing table (do not touch anything else in the file):

```markdown
| [setup-0016-0017.sql](setup-0016-0017.sql) | events, event_invitees, event_checklist_items, event_plans (0015 ppt_templates 선행 필요) | 적용 대기 |
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0017_event_plans.sql supabase/migrations/0017_event_plans.test.ts docs/sql/setup-0016-0017.sql docs/sql/README.md
git commit -m "feat: add event_plans table (0017) and regenerate SQL bundle" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: `lib/ai/eventPlanAssist.ts` — AI draft for one 운영안 placeholder

**Files:**
- Create: `lib/ai/eventPlanAssist.ts`
- Test: `lib/ai/eventPlanAssist.test.ts`

**Interfaces:**
- Consumes: `ASSIST_MODEL` (exported string constant, `"gemini-3.6-flash"`) from `./preSurveyAssist` — read `lib/ai/preSurveyAssist.ts` and `lib/ai/preSurveyAssist.test.ts` before writing this task; this mirrors that file's shape exactly, the same way `lib/ai/formIntroAssist.ts` does.
- Produces: `generateEventPlanDraft(input: { placeholder: string; context: Record<string, string> }): Promise<string>` — Task 7's `planActions.ts` calls this with one placeholder name at a time (never the whole field_values map at once) plus a context object built from the campaign's pre-survey answers and the event's name/date/venue.

- [ ] **Step 1: Write the failing test**

`lib/ai/eventPlanAssist.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockGenerateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
  // eventPlanAssist imports ASSIST_MODEL from preSurveyAssist.ts, and that module
  // itself does `import { GoogleGenAI, ThinkingLevel } from "@google/genai"` at
  // load time. Omit ThinkingLevel from this mock and that import throws before
  // either module finishes loading, regardless of which one is under test.
  ThinkingLevel: { MINIMAL: "MINIMAL", LOW: "LOW", HIGH: "HIGH" },
}));

import { generateEventPlanDraft } from "./eventPlanAssist";

describe("generateEventPlanDraft", () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  test("sends the placeholder name and returns the draft text", async () => {
    mockGenerateContent.mockResolvedValue({ text: "  글로우랩 신제품 런칭 쇼케이스입니다.  " });

    const result = await generateEventPlanDraft({
      placeholder: "행사개요",
      context: { 행사명: "글로우랩 런칭 쇼케이스" },
    });

    expect(result).toBe("글로우랩 신제품 런칭 쇼케이스입니다.");
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-3.6-flash",
        contents: expect.stringContaining("행사개요"),
      })
    );
  });

  test("includes campaign and event context in the prompt", async () => {
    mockGenerateContent.mockResolvedValue({ text: "초안" });

    await generateEventPlanDraft({
      placeholder: "행사일시",
      context: { 행사명: "글로우랩 런칭 쇼케이스", 행사일: "2026-09-12" },
    });

    const prompt = mockGenerateContent.mock.calls[0][0].contents;
    expect(prompt).toContain("글로우랩 런칭 쇼케이스");
    expect(prompt).toContain("2026-09-12");
  });

  test("omits blank context values from the prompt", async () => {
    mockGenerateContent.mockResolvedValue({ text: "초안" });

    await generateEventPlanDraft({ placeholder: "행사장소", context: { 장소: "   ", 메모: "" } });

    const prompt = mockGenerateContent.mock.calls[0][0].contents;
    expect(prompt).toContain("(없음)");
  });

  test("caps the output length and keeps thinking minimal", async () => {
    mockGenerateContent.mockResolvedValue({ text: "초안" });

    await generateEventPlanDraft({ placeholder: "행사개요", context: {} });

    expect(mockGenerateContent.mock.calls[0][0].config).toEqual(
      expect.objectContaining({
        maxOutputTokens: expect.any(Number),
        thinkingConfig: { thinkingLevel: "MINIMAL" },
      })
    );
  });

  test("instructs the model to return plain prose with no markdown scaffolding", async () => {
    mockGenerateContent.mockResolvedValue({ text: "초안" });

    await generateEventPlanDraft({ placeholder: "행사개요", context: {} });

    const prompt = mockGenerateContent.mock.calls[0][0].contents;
    expect(prompt).toContain("마크다운");
    expect(prompt).toContain("1~2문장");
  });

  test("throws when the response carries no text", async () => {
    mockGenerateContent.mockResolvedValue({ text: undefined });

    await expect(
      generateEventPlanDraft({ placeholder: "행사개요", context: {} })
    ).rejects.toThrow("UNEXPECTED_RESPONSE");
  });

  test("throws when the response text is blank", async () => {
    mockGenerateContent.mockResolvedValue({ text: "   " });

    await expect(
      generateEventPlanDraft({ placeholder: "행사개요", context: {} })
    ).rejects.toThrow("UNEXPECTED_RESPONSE");
  });

  test("propagates API errors", async () => {
    mockGenerateContent.mockRejectedValue(new Error("rate limited"));

    await expect(
      generateEventPlanDraft({ placeholder: "행사개요", context: {} })
    ).rejects.toThrow("rate limited");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- eventPlanAssist`
Expected: FAIL — `Cannot find module './eventPlanAssist'`.

- [ ] **Step 3: Write the implementation**

`lib/ai/eventPlanAssist.ts`:

```ts
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { ASSIST_MODEL } from "./preSurveyAssist";

export type EventPlanAssistInput = {
  /** The PPT placeholder being drafted, e.g. "행사개요" (without the {{ }} braces). */
  placeholder: string;
  /** Campaign pre-survey answers plus the event's name/date/venue, keyed by label. */
  context: Record<string, string>;
};

// Same reasoning as preSurveyAssist/formIntroAssist: this model always reasons
// before answering and those tokens count against maxOutputTokens. A single PPT
// placeholder value is at most a short paragraph, so MINIMAL is right.
const EVENT_PLAN_CONFIG = {
  maxOutputTokens: 800,
  thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
};

export async function generateEventPlanDraft(input: EventPlanAssistInput): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const contextLines = Object.entries(input.context)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  const response = await ai.models.generateContent({
    model: ASSIST_MODEL,
    contents: `당신은 인플루언서 마케팅 에이전시의 행사 운영안(PPT) 작성을 돕는 어시스턴트입니다. 아래 정보를 참고해서, PPT의 "${input.placeholder}" 항목에 그대로 넣을 수 있는 텍스트 초안을 써주세요.

규칙:
- 1~2문장의 평문으로만 작성한다.
- 머리말, 설명, 항목 번호, 마크다운 서식, 이모지를 쓰지 않는다.
- 아래 정보에 없는 예산, 인원수, 구체 일정을 지어내지 않는다.
- "${input.placeholder}"에 들어갈 값만 출력한다.

참고 정보:
${contextLines || "(없음)"}`,
    config: EVENT_PLAN_CONFIG,
  });

  const draft = response.text?.trim();
  if (!draft) throw new Error("UNEXPECTED_RESPONSE");
  return draft;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- eventPlanAssist`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ai/eventPlanAssist.ts lib/ai/eventPlanAssist.test.ts
git commit -m "feat: add generateEventPlanDraft for per-field 운영안 AI drafts" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: `lib/events/types.ts` — row types, Korean labels, `formatEventAt`

**Files:**
- Create: `lib/events/types.ts`
- Test: `lib/events/types.test.ts`

**Interfaces:**
- Consumes: nothing (pure types + pure functions; the shapes mirror the 0016/0017 columns exactly).
- Produces (used by Tasks 5–8): `EventStatus`, `RsvpStatus`, `EventRow`, `EventInviteeRow`, `EventChecklistItemRow`, `EventPlanRow`, `PptTemplateOption` (the narrow `{ id, name, placeholders }` read shape referenced in the prerequisite section — this plan does not import the PPT engine's own `PptTemplate` row type), `EVENT_STATUS_LABEL`, `RSVP_LABEL`, `formatEventAt(eventAt: string | null): string`.

- [ ] **Step 1: Write the failing test**

`lib/events/types.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { EVENT_STATUS_LABEL, RSVP_LABEL, formatEventAt } from "./types";

describe("EVENT_STATUS_LABEL", () => {
  test("covers every status the 0016 check constraint allows", () => {
    expect(EVENT_STATUS_LABEL).toEqual({ preparing: "준비중", done: "완료", canceled: "취소" });
  });
});

describe("RSVP_LABEL", () => {
  test("covers every rsvp_status the 0016 check constraint allows", () => {
    expect(RSVP_LABEL).toEqual({
      pending: "미정",
      attending: "참석예정",
      not_attending: "불참",
    });
  });
});

describe("formatEventAt", () => {
  test("formats an instant as a KST date, weekday, and time", () => {
    // 2026-09-12T05:00:00Z is 2026-09-12 14:00 in Seoul, a Saturday.
    expect(formatEventAt("2026-09-12T05:00:00Z")).toBe("2026.09.12(토) 14:00");
  });

  test("rolls into the next KST day near midnight UTC", () => {
    // 2026-09-12T15:30:00Z is 2026-09-13 00:30 in Seoul, a Sunday.
    expect(formatEventAt("2026-09-12T15:30:00Z")).toBe("2026.09.13(일) 00:30");
  });

  test("shows 미정 when the event has no date yet", () => {
    expect(formatEventAt(null)).toBe("미정");
  });

  test("shows 미정 for an unparseable value", () => {
    expect(formatEventAt("작성중")).toBe("미정");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/events/types`
Expected: FAIL — `Cannot find module './types'`.

- [ ] **Step 3: Write the implementation**

`lib/events/types.ts`:

```ts
export type EventStatus = "preparing" | "done" | "canceled";
export type RsvpStatus = "pending" | "attending" | "not_attending";

export type EventRow = {
  id: string;
  campaign_id: string;
  name: string;
  event_at: string | null;
  venue: string | null;
  memo: string | null;
  status: EventStatus;
  created_at: string;
};

export type EventInviteeRow = {
  id: string;
  event_id: string;
  applicant_id: string | null;
  name: string;
  sns_url: string | null;
  contact: string | null;
  rsvp_status: RsvpStatus;
  attended: boolean;
  memo: string | null;
  created_at: string;
};

export type EventChecklistItemRow = {
  id: string;
  event_id: string;
  label: string;
  due_date: string | null;
  assignee: string | null;
  done: boolean;
  sort_order: number;
  created_at: string;
};

export type EventPlanRow = {
  id: string;
  event_id: string;
  template_id: string;
  field_values: Record<string, string>;
  updated_at: string;
};

/**
 * Narrow read shape for the template picker (Task 7). Deliberately does not
 * import the PPT engine plan's own `PptTemplate` row type (exported type-only
 * from app/(dashboard)/settings/ppt-templates/actions.ts) — this plan only
 * ever needs id/name/placeholders, and importing the engine's row type would
 * couple this file to a module owned by a different plan.
 */
export type PptTemplateOption = {
  id: string;
  name: string;
  placeholders: string[];
};

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  preparing: "준비중",
  done: "완료",
  canceled: "취소",
};

export const RSVP_LABEL: Record<RsvpStatus, string> = {
  pending: "미정",
  attending: "참석예정",
  not_attending: "불참",
};

// Same KST-shift trick as lib/seeding/dday.ts's toKstDateString: shift the
// instant by the fixed UTC+9 offset, then read it back with the UTC getters so
// the result doesn't depend on the host machine's local timezone (Vercel runs
// UTC; the agency works in Seoul).
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026.09.12(토) 14:00" 형식. event_at이 없거나 파싱할 수 없으면 "미정". */
export function formatEventAt(eventAt: string | null): string {
  if (!eventAt) return "미정";
  const instant = new Date(eventAt);
  if (Number.isNaN(instant.getTime())) return "미정";

  const kst = new Date(instant.getTime() + KST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  const weekday = WEEKDAY_LABEL[kst.getUTCDay()];
  return `${kst.getUTCFullYear()}.${pad(kst.getUTCMonth() + 1)}.${pad(kst.getUTCDate())}(${weekday}) ${pad(
    kst.getUTCHours()
  )}:${pad(kst.getUTCMinutes())}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/events/types`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/events/types.ts lib/events/types.test.ts
git commit -m "feat: add events row types, Korean labels, and formatEventAt" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: Invitee management — `InviteeSection.tsx` + `inviteeActions.ts`

**Files:**
- Create: `app/(dashboard)/campaigns/[id]/events/[eventId]/inviteeActions.ts`
- Test: `app/(dashboard)/campaigns/[id]/events/[eventId]/inviteeActions.test.ts`
- Create: `app/(dashboard)/campaigns/[id]/events/[eventId]/InviteeSection.tsx`
- Test: `app/(dashboard)/campaigns/[id]/events/[eventId]/InviteeSection.test.tsx`

**Interfaces:**
- Consumes: `EventInviteeRow`, `RsvpStatus`, `RSVP_LABEL` from `@/lib/events/types` (Task 4).
- Produces: `importInviteesFromApplicants(eventId, campaignId, applicantIds: string[]): Promise<InviteeActionResult>`, `addManualInvitee(eventId, campaignId, name, snsUrl, contact): Promise<InviteeActionResult>`, `updateInvitee(inviteeId, eventId, campaignId, patch: { rsvp_status?: RsvpStatus; attended?: boolean; memo?: string }): Promise<InviteeActionResult>` where `InviteeActionResult = { error: string } | { success: true }`. Exports `ApplicantCandidate` (`{ id, name, sns_url, contact }`) and default export `InviteeSection` — both consumed by Task 8's assembled detail page.

This section is built and tested standalone with hand-written fixture props; Task 8 wires it to real Supabase data.

- [ ] **Step 1: Write the failing test for `inviteeActions.ts`**

`app/(dashboard)/campaigns/[id]/events/[eventId]/inviteeActions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/roles", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/dashboard", () => ({ createDashboardSupabaseClient: vi.fn() }));

import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { addManualInvitee, importInviteesFromApplicants, updateInvitee } from "./inviteeActions";
import type { RsvpStatus } from "@/lib/events/types";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocked(requireRole).mockResolvedValue({ id: "u1", role: "staff", full_name: "담당자" });
});

describe("importInviteesFromApplicants", () => {
  test("requires at least one applicant to be selected", async () => {
    const result = await importInviteesFromApplicants("evt-1", "c1", []);
    expect(result).toEqual({ error: "가져올 지원자를 선택해주세요." });
  });

  test("copies name/sns_url/contact as a snapshot, scoped to this campaign", async () => {
    const inFilter = vi.fn().mockResolvedValue({
      data: [
        { id: "a1", name: "김서연", sns_url: "https://instagram.com/seoyeon", contact: "010-1111-1111" },
      ],
      error: null,
    });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocked(createDashboardSupabaseClient).mockResolvedValue({
      from: (table: string) => {
        if (table === "applicants") {
          return { select: () => ({ eq: () => ({ in: inFilter }) }) };
        }
        return { upsert };
      },
    });

    const result = await importInviteesFromApplicants("evt-1", "c1", ["a1"]);

    expect(result).toEqual({ success: true });
    expect(upsert).toHaveBeenCalledWith(
      [
        {
          event_id: "evt-1",
          applicant_id: "a1",
          name: "김서연",
          sns_url: "https://instagram.com/seoyeon",
          contact: "010-1111-1111",
        },
      ],
      { onConflict: "event_id,applicant_id", ignoreDuplicates: true }
    );
  });
});

describe("addManualInvitee", () => {
  test("rejects a blank name", async () => {
    const result = await addManualInvitee("evt-1", "c1", "   ", "", "");
    expect(result).toEqual({ error: "이름을 입력해주세요." });
  });

  test("inserts a manual invitee with no applicant_id", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocked(createDashboardSupabaseClient).mockResolvedValue({ from: () => ({ insert }) });

    const result = await addManualInvitee("evt-1", "c1", "수기 초대자", "", "");

    expect(result).toEqual({ success: true });
    expect(insert).toHaveBeenCalledWith({
      event_id: "evt-1",
      name: "수기 초대자",
      sns_url: null,
      contact: null,
    });
  });
});

describe("updateInvitee", () => {
  test("rejects an unknown rsvp_status", async () => {
    const result = await updateInvitee("inv-1", "evt-1", "c1", {
      rsvp_status: "maybe" as unknown as RsvpStatus,
    });
    expect(result).toEqual({ error: "알 수 없는 참석 상태입니다." });
  });

  test("updates the invitee scoped to its event", async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null });
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const update = vi.fn(() => ({ eq: eq1 }));
    mocked(createDashboardSupabaseClient).mockResolvedValue({ from: () => ({ update }) });

    const result = await updateInvitee("inv-1", "evt-1", "c1", { attended: true });

    expect(result).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({ attended: true });
    expect(eq1).toHaveBeenCalledWith("id", "inv-1");
    expect(eq2).toHaveBeenCalledWith("event_id", "evt-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- inviteeActions`
Expected: FAIL — `Cannot find module './inviteeActions'`.

- [ ] **Step 3: Implement `inviteeActions.ts`**

`app/(dashboard)/campaigns/[id]/events/[eventId]/inviteeActions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import type { RsvpStatus } from "@/lib/events/types";

export type InviteeActionResult = { error: string } | { success: true };

const SAVE_FAILED = "저장에 실패했습니다. 다시 시도해주세요.";
const RSVP_VALUES: RsvpStatus[] = ["pending", "attending", "not_attending"];

/**
 * Copies the selected applicants' name/sns_url/contact into event_invitees as a
 * snapshot (spec: 가져오기 시 지원자 값 복사, 스냅샷 — later edits to the applicant
 * must not change the invite list). Only pulls applicants that belong to this
 * event's own campaign, so an id from another campaign can't be smuggled in.
 */
export async function importInviteesFromApplicants(
  eventId: string,
  campaignId: string,
  applicantIds: string[]
): Promise<InviteeActionResult> {
  await requireRole("staff");

  const ids = applicantIds.filter((appId) => appId.trim().length > 0);
  if (ids.length === 0) return { error: "가져올 지원자를 선택해주세요." };

  const supabase = await createDashboardSupabaseClient();

  const { data: applicants, error: fetchError } = await supabase
    .from("applicants")
    .select("id, name, sns_url, contact")
    .eq("campaign_id", campaignId)
    .in("id", ids);

  if (fetchError) return { error: SAVE_FAILED };

  const rows = (applicants ?? []).map((a) => ({
    event_id: eventId,
    applicant_id: a.id,
    name: a.name,
    sns_url: a.sns_url,
    contact: a.contact,
  }));

  if (rows.length === 0) return { error: SAVE_FAILED };

  // ignoreDuplicates: the UI disables already-invited applicants, but a second
  // staff member could import the same one moments earlier — treat that as a
  // no-op instead of surfacing the unique(event_id, applicant_id) violation.
  const { error } = await supabase
    .from("event_invitees")
    .upsert(rows, { onConflict: "event_id,applicant_id", ignoreDuplicates: true });

  if (error) return { error: SAVE_FAILED };

  revalidatePath(`/campaigns/${campaignId}/events/${eventId}`);
  return { success: true };
}

export async function addManualInvitee(
  eventId: string,
  campaignId: string,
  name: string,
  snsUrl: string,
  contact: string
): Promise<InviteeActionResult> {
  await requireRole("staff");

  const trimmedName = name.trim();
  if (!trimmedName) return { error: "이름을 입력해주세요." };

  const supabase = await createDashboardSupabaseClient();
  const { error } = await supabase.from("event_invitees").insert({
    event_id: eventId,
    name: trimmedName,
    sns_url: snsUrl.trim() || null,
    contact: contact.trim() || null,
  });

  if (error) return { error: SAVE_FAILED };

  revalidatePath(`/campaigns/${campaignId}/events/${eventId}`);
  return { success: true };
}

export async function updateInvitee(
  inviteeId: string,
  eventId: string,
  campaignId: string,
  patch: { rsvp_status?: RsvpStatus; attended?: boolean; memo?: string }
): Promise<InviteeActionResult> {
  await requireRole("staff");

  if (Object.keys(patch).length === 0) return { success: true };
  if (patch.rsvp_status !== undefined && !RSVP_VALUES.includes(patch.rsvp_status)) {
    return { error: "알 수 없는 참석 상태입니다." };
  }

  const supabase = await createDashboardSupabaseClient();
  const { error } = await supabase
    .from("event_invitees")
    .update(patch)
    .eq("id", inviteeId)
    .eq("event_id", eventId);

  if (error) return { error: SAVE_FAILED };

  revalidatePath(`/campaigns/${campaignId}/events/${eventId}`);
  return { success: true };
}
```

- [ ] **Step 4: Run test to verify `inviteeActions.ts` passes**

Run: `npm test -- inviteeActions`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Write the failing test for `InviteeSection.tsx`**

`app/(dashboard)/campaigns/[id]/events/[eventId]/InviteeSection.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./inviteeActions", () => ({
  importInviteesFromApplicants: vi.fn(),
  addManualInvitee: vi.fn(),
  updateInvitee: vi.fn(),
}));

import { addManualInvitee, importInviteesFromApplicants, updateInvitee } from "./inviteeActions";
import InviteeSection from "./InviteeSection";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

const APPLICANTS = [
  { id: "a1", name: "김서연", sns_url: "https://instagram.com/seoyeon", contact: "010-1111-1111" },
  { id: "a2", name: "박지훈", sns_url: "https://instagram.com/jihoon", contact: "010-2222-2222" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InviteeSection", () => {
  test("shows the invite/attending/attended header counts", () => {
    render(
      <InviteeSection
        eventId="evt-1"
        campaignId="c1"
        applicants={APPLICANTS}
        initialInvitees={[
          {
            id: "inv-1",
            event_id: "evt-1",
            applicant_id: "a1",
            name: "김서연",
            sns_url: "https://instagram.com/seoyeon",
            contact: "010-1111-1111",
            rsvp_status: "attending",
            attended: true,
            memo: null,
            created_at: "2026-08-30T00:00:00Z",
          },
        ]}
      />
    );

    expect(screen.getByText("초대 1 · 참석예정 1 · 참석 1")).toBeInTheDocument();
  });

  test("disables an applicant already invited when the import list opens", () => {
    render(
      <InviteeSection
        eventId="evt-1"
        campaignId="c1"
        applicants={APPLICANTS}
        initialInvitees={[
          {
            id: "inv-1",
            event_id: "evt-1",
            applicant_id: "a1",
            name: "김서연",
            sns_url: null,
            contact: null,
            rsvp_status: "pending",
            attended: false,
            memo: null,
            created_at: "2026-08-30T00:00:00Z",
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "캠페인 지원자에서 가져오기" }));

    expect(screen.getByLabelText("김서연 선택")).toBeDisabled();
    expect(screen.getByLabelText("박지훈 선택")).not.toBeDisabled();
  });

  test("imports the selected applicants and adds them to the table", async () => {
    mocked(importInviteesFromApplicants).mockResolvedValue({ success: true });

    render(
      <InviteeSection eventId="evt-1" campaignId="c1" applicants={APPLICANTS} initialInvitees={[]} />
    );

    fireEvent.click(screen.getByRole("button", { name: "캠페인 지원자에서 가져오기" }));
    fireEvent.click(screen.getByLabelText("박지훈 선택"));
    fireEvent.click(screen.getByRole("button", { name: "선택 가져오기 (1)" }));

    await waitFor(() => {
      expect(importInviteesFromApplicants).toHaveBeenCalledWith("evt-1", "c1", ["a2"]);
    });
    expect(screen.getByText("박지훈")).toBeInTheDocument();
  });

  test("requires a name for a manual add", async () => {
    render(<InviteeSection eventId="evt-1" campaignId="c1" applicants={[]} initialInvitees={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "직접 추가" }));

    expect(await screen.findByText("이름을 입력해주세요.")).toBeInTheDocument();
    expect(addManualInvitee).not.toHaveBeenCalled();
  });

  test("adds a manually entered invitee", async () => {
    mocked(addManualInvitee).mockResolvedValue({ success: true });

    render(<InviteeSection eventId="evt-1" campaignId="c1" applicants={[]} initialInvitees={[]} />);

    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "수기 초대자" } });
    fireEvent.click(screen.getByRole("button", { name: "직접 추가" }));

    await waitFor(() => {
      expect(addManualInvitee).toHaveBeenCalledWith("evt-1", "c1", "수기 초대자", "", "");
    });
    expect(screen.getByText("수기 초대자")).toBeInTheDocument();
  });

  test("changing an invitee's RSVP status saves it", async () => {
    mocked(updateInvitee).mockResolvedValue({ success: true });

    render(
      <InviteeSection
        eventId="evt-1"
        campaignId="c1"
        applicants={[]}
        initialInvitees={[
          {
            id: "inv-1",
            event_id: "evt-1",
            applicant_id: null,
            name: "김서연",
            sns_url: null,
            contact: null,
            rsvp_status: "pending",
            attended: false,
            memo: null,
            created_at: "2026-08-30T00:00:00Z",
          },
        ]}
      />
    );

    fireEvent.change(screen.getByLabelText("김서연 참석 여부"), { target: { value: "attending" } });

    await waitFor(() => {
      expect(updateInvitee).toHaveBeenCalledWith("inv-1", "evt-1", "c1", { rsvp_status: "attending" });
    });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- InviteeSection`
Expected: FAIL — `Cannot find module './InviteeSection'`.

- [ ] **Step 7: Implement `InviteeSection.tsx`**

`app/(dashboard)/campaigns/[id]/events/[eventId]/InviteeSection.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { RSVP_LABEL, type EventInviteeRow, type RsvpStatus } from "@/lib/events/types";
import { addManualInvitee, importInviteesFromApplicants, updateInvitee } from "./inviteeActions";

export type ApplicantCandidate = {
  id: string;
  name: string;
  sns_url: string;
  contact: string;
};

const CELL = "px-3 py-2 align-top text-sm text-text";
const INPUT = "rounded-token border border-border bg-surface2 px-2 py-1 text-sm text-text";

export default function InviteeSection({
  eventId,
  campaignId,
  initialInvitees,
  applicants,
}: {
  eventId: string;
  campaignId: string;
  initialInvitees: EventInviteeRow[];
  applicants: ApplicantCandidate[];
}) {
  const [invitees, setInvitees] = useState<EventInviteeRow[]>(initialInvitees);
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manualName, setManualName] = useState("");
  const [manualSns, setManualSns] = useState("");
  const [manualContact, setManualContact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const invitedApplicantIds = new Set(
    invitees.map((i) => i.applicant_id).filter((appId): appId is string => appId !== null)
  );

  const invitedCount = invitees.length;
  const attendingCount = invitees.filter((i) => i.rsvp_status === "attending").length;
  const attendedCount = invitees.filter((i) => i.attended).length;

  function toggleSelected(applicantId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(applicantId)) next.delete(applicantId);
      else next.add(applicantId);
      return next;
    });
  }

  async function handleImport() {
    setError(null);
    setBusy(true);
    const result = await importInviteesFromApplicants(eventId, campaignId, Array.from(selected));
    setBusy(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    const imported = applicants.filter((a) => selected.has(a.id));
    setInvitees((prev) => [
      ...prev,
      ...imported.map((a) => ({
        id: `pending-${a.id}`,
        event_id: eventId,
        applicant_id: a.id,
        name: a.name,
        sns_url: a.sns_url || null,
        contact: a.contact || null,
        rsvp_status: "pending" as RsvpStatus,
        attended: false,
        memo: null,
        created_at: new Date().toISOString(),
      })),
    ]);
    setSelected(new Set());
    setShowImport(false);
  }

  async function handleManualAdd() {
    setError(null);
    if (!manualName.trim()) {
      setError("이름을 입력해주세요.");
      return;
    }
    setBusy(true);
    const result = await addManualInvitee(eventId, campaignId, manualName, manualSns, manualContact);
    setBusy(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    setInvitees((prev) => [
      ...prev,
      {
        id: `pending-${Date.now()}`,
        event_id: eventId,
        applicant_id: null,
        name: manualName.trim(),
        sns_url: manualSns.trim() || null,
        contact: manualContact.trim() || null,
        rsvp_status: "pending",
        attended: false,
        memo: null,
        created_at: new Date().toISOString(),
      },
    ]);
    setManualName("");
    setManualSns("");
    setManualContact("");
  }

  function apply(
    inviteeId: string,
    patch: { rsvp_status?: RsvpStatus; attended?: boolean; memo?: string }
  ) {
    setInvitees((prev) => prev.map((i) => (i.id === inviteeId ? { ...i, ...patch } : i)));
    setError(null);
    startTransition(async () => {
      const result = await updateInvitee(inviteeId, eventId, campaignId, patch);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <section className="rounded-token border border-border bg-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-text">초대</h2>
        <p className="font-mono text-sm tabular-nums text-textMuted">
          초대 {invitedCount} · 참석예정 {attendingCount} · 참석 {attendedCount}
        </p>
      </div>

      {error && <p className="mb-3 text-sm text-critical">{error}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowImport((v) => !v)}
          className="rounded-token border border-border px-3 py-1.5 text-sm text-text"
        >
          캠페인 지원자에서 가져오기
        </button>
      </div>

      {showImport && (
        <div className="mb-6 rounded-token border border-border bg-surface2 p-4">
          {applicants.length === 0 ? (
            <p className="text-sm text-textMuted">이 캠페인에는 아직 지원자가 없습니다.</p>
          ) : (
            <ul className="mb-3 flex flex-col gap-1">
              {applicants.map((a) => {
                const alreadyInvited = invitedApplicantIds.has(a.id);
                return (
                  <li key={a.id} className="flex items-center gap-2 text-sm text-text">
                    <input
                      type="checkbox"
                      aria-label={`${a.name} 선택`}
                      checked={selected.has(a.id)}
                      disabled={alreadyInvited}
                      onChange={() => toggleSelected(a.id)}
                    />
                    <span className={alreadyInvited ? "text-textMuted" : ""}>{a.name}</span>
                    {alreadyInvited && <span className="text-xs text-textMuted">(이미 초대됨)</span>}
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            onClick={handleImport}
            disabled={busy || selected.size === 0}
            className="rounded-token bg-accent px-3 py-1.5 text-sm font-medium text-onAccent disabled:opacity-60"
          >
            선택 가져오기 ({selected.size})
          </button>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="manual-name" className="text-xs text-textMuted">
            이름
          </label>
          <input
            id="manual-name"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            className={INPUT}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="manual-sns" className="text-xs text-textMuted">
            SNS 링크
          </label>
          <input
            id="manual-sns"
            value={manualSns}
            onChange={(e) => setManualSns(e.target.value)}
            className={INPUT}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="manual-contact" className="text-xs text-textMuted">
            연락처
          </label>
          <input
            id="manual-contact"
            value={manualContact}
            onChange={(e) => setManualContact(e.target.value)}
            className={INPUT}
          />
        </div>
        <button
          type="button"
          onClick={handleManualAdd}
          disabled={busy}
          className="rounded-token border border-border px-3 py-2 text-sm text-text disabled:opacity-60"
        >
          직접 추가
        </button>
      </div>

      {invitees.length === 0 ? (
        <p className="text-textMuted">아직 초대한 인플루언서가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-token border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-surface2">
              <tr className="text-left text-xs text-textMuted">
                <th className="px-3 py-2">이름</th>
                <th className="px-3 py-2">SNS</th>
                <th className="px-3 py-2">연락처</th>
                <th className="px-3 py-2">참석 여부</th>
                <th className="px-3 py-2">당일 참석</th>
                <th className="px-3 py-2">메모</th>
              </tr>
            </thead>
            <tbody>
              {invitees.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className={CELL}>{i.name}</td>
                  <td className={CELL}>{i.sns_url ?? "-"}</td>
                  <td className={`${CELL} font-mono tabular-nums`}>{i.contact ?? "-"}</td>
                  <td className={CELL}>
                    <select
                      aria-label={`${i.name} 참석 여부`}
                      value={i.rsvp_status}
                      onChange={(e) => apply(i.id, { rsvp_status: e.target.value as RsvpStatus })}
                      className={INPUT}
                    >
                      {(Object.keys(RSVP_LABEL) as RsvpStatus[]).map((status) => (
                        <option key={status} value={status}>
                          {RSVP_LABEL[status]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={CELL}>
                    <input
                      type="checkbox"
                      aria-label={`${i.name} 당일 참석`}
                      checked={i.attended}
                      onChange={(e) => apply(i.id, { attended: e.target.checked })}
                    />
                  </td>
                  <td className={CELL}>
                    <input
                      aria-label={`${i.name} 메모`}
                      defaultValue={i.memo ?? ""}
                      onBlur={(e) => apply(i.id, { memo: e.target.value })}
                      className={`${INPUT} w-40`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 8: Run both test files to verify everything passes**

Run: `npm test -- inviteeActions InviteeSection`
Expected: PASS (6 + 6 tests).

- [ ] **Step 9: Commit**

```bash
git add "app/(dashboard)/campaigns/[id]/events/[eventId]/inviteeActions.ts" "app/(dashboard)/campaigns/[id]/events/[eventId]/inviteeActions.test.ts" "app/(dashboard)/campaigns/[id]/events/[eventId]/InviteeSection.tsx" "app/(dashboard)/campaigns/[id]/events/[eventId]/InviteeSection.test.tsx"
git commit -m "feat: add invitee import/manual-add/RSVP tracking for events" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: Checklist — `ChecklistSection.tsx` + `checklistActions.ts`

**Files:**
- Create: `app/(dashboard)/campaigns/[id]/events/[eventId]/checklistActions.ts`
- Test: `app/(dashboard)/campaigns/[id]/events/[eventId]/checklistActions.test.ts`
- Create: `app/(dashboard)/campaigns/[id]/events/[eventId]/ChecklistSection.tsx`
- Test: `app/(dashboard)/campaigns/[id]/events/[eventId]/ChecklistSection.test.tsx`

**Interfaces:**
- Consumes: `EventChecklistItemRow` from `@/lib/events/types` (Task 4); `formatDday`, `ddayToneClass` from `@/lib/seeding/dday` (existing, reused as instructed — D-day math must never happen client-side).
- Produces: `addChecklistItem(eventId, campaignId, label, dueDate: string | null, assignee): Promise<ChecklistActionResult>`, `updateChecklistItem(itemId, eventId, campaignId, patch: { done?: boolean; due_date?: string | null; assignee?: string | null }): Promise<ChecklistActionResult>`, `deleteChecklistItem(itemId, eventId, campaignId): Promise<ChecklistActionResult>` where `ChecklistActionResult = { error: string } | { success: true }`. Default export `ChecklistSection`, which takes `todayKst: string` as a prop — Task 8's server page computes it once via `toKstDateString(new Date())` and passes it down; the component itself never calls `new Date()` for date-boundary logic.

- [ ] **Step 1: Write the failing test for `checklistActions.ts`**

`app/(dashboard)/campaigns/[id]/events/[eventId]/checklistActions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/roles", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/dashboard", () => ({ createDashboardSupabaseClient: vi.fn() }));

import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { addChecklistItem, deleteChecklistItem, updateChecklistItem } from "./checklistActions";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocked(requireRole).mockResolvedValue({ id: "u1", role: "staff", full_name: "담당자" });
});

describe("addChecklistItem", () => {
  test("rejects a blank label", async () => {
    const result = await addChecklistItem("evt-1", "c1", "   ", null, "");
    expect(result).toEqual({ error: "항목 내용을 입력해주세요." });
  });

  test("rejects a malformed due date", async () => {
    const result = await addChecklistItem("evt-1", "c1", "장소 대관 확정", "2026/09/12", "");
    expect(result).toEqual({ error: "마감일은 YYYY-MM-DD 형식으로 입력해주세요." });
  });

  test("inserts the trimmed item", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocked(createDashboardSupabaseClient).mockResolvedValue({ from: () => ({ insert }) });

    const result = await addChecklistItem("evt-1", "c1", "  장소 대관 확정  ", "2026-09-12", "  김담당  ");

    expect(result).toEqual({ success: true });
    expect(insert).toHaveBeenCalledWith({
      event_id: "evt-1",
      label: "장소 대관 확정",
      due_date: "2026-09-12",
      assignee: "김담당",
    });
  });
});

describe("updateChecklistItem", () => {
  test("rejects a malformed due date", async () => {
    const result = await updateChecklistItem("chk-1", "evt-1", "c1", { due_date: "2026/09/12" });
    expect(result).toEqual({ error: "마감일은 YYYY-MM-DD 형식으로 입력해주세요." });
  });

  test("updates the item scoped to its event", async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null });
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const update = vi.fn(() => ({ eq: eq1 }));
    mocked(createDashboardSupabaseClient).mockResolvedValue({ from: () => ({ update }) });

    const result = await updateChecklistItem("chk-1", "evt-1", "c1", { done: true });

    expect(result).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({ done: true });
    expect(eq1).toHaveBeenCalledWith("id", "chk-1");
    expect(eq2).toHaveBeenCalledWith("event_id", "evt-1");
  });
});

describe("deleteChecklistItem", () => {
  test("deletes the item scoped to its event", async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null });
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const del = vi.fn(() => ({ eq: eq1 }));
    mocked(createDashboardSupabaseClient).mockResolvedValue({ from: () => ({ delete: del }) });

    const result = await deleteChecklistItem("chk-1", "evt-1", "c1");

    expect(result).toEqual({ success: true });
    expect(eq1).toHaveBeenCalledWith("id", "chk-1");
    expect(eq2).toHaveBeenCalledWith("event_id", "evt-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- checklistActions`
Expected: FAIL — `Cannot find module './checklistActions'`.

- [ ] **Step 3: Implement `checklistActions.ts`**

`app/(dashboard)/campaigns/[id]/events/[eventId]/checklistActions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";

export type ChecklistActionResult = { error: string } | { success: true };

const SAVE_FAILED = "저장에 실패했습니다. 다시 시도해주세요.";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function addChecklistItem(
  eventId: string,
  campaignId: string,
  label: string,
  dueDate: string | null,
  assignee: string
): Promise<ChecklistActionResult> {
  await requireRole("staff");

  const trimmed = label.trim();
  if (!trimmed) return { error: "항목 내용을 입력해주세요." };
  if (dueDate !== null && dueDate !== "" && !ISO_DATE.test(dueDate)) {
    return { error: "마감일은 YYYY-MM-DD 형식으로 입력해주세요." };
  }

  const supabase = await createDashboardSupabaseClient();
  const { error } = await supabase.from("event_checklist_items").insert({
    event_id: eventId,
    label: trimmed,
    due_date: dueDate || null,
    assignee: assignee.trim() || null,
  });

  if (error) return { error: SAVE_FAILED };

  revalidatePath(`/campaigns/${campaignId}/events/${eventId}`);
  return { success: true };
}

export async function updateChecklistItem(
  itemId: string,
  eventId: string,
  campaignId: string,
  patch: { done?: boolean; due_date?: string | null; assignee?: string | null }
): Promise<ChecklistActionResult> {
  await requireRole("staff");

  if (Object.keys(patch).length === 0) return { success: true };
  if (patch.due_date !== undefined && patch.due_date !== null && !ISO_DATE.test(patch.due_date)) {
    return { error: "마감일은 YYYY-MM-DD 형식으로 입력해주세요." };
  }

  const supabase = await createDashboardSupabaseClient();
  const { error } = await supabase
    .from("event_checklist_items")
    .update(patch)
    .eq("id", itemId)
    .eq("event_id", eventId);

  if (error) return { error: SAVE_FAILED };

  revalidatePath(`/campaigns/${campaignId}/events/${eventId}`);
  return { success: true };
}

export async function deleteChecklistItem(
  itemId: string,
  eventId: string,
  campaignId: string
): Promise<ChecklistActionResult> {
  await requireRole("staff");

  const supabase = await createDashboardSupabaseClient();
  const { error } = await supabase
    .from("event_checklist_items")
    .delete()
    .eq("id", itemId)
    .eq("event_id", eventId);

  if (error) return { error: SAVE_FAILED };

  revalidatePath(`/campaigns/${campaignId}/events/${eventId}`);
  return { success: true };
}
```

- [ ] **Step 4: Run test to verify `checklistActions.ts` passes**

Run: `npm test -- checklistActions`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Write the failing test for `ChecklistSection.tsx`**

`app/(dashboard)/campaigns/[id]/events/[eventId]/ChecklistSection.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./checklistActions", () => ({
  addChecklistItem: vi.fn(),
  updateChecklistItem: vi.fn(),
  deleteChecklistItem: vi.fn(),
}));

import { addChecklistItem, deleteChecklistItem, updateChecklistItem } from "./checklistActions";
import ChecklistSection from "./ChecklistSection";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ChecklistSection", () => {
  test("shows the D-day computed from the server-passed todayKst, not the browser clock", () => {
    render(
      <ChecklistSection
        eventId="evt-1"
        campaignId="c1"
        todayKst="2026-08-30"
        initialItems={[
          {
            id: "chk-1",
            event_id: "evt-1",
            label: "장소 대관 확정",
            due_date: "2026-09-02",
            assignee: null,
            done: false,
            sort_order: 0,
            created_at: "2026-08-30T00:00:00Z",
          },
        ]}
      />
    );

    expect(screen.getByText("D-3")).toBeInTheDocument();
  });

  test("requires a label to add an item", async () => {
    render(<ChecklistSection eventId="evt-1" campaignId="c1" todayKst="2026-08-30" initialItems={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    expect(await screen.findByText("항목 내용을 입력해주세요.")).toBeInTheDocument();
    expect(addChecklistItem).not.toHaveBeenCalled();
  });

  test("adds a new checklist item", async () => {
    mocked(addChecklistItem).mockResolvedValue({ success: true });

    render(<ChecklistSection eventId="evt-1" campaignId="c1" todayKst="2026-08-30" initialItems={[]} />);

    fireEvent.change(screen.getByLabelText("항목"), { target: { value: "장소 대관 확정" } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    await waitFor(() => {
      expect(addChecklistItem).toHaveBeenCalledWith("evt-1", "c1", "장소 대관 확정", null, "");
    });
    expect(screen.getByText("장소 대관 확정")).toBeInTheDocument();
  });

  test("toggling done saves it", async () => {
    mocked(updateChecklistItem).mockResolvedValue({ success: true });

    render(
      <ChecklistSection
        eventId="evt-1"
        campaignId="c1"
        todayKst="2026-08-30"
        initialItems={[
          {
            id: "chk-1",
            event_id: "evt-1",
            label: "장소 대관 확정",
            due_date: null,
            assignee: null,
            done: false,
            sort_order: 0,
            created_at: "2026-08-30T00:00:00Z",
          },
        ]}
      />
    );

    fireEvent.click(screen.getByLabelText("장소 대관 확정 완료"));

    await waitFor(() => {
      expect(updateChecklistItem).toHaveBeenCalledWith("chk-1", "evt-1", "c1", { done: true });
    });
  });

  test("deletes an item", async () => {
    mocked(deleteChecklistItem).mockResolvedValue({ success: true });

    render(
      <ChecklistSection
        eventId="evt-1"
        campaignId="c1"
        todayKst="2026-08-30"
        initialItems={[
          {
            id: "chk-1",
            event_id: "evt-1",
            label: "장소 대관 확정",
            due_date: null,
            assignee: null,
            done: false,
            sort_order: 0,
            created_at: "2026-08-30T00:00:00Z",
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    await waitFor(() => {
      expect(deleteChecklistItem).toHaveBeenCalledWith("chk-1", "evt-1", "c1");
    });
    expect(screen.queryByText("장소 대관 확정")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- ChecklistSection`
Expected: FAIL — `Cannot find module './ChecklistSection'`.

- [ ] **Step 7: Implement `ChecklistSection.tsx`**

`app/(dashboard)/campaigns/[id]/events/[eventId]/ChecklistSection.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { ddayToneClass, formatDday } from "@/lib/seeding/dday";
import type { EventChecklistItemRow } from "@/lib/events/types";
import { addChecklistItem, deleteChecklistItem, updateChecklistItem } from "./checklistActions";

const CELL = "text-sm text-text";
const INPUT = "rounded-token border border-border bg-surface2 px-2 py-1 text-sm text-text";

export default function ChecklistSection({
  eventId,
  campaignId,
  initialItems,
  todayKst,
}: {
  eventId: string;
  campaignId: string;
  initialItems: EventChecklistItemRow[];
  todayKst: string;
}) {
  const [items, setItems] = useState<EventChecklistItemRow[]>(initialItems);
  const [label, setLabel] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function handleAdd() {
    setError(null);
    if (!label.trim()) {
      setError("항목 내용을 입력해주세요.");
      return;
    }
    setBusy(true);
    const result = await addChecklistItem(eventId, campaignId, label, dueDate || null, assignee);
    setBusy(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        id: `pending-${Date.now()}`,
        event_id: eventId,
        label: label.trim(),
        due_date: dueDate || null,
        assignee: assignee.trim() || null,
        done: false,
        sort_order: prev.length,
        created_at: new Date().toISOString(),
      },
    ]);
    setLabel("");
    setDueDate("");
    setAssignee("");
  }

  function apply(
    itemId: string,
    patch: { done?: boolean; due_date?: string | null; assignee?: string | null }
  ) {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i)));
    setError(null);
    startTransition(async () => {
      const result = await updateChecklistItem(itemId, eventId, campaignId, patch);
      if ("error" in result) setError(result.error);
    });
  }

  async function handleDelete(itemId: string) {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    const result = await deleteChecklistItem(itemId, eventId, campaignId);
    if ("error" in result) setError(result.error);
  }

  return (
    <section className="rounded-token border border-border bg-surface p-6">
      <h2 className="mb-4 text-lg font-bold text-text">체크리스트</h2>

      {error && <p className="mb-3 text-sm text-critical">{error}</p>}

      <div className="mb-6 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="checklist-label" className="text-xs text-textMuted">
            항목
          </label>
          <input
            id="checklist-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={`${INPUT} w-56`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="checklist-due" className="text-xs text-textMuted">
            마감일
          </label>
          <input
            id="checklist-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={INPUT}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="checklist-assignee" className="text-xs text-textMuted">
            담당자
          </label>
          <input
            id="checklist-assignee"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className={INPUT}
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={busy}
          className="rounded-token border border-border px-3 py-2 text-sm text-text disabled:opacity-60"
        >
          추가
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-textMuted">아직 체크리스트 항목이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-3 rounded-token border border-border px-3 py-2"
            >
              <input
                type="checkbox"
                aria-label={`${item.label} 완료`}
                checked={item.done}
                onChange={(e) => apply(item.id, { done: e.target.checked })}
              />
              <span className={`flex-1 ${item.done ? "text-textMuted line-through" : CELL}`}>
                {item.label}
              </span>
              <input
                type="date"
                aria-label={`${item.label} 마감일`}
                value={item.due_date ?? ""}
                onChange={(e) => apply(item.id, { due_date: e.target.value || null })}
                className={INPUT}
              />
              <span
                className={`font-mono text-sm tabular-nums ${ddayToneClass(item.due_date, todayKst)}`}
              >
                {formatDday(item.due_date, todayKst)}
              </span>
              <input
                aria-label={`${item.label} 담당자`}
                value={item.assignee ?? ""}
                onChange={(e) => apply(item.id, { assignee: e.target.value || null })}
                className={`${INPUT} w-28`}
              />
              <button
                type="button"
                onClick={() => handleDelete(item.id)}
                className="rounded-token border border-border px-2 py-1 text-xs text-textMuted"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 8: Run both test files to verify everything passes**

Run: `npm test -- checklistActions ChecklistSection`
Expected: PASS (5 + 5 tests).

- [ ] **Step 9: Commit**

```bash
git add "app/(dashboard)/campaigns/[id]/events/[eventId]/checklistActions.ts" "app/(dashboard)/campaigns/[id]/events/[eventId]/checklistActions.test.ts" "app/(dashboard)/campaigns/[id]/events/[eventId]/ChecklistSection.tsx" "app/(dashboard)/campaigns/[id]/events/[eventId]/ChecklistSection.test.tsx"
git commit -m "feat: add event checklist with server-computed KST D-day" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: 운영안 — `PlanSection.tsx` + `planActions.ts` + PPT export route

**Files:**
- Create: `app/(dashboard)/campaigns/[id]/events/[eventId]/planActions.ts`
- Test: `app/(dashboard)/campaigns/[id]/events/[eventId]/planActions.test.ts`
- Create: `app/(dashboard)/campaigns/[id]/events/[eventId]/PlanSection.tsx`
- Test: `app/(dashboard)/campaigns/[id]/events/[eventId]/PlanSection.test.tsx`
- Create: `app/(dashboard)/campaigns/[id]/events/[eventId]/plan/export/route.ts`
- Test: `app/(dashboard)/campaigns/[id]/events/[eventId]/plan/export/route.test.ts`

**Interfaces:**
- Consumes: `generateEventPlanDraft` from `@/lib/ai/eventPlanAssist` (Task 3); `formatEventAt` from `@/lib/events/types` (Task 4); `EventPlanRow`, `PptTemplateOption` from `@/lib/events/types`; **from the pinned PPT-engine contract (must be `await`ed):** `extractPlaceholders(pptx: Buffer): Promise<string[]>` (not used by this task directly — Task 8's template upload isn't part of this plan, only consumption), `fillTemplate(pptx: Buffer, values: Record<string, string>): Promise<Buffer>` from `@/lib/ppt/template`, and `downloadTemplateFile(storagePath: string): Promise<Buffer | null>` from `@/lib/ppt/storage`.
- Produces: `saveEventPlan(eventId, campaignId, templateId, fieldValues: Record<string, string>): Promise<PlanActionResult>`, `getEventPlanFieldDraft(eventId, placeholder): Promise<FieldDraftResult>` where `PlanActionResult = { error: string } | { success: true }` and `FieldDraftResult = { draft: string } | { error: string }`. Default export `PlanSection`, consumed by Task 8. `GET` route handler at `plan/export`, linked to from `PlanSection`'s "PPT 생성" button and consumed directly by the browser (not called from any other task's code).

- [ ] **Step 1: Write the failing test for `planActions.ts`**

`app/(dashboard)/campaigns/[id]/events/[eventId]/planActions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/roles", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/dashboard", () => ({ createDashboardSupabaseClient: vi.fn() }));
vi.mock("@/lib/ai/eventPlanAssist", () => ({ generateEventPlanDraft: vi.fn() }));

import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { generateEventPlanDraft } from "@/lib/ai/eventPlanAssist";
import { getEventPlanFieldDraft, saveEventPlan } from "./planActions";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocked(requireRole).mockResolvedValue({ id: "u1", role: "staff", full_name: "담당자" });
});

describe("saveEventPlan", () => {
  test("requires a template to be selected", async () => {
    const result = await saveEventPlan("evt-1", "c1", "", {});
    expect(result).toEqual({ error: "템플릿을 선택해주세요." });
  });

  test("upserts the plan keyed on event_id", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocked(createDashboardSupabaseClient).mockResolvedValue({ from: () => ({ upsert }) });

    const result = await saveEventPlan("evt-1", "c1", "tpl-1", { 행사명: "런칭 쇼케이스" });

    expect(result).toEqual({ success: true });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: "evt-1",
        template_id: "tpl-1",
        field_values: { 행사명: "런칭 쇼케이스" },
      }),
      { onConflict: "event_id" }
    );
  });
});

describe("getEventPlanFieldDraft", () => {
  function mockContext(response: unknown) {
    mocked(createDashboardSupabaseClient).mockResolvedValue({
      from: (table: string) => {
        if (table === "events") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: "evt-1",
                    campaign_id: "c1",
                    name: "런칭 쇼케이스",
                    event_at: "2026-09-12T05:00:00Z",
                    venue: "성수 팝업스토어",
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

  test("passes the event details and pre-survey answers as context", async () => {
    mockContext({ answers: { q1: "20대 여성 타겟 스킨케어 브랜드입니다" } });
    mocked(generateEventPlanDraft).mockResolvedValue("초안 텍스트");

    const result = await getEventPlanFieldDraft("evt-1", "행사개요");

    expect(result).toEqual({ draft: "초안 텍스트" });
    expect(generateEventPlanDraft).toHaveBeenCalledWith({
      placeholder: "행사개요",
      context: {
        행사명: "런칭 쇼케이스",
        행사일시: "2026.09.12(토) 14:00",
        행사장소: "성수 팝업스토어",
        "브랜드 소개를 부탁드립니다": "20대 여성 타겟 스킨케어 브랜드입니다",
      },
    });
  });

  test("falls back to manual entry when generation fails", async () => {
    mockContext({ answers: {} });
    mocked(generateEventPlanDraft).mockRejectedValue(new Error("boom"));

    const result = await getEventPlanFieldDraft("evt-1", "행사개요");

    expect(result).toEqual({ error: "AI 제안 실패 — 직접 입력해주세요." });
  });

  test("returns the fallback when the event does not exist", async () => {
    mocked(createDashboardSupabaseClient).mockResolvedValue({
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }),
    });

    const result = await getEventPlanFieldDraft("missing", "행사개요");

    expect(result).toEqual({ error: "AI 제안 실패 — 직접 입력해주세요." });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- planActions`
Expected: FAIL — `Cannot find module './planActions'`.

- [ ] **Step 3: Implement `planActions.ts`**

`app/(dashboard)/campaigns/[id]/events/[eventId]/planActions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { generateEventPlanDraft } from "@/lib/ai/eventPlanAssist";
import { formatEventAt } from "@/lib/events/types";

export type PlanActionResult = { error: string } | { success: true };
export type FieldDraftResult = { draft: string } | { error: string };

const SAVE_FAILED = "저장에 실패했습니다. 다시 시도해주세요.";
const ASSIST_FAILED = "AI 제안 실패 — 직접 입력해주세요.";

export async function saveEventPlan(
  eventId: string,
  campaignId: string,
  templateId: string,
  fieldValues: Record<string, string>
): Promise<PlanActionResult> {
  await requireRole("staff");

  if (!templateId) return { error: "템플릿을 선택해주세요." };

  const supabase = await createDashboardSupabaseClient();
  const { error } = await supabase.from("event_plans").upsert(
    {
      event_id: eventId,
      template_id: templateId,
      field_values: fieldValues,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id" }
  );

  if (error) return { error: SAVE_FAILED };

  revalidatePath(`/campaigns/${campaignId}/events/${eventId}`);
  return { success: true };
}

/**
 * Drafts a single placeholder's value at a time (never the whole field_values
 * map in one call) — the spec's AI 초안 button sits next to each field. Context
 * combines the event's own name/date/venue with the campaign's most recent
 * pre-survey answers, keyed by question label so the model reads it as prose
 * (same convention as getIntroDraft in apply-form/actions.ts).
 */
export async function getEventPlanFieldDraft(
  eventId: string,
  placeholder: string
): Promise<FieldDraftResult> {
  await requireRole("staff");

  const supabase = await createDashboardSupabaseClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, campaign_id, name, event_at, venue")
    .eq("id", eventId)
    .single();

  if (!event) return { error: ASSIST_FAILED };

  const { data: template } = await supabase
    .from("pre_survey_template")
    .select("questions")
    .eq("id", 1)
    .single();

  const { data: response } = await supabase
    .from("pre_survey_responses")
    .select("answers")
    .eq("campaign_id", event.campaign_id)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const questions = (template?.questions ?? []) as { id: string; label: string }[];
  const answers = (response?.answers ?? {}) as Record<string, string>;
  const context: Record<string, string> = {
    행사명: event.name,
    행사일시: formatEventAt(event.event_at),
    행사장소: event.venue ?? "",
  };
  for (const q of questions) {
    const answer = answers[q.id];
    if (answer && answer.trim().length > 0) context[q.label] = answer;
  }

  try {
    const draft = await generateEventPlanDraft({ placeholder, context });
    return { draft };
  } catch {
    return { error: ASSIST_FAILED };
  }
}
```

- [ ] **Step 4: Run test to verify `planActions.ts` passes**

Run: `npm test -- planActions`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Write the failing test for `PlanSection.tsx`**

`app/(dashboard)/campaigns/[id]/events/[eventId]/PlanSection.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./planActions", () => ({
  getEventPlanFieldDraft: vi.fn(),
  saveEventPlan: vi.fn(),
}));

import { getEventPlanFieldDraft, saveEventPlan } from "./planActions";
import PlanSection from "./PlanSection";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

const TEMPLATES = [{ id: "tpl-1", name: "행사 운영안 템플릿", placeholders: ["행사명", "행사개요"] }];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PlanSection", () => {
  test("prompts to upload a template when none exist yet", () => {
    render(<PlanSection eventId="evt-1" campaignId="c1" templates={[]} initialPlan={null} />);

    expect(
      screen.getByText("등록된 행사용 PPT 템플릿이 없습니다. 설정에서 먼저 템플릿을 업로드해주세요.")
    ).toBeInTheDocument();
  });

  test("opens one input per placeholder once a template is selected", () => {
    render(<PlanSection eventId="evt-1" campaignId="c1" templates={TEMPLATES} initialPlan={null} />);

    fireEvent.change(screen.getByLabelText("템플릿"), { target: { value: "tpl-1" } });

    expect(screen.getByLabelText("행사명")).toBeInTheDocument();
    expect(screen.getByLabelText("행사개요")).toBeInTheDocument();
  });

  test("restores a saved plan's template and field values", () => {
    render(
      <PlanSection
        eventId="evt-1"
        campaignId="c1"
        templates={TEMPLATES}
        initialPlan={{
          id: "plan-1",
          event_id: "evt-1",
          template_id: "tpl-1",
          field_values: { 행사명: "글로우랩 런칭 쇼케이스" },
          updated_at: "2026-08-30T00:00:00Z",
        }}
      />
    );

    expect(screen.getByLabelText("행사명")).toHaveValue("글로우랩 런칭 쇼케이스");
  });

  test("fills a field's AI draft without touching the others", async () => {
    mocked(getEventPlanFieldDraft).mockResolvedValue({ draft: "글로우랩 신제품 런칭 쇼케이스입니다." });

    render(<PlanSection eventId="evt-1" campaignId="c1" templates={TEMPLATES} initialPlan={null} />);
    fireEvent.change(screen.getByLabelText("템플릿"), { target: { value: "tpl-1" } });
    fireEvent.click(screen.getAllByRole("button", { name: "AI 초안" })[1]);

    await waitFor(() => {
      expect(screen.getByLabelText("행사개요")).toHaveValue("글로우랩 신제품 런칭 쇼케이스입니다.");
    });
    expect(getEventPlanFieldDraft).toHaveBeenCalledWith("evt-1", "행사개요");
    expect(screen.getByLabelText("행사명")).toHaveValue("");
  });

  test("shows the fallback message on AI failure without clearing the field", async () => {
    mocked(getEventPlanFieldDraft).mockResolvedValue({ error: "AI 제안 실패 — 직접 입력해주세요." });

    render(<PlanSection eventId="evt-1" campaignId="c1" templates={TEMPLATES} initialPlan={null} />);
    fireEvent.change(screen.getByLabelText("템플릿"), { target: { value: "tpl-1" } });
    fireEvent.click(screen.getAllByRole("button", { name: "AI 초안" })[0]);

    await waitFor(() => {
      expect(screen.getByText("AI 제안 실패 — 직접 입력해주세요.")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("행사명")).toHaveValue("");
  });

  test("saves the template and field values", async () => {
    mocked(saveEventPlan).mockResolvedValue({ success: true });

    render(<PlanSection eventId="evt-1" campaignId="c1" templates={TEMPLATES} initialPlan={null} />);
    fireEvent.change(screen.getByLabelText("템플릿"), { target: { value: "tpl-1" } });
    fireEvent.change(screen.getByLabelText("행사명"), { target: { value: "런칭 쇼케이스" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(saveEventPlan).toHaveBeenCalledWith("evt-1", "c1", "tpl-1", { 행사명: "런칭 쇼케이스" });
    });
    expect(screen.getByText("저장되었습니다.")).toBeInTheDocument();
  });

  test("offers the PPT export link only once a template is chosen", () => {
    render(<PlanSection eventId="evt-1" campaignId="c1" templates={TEMPLATES} initialPlan={null} />);

    fireEvent.change(screen.getByLabelText("템플릿"), { target: { value: "tpl-1" } });

    expect(screen.getByRole("link", { name: "PPT 생성" })).toHaveAttribute(
      "href",
      "/campaigns/c1/events/evt-1/plan/export"
    );
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- PlanSection`
Expected: FAIL — `Cannot find module './PlanSection'`.

- [ ] **Step 7: Implement `PlanSection.tsx`**

`app/(dashboard)/campaigns/[id]/events/[eventId]/PlanSection.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { EventPlanRow, PptTemplateOption } from "@/lib/events/types";
import { getEventPlanFieldDraft, saveEventPlan } from "./planActions";

export default function PlanSection({
  eventId,
  campaignId,
  templates,
  initialPlan,
}: {
  eventId: string;
  campaignId: string;
  templates: PptTemplateOption[];
  initialPlan: EventPlanRow | null;
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

  function handleSelectTemplate(templateIdValue: string) {
    setTemplateId(templateIdValue);
    setSaved(false);
  }

  function handleFieldChange(placeholder: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [placeholder]: value }));
    setSaved(false);
  }

  async function handleAssist(placeholder: string) {
    setAssistLoadingField(placeholder);
    setAssistError(null);
    const result = await getEventPlanFieldDraft(eventId, placeholder);
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
    const result = await saveEventPlan(eventId, campaignId, templateId, fieldValues);
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
          등록된 행사용 PPT 템플릿이 없습니다. 설정에서 먼저 템플릿을 업로드해주세요.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-token border border-border bg-surface p-6">
      <h2 className="mb-4 text-lg font-bold text-text">운영안</h2>

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
          <option value="">템플릿을 선택하세요</option>
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
                rows={2}
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
              disabled={saving || !templateId}
              className="self-start rounded-token bg-accent px-4 py-2 font-medium text-onAccent disabled:opacity-60"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
            {templateId && (
              <a
                href={`/campaigns/${campaignId}/events/${eventId}/plan/export`}
                className="rounded-token border border-border px-4 py-2 text-sm text-text"
              >
                PPT 생성
              </a>
            )}
          </div>

          {saved && <p className="text-sm text-success">저장되었습니다.</p>}
          {saveError && <p className="text-sm text-critical">{saveError}</p>}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 8: Run both test files to verify everything passes**

Run: `npm test -- planActions PlanSection`
Expected: PASS (5 + 6 tests).

- [ ] **Step 9: Write the failing test for the PPT export route**

`app/(dashboard)/campaigns/[id]/events/[eventId]/plan/export/route.test.ts`:

```ts
import { describe, expect, test, vi, beforeEach } from "vitest";

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
  event = { id: "evt-1", name: "런칭 쇼케이스", campaign_id: "c1" },
  plan = { template_id: "tpl-1", field_values: { 행사명: "런칭 쇼케이스" } },
  template = { storage_path: "event/tpl-1.pptx" },
}: {
  event?: Record<string, unknown> | null;
  plan?: Record<string, unknown> | null;
  template?: Record<string, unknown> | null;
} = {}) {
  mocked(createDashboardSupabaseClient).mockResolvedValue({
    from: (table: string) => {
      if (table === "events") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: event }) }) }) }),
        };
      }
      if (table === "event_plans") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: plan }) }) }) };
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
  mocked(getCurrentProfile).mockResolvedValue({ id: "u1", role: "staff", full_name: "담당자" });
});

describe("GET /campaigns/[id]/events/[eventId]/plan/export", () => {
  test("returns 401 when nobody is signed in", async () => {
    mocked(getCurrentProfile).mockResolvedValue(null);

    const response = await GET(new Request("http://test/export"), {
      params: Promise.resolve({ id: "c1", eventId: "evt-1" }),
    });

    expect(response.status).toBe(401);
  });

  test("returns 404 for an unknown event", async () => {
    mockSupabase({ event: null });

    const response = await GET(new Request("http://test/export"), {
      params: Promise.resolve({ id: "c1", eventId: "missing" }),
    });

    expect(response.status).toBe(404);
  });

  test("returns 404 when the event has no saved plan yet", async () => {
    mockSupabase({ plan: null });

    const response = await GET(new Request("http://test/export"), {
      params: Promise.resolve({ id: "c1", eventId: "evt-1" }),
    });

    expect(response.status).toBe(404);
  });

  test("returns the spec's Korean error copy when the template file can't be downloaded", async () => {
    mockSupabase();
    mocked(downloadTemplateFile).mockResolvedValue(null);

    const response = await GET(new Request("http://test/export"), {
      params: Promise.resolve({ id: "c1", eventId: "evt-1" }),
    });

    expect(response.status).toBe(502);
    expect(await response.text()).toBe("템플릿 파일을 불러오지 못했습니다. 다시 업로드해주세요.");
  });

  test("fills the template and returns a downloadable pptx", async () => {
    mockSupabase();
    mocked(downloadTemplateFile).mockResolvedValue(Buffer.from("original-pptx"));
    mocked(fillTemplate).mockResolvedValue(Buffer.from("filled-pptx"));

    const response = await GET(new Request("http://test/export"), {
      params: Promise.resolve({ id: "c1", eventId: "evt-1" }),
    });

    expect(fillTemplate).toHaveBeenCalledWith(Buffer.from("original-pptx"), { 행사명: "런칭 쇼케이스" });
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    expect(response.headers.get("Content-Disposition")).toContain(
      encodeURIComponent("런칭 쇼케이스-운영안.pptx")
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes)).toBe("filled-pptx");
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npm test -- plan/export/route`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 11: Implement the export route**

`app/(dashboard)/campaigns/[id]/events/[eventId]/plan/export/route.ts`:

```ts
import { getCurrentProfile } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { downloadTemplateFile } from "@/lib/ppt/storage";
import { fillTemplate } from "@/lib/ppt/template";

// Follows the same auth/client pattern as seeding-sheet/export/route.ts: this is
// a GET handler under app/(dashboard)/, not a "use server" action, so it checks
// the session directly with getCurrentProfile rather than requireRole.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("UNAUTHORIZED", { status: 401 });

  const { id, eventId } = await params;
  const supabase = await createDashboardSupabaseClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name, campaign_id")
    .eq("id", eventId)
    .eq("campaign_id", id)
    .single();

  if (!event) return new Response("NOT_FOUND", { status: 404 });

  const { data: plan } = await supabase
    .from("event_plans")
    .select("template_id, field_values")
    .eq("event_id", eventId)
    .single();

  if (!plan) return new Response("PLAN_NOT_FOUND", { status: 404 });

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
  const filename = `${event.name}-운영안.pptx`;

  return new Response(filled, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npm test -- plan/export/route`
Expected: PASS (all 5 tests).

- [ ] **Step 13: Commit**

```bash
git add "app/(dashboard)/campaigns/[id]/events/[eventId]/planActions.ts" "app/(dashboard)/campaigns/[id]/events/[eventId]/planActions.test.ts" "app/(dashboard)/campaigns/[id]/events/[eventId]/PlanSection.tsx" "app/(dashboard)/campaigns/[id]/events/[eventId]/PlanSection.test.tsx" "app/(dashboard)/campaigns/[id]/events/[eventId]/plan/export/route.ts" "app/(dashboard)/campaigns/[id]/events/[eventId]/plan/export/route.test.ts"
git commit -m "feat: add 운영안 template picker, per-field AI drafts, and PPT export" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: Assembly — status control, list/create screens, detail page, campaign hub entry point

**Files:**
- Create: `app/(dashboard)/campaigns/[id]/events/[eventId]/actions.ts` (`updateEventStatus`)
- Test: `app/(dashboard)/campaigns/[id]/events/[eventId]/actions.test.ts`
- Create: `app/(dashboard)/campaigns/[id]/events/[eventId]/EventStatusControl.tsx`
- Test: `app/(dashboard)/campaigns/[id]/events/[eventId]/EventStatusControl.test.tsx`
- Create: `app/(dashboard)/campaigns/[id]/events/actions.ts` (`createEvent`)
- Test: `app/(dashboard)/campaigns/[id]/events/actions.test.ts`
- Create: `app/(dashboard)/campaigns/[id]/events/EventCreateForm.tsx`
- Test: `app/(dashboard)/campaigns/[id]/events/EventCreateForm.test.tsx`
- Create: `app/(dashboard)/campaigns/[id]/events/page.tsx`
- Test: `app/(dashboard)/campaigns/[id]/events/page.test.tsx`
- Create: `app/(dashboard)/campaigns/[id]/events/[eventId]/page.tsx`
- Test: `app/(dashboard)/campaigns/[id]/events/[eventId]/page.test.tsx`
- Modify: `app/(dashboard)/campaigns/[id]/page.tsx` (additive — append ONE `<section>`, change nothing else; this file is shared with other plans)

**Interfaces:**
- Consumes: `EventRow`, `EventStatus`, `EVENT_STATUS_LABEL`, `formatEventAt` from `@/lib/events/types` (Task 4); `toKstDateString` from `@/lib/seeding/dday`; `InviteeSection` + `ApplicantCandidate` (Task 5), `ChecklistSection` (Task 6), `PlanSection` (Task 7).
- Produces: `updateEventStatus(eventId, campaignId, status: EventStatus): Promise<UpdateEventStatusResult>`, `createEvent(campaignId, name, eventAt, venue, memo): Promise<CreateEventResult>` where `CreateEventResult = { error: string } | { success: true; eventId: string }`. Nothing downstream of this plan consumes these — Task 8 is the top of the tree.

- [ ] **Step 1: Write the failing tests for `[eventId]/actions.ts` and `EventStatusControl.tsx`**

`app/(dashboard)/campaigns/[id]/events/[eventId]/actions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/roles", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/dashboard", () => ({ createDashboardSupabaseClient: vi.fn() }));

import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { updateEventStatus } from "./actions";
import type { EventStatus } from "@/lib/events/types";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

function mockUpdate(result: { error: unknown } = { error: null }) {
  const eq2 = vi.fn().mockResolvedValue(result);
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const update = vi.fn(() => ({ eq: eq1 }));
  mocked(createDashboardSupabaseClient).mockResolvedValue({ from: () => ({ update }) });
  return { update, eq1, eq2 };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked(requireRole).mockResolvedValue({ id: "u1", role: "staff", full_name: "담당자" });
});

describe("updateEventStatus", () => {
  test("rejects a status outside the 0016 check constraint", async () => {
    mockUpdate();
    const result = await updateEventStatus("evt-1", "c1", "archived" as unknown as EventStatus);
    expect(result).toEqual({ error: "알 수 없는 상태입니다." });
  });

  test("updates the event scoped to its campaign", async () => {
    const { update, eq1, eq2 } = mockUpdate();

    const result = await updateEventStatus("evt-1", "c1", "done");

    expect(result).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({ status: "done" });
    expect(eq1).toHaveBeenCalledWith("id", "evt-1");
    expect(eq2).toHaveBeenCalledWith("campaign_id", "c1");
  });

  test("returns a Korean error when the write fails", async () => {
    mockUpdate({ error: { message: "boom" } });
    const result = await updateEventStatus("evt-1", "c1", "canceled");
    expect(result).toEqual({ error: "저장에 실패했습니다. 다시 시도해주세요." });
  });
});
```

`app/(dashboard)/campaigns/[id]/events/[eventId]/EventStatusControl.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./actions", () => ({ updateEventStatus: vi.fn() }));

import { updateEventStatus } from "./actions";
import EventStatusControl from "./EventStatusControl";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EventStatusControl", () => {
  test("shows the current status", () => {
    render(<EventStatusControl eventId="evt-1" campaignId="c1" initialStatus="preparing" />);
    expect(screen.getByLabelText("행사 상태")).toHaveValue("preparing");
  });

  test("saves the new status on change", async () => {
    mocked(updateEventStatus).mockResolvedValue({ success: true });

    render(<EventStatusControl eventId="evt-1" campaignId="c1" initialStatus="preparing" />);
    fireEvent.change(screen.getByLabelText("행사 상태"), { target: { value: "done" } });

    await waitFor(() => {
      expect(updateEventStatus).toHaveBeenCalledWith("evt-1", "c1", "done");
    });
  });

  test("reverts to the previous status and shows an error on failure", async () => {
    mocked(updateEventStatus).mockResolvedValue({ error: "저장에 실패했습니다. 다시 시도해주세요." });

    render(<EventStatusControl eventId="evt-1" campaignId="c1" initialStatus="preparing" />);
    fireEvent.change(screen.getByLabelText("행사 상태"), { target: { value: "done" } });

    await waitFor(() => {
      expect(screen.getByText("저장에 실패했습니다. 다시 시도해주세요.")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("행사 상태")).toHaveValue("preparing");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- "events/\[eventId\]/actions" EventStatusControl`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Implement `[eventId]/actions.ts` and `EventStatusControl.tsx`**

`app/(dashboard)/campaigns/[id]/events/[eventId]/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import type { EventStatus } from "@/lib/events/types";

export type UpdateEventStatusResult = { error: string } | { success: true };

const VALID_STATUSES: EventStatus[] = ["preparing", "done", "canceled"];

export async function updateEventStatus(
  eventId: string,
  campaignId: string,
  status: EventStatus
): Promise<UpdateEventStatusResult> {
  await requireRole("staff");

  if (!VALID_STATUSES.includes(status)) return { error: "알 수 없는 상태입니다." };

  const supabase = await createDashboardSupabaseClient();
  const { error } = await supabase
    .from("events")
    .update({ status })
    .eq("id", eventId)
    .eq("campaign_id", campaignId);

  if (error) return { error: "저장에 실패했습니다. 다시 시도해주세요." };

  revalidatePath(`/campaigns/${campaignId}/events/${eventId}`);
  revalidatePath(`/campaigns/${campaignId}/events`);
  return { success: true };
}
```

`app/(dashboard)/campaigns/[id]/events/[eventId]/EventStatusControl.tsx`:

```tsx
"use client";

import { useState } from "react";
import { EVENT_STATUS_LABEL, type EventStatus } from "@/lib/events/types";
import { updateEventStatus } from "./actions";

const STATUSES: EventStatus[] = ["preparing", "done", "canceled"];

export default function EventStatusControl({
  eventId,
  campaignId,
  initialStatus,
}: {
  eventId: string;
  campaignId: string;
  initialStatus: EventStatus;
}) {
  const [status, setStatus] = useState<EventStatus>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleChange(next: EventStatus) {
    const previous = status;
    setStatus(next);
    setError(null);
    setBusy(true);
    const result = await updateEventStatus(eventId, campaignId, next);
    setBusy(false);

    if ("error" in result) {
      setStatus(previous);
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label="행사 상태"
        value={status}
        disabled={busy}
        onChange={(e) => handleChange(e.target.value as EventStatus)}
        className="rounded-token border border-border bg-surface2 px-3 py-2 text-sm text-text"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {EVENT_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-critical">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- "events/\[eventId\]/actions" EventStatusControl`
Expected: PASS (3 + 3 tests).

- [ ] **Step 5: Write the failing tests for `events/actions.ts` and `EventCreateForm.tsx`**

`app/(dashboard)/campaigns/[id]/events/actions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/roles", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/dashboard", () => ({ createDashboardSupabaseClient: vi.fn() }));

import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { createEvent } from "./actions";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

function mockInsert(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  mocked(createDashboardSupabaseClient).mockResolvedValue({
    from: () => ({ insert: () => ({ select: () => ({ single }) }) }),
  });
  return single;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked(requireRole).mockResolvedValue({ id: "u1", role: "staff", full_name: "담당자" });
});

describe("createEvent", () => {
  test("rejects a blank name without touching the database", async () => {
    const single = mockInsert({ data: null, error: null });

    const result = await createEvent("c1", "   ", "", "", "");

    expect(result).toEqual({ error: "행사명을 입력해주세요." });
    expect(single).not.toHaveBeenCalled();
  });

  test("creates the event and returns its id", async () => {
    mockInsert({ data: { id: "evt-1" }, error: null });

    const result = await createEvent(
      "c1",
      "런칭 쇼케이스",
      "2026-09-12T14:00:00+09:00",
      "성수 팝업스토어",
      ""
    );

    expect(result).toEqual({ success: true, eventId: "evt-1" });
  });

  test("returns a Korean error when the insert fails", async () => {
    mockInsert({ data: null, error: { message: "boom" } });

    const result = await createEvent("c1", "런칭 쇼케이스", "", "", "");

    expect(result).toEqual({ error: "행사 생성에 실패했습니다. 다시 시도해주세요." });
  });

  test("requires a signed-in staff member", async () => {
    mockInsert({ data: { id: "evt-1" }, error: null });
    await createEvent("c1", "런칭 쇼케이스", "", "", "");
    expect(requireRole).toHaveBeenCalledWith("staff");
  });
});
```

`app/(dashboard)/campaigns/[id]/events/EventCreateForm.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./actions", () => ({ createEvent: vi.fn() }));

import { createEvent } from "./actions";
import EventCreateForm from "./EventCreateForm";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EventCreateForm", () => {
  test("submits the trimmed fields with the event time offset to KST", async () => {
    mocked(createEvent).mockResolvedValue({ success: true, eventId: "evt-1" });

    render(<EventCreateForm campaignId="c1" />);
    fireEvent.change(screen.getByLabelText("행사명"), { target: { value: "런칭 쇼케이스" } });
    fireEvent.change(screen.getByLabelText("행사 일시"), { target: { value: "2026-09-12T14:00" } });
    fireEvent.change(screen.getByLabelText("장소"), { target: { value: "성수 팝업스토어" } });
    fireEvent.click(screen.getByRole("button", { name: "행사 만들기" }));

    await waitFor(() => {
      expect(createEvent).toHaveBeenCalledWith(
        "c1",
        "런칭 쇼케이스",
        "2026-09-12T14:00:00+09:00",
        "성수 팝업스토어",
        ""
      );
    });
  });

  test("leaves the event time blank when none is entered", async () => {
    mocked(createEvent).mockResolvedValue({ success: true, eventId: "evt-1" });

    render(<EventCreateForm campaignId="c1" />);
    fireEvent.change(screen.getByLabelText("행사명"), { target: { value: "런칭 쇼케이스" } });
    fireEvent.click(screen.getByRole("button", { name: "행사 만들기" }));

    await waitFor(() => {
      expect(createEvent).toHaveBeenCalledWith("c1", "런칭 쇼케이스", "", "", "");
    });
  });

  test("redirects to the new event's detail page on success", async () => {
    mocked(createEvent).mockResolvedValue({ success: true, eventId: "evt-1" });

    render(<EventCreateForm campaignId="c1" />);
    fireEvent.change(screen.getByLabelText("행사명"), { target: { value: "런칭 쇼케이스" } });
    fireEvent.click(screen.getByRole("button", { name: "행사 만들기" }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/campaigns/c1/events/evt-1");
    });
  });

  test("shows the server error and does not navigate on failure", async () => {
    mocked(createEvent).mockResolvedValue({ error: "행사명을 입력해주세요." });

    render(<EventCreateForm campaignId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "행사 만들기" }));

    await waitFor(() => {
      expect(screen.getByText("행사명을 입력해주세요.")).toBeInTheDocument();
    });
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm test -- "events/actions" EventCreateForm`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 7: Implement `events/actions.ts` and `EventCreateForm.tsx`**

`app/(dashboard)/campaigns/[id]/events/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";

export type CreateEventResult = { error: string } | { success: true; eventId: string };

export async function createEvent(
  campaignId: string,
  name: string,
  eventAt: string,
  venue: string,
  memo: string
): Promise<CreateEventResult> {
  await requireRole("staff");

  const trimmedName = name.trim();
  if (!trimmedName) return { error: "행사명을 입력해주세요." };

  const supabase = await createDashboardSupabaseClient();
  const { data, error } = await supabase
    .from("events")
    .insert({
      campaign_id: campaignId,
      name: trimmedName,
      event_at: eventAt || null,
      venue: venue.trim() || null,
      memo: memo.trim() || null,
    })
    .select()
    .single();

  if (error || !data) return { error: "행사 생성에 실패했습니다. 다시 시도해주세요." };

  revalidatePath(`/campaigns/${campaignId}/events`);
  return { success: true, eventId: data.id };
}
```

`app/(dashboard)/campaigns/[id]/events/EventCreateForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEvent } from "./actions";

export default function EventCreateForm({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [eventAt, setEventAt] = useState("");
  const [venue, setVenue] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    // <input type="datetime-local"> yields a bare "YYYY-MM-DDTHH:mm" with no
    // timezone. Postgres would otherwise read that as UTC wall-clock time —
    // nine hours off from what the agency (Seoul) typed in. Stamp the +09:00
    // offset explicitly so it round-trips correctly.
    const eventAtIso = eventAt ? `${eventAt}:00+09:00` : "";
    const result = await createEvent(campaignId, name, eventAtIso, venue, memo);
    setBusy(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.push(`/campaigns/${campaignId}/events/${result.eventId}`);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleCreate();
      }}
      className="flex max-w-md flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="event-name" className="text-sm font-medium text-text">
          행사명
        </label>
        <input
          id="event-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-token border border-border bg-surface px-3 py-2 text-text"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="event-at" className="text-sm font-medium text-text">
          행사 일시
        </label>
        <input
          id="event-at"
          type="datetime-local"
          value={eventAt}
          onChange={(e) => setEventAt(e.target.value)}
          className="rounded-token border border-border bg-surface px-3 py-2 text-text"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="event-venue" className="text-sm font-medium text-text">
          장소
        </label>
        <input
          id="event-venue"
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          className="rounded-token border border-border bg-surface px-3 py-2 text-text"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="event-memo" className="text-sm font-medium text-text">
          메모
        </label>
        <textarea
          id="event-memo"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={3}
          className="rounded-token border border-border bg-surface px-3 py-2 text-text"
        />
      </div>
      {error && <p className="text-sm text-critical">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="self-start rounded-token bg-accent px-4 py-2 font-medium text-onAccent disabled:opacity-60"
      >
        {busy ? "생성 중..." : "행사 만들기"}
      </button>
    </form>
  );
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- "events/actions" EventCreateForm`
Expected: PASS (4 + 4 tests).

- [ ] **Step 9: Write the failing test for `events/page.tsx`, then implement it**

`app/(dashboard)/campaigns/[id]/events/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/roles", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/dashboard", () => ({ createDashboardSupabaseClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("./actions", () => ({ createEvent: vi.fn() }));

import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { notFound } from "next/navigation";
import EventsPage from "./page";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

function mockSupabase(campaign: Record<string, unknown> | null, events: unknown[] = []) {
  mocked(createDashboardSupabaseClient).mockResolvedValue({
    from: (table: string) => {
      if (table === "campaigns") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: campaign }) }) }) };
      }
      return { select: () => ({ eq: () => ({ order: async () => ({ data: events }) }) }) };
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked(requireRole).mockResolvedValue({ id: "u1", role: "staff", full_name: "담당자" });
});

describe("EventsPage", () => {
  test("lists the campaign's events with their status and schedule", async () => {
    mockSupabase({ id: "c1", name: "글로우랩 세럼" }, [
      {
        id: "evt-1",
        campaign_id: "c1",
        name: "런칭 쇼케이스",
        event_at: "2026-09-12T05:00:00Z",
        venue: "성수 팝업스토어",
        memo: null,
        status: "preparing",
        created_at: "2026-08-30T00:00:00Z",
      },
    ]);

    const ui = await EventsPage({ params: Promise.resolve({ id: "c1" }) });
    render(ui);

    expect(screen.getByText("런칭 쇼케이스")).toBeInTheDocument();
    expect(screen.getByText("준비중")).toBeInTheDocument();
    expect(screen.getByText("2026.09.12(토) 14:00 · 성수 팝업스토어")).toBeInTheDocument();
  });

  test("shows an empty state and still offers the create form", async () => {
    mockSupabase({ id: "c1", name: "글로우랩 세럼" }, []);

    const ui = await EventsPage({ params: Promise.resolve({ id: "c1" }) });
    render(ui);

    expect(screen.getByText("아직 등록된 행사가 없습니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("행사명")).toBeInTheDocument();
  });

  test("calls notFound for an unknown campaign", async () => {
    mockSupabase(null);

    await expect(EventsPage({ params: Promise.resolve({ id: "missing" }) })).rejects.toThrow(
      "NOT_FOUND"
    );
    expect(notFound).toHaveBeenCalled();
  });
});
```

`app/(dashboard)/campaigns/[id]/events/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { EVENT_STATUS_LABEL, formatEventAt, type EventRow } from "@/lib/events/types";
import EventCreateForm from "./EventCreateForm";

export default async function EventsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("staff");

  const { id } = await params;
  const supabase = await createDashboardSupabaseClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("id", id)
    .single();

  if (!campaign) notFound();

  const { data: events } = await supabase
    .from("events")
    .select("id, campaign_id, name, event_at, venue, memo, status, created_at")
    .eq("campaign_id", id)
    .order("created_at", { ascending: false });

  const rows = (events ?? []) as EventRow[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-text">{campaign.name} 행사</h1>
      <p className="mb-6 text-textMuted">에이전시가 직접 주최하는 행사를 관리합니다.</p>

      <div className="mb-8 flex flex-col gap-3">
        {rows.length === 0 ? (
          <p className="text-textMuted">아직 등록된 행사가 없습니다.</p>
        ) : (
          rows.map((event) => (
            <Link
              key={event.id}
              href={`/campaigns/${id}/events/${event.id}`}
              className="rounded-token border border-border bg-surface p-4 hover:bg-surface2"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium text-text">{event.name}</p>
                <span className="text-sm text-textMuted">{EVENT_STATUS_LABEL[event.status]}</span>
              </div>
              <p className="mt-1 text-sm text-textMuted">
                {formatEventAt(event.event_at)} · {event.venue ?? "장소 미정"}
              </p>
            </Link>
          ))
        )}
      </div>

      <h2 className="mb-3 text-lg font-bold text-text">새 행사</h2>
      <EventCreateForm campaignId={id} />
    </div>
  );
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npm test -- "events/page"`
Expected: PASS (3 tests).

- [ ] **Step 11: Write the failing test for `[eventId]/page.tsx`, then implement it**

`app/(dashboard)/campaigns/[id]/events/[eventId]/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/roles", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/dashboard", () => ({ createDashboardSupabaseClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("./actions", () => ({ updateEventStatus: vi.fn() }));
vi.mock("./inviteeActions", () => ({
  importInviteesFromApplicants: vi.fn(),
  addManualInvitee: vi.fn(),
  updateInvitee: vi.fn(),
}));
vi.mock("./checklistActions", () => ({
  addChecklistItem: vi.fn(),
  updateChecklistItem: vi.fn(),
  deleteChecklistItem: vi.fn(),
}));
vi.mock("./planActions", () => ({
  getEventPlanFieldDraft: vi.fn(),
  saveEventPlan: vi.fn(),
}));

import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { notFound } from "next/navigation";
import EventDetailPage from "./page";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

const EVENT = {
  id: "evt-1",
  campaign_id: "c1",
  name: "런칭 쇼케이스",
  event_at: "2026-09-12T05:00:00Z",
  venue: "성수 팝업스토어",
  memo: null,
  status: "preparing",
  created_at: "2026-08-30T00:00:00Z",
};

function mockSupabase({
  event = EVENT,
  invitees = [],
  applicants = [],
  checklist = [],
  templates = [],
  plan = null,
}: Partial<{
  event: Record<string, unknown> | null;
  invitees: unknown[];
  applicants: unknown[];
  checklist: unknown[];
  templates: unknown[];
  plan: unknown;
}> = {}) {
  mocked(createDashboardSupabaseClient).mockResolvedValue({
    from: (table: string) => {
      if (table === "events") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: event }) }) }) }),
        };
      }
      if (table === "event_invitees") {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: invitees }) }) }) };
      }
      if (table === "applicants") {
        return { select: () => ({ eq: async () => ({ data: applicants }) }) };
      }
      if (table === "event_checklist_items") {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: checklist }) }) }) };
      }
      if (table === "ppt_templates") {
        return { select: () => ({ eq: async () => ({ data: templates }) }) };
      }
      if (table === "event_plans") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: plan }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked(requireRole).mockResolvedValue({ id: "u1", role: "staff", full_name: "담당자" });
});

describe("EventDetailPage", () => {
  test("renders the event header and each section with its fetched data", async () => {
    mockSupabase({
      invitees: [
        {
          id: "inv-1",
          event_id: "evt-1",
          applicant_id: null,
          name: "김인플",
          sns_url: null,
          contact: null,
          rsvp_status: "pending",
          attended: false,
          memo: null,
          created_at: "2026-08-30T00:00:00Z",
        },
      ],
      checklist: [
        {
          id: "chk-1",
          event_id: "evt-1",
          label: "장소 대관 확정",
          due_date: null,
          assignee: null,
          done: false,
          sort_order: 0,
          created_at: "2026-08-30T00:00:00Z",
        },
      ],
      templates: [{ id: "tpl-1", name: "행사 운영안 템플릿", placeholders: ["행사명"] }],
    });

    const ui = await EventDetailPage({ params: Promise.resolve({ id: "c1", eventId: "evt-1" }) });
    render(ui);

    expect(screen.getByRole("heading", { name: "런칭 쇼케이스" })).toBeInTheDocument();
    expect(screen.getByText("김인플")).toBeInTheDocument();
    expect(screen.getByText("장소 대관 확정")).toBeInTheDocument();
    expect(screen.getByText("행사 운영안 템플릿")).toBeInTheDocument();
  });

  test("calls notFound when the event does not belong to this campaign", async () => {
    mockSupabase({ event: null });

    await expect(
      EventDetailPage({ params: Promise.resolve({ id: "c1", eventId: "missing" }) })
    ).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
```

`app/(dashboard)/campaigns/[id]/events/[eventId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { toKstDateString } from "@/lib/seeding/dday";
import {
  formatEventAt,
  type EventChecklistItemRow,
  type EventInviteeRow,
  type EventPlanRow,
  type EventRow,
  type PptTemplateOption,
} from "@/lib/events/types";
import EventStatusControl from "./EventStatusControl";
import InviteeSection, { type ApplicantCandidate } from "./InviteeSection";
import ChecklistSection from "./ChecklistSection";
import PlanSection from "./PlanSection";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}) {
  await requireRole("staff");

  const { id, eventId } = await params;
  const supabase = await createDashboardSupabaseClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, campaign_id, name, event_at, venue, memo, status, created_at")
    .eq("id", eventId)
    .eq("campaign_id", id)
    .single();

  if (!event) notFound();

  const [
    { data: invitees },
    { data: applicants },
    { data: checklist },
    { data: templates },
    { data: plan },
  ] = await Promise.all([
    supabase
      .from("event_invitees")
      .select("id, event_id, applicant_id, name, sns_url, contact, rsvp_status, attended, memo, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true }),
    supabase.from("applicants").select("id, name, sns_url, contact").eq("campaign_id", id),
    supabase
      .from("event_checklist_items")
      .select("id, event_id, label, due_date, assignee, done, sort_order, created_at")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true }),
    supabase.from("ppt_templates").select("id, name, placeholders").eq("kind", "event"),
    supabase
      .from("event_plans")
      .select("id, event_id, template_id, field_values, updated_at")
      .eq("event_id", eventId)
      .maybeSingle(),
  ]);

  const eventRow = event as EventRow;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-1 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-text">{eventRow.name}</h1>
          <EventStatusControl eventId={eventId} campaignId={id} initialStatus={eventRow.status} />
        </div>
        <p className="text-textMuted">
          {formatEventAt(eventRow.event_at)} · {eventRow.venue ?? "장소 미정"}
        </p>
        {eventRow.memo && <p className="mt-2 text-sm text-textMuted">{eventRow.memo}</p>}
      </div>

      <PlanSection
        eventId={eventId}
        campaignId={id}
        templates={(templates ?? []) as PptTemplateOption[]}
        initialPlan={(plan ?? null) as EventPlanRow | null}
      />

      <InviteeSection
        eventId={eventId}
        campaignId={id}
        initialInvitees={(invitees ?? []) as EventInviteeRow[]}
        applicants={(applicants ?? []) as ApplicantCandidate[]}
      />

      <ChecklistSection
        eventId={eventId}
        campaignId={id}
        initialItems={(checklist ?? []) as EventChecklistItemRow[]}
        todayKst={toKstDateString(new Date())}
      />
    </div>
  );
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npm test -- "events/\[eventId\]/page"`
Expected: PASS (2 tests).

- [ ] **Step 13: Append the 행사 entry point to the campaign hub — additive only**

`app/(dashboard)/campaigns/[id]/page.tsx` is shared with every other plan that adds a campaign-detail section (사전조사, 신청폼, 지원자 리스트, 관리시트, 결과보고서 already live there). Add exactly one more `<section>` matching the existing five in structure, immediately after the 결과보고서 section and before the closing `</div>`. Do not reformat or reorder anything else in the file:

```tsx
      <section className="mt-6 max-w-2xl rounded-token border border-border bg-surface p-6">
        <h2 className="mb-1 text-lg font-bold text-text">행사</h2>
        <p className="mb-4 text-sm text-textMuted">
          에이전시가 직접 주최하는 행사의 운영안·초대·체크리스트를 관리합니다.
        </p>
        <Link
          href={`/campaigns/${campaign.id}/events`}
          className="inline-block rounded-token bg-accent px-4 py-2 text-sm font-medium text-onAccent"
        >
          행사 관리
        </Link>
      </section>
```

This page's existing test file (`page.test.tsx`) asserts on the five existing sections by heading text and does not assert an exhaustive section count, so this addition does not require changing that test — run it once to confirm before moving on:

Run: `npm test -- "campaigns/\[id\]/page"`
Expected: PASS (no regressions from the additive section).

- [ ] **Step 14: Run every test file this task touched**

Run: `npm test -- "events/\[eventId\]/actions" EventStatusControl "events/actions" EventCreateForm "events/page" "events/\[eventId\]/page"`
Expected: PASS (all of them).

- [ ] **Step 15: Commit**

```bash
git add "app/(dashboard)/campaigns/[id]/events/[eventId]/actions.ts" "app/(dashboard)/campaigns/[id]/events/[eventId]/actions.test.ts" "app/(dashboard)/campaigns/[id]/events/[eventId]/EventStatusControl.tsx" "app/(dashboard)/campaigns/[id]/events/[eventId]/EventStatusControl.test.tsx" "app/(dashboard)/campaigns/[id]/events/actions.ts" "app/(dashboard)/campaigns/[id]/events/actions.test.ts" "app/(dashboard)/campaigns/[id]/events/EventCreateForm.tsx" "app/(dashboard)/campaigns/[id]/events/EventCreateForm.test.tsx" "app/(dashboard)/campaigns/[id]/events/page.tsx" "app/(dashboard)/campaigns/[id]/events/page.test.tsx" "app/(dashboard)/campaigns/[id]/events/[eventId]/page.tsx" "app/(dashboard)/campaigns/[id]/events/[eventId]/page.test.tsx" "app/(dashboard)/campaigns/[id]/page.tsx"
git commit -m "feat: assemble event list/detail screens and add 행사 entry point to campaign hub" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-09-01-influencer-event-management-design.md`):

- 데이터 모델 (0016~0017): Task 1 (events, event_invitees, event_checklist_items) + Task 2 (event_plans) — all columns, checks, and RLS from the spec's "데이터 모델" section are covered.
- 행사 목록·생성 + 캠페인 상세 진입점: Task 8 (`events/page.tsx`, `EventCreateForm.tsx`, campaign hub section).
- 행사 상세 (개요·상태): Task 8 (`[eventId]/page.tsx` header, `EventStatusControl`).
- 운영안 (템플릿 선택 → placeholder 입력 → AI 초안 → 저장 → PPT 생성): Task 3 (AI draft) + Task 7 (`PlanSection`, `planActions`, export route).
- 초대 관리 (가져오기 모달·직접 추가·RSVP 3상태·당일 참석·메모·집계): Task 5.
- 체크리스트 (추가/삭제/완료 토글·마감일·담당자·D-day): Task 6.
- 템플릿 설정 화면 (`/settings/ppt-templates`): explicitly out of scope for this plan — owned by the parallel PPT engine plan (see "Prerequisite" section at the top).
- 인증 및 권한 (`requireRole("staff")` on every action, `createDashboardSupabaseClient` everywhere): enforced in every action file across Tasks 5–8.
- 에러 처리 및 검증 (행사명 필수, 초대 이름 필수, PPT 템플릿 다운로드 실패 문구, AI 폴백 문구): Task 8 (`createEvent`), Task 5 (`addManualInvitee`), Task 7 (export route, `getEventPlanFieldDraft`).
- 제외 범위 (예산·지출, 초대장 발송 자동화, RSVP 공개 링크, 결과보고서): none of the eight tasks implement any of these — confirmed absent by construction.

**Placeholder scan:** no "TBD"/"implement later"/"similar to Task N" strings appear in Tasks 2–8; every step above carries complete, runnable code and an explicit expected test outcome.

**Type consistency:** `EventStatus`, `RsvpStatus`, `EventRow`, `EventInviteeRow`, `EventChecklistItemRow`, `EventPlanRow`, `PptTemplateOption`, `EVENT_STATUS_LABEL`, `RSVP_LABEL`, `formatEventAt` are defined once in Task 4 and imported (never redefined) by every later task that touches them. `ApplicantCandidate` is defined once in Task 5's `InviteeSection.tsx` and imported by Task 8. Action result types (`InviteeActionResult`, `ChecklistActionResult`, `PlanActionResult`/`FieldDraftResult`, `UpdateEventStatusResult`, `CreateEventResult`) are each defined once, in the action file that produces them, and referenced by name (not re-declared) in every component and test that consumes them. Function names stay identical from their defining task through every later reference: `generateEventPlanDraft` (3→7), `formatEventAt` (4→7,8), `importInviteesFromApplicants`/`addManualInvitee`/`updateInvitee` (5→8), `addChecklistItem`/`updateChecklistItem`/`deleteChecklistItem` (6→8), `saveEventPlan`/`getEventPlanFieldDraft` (7→8).
