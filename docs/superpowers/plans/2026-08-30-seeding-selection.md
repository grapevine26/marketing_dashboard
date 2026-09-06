# Seeding Selection (최종선정 / 예비선정) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an agency staffer (internal dashboard) or a client company contact (public `/applicants/[token]` link, no login) mark each applicant 최종선정 / 예비선정 / 미선정 with identical effect, auto-create the `seeding_records` row exactly on the transition to `selected`, and immediately surface the campaign-type-appropriate 배송정보/방문정보 input form.

**Architecture:** One `seeding_records` table whose `campaign_type` is derived by a BEFORE INSERT trigger from the applicant's campaign, so the 진행 단계 allowed-value set can be enforced by a plain CHECK constraint instead of application code. Three `SECURITY DEFINER` plpgsql functions (`set_applicant_status`, `get_seeding_record_by_token`, `save_seeding_record_details`) scope every read and write strictly by `campaigns.applicant_list_token`, so the public route needs no direct table grants. Both entry points — the internal list and the public share page — render the same `SelectionControls` client component, which calls the same server actions, which call the same RPCs. There is exactly one audited write path.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres RPC + RLS, `@supabase/ssr`), Tailwind v4, Vitest + @testing-library/react.

**Spec:** [docs/superpowers/specs/2026-08-30-influencer-seeding-management-design.md](../specs/2026-08-30-influencer-seeding-management-design.md) — this plan implements 핵심 화면/플로우 3번 (최종선정 / 예비선정) and the `seeding_records` table from 데이터 모델.

## Prerequisites — Plan 3 must land first

This plan builds **on top of** Plan 3 (지원자 리스트) and Plan 1/2 (already merged and deployed). It does **not** define any of the following; assume they exist verbatim:

- `public.applicants` — `id uuid pk`, `campaign_id uuid` FK → `campaigns`, 이름/SNS 계정 링크/국적/연락처/개인정보 수집 동의/2차활용 동의 as real columns, custom answers `jsonb`, `status text check (status in ('applied','selected','reserved','rejected')) default 'applied'`, `applied_at timestamptz`, `status_changed_by text check (status_changed_by in ('agency','company'))`, `status_changed_at timestamptz`.
- `public.campaign_form_config`, the public application form at `/apply/[token]`, the CSV export.
- The **read-only** applicant list in two places: the public share page `app/applicants/[token]/page.tsx` and the internal screen (assumed at `app/(dashboard)/campaigns/[id]/applicants/page.tsx`). Task 6 modifies both to mount the selection UI; it does not create them.
- Plan 1: `campaigns.applicant_list_token uuid not null default gen_random_uuid()` — the token for `/applicants/[token]`.
- Plan 1/2 helpers: `createServerSupabaseClient()` (async — `await` it), `createBrowserSupabaseClient()`, `getCurrentProfile()`, `requireRole()`, the dashboard shell, the Tailwind design tokens.

**Column-name dependency:** the SQL in this plan touches only `applicants.id`, `.campaign_id`, `.status`, `.status_changed_by`, `.status_changed_at`. The TSX touches none of them directly. Only the **test fixtures** insert a full applicant row; if Plan 3 named the standard columns differently than the fixture below, adjust the fixture — production code in this plan is unaffected.

**Out of scope (other plans own these):** the applicants/campaign_form_config tables and the list read UI + CSV (Plan 3); 진행단계 갱신, D-day, 업로드 링크·조회수·인게이지먼트 입력, `/seeding-sheet/[token]` 공유 페이지, 관리시트 CSV (Plan 5); 결과보고서 (Plan 6). This plan creates the `seeding_records` **columns** those plans will fill, and nothing more.

## Global Constraints

- **Migration numbers: only `0009` and `0010`.** Other plans own 0006–0008 and 0011+. Do not renumber, do not add a third migration.
- `/applicants/[token]` is the **only public route in the entire spec that allows write actions** (spec 인증 및 권한: "지원자 리스트 공유 페이지는 조회뿐 아니라 최종선정/예비선정 같은 쓰기 액션도 허용하는 유일한 공개 라우트다"). Every function it can reach must therefore be `SECURITY DEFINER`, scoped by `applicant_list_token`, and granted with `revoke execute ... from public;` followed by `grant execute ... to anon, authenticated;`. `anon` gets **no** direct table access to `applicants` or `seeding_records` — mirror `supabase/migrations/0005_pre_survey_rpc.sql` exactly.
- **One write path per concern.** The internal dashboard action and the public page action are the *same* server action calling the *same* RPC, so there is a single audited path. The internal path does not `update()` `applicants` directly, even though it could under RLS.
- Applicant status values are exactly `applied` | `selected` | `reserved` | `rejected` (spec 데이터 모델 > `applicants`).
- Actor values are exactly `agency` | `company`, recorded in `status_changed_by` with `status_changed_at` (spec 에러 처리 및 검증: "각 액션에 실행 주체와 시각을 기록").
- 진행 단계 allowed values, verbatim from the spec, differ by campaign type:
  - `shipping` (제품배송형): `발송완료` → `가이드전달완료` → `수령완료` → `업로드완료`
  - `visit` (현장방문형): `확정완료` → `가이드전달완료` → `방문완료` → `업로드완료`
  - Plus the shared initial value `선정완료`, which every row starts at (see Judgment Calls).
- `seeding_records` is created **exactly** on the transition to `selected`, one row per applicant (1:0..1). **Never** for `reserved` (spec: "예비선정 단계에서는 생성되지 않는다").
- 미선정자 are marked `rejected` and **never deleted** (spec: "삭제하지 않음").
- Re-clicking an already-selected applicant must succeed without error and leave the state unchanged (spec: "멱등 처리").
- Server actions are reachable from public routes: re-validate every untrusted input (status value, actor) inside the action even though the RPC validates too.
- Every server action needs an **explicit return type** (e.g. `Promise<{ error: string } | { success: true }>`) — without it, TS narrowing via `"error" in result` breaks the production build.
- Any action calling `revalidatePath` needs `vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))` in its unit test.
- UI copy in Korean. Tailwind tokens only: `bg-bg`, `bg-surface`, `bg-surface2`, `border-border`, `text-text`, `text-textMuted`, `bg-accent`, `text-onAccent`, `text-critical`, `text-success`, `text-warning`, `rounded-token`.
- Commit messages in English, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Judgment Calls (spec ambiguities resolved here)

1. **Initial 진행 단계.** The spec lists only completed-milestone stages; a row created the instant an applicant is selected has reached none of them. This plan adds a shared initial value `선정완료` as the column default for both campaign types. Plan 5's stage checklist starts from the first type-specific stage.
2. **`selected` is terminal in this plan.** The spec describes `applied → selected|reserved`, `reserved → selected` (승격), and `rejected` as a marking. It never describes un-selecting. Demoting a selected applicant would orphan an already-populated 관리시트 row, so `set_applicant_status` treats `selected` as terminal: re-clicking `selected` is an idempotent success, and any other target returns `ok:false, reason:'ALREADY_SELECTED'` which the UI renders as "이미 최종선정된 지원자입니다. 상태를 되돌릴 수 없습니다." Transitions out of `applied`, `reserved`, and `rejected` into any of the three are all allowed (so a mis-click on 미선정 is recoverable).
3. **The actor is derived server-side, never taken from the client.** A client-supplied `actor` prop would let anyone opening the public link claim `agency`. The action calls `getCurrentProfile()`: a session means `agency`, no session means `company`. This is why `setApplicantStatus` takes no actor parameter.
4. **`campaign_type` is denormalized onto `seeding_records`** (populated by a BEFORE INSERT trigger from the applicant's campaign, never by the caller). A CHECK constraint cannot reference another table, and this is the only way to enforce the spec's per-type stage vocabulary in the database rather than in application code.

---

## File Structure

```
marketing/
├── supabase/migrations/
│   ├── 0009_seeding_records.sql          # table, type-scoped 진행단계 CHECK, campaign_type + updated_at triggers, RLS
│   ├── 0009_seeding_records.test.ts
│   ├── 0010_selection_rpc.sql            # set_applicant_status, get_seeding_record_by_token, save_seeding_record_details
│   └── 0010_selection_rpc.test.ts
├── app/
│   ├── applicants/[token]/
│   │   ├── page.tsx                      # OWNED BY PLAN 3 — Task 6 modifies it to mount SelectionControls
│   │   ├── actions.ts                    # NEW: the single write path both entry points import
│   │   ├── actions.test.ts
│   │   ├── SelectionControls.tsx         # NEW: 최종선정/예비선정/미선정 buttons + status badge
│   │   ├── SelectionControls.test.tsx
│   │   ├── SeedingDetailsForm.tsx        # NEW: 배송정보 or 방문정보, chosen by campaign_type
│   │   └── SeedingDetailsForm.test.tsx
│   └── (dashboard)/campaigns/[id]/applicants/
│       └── page.tsx                      # OWNED BY PLAN 3 — Task 6 modifies it to mount SelectionControls
```

`app/applicants/[token]/actions.ts` lives under the public route on purpose: it is the module both entry points import, exactly as `app/pre-survey/[token]/actions.ts` is in Plan 2. The internal dashboard page never writes to `applicants` or `seeding_records` itself.

No new *screens* are introduced — the selection UI is mounted into two screens Plan 3 already made reachable (campaign detail → 지원자 리스트, and the shared link). Task 6 is what makes this plan's code reachable; do not skip it.

---

## Task 1: `seeding_records` Table

**Files:**
- Create: `supabase/migrations/0009_seeding_records.sql`
- Test: `supabase/migrations/0009_seeding_records.test.ts`

**Interfaces:**
- Consumes: `public.campaigns` (`id`, `campaign_type`) from Plan 1; `public.applicants` (`id`, `campaign_id`) from Plan 3.
- Produces: table `public.seeding_records (id uuid pk, applicant_id uuid unique not null → applicants, campaign_id uuid not null → campaigns, campaign_type text not null, shipping_address text, visit_scheduled_at timestamptz, visit_party_size integer, progress_stage text not null default '선정완료', upload_deadline date, upload_url text, view_count integer, engagement_count integer, created_at timestamptz, updated_at timestamptz)`. `campaign_id` and `campaign_type` are filled by a BEFORE INSERT trigger from the applicant — callers pass only `applicant_id`. `authenticated` may `select` and `update`; **nobody** has an insert policy, so rows can only be created by the Task 2 `SECURITY DEFINER` RPC.

- [ ] **Step 1: Write the failing test**

`supabase/migrations/0009_seeding_records.test.ts`:

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

async function makeCampaign(campaign_type: "shipping" | "visit") {
  const { data, error } = await admin
    .from("campaigns")
    .insert({ name: "글로우랩 세럼", company_name: "글로우랩", campaign_type })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// NOTE: the standard applicant columns come from Plan 3. If Plan 3 named them
// differently, adjust this fixture only — no production code in this plan
// reads them.
async function makeApplicant(campaignId: string) {
  const { data, error } = await admin
    .from("applicants")
    .insert({
      campaign_id: campaignId,
      name: "김인플",
      sns_url: "https://instagram.com/kiminflu",
      nationality: "대한민국",
      contact: "010-1234-5678",
      privacy_consent: true,
      secondary_use_consent: true,
      custom_answers: {},
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

test("inserting with only applicant_id derives campaign_id and campaign_type", async () => {
  const campaign = await makeCampaign("shipping");
  const applicant = await makeApplicant(campaign.id);

  const { data, error } = await admin
    .from("seeding_records")
    .insert({ applicant_id: applicant.id })
    .select("applicant_id, campaign_id, campaign_type, progress_stage, upload_url, view_count")
    .single();

  expect(error).toBeNull();
  expect(data).toEqual({
    applicant_id: applicant.id,
    campaign_id: campaign.id,
    campaign_type: "shipping",
    progress_stage: "선정완료",
    upload_url: null,
    view_count: null,
  });
});

test("a shipping record accepts shipping stages and rejects visit-only stages", async () => {
  const campaign = await makeCampaign("shipping");
  const applicant = await makeApplicant(campaign.id);
  await admin.from("seeding_records").insert({ applicant_id: applicant.id });

  const { error: ok } = await admin
    .from("seeding_records")
    .update({ progress_stage: "수령완료" })
    .eq("applicant_id", applicant.id);
  expect(ok).toBeNull();

  const { error: bad } = await admin
    .from("seeding_records")
    .update({ progress_stage: "방문완료" })
    .eq("applicant_id", applicant.id);
  expect(bad).not.toBeNull();
});

test("a visit record accepts visit stages and rejects shipping-only stages", async () => {
  const campaign = await makeCampaign("visit");
  const applicant = await makeApplicant(campaign.id);
  await admin.from("seeding_records").insert({ applicant_id: applicant.id });

  const { error: ok } = await admin
    .from("seeding_records")
    .update({ progress_stage: "확정완료" })
    .eq("applicant_id", applicant.id);
  expect(ok).toBeNull();

  const { error: bad } = await admin
    .from("seeding_records")
    .update({ progress_stage: "발송완료" })
    .eq("applicant_id", applicant.id);
  expect(bad).not.toBeNull();
});

test("an applicant can have at most one seeding record", async () => {
  const campaign = await makeCampaign("shipping");
  const applicant = await makeApplicant(campaign.id);

  const { error: first } = await admin.from("seeding_records").insert({ applicant_id: applicant.id });
  expect(first).toBeNull();

  const { error: second } = await admin.from("seeding_records").insert({ applicant_id: applicant.id });
  expect(second).not.toBeNull();
});

test("updated_at is bumped on every update", async () => {
  const campaign = await makeCampaign("visit");
  const applicant = await makeApplicant(campaign.id);
  const { data: created } = await admin
    .from("seeding_records")
    .insert({ applicant_id: applicant.id })
    .select("updated_at")
    .single();

  await new Promise((resolve) => setTimeout(resolve, 10));
  const { data: updated } = await admin
    .from("seeding_records")
    .update({ visit_party_size: 2 })
    .eq("applicant_id", applicant.id)
    .select("updated_at")
    .single();

  expect(new Date(updated!.updated_at).getTime()).toBeGreaterThan(
    new Date(created!.updated_at).getTime()
  );
});

test("the anon client can neither read nor insert seeding records", async () => {
  const campaign = await makeCampaign("shipping");
  const applicant = await makeApplicant(campaign.id);
  await admin.from("seeding_records").insert({ applicant_id: applicant.id });

  const { error: insertError } = await anon
    .from("seeding_records")
    .insert({ applicant_id: applicant.id });
  expect(insertError).not.toBeNull();

  const { data: rows } = await anon.from("seeding_records").select("id");
  expect(rows ?? []).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- 0009_seeding_records`
Expected: FAIL — `relation "public.seeding_records" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0009_seeding_records.sql`:

```sql
-- 관리시트 행. 지원자가 `selected`로 전이되는 시점에 정확히 1건 생성된다 (1:0..1).
-- `reserved`(예비선정)에서는 생성되지 않는다.
-- campaign_id/campaign_type은 호출자가 넘기지 않고 아래 트리거가 지원자로부터 파생시킨다.
create table public.seeding_records (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null unique references public.applicants(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  campaign_type text not null check (campaign_type in ('shipping', 'visit')),
  -- 제품배송형 전용
  shipping_address text,
  -- 현장방문형 전용
  visit_scheduled_at timestamptz,
  visit_party_size integer check (visit_party_size is null or visit_party_size > 0),
  -- 진행 단계: 캠페인 유형별 허용값이 다르다
  progress_stage text not null default '선정완료',
  upload_deadline date,
  upload_url text,
  view_count integer,
  engagement_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seeding_records_stage_matches_type check (
    (campaign_type = 'shipping'
      and progress_stage in ('선정완료', '발송완료', '가이드전달완료', '수령완료', '업로드완료'))
    or
    (campaign_type = 'visit'
      and progress_stage in ('선정완료', '확정완료', '가이드전달완료', '방문완료', '업로드완료'))
  )
);

create index seeding_records_campaign_id_idx on public.seeding_records (campaign_id);

create or replace function public.seeding_records_set_campaign_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_campaign_type text;
begin
  select a.campaign_id into v_campaign_id
  from public.applicants a
  where a.id = new.applicant_id;

  if v_campaign_id is null then
    raise exception 'APPLICANT_NOT_FOUND';
  end if;

  select c.campaign_type into v_campaign_type
  from public.campaigns c
  where c.id = v_campaign_id;

  new.campaign_id := v_campaign_id;
  new.campaign_type := v_campaign_type;
  return new;
end;
$$;

create trigger seeding_records_set_campaign_type_trg
  before insert on public.seeding_records
  for each row execute function public.seeding_records_set_campaign_type();

create or replace function public.seeding_records_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger seeding_records_touch_updated_at_trg
  before update on public.seeding_records
  for each row execute function public.seeding_records_touch_updated_at();

alter table public.seeding_records enable row level security;

create policy "authenticated users can read seeding records"
  on public.seeding_records for select
  to authenticated
  using (true);

-- 관리시트 내용 갱신(진행단계/업로드 링크/수치)은 내부 대시보드에서만 이뤄진다.
create policy "authenticated users can update seeding records"
  on public.seeding_records for update
  to authenticated
  using (true)
  with check (true);

-- insert 정책은 의도적으로 없다: 행 생성은 오직 set_applicant_status RPC(0010)에서만.
```

- [ ] **Step 4: Apply the migration and run test to verify it passes**

Run: `npx supabase migration up`
Run: `npm test -- 0009_seeding_records`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_seeding_records.sql supabase/migrations/0009_seeding_records.test.ts
git commit -m "feat: add seeding_records table with campaign-type-scoped progress stages

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Token-Scoped Selection RPCs

**Files:**
- Create: `supabase/migrations/0010_selection_rpc.sql`
- Test: `supabase/migrations/0010_selection_rpc.test.ts`

**Interfaces:**
- Consumes: `public.campaigns.applicant_list_token` (Plan 1), `public.applicants` (Plan 3), `public.seeding_records` (Task 1).
- Produces, all `SECURITY DEFINER`, all `revoke ... from public` then `grant ... to anon, authenticated`:
  - `set_applicant_status(p_token uuid, p_applicant_id uuid, p_status text, p_actor text) returns json` — `{"ok":true,"status":"selected","seeding_record_id":"<uuid>|null","created":true|false}` on success, `{"ok":false,"reason":"INVALID_TOKEN"|"APPLICANT_NOT_IN_CAMPAIGN"|"ALREADY_SELECTED"}` otherwise. Raises `INVALID_STATUS` / `INVALID_ACTOR` for values outside the allowed sets. Records `status_changed_by`/`status_changed_at`. Creates the `seeding_records` row iff the target status is `selected`.
  - `get_seeding_record_by_token(p_token uuid, p_applicant_id uuid) returns json` — `{"campaign_type":"shipping"|"visit","record":null|{"shipping_address":...,"visit_scheduled_at":...,"visit_party_size":...}}`, or SQL `null` when the token is unknown or the applicant belongs to another campaign.
  - `save_seeding_record_details(p_token uuid, p_applicant_id uuid, p_shipping_address text, p_visit_scheduled_at timestamptz, p_visit_party_size integer) returns boolean` — writes only the columns matching the campaign's type; `true` iff exactly one row was updated.

- [ ] **Step 1: Write the failing test**

`supabase/migrations/0010_selection_rpc.test.ts`:

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

async function makeCampaign(campaign_type: "shipping" | "visit") {
  const { data, error } = await admin
    .from("campaigns")
    .insert({ name: "글로우랩 세럼", company_name: "글로우랩", campaign_type })
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
      name: "김인플",
      sns_url: "https://instagram.com/kiminflu",
      nationality: "대한민국",
      contact: "010-1234-5678",
      privacy_consent: true,
      secondary_use_consent: true,
      custom_answers: {},
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

test("selecting an applicant as anon sets the status, records the actor, and creates one seeding record", async () => {
  const campaign = await makeCampaign("shipping");
  const applicant = await makeApplicant(campaign.id);

  const { data, error } = await anon.rpc("set_applicant_status", {
    p_token: campaign.applicant_list_token,
    p_applicant_id: applicant.id,
    p_status: "selected",
    p_actor: "company",
  });

  expect(error).toBeNull();
  expect(data.ok).toBe(true);
  expect(data.status).toBe("selected");
  expect(data.created).toBe(true);

  const { data: row } = await admin
    .from("applicants")
    .select("status, status_changed_by, status_changed_at")
    .eq("id", applicant.id)
    .single();
  expect(row!.status).toBe("selected");
  expect(row!.status_changed_by).toBe("company");
  expect(row!.status_changed_at).not.toBeNull();

  const { data: records } = await admin
    .from("seeding_records")
    .select("id, campaign_id, campaign_type")
    .eq("applicant_id", applicant.id);
  expect(records).toHaveLength(1);
  expect(records![0].campaign_id).toBe(campaign.id);
  expect(records![0].campaign_type).toBe("shipping");
});

test("reserving an applicant does NOT create a seeding record", async () => {
  const campaign = await makeCampaign("shipping");
  const applicant = await makeApplicant(campaign.id);

  const { data } = await anon.rpc("set_applicant_status", {
    p_token: campaign.applicant_list_token,
    p_applicant_id: applicant.id,
    p_status: "reserved",
    p_actor: "agency",
  });

  expect(data.ok).toBe(true);
  expect(data.seeding_record_id).toBeNull();

  const { data: records } = await admin
    .from("seeding_records")
    .select("id")
    .eq("applicant_id", applicant.id);
  expect(records).toEqual([]);
});

test("a reserved applicant can be promoted to selected, creating the record then", async () => {
  const campaign = await makeCampaign("visit");
  const applicant = await makeApplicant(campaign.id);

  await anon.rpc("set_applicant_status", {
    p_token: campaign.applicant_list_token,
    p_applicant_id: applicant.id,
    p_status: "reserved",
    p_actor: "company",
  });
  const { data } = await anon.rpc("set_applicant_status", {
    p_token: campaign.applicant_list_token,
    p_applicant_id: applicant.id,
    p_status: "selected",
    p_actor: "agency",
  });

  expect(data.ok).toBe(true);
  expect(data.created).toBe(true);

  const { data: row } = await admin
    .from("applicants")
    .select("status, status_changed_by")
    .eq("id", applicant.id)
    .single();
  expect(row!.status).toBe("selected");
  expect(row!.status_changed_by).toBe("agency");
});

test("re-selecting an already selected applicant is idempotent — no error, no second record", async () => {
  const campaign = await makeCampaign("shipping");
  const applicant = await makeApplicant(campaign.id);

  const first = await anon.rpc("set_applicant_status", {
    p_token: campaign.applicant_list_token,
    p_applicant_id: applicant.id,
    p_status: "selected",
    p_actor: "agency",
  });
  const second = await anon.rpc("set_applicant_status", {
    p_token: campaign.applicant_list_token,
    p_applicant_id: applicant.id,
    p_status: "selected",
    p_actor: "company",
  });

  expect(second.error).toBeNull();
  expect(second.data.ok).toBe(true);
  expect(second.data.created).toBe(false);
  expect(second.data.seeding_record_id).toBe(first.data.seeding_record_id);

  const { data: records } = await admin
    .from("seeding_records")
    .select("id")
    .eq("applicant_id", applicant.id);
  expect(records).toHaveLength(1);
});

test("a selected applicant cannot be demoted", async () => {
  const campaign = await makeCampaign("shipping");
  const applicant = await makeApplicant(campaign.id);

  await anon.rpc("set_applicant_status", {
    p_token: campaign.applicant_list_token,
    p_applicant_id: applicant.id,
    p_status: "selected",
    p_actor: "agency",
  });
  const { data } = await anon.rpc("set_applicant_status", {
    p_token: campaign.applicant_list_token,
    p_applicant_id: applicant.id,
    p_status: "rejected",
    p_actor: "agency",
  });

  expect(data).toEqual({ ok: false, reason: "ALREADY_SELECTED" });

  const { data: row } = await admin
    .from("applicants")
    .select("status")
    .eq("id", applicant.id)
    .single();
  expect(row!.status).toBe("selected");
});

test("rejecting marks the applicant without deleting the row", async () => {
  const campaign = await makeCampaign("shipping");
  const applicant = await makeApplicant(campaign.id);

  await anon.rpc("set_applicant_status", {
    p_token: campaign.applicant_list_token,
    p_applicant_id: applicant.id,
    p_status: "rejected",
    p_actor: "company",
  });

  const { data: row } = await admin
    .from("applicants")
    .select("id, status")
    .eq("id", applicant.id)
    .single();
  expect(row).toEqual({ id: applicant.id, status: "rejected" });
});

test("an unknown token changes nothing", async () => {
  const campaign = await makeCampaign("shipping");
  const applicant = await makeApplicant(campaign.id);

  const { data } = await anon.rpc("set_applicant_status", {
    p_token: "00000000-0000-0000-0000-000000000000",
    p_applicant_id: applicant.id,
    p_status: "selected",
    p_actor: "company",
  });

  expect(data).toEqual({ ok: false, reason: "INVALID_TOKEN" });

  const { data: row } = await admin
    .from("applicants")
    .select("status")
    .eq("id", applicant.id)
    .single();
  expect(row!.status).toBe("applied");
});

test("a token from another campaign cannot touch this campaign's applicants", async () => {
  const campaignA = await makeCampaign("shipping");
  const campaignB = await makeCampaign("shipping");
  const applicant = await makeApplicant(campaignA.id);

  const { data } = await anon.rpc("set_applicant_status", {
    p_token: campaignB.applicant_list_token,
    p_applicant_id: applicant.id,
    p_status: "selected",
    p_actor: "company",
  });

  expect(data).toEqual({ ok: false, reason: "APPLICANT_NOT_IN_CAMPAIGN" });
});

test("an invalid status or actor is rejected outright", async () => {
  const campaign = await makeCampaign("shipping");
  const applicant = await makeApplicant(campaign.id);

  const badStatus = await anon.rpc("set_applicant_status", {
    p_token: campaign.applicant_list_token,
    p_applicant_id: applicant.id,
    p_status: "applied",
    p_actor: "company",
  });
  expect(badStatus.error).not.toBeNull();

  const badActor = await anon.rpc("set_applicant_status", {
    p_token: campaign.applicant_list_token,
    p_applicant_id: applicant.id,
    p_status: "selected",
    p_actor: "hacker",
  });
  expect(badActor.error).not.toBeNull();
});

test("get_seeding_record_by_token returns the campaign type and the record", async () => {
  const campaign = await makeCampaign("visit");
  const applicant = await makeApplicant(campaign.id);

  const before = await anon.rpc("get_seeding_record_by_token", {
    p_token: campaign.applicant_list_token,
    p_applicant_id: applicant.id,
  });
  expect(before.data).toEqual({ campaign_type: "visit", record: null });

  await anon.rpc("set_applicant_status", {
    p_token: campaign.applicant_list_token,
    p_applicant_id: applicant.id,
    p_status: "selected",
    p_actor: "company",
  });

  const after = await anon.rpc("get_seeding_record_by_token", {
    p_token: campaign.applicant_list_token,
    p_applicant_id: applicant.id,
  });
  expect(after.data.campaign_type).toBe("visit");
  expect(after.data.record).toEqual({
    shipping_address: null,
    visit_scheduled_at: null,
    visit_party_size: null,
  });
});

test("get_seeding_record_by_token returns null for an unknown token", async () => {
  const campaign = await makeCampaign("shipping");
  const applicant = await makeApplicant(campaign.id);

  const { data } = await anon.rpc("get_seeding_record_by_token", {
    p_token: "00000000-0000-0000-0000-000000000000",
    p_applicant_id: applicant.id,
  });
  expect(data).toBeNull();
});

test("save_seeding_record_details writes only the shipping column for a shipping campaign", async () => {
  const campaign = await makeCampaign("shipping");
  const applicant = await makeApplicant(campaign.id);
  await anon.rpc("set_applicant_status", {
    p_token: campaign.applicant_list_token,
    p_applicant_id: applicant.id,
    p_status: "selected",
    p_actor: "company",
  });

  const { data, error } = await anon.rpc("save_seeding_record_details", {
    p_token: campaign.applicant_list_token,
    p_applicant_id: applicant.id,
    p_shipping_address: "서울시 강남구 테헤란로 1길 10, 101호",
    p_visit_scheduled_at: "2026-09-05T14:00:00+09:00",
    p_visit_party_size: 3,
  });

  expect(error).toBeNull();
  expect(data).toBe(true);

  const { data: row } = await admin
    .from("seeding_records")
    .select("shipping_address, visit_scheduled_at, visit_party_size")
    .eq("applicant_id", applicant.id)
    .single();
  expect(row).toEqual({
    shipping_address: "서울시 강남구 테헤란로 1길 10, 101호",
    visit_scheduled_at: null,
    visit_party_size: null,
  });
});

test("save_seeding_record_details writes only the visit columns for a visit campaign", async () => {
  const campaign = await makeCampaign("visit");
  const applicant = await makeApplicant(campaign.id);
  await anon.rpc("set_applicant_status", {
    p_token: campaign.applicant_list_token,
    p_applicant_id: applicant.id,
    p_status: "selected",
    p_actor: "agency",
  });

  const { data } = await anon.rpc("save_seeding_record_details", {
    p_token: campaign.applicant_list_token,
    p_applicant_id: applicant.id,
    p_shipping_address: "무시되어야 하는 주소",
    p_visit_scheduled_at: "2026-09-05T14:00:00+09:00",
    p_visit_party_size: 3,
  });
  expect(data).toBe(true);

  const { data: row } = await admin
    .from("seeding_records")
    .select("shipping_address, visit_party_size")
    .eq("applicant_id", applicant.id)
    .single();
  expect(row!.shipping_address).toBeNull();
  expect(row!.visit_party_size).toBe(3);
});

test("save_seeding_record_details returns false when there is no seeding record yet", async () => {
  const campaign = await makeCampaign("shipping");
  const applicant = await makeApplicant(campaign.id);

  const { data } = await anon.rpc("save_seeding_record_details", {
    p_token: campaign.applicant_list_token,
    p_applicant_id: applicant.id,
    p_shipping_address: "서울시 강남구",
    p_visit_scheduled_at: null,
    p_visit_party_size: null,
  });
  expect(data).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- 0010_selection_rpc`
Expected: FAIL — `function set_applicant_status(uuid, uuid, text, text) does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0010_selection_rpc.sql`:

```sql
-- /applicants/[token] 은 스펙 전체에서 유일하게 쓰기 액션을 허용하는 공개 라우트다.
-- 그래서 아래 함수들은 모두 SECURITY DEFINER이며, campaigns.applicant_list_token 으로만
-- 범위가 좁혀진다. anon에는 applicants/seeding_records 테이블 권한을 일절 주지 않는다.
-- (0005_pre_survey_rpc.sql 과 동일한 패턴)

create or replace function public.set_applicant_status(
  p_token uuid,
  p_applicant_id uuid,
  p_status text,
  p_actor text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_current_status text;
  v_record_id uuid;
  v_created boolean := false;
begin
  if p_status not in ('selected', 'reserved', 'rejected') then
    raise exception 'INVALID_STATUS';
  end if;

  if p_actor not in ('agency', 'company') then
    raise exception 'INVALID_ACTOR';
  end if;

  select id into v_campaign_id
  from public.campaigns
  where applicant_list_token = p_token;

  if v_campaign_id is null then
    return json_build_object('ok', false, 'reason', 'INVALID_TOKEN');
  end if;

  select status into v_current_status
  from public.applicants
  where id = p_applicant_id and campaign_id = v_campaign_id
  for update;

  -- applicants.status is not null, so a null here means "no such applicant in
  -- this campaign" — a token for campaign B can never touch campaign A's rows.
  if v_current_status is null then
    return json_build_object('ok', false, 'reason', 'APPLICANT_NOT_IN_CAMPAIGN');
  end if;

  -- `selected` is terminal: 다시 눌러도 에러 없이 현재 상태 유지(멱등), 강등은 불가.
  -- 강등을 허용하면 이미 채워진 관리시트 행이 고아가 된다.
  if v_current_status = 'selected' then
    if p_status <> 'selected' then
      return json_build_object('ok', false, 'reason', 'ALREADY_SELECTED');
    end if;

    select id into v_record_id
    from public.seeding_records
    where applicant_id = p_applicant_id;

    return json_build_object(
      'ok', true,
      'status', 'selected',
      'seeding_record_id', v_record_id,
      'created', false
    );
  end if;

  update public.applicants
  set status = p_status,
      status_changed_by = p_actor,
      status_changed_at = now()
  where id = p_applicant_id;

  -- 관리시트 행은 오직 `selected`로 전이되는 순간에만 생성된다. 예비선정에서는 생성 안 함.
  if p_status = 'selected' then
    insert into public.seeding_records (applicant_id, campaign_id)
    values (p_applicant_id, v_campaign_id)
    on conflict (applicant_id) do nothing
    returning id into v_record_id;

    if v_record_id is null then
      select id into v_record_id
      from public.seeding_records
      where applicant_id = p_applicant_id;
    else
      v_created := true;
    end if;
  end if;

  return json_build_object(
    'ok', true,
    'status', p_status,
    'seeding_record_id', v_record_id,
    'created', v_created
  );
end;
$$;

revoke execute on function public.set_applicant_status(uuid, uuid, text, text) from public;
grant execute on function public.set_applicant_status(uuid, uuid, text, text) to anon, authenticated;

create or replace function public.get_seeding_record_by_token(
  p_token uuid,
  p_applicant_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_campaign_type text;
  v_record json;
begin
  select c.id, c.campaign_type into v_campaign_id, v_campaign_type
  from public.campaigns c
  where c.applicant_list_token = p_token;

  if v_campaign_id is null then
    return null;
  end if;

  if not exists (
    select 1 from public.applicants
    where id = p_applicant_id and campaign_id = v_campaign_id
  ) then
    return null;
  end if;

  select json_build_object(
    'shipping_address', r.shipping_address,
    'visit_scheduled_at', r.visit_scheduled_at,
    'visit_party_size', r.visit_party_size
  )
  into v_record
  from public.seeding_records r
  where r.applicant_id = p_applicant_id;

  return json_build_object('campaign_type', v_campaign_type, 'record', v_record);
end;
$$;

revoke execute on function public.get_seeding_record_by_token(uuid, uuid) from public;
grant execute on function public.get_seeding_record_by_token(uuid, uuid) to anon, authenticated;

create or replace function public.save_seeding_record_details(
  p_token uuid,
  p_applicant_id uuid,
  p_shipping_address text,
  p_visit_scheduled_at timestamptz,
  p_visit_party_size integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_campaign_type text;
  v_updated integer;
begin
  select c.id, c.campaign_type into v_campaign_id, v_campaign_type
  from public.campaigns c
  where c.applicant_list_token = p_token;

  if v_campaign_id is null then
    return false;
  end if;

  -- 캠페인 유형에 해당하는 컬럼만 쓴다. 반대편 값은 무시한다.
  if v_campaign_type = 'shipping' then
    update public.seeding_records
    set shipping_address = p_shipping_address
    where applicant_id = p_applicant_id and campaign_id = v_campaign_id;
  else
    update public.seeding_records
    set visit_scheduled_at = p_visit_scheduled_at,
        visit_party_size = p_visit_party_size
    where applicant_id = p_applicant_id and campaign_id = v_campaign_id;
  end if;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke execute on function public.save_seeding_record_details(uuid, uuid, text, timestamptz, integer) from public;
grant execute on function public.save_seeding_record_details(uuid, uuid, text, timestamptz, integer) to anon, authenticated;
```

- [ ] **Step 4: Apply the migration and run test to verify it passes**

Run: `npx supabase migration up`
Run: `npm test -- 0010_selection_rpc`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0010_selection_rpc.sql supabase/migrations/0010_selection_rpc.test.ts
git commit -m "feat: add token-scoped selection RPCs for the applicant list share page

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Shared Server Actions (the single write path)

**Files:**
- Create: `app/applicants/[token]/actions.ts`
- Test: `app/applicants/[token]/actions.test.ts`

**Interfaces:**
- Consumes: `createServerSupabaseClient()` (Plan 1), `getCurrentProfile()` (Plan 1), the three RPCs from Task 2.
- Produces (imported by Tasks 4, 5, 6 — both the public page and the internal page use these exact functions):
  - `type ApplicantStatus = "selected" | "reserved" | "rejected"`
  - `type SeedingDetailsContext = { campaign_type: "shipping" | "visit"; record: { shipping_address: string | null; visit_scheduled_at: string | null; visit_party_size: number | null } | null }`
  - `type SeedingDetailsInput = { shippingAddress?: string; visitScheduledAt?: string; visitPartySize?: number }`
  - `setApplicantStatus(token: string, applicantId: string, status: string): Promise<{ error: string } | { success: true; status: ApplicantStatus; seedingRecordId: string | null }>`
  - `getSeedingDetails(token: string, applicantId: string): Promise<{ error: string } | { success: true; context: SeedingDetailsContext }>`
  - `saveSeedingRecordDetails(token: string, applicantId: string, details: SeedingDetailsInput): Promise<{ error: string } | { success: true }>`

- [ ] **Step 1: Write the failing test**

`app/applicants/[token]/actions.test.ts`:

```ts
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth/roles", () => ({ getCurrentProfile: vi.fn() }));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";
import { setApplicantStatus, getSeedingDetails, saveSeedingRecordDetails } from "./actions";

const mockedClient = createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>;
const mockedProfile = getCurrentProfile as unknown as ReturnType<typeof vi.fn>;

function withRpc(rpc: ReturnType<typeof vi.fn>) {
  mockedClient.mockResolvedValue({ rpc });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedProfile.mockResolvedValue(null);
});

describe("setApplicantStatus", () => {
  test("rejects a status outside the allowed set before touching the database", async () => {
    const rpc = vi.fn();
    withRpc(rpc);

    const result = await setApplicantStatus("tok", "a1", "applied");

    expect(result).toEqual({ error: "알 수 없는 상태입니다." });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("records actor 'company' when there is no logged-in profile", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, status: "selected", seeding_record_id: "r1", created: true },
      error: null,
    });
    withRpc(rpc);

    const result = await setApplicantStatus("tok", "a1", "selected");

    expect(result).toEqual({ success: true, status: "selected", seedingRecordId: "r1" });
    expect(rpc).toHaveBeenCalledWith("set_applicant_status", {
      p_token: "tok",
      p_applicant_id: "a1",
      p_status: "selected",
      p_actor: "company",
    });
  });

  test("records actor 'agency' when a profile is logged in, ignoring anything the client claims", async () => {
    mockedProfile.mockResolvedValue({ id: "u1", role: "staff", full_name: "담당자" });
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, status: "reserved", seeding_record_id: null, created: false },
      error: null,
    });
    withRpc(rpc);

    const result = await setApplicantStatus("tok", "a1", "reserved");

    expect(result).toEqual({ success: true, status: "reserved", seedingRecordId: null });
    expect(rpc).toHaveBeenCalledWith(
      "set_applicant_status",
      expect.objectContaining({ p_actor: "agency" })
    );
  });

  test("surfaces the ALREADY_SELECTED reason in Korean", async () => {
    withRpc(vi.fn().mockResolvedValue({ data: { ok: false, reason: "ALREADY_SELECTED" }, error: null }));

    const result = await setApplicantStatus("tok", "a1", "rejected");

    expect(result).toEqual({ error: "이미 최종선정된 지원자입니다. 상태를 되돌릴 수 없습니다." });
  });

  test("surfaces a generic error for an invalid token", async () => {
    withRpc(vi.fn().mockResolvedValue({ data: { ok: false, reason: "INVALID_TOKEN" }, error: null }));

    const result = await setApplicantStatus("tok", "a1", "selected");

    expect(result).toEqual({ error: "처리에 실패했습니다. 링크가 유효한지 확인해주세요." });
  });
});

describe("getSeedingDetails", () => {
  test("returns the campaign type and record", async () => {
    withRpc(
      vi.fn().mockResolvedValue({
        data: {
          campaign_type: "shipping",
          record: { shipping_address: "서울시 강남구", visit_scheduled_at: null, visit_party_size: null },
        },
        error: null,
      })
    );

    const result = await getSeedingDetails("tok", "a1");

    expect(result).toEqual({
      success: true,
      context: {
        campaign_type: "shipping",
        record: { shipping_address: "서울시 강남구", visit_scheduled_at: null, visit_party_size: null },
      },
    });
  });

  test("returns an error when the RPC returns null", async () => {
    withRpc(vi.fn().mockResolvedValue({ data: null, error: null }));

    const result = await getSeedingDetails("tok", "a1");

    expect(result).toEqual({ error: "정보를 불러오지 못했습니다. 링크가 유효한지 확인해주세요." });
  });
});

describe("saveSeedingRecordDetails", () => {
  test("rejects a non-positive party size before touching the database", async () => {
    const rpc = vi.fn();
    withRpc(rpc);

    const result = await saveSeedingRecordDetails("tok", "a1", { visitPartySize: 0 });

    expect(result).toEqual({ error: "방문 인원은 1명 이상으로 입력해주세요." });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("trims the address and sends nulls for the fields it was not given", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    withRpc(rpc);

    const result = await saveSeedingRecordDetails("tok", "a1", {
      shippingAddress: "  서울시 강남구 테헤란로 1길 10  ",
    });

    expect(result).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("save_seeding_record_details", {
      p_token: "tok",
      p_applicant_id: "a1",
      p_shipping_address: "서울시 강남구 테헤란로 1길 10",
      p_visit_scheduled_at: null,
      p_visit_party_size: null,
    });
  });

  test("returns an error when the RPC reports no row was updated", async () => {
    withRpc(vi.fn().mockResolvedValue({ data: false, error: null }));

    const result = await saveSeedingRecordDetails("tok", "a1", { shippingAddress: "서울시" });

    expect(result).toEqual({ error: "저장에 실패했습니다. 다시 시도해주세요." });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "app/applicants/\[token\]/actions"`
Expected: FAIL — the actions module doesn't exist.

- [ ] **Step 3: Implement the actions**

`app/applicants/[token]/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ApplicantStatus = "selected" | "reserved" | "rejected";

export type SeedingDetailsContext = {
  campaign_type: "shipping" | "visit";
  record: {
    shipping_address: string | null;
    visit_scheduled_at: string | null;
    visit_party_size: number | null;
  } | null;
};

export type SeedingDetailsInput = {
  shippingAddress?: string;
  visitScheduledAt?: string;
  visitPartySize?: number;
};

const SELECTABLE: ApplicantStatus[] = ["selected", "reserved", "rejected"];

export async function setApplicantStatus(
  token: string,
  applicantId: string,
  status: string
): Promise<
  { error: string } | { success: true; status: ApplicantStatus; seedingRecordId: string | null }
> {
  // This action is reachable from the public /applicants/[token] page, so
  // nothing the caller sends is trusted — re-validate even though the RPC does too.
  if (!SELECTABLE.includes(status as ApplicantStatus)) {
    return { error: "알 수 없는 상태입니다." };
  }

  // The actor is never a client-supplied value: anyone with the public link
  // could otherwise claim to be the agency. A session means agency, none means
  // the company opened the share link.
  const profile = await getCurrentProfile();
  const actor = profile ? "agency" : "company";

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("set_applicant_status", {
    p_token: token,
    p_applicant_id: applicantId,
    p_status: status,
    p_actor: actor,
  });

  if (error || !data) {
    return { error: "처리에 실패했습니다. 잠시 후 다시 시도해주세요." };
  }

  if (!data.ok) {
    if (data.reason === "ALREADY_SELECTED") {
      return { error: "이미 최종선정된 지원자입니다. 상태를 되돌릴 수 없습니다." };
    }
    return { error: "처리에 실패했습니다. 링크가 유효한지 확인해주세요." };
  }

  revalidatePath(`/applicants/${token}`);
  return {
    success: true,
    status: data.status as ApplicantStatus,
    seedingRecordId: data.seeding_record_id ?? null,
  };
}

export async function getSeedingDetails(
  token: string,
  applicantId: string
): Promise<{ error: string } | { success: true; context: SeedingDetailsContext }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_seeding_record_by_token", {
    p_token: token,
    p_applicant_id: applicantId,
  });

  if (error || !data) {
    return { error: "정보를 불러오지 못했습니다. 링크가 유효한지 확인해주세요." };
  }
  return { success: true, context: data as SeedingDetailsContext };
}

export async function saveSeedingRecordDetails(
  token: string,
  applicantId: string,
  details: SeedingDetailsInput
): Promise<{ error: string } | { success: true }> {
  const address = (details.shippingAddress ?? "").trim();
  const visitAt = (details.visitScheduledAt ?? "").trim();
  const partySize = details.visitPartySize;

  if (partySize !== undefined && (!Number.isInteger(partySize) || partySize < 1)) {
    return { error: "방문 인원은 1명 이상으로 입력해주세요." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("save_seeding_record_details", {
    p_token: token,
    p_applicant_id: applicantId,
    p_shipping_address: address.length > 0 ? address : null,
    p_visit_scheduled_at: visitAt.length > 0 ? visitAt : null,
    p_visit_party_size: partySize ?? null,
  });

  if (error || data !== true) {
    return { error: "저장에 실패했습니다. 다시 시도해주세요." };
  }

  revalidatePath(`/applicants/${token}`);
  return { success: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- "app/applicants/\[token\]/actions"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/applicants/[token]/actions.ts" "app/applicants/[token]/actions.test.ts"
git commit -m "feat: add shared selection server actions with server-derived actor

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: Seeding Details Form (배송정보 / 방문정보)

**Files:**
- Create: `app/applicants/[token]/SeedingDetailsForm.tsx`
- Test: `app/applicants/[token]/SeedingDetailsForm.test.tsx`

**Interfaces:**
- Consumes: `getSeedingDetails`, `saveSeedingRecordDetails`, `SeedingDetailsContext` (Task 3).
- Produces: `<SeedingDetailsForm token={string} applicantId={string} />` — a client component that fetches its own context on mount, renders 배송 주소 for `shipping` campaigns and 방문 일정 + 방문 인원 for `visit` campaigns, and renders nothing until the context arrives. Task 5 mounts it.

- [ ] **Step 1: Write the failing test**

`app/applicants/[token]/SeedingDetailsForm.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("./actions", () => ({
  getSeedingDetails: vi.fn(),
  saveSeedingRecordDetails: vi.fn(),
}));

import { getSeedingDetails, saveSeedingRecordDetails } from "./actions";
import SeedingDetailsForm from "./SeedingDetailsForm";

const mockedGet = getSeedingDetails as unknown as ReturnType<typeof vi.fn>;
const mockedSave = saveSeedingRecordDetails as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockedSave.mockResolvedValue({ success: true });
});

describe("SeedingDetailsForm", () => {
  test("renders 배송 주소 only, for a shipping campaign", async () => {
    mockedGet.mockResolvedValue({
      success: true,
      context: { campaign_type: "shipping", record: { shipping_address: null, visit_scheduled_at: null, visit_party_size: null } },
    });

    render(<SeedingDetailsForm token="tok" applicantId="a1" />);

    expect(await screen.findByLabelText("배송 주소")).toBeInTheDocument();
    expect(screen.queryByLabelText("방문 일정")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("방문 인원")).not.toBeInTheDocument();
  });

  test("renders 방문 일정 and 방문 인원 only, for a visit campaign", async () => {
    mockedGet.mockResolvedValue({
      success: true,
      context: { campaign_type: "visit", record: null },
    });

    render(<SeedingDetailsForm token="tok" applicantId="a1" />);

    expect(await screen.findByLabelText("방문 일정")).toBeInTheDocument();
    expect(screen.getByLabelText("방문 인원")).toBeInTheDocument();
    expect(screen.queryByLabelText("배송 주소")).not.toBeInTheDocument();
  });

  test("prefills the existing values", async () => {
    mockedGet.mockResolvedValue({
      success: true,
      context: {
        campaign_type: "shipping",
        record: { shipping_address: "서울시 강남구 테헤란로 1길 10", visit_scheduled_at: null, visit_party_size: null },
      },
    });

    render(<SeedingDetailsForm token="tok" applicantId="a1" />);

    expect(await screen.findByLabelText("배송 주소")).toHaveValue("서울시 강남구 테헤란로 1길 10");
  });

  test("saves the shipping address", async () => {
    mockedGet.mockResolvedValue({
      success: true,
      context: { campaign_type: "shipping", record: null },
    });

    render(<SeedingDetailsForm token="tok" applicantId="a1" />);
    fireEvent.change(await screen.findByLabelText("배송 주소"), {
      target: { value: "서울시 강남구 테헤란로 1길 10, 101호" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(mockedSave).toHaveBeenCalledWith("tok", "a1", {
        shippingAddress: "서울시 강남구 테헤란로 1길 10, 101호",
      });
    });
    expect(await screen.findByText("저장되었습니다.")).toBeInTheDocument();
  });

  test("saves the visit schedule and party size as a number", async () => {
    mockedGet.mockResolvedValue({
      success: true,
      context: { campaign_type: "visit", record: null },
    });

    render(<SeedingDetailsForm token="tok" applicantId="a1" />);
    fireEvent.change(await screen.findByLabelText("방문 일정"), {
      target: { value: "2026-09-05T14:00" },
    });
    fireEvent.change(screen.getByLabelText("방문 인원"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(mockedSave).toHaveBeenCalledWith("tok", "a1", {
        visitScheduledAt: "2026-09-05T14:00",
        visitPartySize: 3,
      });
    });
  });

  test("shows the error message when saving fails", async () => {
    mockedGet.mockResolvedValue({
      success: true,
      context: { campaign_type: "shipping", record: null },
    });
    mockedSave.mockResolvedValue({ error: "저장에 실패했습니다. 다시 시도해주세요." });

    render(<SeedingDetailsForm token="tok" applicantId="a1" />);
    fireEvent.click(await screen.findByRole("button", { name: "저장" }));

    expect(await screen.findByText("저장에 실패했습니다. 다시 시도해주세요.")).toBeInTheDocument();
  });

  test("renders nothing when the context cannot be loaded", async () => {
    mockedGet.mockResolvedValue({ error: "정보를 불러오지 못했습니다. 링크가 유효한지 확인해주세요." });

    const { container } = render(<SeedingDetailsForm token="tok" applicantId="a1" />);

    await waitFor(() => expect(mockedGet).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SeedingDetailsForm`
Expected: FAIL — `SeedingDetailsForm.tsx` doesn't exist.

- [ ] **Step 3: Implement the component**

`app/applicants/[token]/SeedingDetailsForm.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  getSeedingDetails,
  saveSeedingRecordDetails,
  type SeedingDetailsContext,
} from "./actions";

export default function SeedingDetailsForm({
  token,
  applicantId,
}: {
  token: string;
  applicantId: string;
}) {
  const [context, setContext] = useState<SeedingDetailsContext | null>(null);
  const [address, setAddress] = useState("");
  const [visitAt, setVisitAt] = useState("");
  const [partySize, setPartySize] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getSeedingDetails(token, applicantId).then((result) => {
      if (!active) return;
      if ("error" in result) return;
      setContext(result.context);
      setAddress(result.context.record?.shipping_address ?? "");
      setVisitAt((result.context.record?.visit_scheduled_at ?? "").slice(0, 16));
      setPartySize(
        result.context.record?.visit_party_size != null
          ? String(result.context.record.visit_party_size)
          : ""
      );
    });
    return () => {
      active = false;
    };
  }, [token, applicantId]);

  if (!context) return null;

  const isShipping = context.campaign_type === "shipping";

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const result = await saveSeedingRecordDetails(
      token,
      applicantId,
      isShipping
        ? { shippingAddress: address }
        : {
            visitScheduledAt: visitAt,
            ...(partySize.trim().length > 0 ? { visitPartySize: Number(partySize) } : {}),
          }
    );
    setSaving(false);
    setFailed("error" in result);
    setMessage("error" in result ? result.error : "저장되었습니다.");
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-token border border-border bg-surface2 p-4">
      <p className="text-sm font-medium text-text">
        {isShipping ? "배송정보 입력" : "방문정보 입력"}
      </p>

      {isShipping ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`address-${applicantId}`} className="text-xs text-textMuted">
            배송 주소
          </label>
          <input
            id={`address-${applicantId}`}
            aria-label="배송 주소"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="rounded-token border border-border bg-surface px-3 py-2 text-sm text-text"
            placeholder="예: 서울시 강남구 테헤란로 1길 10, 101호"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor={`visit-at-${applicantId}`} className="text-xs text-textMuted">
              방문 일정
            </label>
            <input
              id={`visit-at-${applicantId}`}
              aria-label="방문 일정"
              type="datetime-local"
              value={visitAt}
              onChange={(e) => setVisitAt(e.target.value)}
              className="rounded-token border border-border bg-surface px-3 py-2 text-sm text-text"
            />
          </div>
          <div className="flex w-32 flex-col gap-1">
            <label htmlFor={`party-size-${applicantId}`} className="text-xs text-textMuted">
              방문 인원
            </label>
            <input
              id={`party-size-${applicantId}`}
              aria-label="방문 인원"
              type="number"
              min={1}
              value={partySize}
              onChange={(e) => setPartySize(e.target.value)}
              className="rounded-token border border-border bg-surface px-3 py-2 text-sm text-text tabular-nums"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="self-start rounded-token bg-accent px-4 py-2 text-sm font-medium text-onAccent disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        {message && (
          <p className={`text-sm ${failed ? "text-critical" : "text-success"}`}>{message}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- SeedingDetailsForm`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/applicants/[token]/SeedingDetailsForm.tsx" "app/applicants/[token]/SeedingDetailsForm.test.tsx"
git commit -m "feat: add campaign-type-aware seeding details form

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: Selection Controls

**Files:**
- Create: `app/applicants/[token]/SelectionControls.tsx`
- Test: `app/applicants/[token]/SelectionControls.test.tsx`

**Interfaces:**
- Consumes: `setApplicantStatus`, `ApplicantStatus` (Task 3); `<SeedingDetailsForm>` (Task 4); `useRouter` from `next/navigation`.
- Produces: `<SelectionControls token={string} applicantId={string} status={string} />` — the single UI unit both entry points mount in Task 6. Renders a status badge plus 최종선정 / 예비선정 / 미선정 buttons, disables all three once the applicant is `selected` (terminal), and renders `<SeedingDetailsForm>` underneath whenever the status is `selected`. It deliberately takes **no actor prop** — Task 3's action derives the actor server-side.

- [ ] **Step 1: Write the failing test**

`app/applicants/[token]/SelectionControls.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./actions", () => ({ setApplicantStatus: vi.fn() }));
vi.mock("./SeedingDetailsForm", () => ({
  default: ({ applicantId }: { applicantId: string }) => (
    <div data-testid="seeding-details-form">{applicantId}</div>
  ),
}));

import { setApplicantStatus } from "./actions";
import SelectionControls from "./SelectionControls";

const mockedSet = setApplicantStatus as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SelectionControls", () => {
  test("shows the current status and all three actions for an applied applicant", () => {
    render(<SelectionControls token="tok" applicantId="a1" status="applied" />);

    expect(screen.getByTestId("selection-status")).toHaveTextContent("지원");
    expect(screen.getByRole("button", { name: "최종선정" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "예비선정" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "미선정" })).toBeEnabled();
    expect(screen.queryByTestId("seeding-details-form")).not.toBeInTheDocument();
  });

  test("최종선정 calls the action and reveals the details form", async () => {
    mockedSet.mockResolvedValue({ success: true, status: "selected", seedingRecordId: "r1" });

    render(<SelectionControls token="tok" applicantId="a1" status="applied" />);
    fireEvent.click(screen.getByRole("button", { name: "최종선정" }));

    await waitFor(() => {
      expect(mockedSet).toHaveBeenCalledWith("tok", "a1", "selected");
    });
    expect(await screen.findByTestId("seeding-details-form")).toBeInTheDocument();
    expect(screen.getByTestId("selection-status")).toHaveTextContent("최종선정");
    expect(refresh).toHaveBeenCalled();
  });

  test("예비선정 changes the status without revealing the details form", async () => {
    mockedSet.mockResolvedValue({ success: true, status: "reserved", seedingRecordId: null });

    render(<SelectionControls token="tok" applicantId="a1" status="applied" />);
    fireEvent.click(screen.getByRole("button", { name: "예비선정" }));

    await waitFor(() => {
      expect(screen.getByTestId("selection-status")).toHaveTextContent("예비선정");
    });
    expect(screen.queryByTestId("seeding-details-form")).not.toBeInTheDocument();
  });

  test("a reserved applicant can still be promoted to 최종선정", async () => {
    mockedSet.mockResolvedValue({ success: true, status: "selected", seedingRecordId: "r1" });

    render(<SelectionControls token="tok" applicantId="a1" status="reserved" />);
    expect(screen.getByRole("button", { name: "최종선정" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "최종선정" }));

    await waitFor(() => {
      expect(mockedSet).toHaveBeenCalledWith("tok", "a1", "selected");
    });
  });

  test("an already selected applicant renders the form with every button disabled", () => {
    render(<SelectionControls token="tok" applicantId="a1" status="selected" />);

    expect(screen.getByTestId("seeding-details-form")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "최종선정" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "예비선정" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "미선정" })).toBeDisabled();
  });

  test("shows the error returned by the action and keeps the previous status", async () => {
    mockedSet.mockResolvedValue({ error: "처리에 실패했습니다. 링크가 유효한지 확인해주세요." });

    render(<SelectionControls token="tok" applicantId="a1" status="applied" />);
    fireEvent.click(screen.getByRole("button", { name: "최종선정" }));

    expect(
      await screen.findByText("처리에 실패했습니다. 링크가 유효한지 확인해주세요.")
    ).toBeInTheDocument();
    expect(screen.getByTestId("selection-status")).toHaveTextContent("지원");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SelectionControls`
Expected: FAIL — `SelectionControls.tsx` doesn't exist.

- [ ] **Step 3: Implement the component**

`app/applicants/[token]/SelectionControls.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setApplicantStatus, type ApplicantStatus } from "./actions";
import SeedingDetailsForm from "./SeedingDetailsForm";

const STATUS_LABEL: Record<string, string> = {
  applied: "지원",
  selected: "최종선정",
  reserved: "예비선정",
  rejected: "미선정",
};

export default function SelectionControls({
  token,
  applicantId,
  status,
}: {
  token: string;
  applicantId: string;
  status: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 최종선정은 되돌릴 수 없다 (관리시트 행이 이미 만들어졌기 때문).
  const locked = current === "selected";

  async function choose(next: ApplicantStatus) {
    setPending(true);
    setError(null);
    const result = await setApplicantStatus(token, applicantId, next);
    setPending(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    setCurrent(result.status);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="selection-status"
          className="rounded-token border border-border px-2 py-1 text-xs text-textMuted"
        >
          {STATUS_LABEL[current] ?? current}
        </span>
        <button
          type="button"
          onClick={() => choose("selected")}
          disabled={pending || locked}
          className="rounded-token bg-accent px-3 py-1.5 text-sm font-medium text-onAccent disabled:opacity-50"
        >
          최종선정
        </button>
        <button
          type="button"
          onClick={() => choose("reserved")}
          disabled={pending || locked}
          className="rounded-token border border-border px-3 py-1.5 text-sm text-text disabled:opacity-50"
        >
          예비선정
        </button>
        <button
          type="button"
          onClick={() => choose("rejected")}
          disabled={pending || locked}
          className="rounded-token border border-border px-3 py-1.5 text-sm text-textMuted disabled:opacity-50"
        >
          미선정
        </button>
      </div>

      {error && <p className="text-sm text-critical">{error}</p>}

      {current === "selected" && (
        <SeedingDetailsForm token={token} applicantId={applicantId} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- SelectionControls`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/applicants/[token]/SelectionControls.tsx" "app/applicants/[token]/SelectionControls.test.tsx"
git commit -m "feat: add selection controls with terminal selected state

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: Mount the Controls in Both Entry Points

**Files:**
- Modify: `app/applicants/[token]/page.tsx` (created by Plan 3 — the public share page)
- Modify: `app/(dashboard)/campaigns/[id]/applicants/page.tsx` (created by Plan 3 — the internal list)

**Interfaces:**
- Consumes: `<SelectionControls token applicantId status />` (Task 5). The public page already has `token` from its route params; the internal page must select `campaigns.applicant_list_token` and pass it, so both entry points hit the identical RPC path.
- Produces: no new module. This task is what makes Tasks 1–5 reachable; without it, the selection UI is dead code.

- [ ] **Step 1: Locate the two applicant row renderings**

```bash
rg -n "applicants" "app/applicants/[token]/page.tsx" "app/(dashboard)/campaigns/[id]/applicants/page.tsx"
```

Read both files. Note (a) the variable each page maps over, (b) the field holding the applicant id and the field holding the status, and (c) for the internal page, whether it already selects `applicant_list_token` from `campaigns`. Plan 3 selects the applicant `id` and `status` columns; if it does not, add them to its `.select(...)` list in Step 3.

- [ ] **Step 2: Write the failing test for the public page**

Append to `app/applicants/[token]/page.test.tsx` (Plan 3 created this file; if it does not exist, create it with this content):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("./SelectionControls", () => ({
  default: ({ token, applicantId, status }: { token: string; applicantId: string; status: string }) => (
    <div data-testid="selection-controls">{`${token}|${applicantId}|${status}`}</div>
  ),
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import PublicApplicantListPage from "./page";

describe("PublicApplicantListPage selection controls", () => {
  test("renders selection controls for every applicant, with the route token", async () => {
    (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      rpc: async () => ({
        data: {
          campaign_name: "글로우랩 세럼",
          company_name: "글로우랩",
          applicants: [
            { id: "a1", name: "김인플", status: "applied" },
            { id: "a2", name: "이인플", status: "reserved" },
          ],
        },
        error: null,
      }),
    });

    const ui = await PublicApplicantListPage({ params: Promise.resolve({ token: "tok-123" }) });
    render(ui);

    const controls = screen.getAllByTestId("selection-controls");
    expect(controls).toHaveLength(2);
    expect(controls[0]).toHaveTextContent("tok-123|a1|applied");
    expect(controls[1]).toHaveTextContent("tok-123|a2|reserved");
  });
});
```

> The mocked Supabase response must match the shape Plan 3's page actually reads. After Step 1 you know that shape — adjust the mock's keys (`applicants`, `id`, `status`) to Plan 3's real names before running. The assertions on `<SelectionControls>` props do not change.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- "app/applicants/\[token\]/page"`
Expected: FAIL — no element with `data-testid="selection-controls"` is rendered.

- [ ] **Step 4: Mount the controls in the public page**

In `app/applicants/[token]/page.tsx`, add the import and render one `<SelectionControls>` per applicant row:

```tsx
import SelectionControls from "./SelectionControls";
```

```tsx
{/* inside the existing per-applicant row/cell, after the applicant's details */}
<SelectionControls token={token} applicantId={applicant.id} status={applicant.status} />
```

Keep Plan 3's existing markup; this adds one element inside the row it already renders. `token` is the value already destructured from `await params`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- "app/applicants/\[token\]/page"`
Expected: PASS

- [ ] **Step 6: Write the failing test for the internal page**

Append to `app/(dashboard)/campaigns/[id]/applicants/page.test.tsx` (create it with this content if Plan 3 did not):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/app/applicants/[token]/SelectionControls", () => ({
  default: ({ token, applicantId, status }: { token: string; applicantId: string; status: string }) => (
    <div data-testid="selection-controls">{`${token}|${applicantId}|${status}`}</div>
  ),
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import InternalApplicantListPage from "./page";

describe("InternalApplicantListPage selection controls", () => {
  test("passes the campaign's applicant_list_token so both entry points share one RPC path", async () => {
    (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: (table: string) => {
        if (table === "campaigns") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: "c1",
                    name: "글로우랩 세럼",
                    company_name: "글로우랩",
                    campaign_type: "shipping",
                    applicant_list_token: "tok-123",
                  },
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [{ id: "a1", name: "김인플", status: "applied" }],
                error: null,
              }),
            }),
          }),
        };
      },
    });

    const ui = await InternalApplicantListPage({ params: Promise.resolve({ id: "c1" }) });
    render(ui);

    expect(screen.getByTestId("selection-controls")).toHaveTextContent("tok-123|a1|applied");
  });
});
```

> Same note as Step 2: align the mocked query-builder chain with whatever Plan 3's page actually calls (the chain above assumes `.select().eq().order()` for applicants and `.select().eq().single()` for the campaign). The assertion on the props is the part that matters.

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- "campaigns/\[id\]/applicants/page"`
Expected: FAIL — no element with `data-testid="selection-controls"`.

- [ ] **Step 8: Mount the controls in the internal page**

In `app/(dashboard)/campaigns/[id]/applicants/page.tsx`:

```tsx
import SelectionControls from "@/app/applicants/[token]/SelectionControls";
```

Make sure the campaign query selects the token:

```tsx
const { data: campaign } = await supabase
  .from("campaigns")
  .select("id, name, company_name, campaign_type, applicant_list_token")
  .eq("id", id)
  .single();
```

And render inside the existing per-applicant row:

```tsx
<SelectionControls
  token={campaign.applicant_list_token}
  applicantId={applicant.id}
  status={applicant.status}
/>
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- "campaigns/\[id\]/applicants/page"`
Expected: PASS

- [ ] **Step 10: Verify the whole suite and the production build**

Run: `npm test`
Expected: PASS (every suite, including Plan 1–3's)

Run: `npm run build`
Expected: build succeeds. If TS complains about narrowing on an action result, the action is missing an explicit `Promise<...>` return type — add it rather than casting.

- [ ] **Step 11: Manual smoke check**

Run: `npm run dev`, then:
1. Open `/campaigns/<id>/applicants`, click 예비선정 on an applicant — the badge flips to 예비선정 and no 배송정보/방문정보 form appears.
2. Click 최종선정 on the same applicant — the badge flips to 최종선정, the type-appropriate form appears, the three buttons disable. Fill and save it; reload to confirm the value persisted.
3. Copy the campaign's `applicant_list_token`, open `/applicants/<token>` in a **logged-out** private window, and select a different applicant. Confirm the change appears in the internal list on reload.
4. In SQL, check the audit trail: `select status, status_changed_by, status_changed_at from applicants where campaign_id = '<id>';` — the internal action must read `agency`, the private-window action `company`.

- [ ] **Step 12: Commit**

```bash
git add "app/applicants/[token]/page.tsx" "app/applicants/[token]/page.test.tsx" "app/(dashboard)/campaigns/[id]/applicants"
git commit -m "feat: mount selection controls in both the internal and shared applicant lists

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

**Spec coverage** (핵심 화면/플로우 3번 and the `seeding_records` 데이터 모델 entry):

- `seeding_records` with `applicant_id`/`campaign_id` FKs, 배송 주소, 방문 일정·인원, 유형별 진행 단계, 업로드 기한, 업로드 링크, 조회수, 인게이지먼트, `updated_at` — Task 1. (업로드 기한/링크/수치 columns exist here but are filled by Plan 5.)
- 1:0..1, created exactly on the transition to `selected`, never for `reserved` — Task 1's unique constraint + Task 2's `set_applicant_status`, with explicit tests for both.
- `applied → selected|reserved`, `reserved → selected` 승격 — Task 2 tests.
- 미선정자는 `rejected`로 표시만 하고 삭제하지 않음 — Task 2 test asserts the row survives.
- `status_changed_by` / `status_changed_at` 감사 기록 — Task 2 (RPC writes them), Task 3 (derives the actor server-side), Task 6 Step 11 (manual verification of both actor values).
- 에이전시 내부 대시보드와 업체 공유 페이지 양쪽에서 동일 효과 — Tasks 3, 5, 6: one component, one action, one RPC, mounted twice.
- 유일하게 쓰기를 허용하는 공개 라우트 — stated in Global Constraints, implemented as three `SECURITY DEFINER` functions with `revoke ... from public` + `grant ... to anon, authenticated` and zero anon table grants (Task 1 has no insert policy at all; Task 2's tests exercise every function as `anon`).
- 멱등 처리 — Task 2's re-selection test plus the disabled buttons in Task 5.
- `selected` 시 유형에 맞는 입력 폼 노출 — Tasks 4 and 5.

**Placeholder scan:** no TBD/TODO. Every code step carries runnable code. The two places that depend on Plan 3's file contents (Task 6 Steps 2 and 6 mocks) ship complete, runnable test code plus an explicit note about which keys to align — the assertions themselves are final.

**Type consistency:** `ApplicantStatus = "selected" | "reserved" | "rejected"` is defined in Task 3 and consumed by Task 5. `SeedingDetailsContext` uses the snake_case `campaign_type` / `record.shipping_address` / `record.visit_scheduled_at` / `record.visit_party_size` exactly as `get_seeding_record_by_token` builds them in Task 2, and Task 4's component and tests use the same keys. `SeedingDetailsInput`'s camelCase `shippingAddress` / `visitScheduledAt` / `visitPartySize` appear identically in Task 3's action, Task 4's component, and Task 4's tests. The RPC names (`set_applicant_status`, `get_seeding_record_by_token`, `save_seeding_record_details`) and their parameter names (`p_token`, `p_applicant_id`, `p_status`, `p_actor`, `p_shipping_address`, `p_visit_scheduled_at`, `p_visit_party_size`) match between the Task 2 migration and the Task 3 action calls. `<SelectionControls token applicantId status />` has the same three props in Tasks 5 and 6.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-30-seeding-selection.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
