# Seeding Management Sheet (관리시트) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 스펙 "핵심 화면/플로우" 4번 (관리시트): the internal screen where 담당자 updates each 최종선정 influencer's 진행 단계 / 업로드 기한 / 업로드 링크 / 조회수 / 인게이지먼트, a read-only `/seeding-sheet/[token]` share page for the client company, and CSV (Excel-openable) export.

**Architecture:** One `SECURITY DEFINER` RPC (`get_seeding_sheet`) is the **single read path** for all three surfaces (internal page, public share page, export route) — token-scoped, exposing only the fields the company should see and never the campaign's other share tokens. One client component (`SeedingSheetTable`) renders both the editable and the read-only view; it is editable exactly when the server component hands it an `onSave` server action, so the public route's tree never imports a write path. All date math lives in a pure, dependency-free module (`lib/seeding/dday.ts`) and all stage vocabulary in another (`lib/seeding/stages.ts`), so both are unit-tested without a DOM or a database. This mirrors Plan 2, where `PreSurveyForm` was shared between the public and internal entry points.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres RPC + RLS), Tailwind v4 design tokens, Vitest + @testing-library/react. **No new npm dependency** — see "CSV, not .xlsx" below.

**Spec:** [docs/superpowers/specs/2026-08-30-influencer-seeding-management-design.md](../specs/2026-08-30-influencer-seeding-management-design.md)

---

## Prerequisites — Plans 3 and 4 MUST land first

This plan **builds on top of** tables it does not create. Do not create, alter, or redefine them.

**Plan 4 has landed.** Its `seeding_records` table ships in `supabase/migrations/0009_seeding_records.sql`, reproduced here verbatim because every column name, constraint, and default below is load-bearing for this plan:

```sql
create table public.seeding_records (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null unique references public.applicants(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  campaign_type text not null check (campaign_type in ('shipping', 'visit')),
  shipping_address text,
  visit_scheduled_at timestamptz,
  visit_party_size integer check (visit_party_size is null or visit_party_size > 0),
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
```

Three consequences this plan is written around:

1. **The column is `progress_stage`, not `stage`.** Every type, prop, JSON key, CSV column, and test fixture in this plan uses `progress_stage`.
2. **The visit headcount column is `visit_party_size`** (and the DB rejects values `<= 0`).
3. **`progress_stage` is `not null default '선정완료'`, and `선정완료` is valid for *both* campaign types.** Every row Plan 4 creates on 최종선정 arrives as `'선정완료'`. There is therefore **no `null` stage anywhere in this plan** — `선정완료` is the zeroth stage meaning 선정은 됐지만 아직 아무 단계도 진행 안 됨. See "선정완료 as the zeroth stage" below.

From Plan 3, this plan reads `public.applicants`: `id`, `campaign_id`, `name`, `sns_url`, `status` (`'applied' | 'selected' | 'reserved' | 'rejected'`).

Plan 4 also owns row creation on 최종선정, the 배송/방문 정보 입력 폼, and all `applicants.status` transitions. **Only `selected` applicants have a `seeding_records` row; `reserved` ones must never appear in the 관리시트** — the RPC in Task 4 enforces this with an explicit `a.status = 'selected'` filter as defence in depth, in case a row ever exists for a demoted applicant.

Also assumed already merged (Plans 1–2, deployed): `campaigns` (with `seeding_sheet_token`), `profiles`, `getCurrentProfile`/`requireRole` in `lib/auth/roles.ts`, `createServerSupabaseClient()` (**async — always `await` it**) in `lib/supabase/server.ts`, `app/(dashboard)/layout.tsx`, and the Tailwind design tokens.

**Out of scope — other plans own these. Do not build them:**
- Creating `seeding_records`, the 최종선정/예비선정 actions, status transitions, 배송/방문 정보 입력 → **Plan 4** (shipped, migration 0009)
- `applicants`, `campaign_form_config`, the application form, the applicant list → **Plan 3**
- 결과보고서 / 웹 리포트 / PDF / PPTX, and the **"보고서 생성" button** → **Plan 6**. This plan deliberately leaves that button out of the 관리시트 header; Plan 6 adds it there. Do not add a stub, a disabled button, or a placeholder link.
- SNS API 자동 수집 of 조회수/인게이지먼트 — explicitly excluded by the spec's 제외 범위. Manual entry only.

---

## Global Constraints

- **Reserved migration numbers: `0011` and `0012` only.** Plan 4 owns 0009; other plans own the rest of 0006–0010 and 0013+. Do not renumber, and do not edit migrations 0001–0010.
- **Conform to Plan 4's column names.** `progress_stage`, `visit_party_size`, `shipping_address`, `visit_scheduled_at`, `upload_deadline`, `upload_url`, `view_count`, `engagement_count`. This plan never alters `seeding_records`' columns or constraints — migration 0011 only adds a trigger, an index, and guarded policies.
- **Public route, zero anon table access.** `/seeding-sheet/[token]` reads only through the `SECURITY DEFINER` RPC `get_seeding_sheet`, granted with `revoke execute ... from public;` then `grant execute ... to anon, authenticated;` — mirroring `supabase/migrations/0005_pre_survey_rpc.sql`. The anon key must never gain `select` on `seeding_records` or `applicants`.
- **The share page is 조회 전용.** Spec: "공유 페이지는 조회 전용(수정은 에이전시 내부에서만)". There is no write RPC in this plan and no server action reachable from `app/seeding-sheet/[token]/page.tsx`.
- **The RPC must not leak the campaign's other share tokens** (`pre_survey_token`, `apply_token`, `applicant_list_token`, `seeding_sheet_token`). Build the JSON field-by-field; never `to_jsonb(c)` or `select *` into the result.
- **Every server action has an explicit return type**, e.g. `Promise<{ error: string } | { success: true }>`. Without it, TypeScript cannot narrow via `"error" in result` and the build breaks.
- **Any test for an action that calls `revalidatePath` must mock it:** `vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))`.
- **진행 단계 허용값 are the exact Korean strings from Plan 4's `seeding_records_stage_matches_type` check constraint**, defined once in `lib/seeding/stages.ts`:
  - 제품배송형 (`shipping`): `선정완료` → `발송완료` → `가이드전달완료` → `수령완료` → `업로드완료`
  - 현장방문형 (`visit`): `선정완료` → `확정완료` → `가이드전달완료` → `방문완료` → `업로드완료`
  - `선정완료` is the zeroth stage and the column's not-null default. **The checklist renders only the four spec stages**; `선정완료` is the state in which none of them are checked. `progress_stage` is never written as `null`.
- **UI copy is Korean.** Tailwind tokens only: `bg-bg`, `bg-surface`, `bg-surface2`, `border-border`, `text-text`, `text-textMuted`, `bg-accent`, `text-onAccent`, `text-critical`, `text-success`, `text-warning`, `rounded-token`. D-day and all numbers render with `font-mono tabular-nums` (spec: "D-day와 진행률은 항상 tabular-nums로 정렬").
- **Optimistic updates, no locking.** Spec: "소규모 팀 동시 사용 기준 — 낙관적 업데이트로 충분, 별도 동시편집 잠금 불필요."
- **Commit messages in English**, each ending with the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

### 선정완료 as the zeroth stage

The spec draws 진행 단계 as four steps per campaign type. Plan 4's shipped table adds a fifth stored value, `선정완료`, as the not-null default, valid for both types. These reconcile cleanly if `선정완료` is read as *the state before step 1*:

| Stored `progress_stage` (shipping) | `선정완료` | `발송완료` | `가이드전달완료` | `수령완료` | `업로드완료` |
|---|---|---|---|---|---|
| `stageIndex` | 0 | 1 | 2 | 3 | 4 |
| Rendered as a checkbox? | no | yes | yes | yes | yes |
| `progressLabel` | `0/4` | `1/4` | `2/4` | `3/4` | `4/4` |

So the **stored vocabulary** has five values while the **rendered checklist** has four items. `stagesFor()` returns the stored vocabulary (used for validation and index arithmetic); `checklistStagesFor()` returns the four rendered steps. Unchecking the first step rewinds to `선정완료`, never to `null` — a `null` write would violate `not null`, and rejecting `선정완료` in `isStageAllowed` would reject rows the database itself created.

### Resolved spec ambiguities (judgment calls)

1. **진행 단계 is one linear stage column, not four independent checkboxes.** The spec calls it "캠페인 유형별로 허용값이 다른 **컬럼**" (singular) and writes the values with `→` arrows; Plan 4 shipped it as a single `text` column with an ordered check constraint. So `progress_stage` holds the furthest completed step, and the UI renders it as a 4-item checklist where checking step *i* implies steps 1..*i* are done. Unchecking step *i* falls back to step *i-1*, bottoming out at `선정완료`.
2. **Stage values are stored in Korean**, verbatim. This was a judgment call when the plan was first written; Plan 4's shipped check constraint has since confirmed it, so `lib/seeding/stages.ts` and the DB constraint now quote the same literals.
3. **CSV, not .xlsx.** The spec says "Excel/CSV로 내보내기". A UTF-8 CSV **with a BOM** opens natively in Excel with Korean text intact, and needs no dependency. SheetJS (`xlsx`) is no longer published to the npm registry in a maintained form, and `exceljs` is a large dependency for a nine-column table. So `lib/export/csv.ts` is ~20 lines of pure, unit-tested code. Upgrade path if real `.xlsx` is ever demanded: swap the body of `toSeedingSheetCsv` behind the same route handler; nothing else changes.
4. **Export is internal-only.** The spec restricts *edit* to the agency but says nothing about who may export. Conservatively, the download route lives under `/campaigns/[id]/...` behind the auth gate; the public share page has no download button. Adding one later means calling the same `toSeedingSheetCsv` from a token-scoped route.
5. **The share page shows only 이름 and SNS 링크 from `applicants`** — not 연락처 or 국적. Those are PII that belong to the applicant list surface (Plan 3), not to a link that gets forwarded around a client company.
6. **Dates are computed in KST (UTC+9, no DST).** The agency is Korean; `new Date()` on Vercel is UTC, so a naive `toISOString()` would show yesterday's date for nine hours every day. `toKstDateString` is computed **on the server** and passed to the client component as a prop, which also prevents a hydration mismatch.
7. **The campaign type comes from `campaigns.campaign_type`, not `seeding_records.campaign_type`.** Plan 4 denormalises the type onto each row to drive its check constraint. This plan reads it once per sheet from the campaign, since every row in one sheet shares it — one value per table render instead of one per row.

---

## File Structure

```
marketing/
├── lib/
│   ├── seeding/
│   │   ├── stages.ts          # Task 1 — stage vocabulary + checklist transitions (pure)
│   │   ├── stages.test.ts
│   │   ├── dday.ts            # Task 2 — KST date + D-day formatting (pure)
│   │   ├── dday.test.ts
│   │   ├── sheetRow.ts        # Task 5 — SeedingSheetRow / SeedingRecordPatch / SaveSeedingRecord types
│   │   ├── sheetCsv.ts        # Task 9 — column definitions for the 관리시트 export
│   │   └── sheetCsv.test.ts
│   └── export/
│       ├── csv.ts             # Task 9 — generic toCsv/withBom (Plan 3 reuses this)
│       └── csv.test.ts
├── supabase/migrations/
│   ├── 0011_seeding_records_sheet_support.sql   # Task 3 — updated_at trigger, index, RLS guard
│   ├── 0011_seeding_records_sheet_support.test.ts
│   ├── 0012_seeding_sheet_rpc.sql               # Task 4 — get_seeding_sheet
│   └── 0012_seeding_sheet_rpc.test.ts
└── app/
    ├── seeding-sheet/[token]/
    │   ├── StageChecklist.tsx        # Task 6 — 유형별 진행 단계 체크리스트
    │   ├── StageChecklist.test.tsx
    │   ├── SeedingSheetTable.tsx     # Task 7 — shared table, editable iff `onSave` is given
    │   ├── SeedingSheetTable.test.tsx
    │   ├── page.tsx                  # Task 8 — public read-only share page
    │   └── page.test.tsx
    └── (dashboard)/campaigns/[id]/
        ├── page.tsx                  # Task 10 — MODIFIED: add the 관리시트 entry point
        └── seeding-sheet/
            ├── actions.ts            # Task 5 — updateSeedingRecord (the only write path)
            ├── actions.test.ts
            ├── page.tsx              # Task 7 — internal editable 관리시트
            ├── page.test.tsx
            └── export/
                ├── route.ts          # Task 9 — CSV download
                └── route.test.ts
```

The shared components live beside the **public** route and are imported by the dashboard page (`@/app/seeding-sheet/[token]/SeedingSheetTable`), exactly as Plan 2 did with `@/app/pre-survey/[token]/PreSurveyForm`.

---

## Task 1: Stage Vocabulary

**Files:**
- Create: `lib/seeding/stages.ts`
- Test: `lib/seeding/stages.test.ts`

**Interfaces:**
- Produces:
  - `type CampaignType = "shipping" | "visit"`
  - `const INITIAL_STAGE = "선정완료"` — the zeroth stage and Plan 4's not-null default
  - `type SeedingStage` — the union of all seven distinct stored Korean strings
  - `type ChecklistStage = Exclude<SeedingStage, typeof INITIAL_STAGE>` — the six distinct rendered steps
  - `SHIPPING_STAGES`, `VISIT_STAGES` — readonly ordered 5-tuples of the **stored** vocabulary
  - `stagesFor(type: CampaignType): readonly SeedingStage[]` — all five stored values
  - `checklistStagesFor(type: CampaignType): readonly ChecklistStage[]` — the four rendered steps
  - `isStageAllowed(type: CampaignType, progress_stage: string): progress_stage is SeedingStage`
  - `stageIndex(type: CampaignType, progress_stage: string): number` — `선정완료` is `0`, steps are `1..4`, `-1` if invalid for the type
  - `isStageDone(type: CampaignType, current: string, progress_stage: ChecklistStage): boolean`
  - `toggleStage(type: CampaignType, current: string, progress_stage: ChecklistStage): SeedingStage` — **never returns null**
  - `progressLabel(type: CampaignType, current: string): string` — e.g. `"0/4"`, `"3/4"`

- [ ] **Step 1: Write the failing test**

`lib/seeding/stages.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  INITIAL_STAGE,
  SHIPPING_STAGES,
  VISIT_STAGES,
  checklistStagesFor,
  isStageAllowed,
  isStageDone,
  progressLabel,
  stageIndex,
  stagesFor,
  toggleStage,
} from "./stages";

describe("stored vocabulary", () => {
  test("선정완료 is the zeroth stage", () => {
    expect(INITIAL_STAGE).toBe("선정완료");
    expect(SHIPPING_STAGES[0]).toBe("선정완료");
    expect(VISIT_STAGES[0]).toBe("선정완료");
  });

  test("제품배송형 stored values match the 0009 check constraint, in order", () => {
    expect(SHIPPING_STAGES).toEqual([
      "선정완료",
      "발송완료",
      "가이드전달완료",
      "수령완료",
      "업로드완료",
    ]);
  });

  test("현장방문형 stored values match the 0009 check constraint, in order", () => {
    expect(VISIT_STAGES).toEqual([
      "선정완료",
      "확정완료",
      "가이드전달완료",
      "방문완료",
      "업로드완료",
    ]);
  });

  test("stagesFor returns the list matching the campaign type", () => {
    expect(stagesFor("shipping")).toEqual(SHIPPING_STAGES);
    expect(stagesFor("visit")).toEqual(VISIT_STAGES);
  });
});

describe("checklistStagesFor", () => {
  test("renders the spec's four 제품배송형 steps, without 선정완료", () => {
    expect(checklistStagesFor("shipping")).toEqual([
      "발송완료",
      "가이드전달완료",
      "수령완료",
      "업로드완료",
    ]);
  });

  test("renders the spec's four 현장방문형 steps, without 선정완료", () => {
    expect(checklistStagesFor("visit")).toEqual([
      "확정완료",
      "가이드전달완료",
      "방문완료",
      "업로드완료",
    ]);
  });
});

describe("isStageAllowed", () => {
  test("선정완료 is allowed on both types, because the DB default writes it on both", () => {
    expect(isStageAllowed("shipping", "선정완료")).toBe(true);
    expect(isStageAllowed("visit", "선정완료")).toBe(true);
  });

  test("a shipping-only stage is not allowed on a visit campaign, and vice versa", () => {
    expect(isStageAllowed("shipping", "발송완료")).toBe(true);
    expect(isStageAllowed("visit", "발송완료")).toBe(false);
    expect(isStageAllowed("visit", "확정완료")).toBe(true);
    expect(isStageAllowed("shipping", "확정완료")).toBe(false);
    expect(isStageAllowed("shipping", "아무거나")).toBe(false);
  });

  test("shared stage names are allowed on both types", () => {
    expect(isStageAllowed("shipping", "가이드전달완료")).toBe(true);
    expect(isStageAllowed("visit", "가이드전달완료")).toBe(true);
    expect(isStageAllowed("shipping", "업로드완료")).toBe(true);
    expect(isStageAllowed("visit", "업로드완료")).toBe(true);
  });
});

describe("stageIndex", () => {
  test("선정완료 sits at 0 and the four steps at 1..4", () => {
    expect(stageIndex("shipping", "선정완료")).toBe(0);
    expect(stageIndex("shipping", "발송완료")).toBe(1);
    expect(stageIndex("shipping", "수령완료")).toBe(3);
    expect(stageIndex("shipping", "업로드완료")).toBe(4);
    expect(stageIndex("visit", "확정완료")).toBe(1);
    expect(stageIndex("visit", "방문완료")).toBe(3);
  });

  test("returns -1 for a stage of the wrong type", () => {
    expect(stageIndex("shipping", "확정완료")).toBe(-1);
    expect(stageIndex("visit", "발송완료")).toBe(-1);
  });
});

describe("isStageDone", () => {
  test("every step at or before the current stage counts as done", () => {
    expect(isStageDone("shipping", "수령완료", "발송완료")).toBe(true);
    expect(isStageDone("shipping", "수령완료", "가이드전달완료")).toBe(true);
    expect(isStageDone("shipping", "수령완료", "수령완료")).toBe(true);
    expect(isStageDone("shipping", "수령완료", "업로드완료")).toBe(false);
  });

  test("nothing is done for a freshly selected 선정완료 row", () => {
    expect(isStageDone("shipping", "선정완료", "발송완료")).toBe(false);
    expect(isStageDone("visit", "선정완료", "확정완료")).toBe(false);
  });
});

describe("toggleStage", () => {
  test("checking a step advances the stage to that step", () => {
    expect(toggleStage("shipping", "선정완료", "수령완료")).toBe("수령완료");
    expect(toggleStage("shipping", "발송완료", "업로드완료")).toBe("업로드완료");
  });

  test("unchecking the current step falls back to the previous one", () => {
    expect(toggleStage("shipping", "수령완료", "수령완료")).toBe("가이드전달완료");
  });

  test("unchecking an earlier step rewinds to just before it", () => {
    expect(toggleStage("shipping", "업로드완료", "가이드전달완료")).toBe("발송완료");
  });

  test("unchecking the first step rewinds to 선정완료, never to null", () => {
    expect(toggleStage("visit", "확정완료", "확정완료")).toBe("선정완료");
    expect(toggleStage("shipping", "발송완료", "발송완료")).toBe("선정완료");
  });

  test("a stage from the other type leaves the current value untouched", () => {
    expect(toggleStage("visit", "확정완료", "발송완료" as never)).toBe("확정완료");
  });
});

describe("progressLabel", () => {
  test("counts completed steps out of the four the spec draws", () => {
    expect(progressLabel("shipping", "선정완료")).toBe("0/4");
    expect(progressLabel("shipping", "발송완료")).toBe("1/4");
    expect(progressLabel("shipping", "수령완료")).toBe("3/4");
    expect(progressLabel("visit", "업로드완료")).toBe("4/4");
  });

  test("clamps to 0/4 for a value that does not belong to the type", () => {
    expect(progressLabel("visit", "발송완료")).toBe("0/4");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/seeding/stages`
Expected: FAIL — `Failed to resolve import "./stages"`.

- [ ] **Step 3: Write the implementation**

`lib/seeding/stages.ts`:

```ts
// The 진행 단계 values are stored verbatim as the Korean strings in the
// seeding_records_stage_matches_type check constraint (Plan 4, migration 0009).
//
// '선정완료' is the zeroth stage: it is the column's not-null default, it is valid for BOTH
// campaign types, and every row Plan 4 creates on 최종선정 arrives holding it. It means
// "선정은 됐지만 아직 아무 단계도 진행 안 됨", so the checklist renders only the four stages the
// spec draws and 선정완료 is the state in which none of them are checked. progress_stage is
// never null.

export type CampaignType = "shipping" | "visit";

/** The zeroth stage — Plan 4's `progress_stage text not null default '선정완료'`. */
export const INITIAL_STAGE = "선정완료";

export const SHIPPING_STAGES = [
  INITIAL_STAGE,
  "발송완료",
  "가이드전달완료",
  "수령완료",
  "업로드완료",
] as const;

export const VISIT_STAGES = [
  INITIAL_STAGE,
  "확정완료",
  "가이드전달완료",
  "방문완료",
  "업로드완료",
] as const;

/** Everything the column may store. */
export type SeedingStage = (typeof SHIPPING_STAGES)[number] | (typeof VISIT_STAGES)[number];

/** The four steps the spec draws as a checklist — the stored vocabulary minus 선정완료. */
export type ChecklistStage = Exclude<SeedingStage, typeof INITIAL_STAGE>;

/** All five stored values for a campaign type — used for validation and index arithmetic. */
export function stagesFor(type: CampaignType): readonly SeedingStage[] {
  return type === "shipping" ? SHIPPING_STAGES : VISIT_STAGES;
}

/** The four rendered checkboxes. */
export function checklistStagesFor(type: CampaignType): readonly ChecklistStage[] {
  return stagesFor(type).slice(1) as readonly ChecklistStage[];
}

export function isStageAllowed(
  type: CampaignType,
  progress_stage: string
): progress_stage is SeedingStage {
  return (stagesFor(type) as readonly string[]).includes(progress_stage);
}

/** 0 for 선정완료, 1..4 for the checklist steps, -1 for a value of the wrong campaign type. */
export function stageIndex(type: CampaignType, progress_stage: string): number {
  return (stagesFor(type) as readonly string[]).indexOf(progress_stage);
}

/** A checklist step counts as done when it sits at or before the record's current stage. */
export function isStageDone(
  type: CampaignType,
  current: string,
  progress_stage: ChecklistStage
): boolean {
  const target = stageIndex(type, progress_stage);
  return target > 0 && stageIndex(type, current) >= target;
}

/**
 * Checking step i sets the stage to step i; unchecking it rewinds to step i-1, which bottoms
 * out at 선정완료 (index 0). Never returns null — the column is not null.
 */
export function toggleStage(
  type: CampaignType,
  current: string,
  progress_stage: ChecklistStage
): SeedingStage {
  const stages = stagesFor(type);
  const target = stageIndex(type, progress_stage);
  if (target < 0) return current as SeedingStage;
  if (isStageDone(type, current, progress_stage)) return stages[target - 1];
  return progress_stage;
}

/** "0/4" for a freshly selected row through to "4/4". */
export function progressLabel(type: CampaignType, current: string): string {
  const done = Math.max(0, stageIndex(type, current));
  return `${done}/${checklistStagesFor(type).length}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/seeding/stages`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/seeding/stages.ts lib/seeding/stages.test.ts
git commit -m "feat: add per-campaign-type seeding stage vocabulary" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: D-day Calculation

**Files:**
- Create: `lib/seeding/dday.ts`
- Test: `lib/seeding/dday.test.ts`

**Interfaces:**
- Produces:
  - `toKstDateString(instant: Date): string` — the Asia/Seoul calendar date as `"YYYY-MM-DD"`
  - `daysUntilDeadline(deadline: string, todayKst: string): number` — whole days; negative once overdue
  - `formatDday(deadline: string | null, todayKst: string): string` — `"D-3"` / `"D-DAY"` / `"D+2"` / `"-"`
  - `ddayToneClass(deadline: string | null, todayKst: string): string` — a Tailwind token class

`upload_deadline` **is** nullable in Plan 4's table, so unlike `progress_stage` these two take `string | null`.

- [ ] **Step 1: Write the failing test**

`lib/seeding/dday.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { daysUntilDeadline, ddayToneClass, formatDday, toKstDateString } from "./dday";

describe("toKstDateString", () => {
  test("keeps the same date before the KST day rolls over", () => {
    expect(toKstDateString(new Date("2026-08-30T14:30:00Z"))).toBe("2026-08-30");
  });

  test("advances to the next date once it is past midnight in Seoul", () => {
    expect(toKstDateString(new Date("2026-08-30T15:30:00Z"))).toBe("2026-08-31");
  });

  test("handles the exact UTC+9 boundary", () => {
    expect(toKstDateString(new Date("2026-08-30T15:00:00Z"))).toBe("2026-08-31");
    expect(toKstDateString(new Date("2026-08-30T14:59:59Z"))).toBe("2026-08-30");
  });

  test("rolls the year over correctly", () => {
    expect(toKstDateString(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
  });
});

describe("daysUntilDeadline", () => {
  test("is 0 when the deadline is today", () => {
    expect(daysUntilDeadline("2026-08-30", "2026-08-30")).toBe(0);
  });

  test("is positive for a future deadline", () => {
    expect(daysUntilDeadline("2026-09-02", "2026-08-30")).toBe(3);
  });

  test("is negative for a past deadline", () => {
    expect(daysUntilDeadline("2026-08-28", "2026-08-30")).toBe(-2);
  });

  test("crosses a month boundary", () => {
    expect(daysUntilDeadline("2026-09-01", "2026-08-31")).toBe(1);
    expect(daysUntilDeadline("2026-09-01", "2026-08-25")).toBe(7);
  });

  test("crosses a year boundary", () => {
    expect(daysUntilDeadline("2027-01-01", "2026-12-31")).toBe(1);
  });

  test("counts the leap day", () => {
    expect(daysUntilDeadline("2028-02-29", "2028-02-28")).toBe(1);
    expect(daysUntilDeadline("2028-03-01", "2028-02-28")).toBe(2);
  });
});

describe("formatDday", () => {
  test("shows D-DAY on the deadline itself", () => {
    expect(formatDday("2026-08-30", "2026-08-30")).toBe("D-DAY");
  });

  test("counts down before the deadline", () => {
    expect(formatDday("2026-09-02", "2026-08-30")).toBe("D-3");
    expect(formatDday("2026-08-31", "2026-08-30")).toBe("D-1");
  });

  test("counts up after the deadline", () => {
    expect(formatDday("2026-08-28", "2026-08-30")).toBe("D+2");
  });

  test("shows a dash when no deadline is set", () => {
    expect(formatDday(null, "2026-08-30")).toBe("-");
    expect(formatDday("", "2026-08-30")).toBe("-");
  });

  test("shows a dash rather than NaN for an unparseable deadline", () => {
    expect(formatDday("작성중", "2026-08-30")).toBe("-");
  });
});

describe("ddayToneClass", () => {
  test("marks an overdue deadline as critical", () => {
    expect(ddayToneClass("2026-08-29", "2026-08-30")).toBe("text-critical");
  });

  test("warns on the deadline day and the day before it", () => {
    expect(ddayToneClass("2026-08-30", "2026-08-30")).toBe("text-warning");
    expect(ddayToneClass("2026-08-31", "2026-08-30")).toBe("text-warning");
  });

  test("stays neutral with time to spare, and muted with no deadline", () => {
    expect(ddayToneClass("2026-09-10", "2026-08-30")).toBe("text-text");
    expect(ddayToneClass(null, "2026-08-30")).toBe("text-textMuted");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/seeding/dday`
Expected: FAIL — `Failed to resolve import "./dday"`.

- [ ] **Step 3: Write the implementation**

`lib/seeding/dday.ts`:

```ts
// Vercel runs in UTC; the agency works in Seoul. Doing the calendar-date math in KST
// (UTC+9, no DST) keeps "오늘" from being wrong for nine hours every day.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The Asia/Seoul calendar date for an instant, as "YYYY-MM-DD". */
export function toKstDateString(instant: Date): string {
  return new Date(instant.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function midnightUtc(dateString: string): number {
  return Date.parse(`${dateString}T00:00:00Z`);
}

/** Whole days from `todayKst` to `deadline`. Negative once the deadline has passed. */
export function daysUntilDeadline(deadline: string, todayKst: string): number {
  return Math.round((midnightUtc(deadline) - midnightUtc(todayKst)) / MS_PER_DAY);
}

/** "D-3" (3일 남음) / "D-DAY" (오늘) / "D+2" (2일 지남) / "-" (기한 없음). */
export function formatDday(deadline: string | null, todayKst: string): string {
  if (!deadline) return "-";
  const days = daysUntilDeadline(deadline, todayKst);
  if (Number.isNaN(days)) return "-";
  if (days === 0) return "D-DAY";
  return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
}

/** Tailwind token class for the D-day cell: overdue → critical, today/tomorrow → warning. */
export function ddayToneClass(deadline: string | null, todayKst: string): string {
  if (!deadline) return "text-textMuted";
  const days = daysUntilDeadline(deadline, todayKst);
  if (Number.isNaN(days)) return "text-textMuted";
  if (days < 0) return "text-critical";
  if (days <= 1) return "text-warning";
  return "text-text";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/seeding/dday`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/seeding/dday.ts lib/seeding/dday.test.ts
git commit -m "feat: add KST-aware D-day calculation for upload deadlines" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Migration 0011 — Sheet Support on `seeding_records`

**Files:**
- Create: `supabase/migrations/0011_seeding_records_sheet_support.sql`
- Test: `supabase/migrations/0011_seeding_records_sheet_support.test.ts`

**Interfaces:**
- Consumes: `public.seeding_records` (Plan 4, migration 0009), `public.applicants` (Plan 3), `public.campaigns` (Plan 1).
- Produces: trigger `seeding_records_touch_updated_at` (keeps `updated_at` fresh on every edit from the 관리시트), index `seeding_records_campaign_id_idx`, and a guarded `select`/`update` RLS policy pair for `authenticated` — added only if Plan 4 did not already create them, so this migration is safe either way. **It adds no columns and alters no constraints.**

Note for every test helper below: `seeding_records.campaign_type` is `not null` with **no default**, so every insert must supply it, and it must match the campaign's own type or the `seeding_records_stage_matches_type` constraint will reject the row.

- [ ] **Step 1: Write the failing test**

`supabase/migrations/0011_seeding_records_sheet_support.test.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "vitest";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function makeSeedingRecord(campaignType: "shipping" | "visit" = "shipping") {
  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .insert({ name: "관리시트 테스트", company_name: "글로우랩", campaign_type: campaignType })
    .select()
    .single();
  if (campaignError) throw campaignError;

  const { data: applicant, error: applicantError } = await admin
    .from("applicants")
    .insert({
      campaign_id: campaign.id,
      name: "김인플",
      sns_url: "https://instagram.com/kiminflu",
      status: "selected",
    })
    .select()
    .single();
  if (applicantError) throw applicantError;

  const { data: record, error: recordError } = await admin
    .from("seeding_records")
    .insert({
      campaign_id: campaign.id,
      applicant_id: applicant.id,
      campaign_type: campaignType,
    })
    .select()
    .single();
  if (recordError) throw recordError;

  return { campaign, applicant, record };
}

async function signedInStaffClient() {
  const email = `sheet-staff-${Date.now()}@example.com`;
  const { error } = await admin.auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
  });
  if (error) throw error;

  const client = createClient(URL, ANON);
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: "password123",
  });
  if (signInError) throw signInError;
  return client;
}

test("a freshly created record starts at the 선정완료 default", async () => {
  const { record } = await makeSeedingRecord();
  expect(record.progress_stage).toBe("선정완료");
});

test("updating a seeding record bumps updated_at", async () => {
  const { record } = await makeSeedingRecord();
  const before = new Date(record.updated_at).getTime();

  await new Promise((resolve) => setTimeout(resolve, 50));

  const { data: updated, error } = await admin
    .from("seeding_records")
    .update({ upload_url: "https://instagram.com/p/abc123" })
    .eq("id", record.id)
    .select()
    .single();

  expect(error).toBeNull();
  expect(new Date(updated!.updated_at).getTime()).toBeGreaterThan(before);
});

test("a signed-in staff user can read and update a seeding record", async () => {
  const { record } = await makeSeedingRecord();
  const staff = await signedInStaffClient();

  const { error: updateError } = await staff
    .from("seeding_records")
    .update({ view_count: 12000, engagement_count: 340, progress_stage: "수령완료" })
    .eq("id", record.id);
  expect(updateError).toBeNull();

  const { data, error } = await staff
    .from("seeding_records")
    .select("view_count, engagement_count, progress_stage")
    .eq("id", record.id)
    .single();

  expect(error).toBeNull();
  expect(data).toEqual({
    view_count: 12000,
    engagement_count: 340,
    progress_stage: "수령완료",
  });
});

test("the anon client cannot read seeding_records directly", async () => {
  const { record } = await makeSeedingRecord();
  const anon = createClient(URL, ANON);

  const { data, error } = await anon
    .from("seeding_records")
    .select("id")
    .eq("id", record.id);

  expect(error !== null || (data ?? []).length === 0).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- 0011_seeding_records_sheet_support`
Expected: FAIL — the `updated_at` test fails because the timestamp is unchanged (no trigger yet). The 선정완료 default test should already pass, since Plan 4's 0009 provides it. If you instead see `relation "public.seeding_records" does not exist`, **stop**: Plan 4's migration has not been applied to this database.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0011_seeding_records_sheet_support.sql`:

```sql
-- The 관리시트 is the only writer of seeding_records once Plan 4 (migration 0009) has created
-- the row, so it owns keeping updated_at fresh and the index its per-campaign query needs.
-- This migration adds no columns and touches no constraint that 0009 defined.

create index if not exists seeding_records_campaign_id_idx
  on public.seeding_records (campaign_id);

create or replace function public.touch_seeding_record_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists seeding_records_touch_updated_at on public.seeding_records;

create trigger seeding_records_touch_updated_at
  before update on public.seeding_records
  for each row
  execute function public.touch_seeding_record_updated_at();

-- Plan 4 is expected to add these policies. Add them only if it did not, so this
-- migration applies cleanly in either order. Note there is deliberately no anon
-- policy: the public share page reads exclusively through get_seeding_sheet (0012).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seeding_records' and cmd = 'SELECT'
  ) then
    execute 'create policy "authenticated users can read seeding records"
      on public.seeding_records for select to authenticated using (true)';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'seeding_records' and cmd = 'UPDATE'
  ) then
    execute 'create policy "authenticated users can update seeding records"
      on public.seeding_records for update to authenticated using (true) with check (true)';
  end if;
end
$$;
```

- [ ] **Step 4: Apply the migration and run test to verify it passes**

Run: `npx supabase migration up`
Run: `npm test -- 0011_seeding_records_sheet_support`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0011_seeding_records_sheet_support.sql supabase/migrations/0011_seeding_records_sheet_support.test.ts
git commit -m "feat: add updated_at trigger and sheet index for seeding_records" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: Migration 0012 — Token-Scoped `get_seeding_sheet` RPC

**Files:**
- Create: `supabase/migrations/0012_seeding_sheet_rpc.sql`
- Test: `supabase/migrations/0012_seeding_sheet_rpc.test.ts`

**Interfaces:**
- Consumes: `public.campaigns` (`seeding_sheet_token`), `public.applicants`, `public.seeding_records`.
- Produces: `get_seeding_sheet(p_token uuid) returns json` — `SECURITY DEFINER`, granted to `anon, authenticated`. Returns `null` for an unknown token, otherwise:

```json
{
  "campaign_name": "글로우랩 세럼",
  "company_name": "글로우랩",
  "campaign_type": "shipping",
  "rows": [
    {
      "id": "…", "name": "김인플", "sns_url": "https://…",
      "shipping_address": "서울시 …", "visit_scheduled_at": null, "visit_party_size": null,
      "progress_stage": "수령완료", "upload_deadline": "2026-09-10", "upload_url": null,
      "view_count": null, "engagement_count": null, "updated_at": "2026-08-30T…"
    }
  ]
}
```

  Rows are sorted by 이름, restricted to `applicants.status = 'selected'`, and carry **no** share tokens and **no** 연락처/국적.

- [ ] **Step 1: Write the failing test**

`supabase/migrations/0012_seeding_sheet_rpc.test.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "vitest";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const anon = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

async function makeApplicant(
  campaignId: string,
  name: string,
  status: "selected" | "reserved"
) {
  const { data, error } = await admin
    .from("applicants")
    .insert({
      campaign_id: campaignId,
      name,
      sns_url: `https://instagram.com/${encodeURIComponent(name)}`,
      status,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function makeCampaignWithRows() {
  const { data: campaign, error } = await admin
    .from("campaigns")
    .insert({ name: "글로우랩 세럼", company_name: "글로우랩", campaign_type: "shipping" })
    .select()
    .single();
  if (error) throw error;

  const selected = await makeApplicant(campaign.id, "김인플", "selected");
  const reserved = await makeApplicant(campaign.id, "박예비", "reserved");

  const { error: recordError } = await admin.from("seeding_records").insert([
    {
      campaign_id: campaign.id,
      applicant_id: selected.id,
      campaign_type: "shipping",
      shipping_address: "서울시 강남구 테헤란로 1",
      progress_stage: "수령완료",
      upload_deadline: "2026-09-10",
    },
    // Defence in depth: a stray row for a 예비선정 applicant must still not surface.
    { campaign_id: campaign.id, applicant_id: reserved.id, campaign_type: "shipping" },
  ]);
  if (recordError) throw recordError;

  return campaign;
}

test("get_seeding_sheet returns the campaign header and its selected rows, as anon", async () => {
  const campaign = await makeCampaignWithRows();

  const { data, error } = await anon.rpc("get_seeding_sheet", {
    p_token: campaign.seeding_sheet_token,
  });

  expect(error).toBeNull();
  expect(data.campaign_name).toBe("글로우랩 세럼");
  expect(data.company_name).toBe("글로우랩");
  expect(data.campaign_type).toBe("shipping");
  expect(data.rows).toHaveLength(1);
  expect(data.rows[0]).toMatchObject({
    name: "김인플",
    shipping_address: "서울시 강남구 테헤란로 1",
    visit_party_size: null,
    progress_stage: "수령완료",
    upload_deadline: "2026-09-10",
    upload_url: null,
    view_count: null,
    engagement_count: null,
  });
});

test("a freshly selected row surfaces as 선정완료, never null", async () => {
  const { data: campaign, error } = await admin
    .from("campaigns")
    .insert({ name: "신규 캠페인", company_name: "글로우랩", campaign_type: "visit" })
    .select()
    .single();
  if (error) throw error;

  const applicant = await makeApplicant(campaign.id, "최신규", "selected");
  const { error: recordError } = await admin.from("seeding_records").insert({
    campaign_id: campaign.id,
    applicant_id: applicant.id,
    campaign_type: "visit",
    visit_scheduled_at: "2026-09-05T05:00:00Z",
    visit_party_size: 2,
  });
  if (recordError) throw recordError;

  const { data } = await anon.rpc("get_seeding_sheet", {
    p_token: campaign.seeding_sheet_token,
  });

  expect(data.rows[0].progress_stage).toBe("선정완료");
  expect(data.rows[0].visit_party_size).toBe(2);
  expect(data.rows[0].upload_deadline).toBeNull();
});

test("예비선정(reserved) applicants never appear in the sheet", async () => {
  const campaign = await makeCampaignWithRows();

  const { data } = await anon.rpc("get_seeding_sheet", {
    p_token: campaign.seeding_sheet_token,
  });

  expect(data.rows.map((row: { name: string }) => row.name)).toEqual(["김인플"]);
});

test("get_seeding_sheet never exposes the campaign's other share tokens", async () => {
  const campaign = await makeCampaignWithRows();

  const { data } = await anon.rpc("get_seeding_sheet", {
    p_token: campaign.seeding_sheet_token,
  });

  const serialized = JSON.stringify(data);
  for (const token of [
    campaign.pre_survey_token,
    campaign.apply_token,
    campaign.applicant_list_token,
    campaign.seeding_sheet_token,
  ]) {
    expect(serialized).not.toContain(token);
  }
});

test("get_seeding_sheet returns an empty row list when nobody is selected yet", async () => {
  const { data: campaign, error } = await admin
    .from("campaigns")
    .insert({ name: "빈 캠페인", company_name: "무명", campaign_type: "visit" })
    .select()
    .single();
  if (error) throw error;

  const { data } = await anon.rpc("get_seeding_sheet", {
    p_token: campaign.seeding_sheet_token,
  });

  expect(data.rows).toEqual([]);
});

test("get_seeding_sheet returns null for an unknown token", async () => {
  const { data, error } = await anon.rpc("get_seeding_sheet", {
    p_token: "00000000-0000-0000-0000-000000000000",
  });

  expect(error).toBeNull();
  expect(data).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- 0012_seeding_sheet_rpc`
Expected: FAIL — `function get_seeding_sheet(uuid) does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0012_seeding_sheet_rpc.sql`:

```sql
-- SECURITY DEFINER so the read-only 관리시트 공유 페이지 (/seeding-sheet/[token]) can read
-- the sheet scoped strictly by seeding_sheet_token, without granting anon any direct table
-- access. The result is built field-by-field on purpose: the campaign's other share tokens
-- and the applicants' 연락처/국적 must never travel with a forwarded share link.

create or replace function public.get_seeding_sheet(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_campaign_name text;
  v_company_name text;
  v_campaign_type text;
  v_rows json;
begin
  select c.id, c.name, c.company_name, c.campaign_type
    into v_campaign_id, v_campaign_name, v_company_name, v_campaign_type
  from public.campaigns c
  where c.seeding_sheet_token = p_token;

  if v_campaign_id is null then
    return null;
  end if;

  select coalesce(json_agg(s.row_json order by s.sort_name), '[]'::json)
    into v_rows
  from (
    select
      a.name as sort_name,
      json_build_object(
        'id', r.id,
        'name', a.name,
        'sns_url', a.sns_url,
        'shipping_address', r.shipping_address,
        'visit_scheduled_at', r.visit_scheduled_at,
        'visit_party_size', r.visit_party_size,
        'progress_stage', r.progress_stage,
        'upload_deadline', r.upload_deadline,
        'upload_url', r.upload_url,
        'view_count', r.view_count,
        'engagement_count', r.engagement_count,
        'updated_at', r.updated_at
      ) as row_json
    from public.seeding_records r
    join public.applicants a on a.id = r.applicant_id
    where r.campaign_id = v_campaign_id
      and a.status = 'selected'
  ) s;

  return json_build_object(
    'campaign_name', v_campaign_name,
    'company_name', v_company_name,
    'campaign_type', v_campaign_type,
    'rows', v_rows
  );
end;
$$;

revoke execute on function public.get_seeding_sheet(uuid) from public;
grant execute on function public.get_seeding_sheet(uuid) to anon, authenticated;
```

- [ ] **Step 4: Apply the migration and run test to verify it passes**

Run: `npx supabase migration up`
Run: `npm test -- 0012_seeding_sheet_rpc`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0012_seeding_sheet_rpc.sql supabase/migrations/0012_seeding_sheet_rpc.test.ts
git commit -m "feat: add token-scoped read-only RPC for the seeding sheet share page" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: Sheet Row Types + `updateSeedingRecord` Server Action

**Files:**
- Create: `lib/seeding/sheetRow.ts`
- Create: `app/(dashboard)/campaigns/[id]/seeding-sheet/actions.ts`
- Test: `app/(dashboard)/campaigns/[id]/seeding-sheet/actions.test.ts`

**Interfaces:**
- Consumes: `requireRole("staff")`, `createServerSupabaseClient()`, `isStageAllowed`/`CampaignType`/`SeedingStage` (Task 1).
- Produces:
  - `type SeedingSheetRow` — the TypeScript mirror of one element of the RPC's `rows` array (Task 4). `progress_stage` is `string` (**not** `string | null`), matching the not-null column. Consumed by Tasks 7, 8, 9.
  - `type SeedingRecordPatch = { progress_stage?: SeedingStage; upload_deadline?: string | null; upload_url?: string | null; view_count?: number | null; engagement_count?: number | null }` — `progress_stage` has no `null` member on purpose.
  - `type SaveSeedingRecord = (recordId: string, patch: SeedingRecordPatch) => Promise<{ error: string } | { success: true }>`
  - `updateSeedingRecord(campaignId: string, campaignType: CampaignType, recordId: string, patch: SeedingRecordPatch): Promise<{ error: string } | { success: true }>`

**Parameter order matters:** `campaignId` and `campaignType` come first so the server component can produce a `SaveSeedingRecord` with `updateSeedingRecord.bind(null, campaign.id, campaignType)` (Task 7). Bound arguments are signed by Next.js and are not client-forgeable, so validating `patch.progress_stage` against the bound `campaignType` — and scoping the update with `.eq("campaign_id", campaignId)` — is a real trust boundary, not decoration. It also mirrors the DB's own `seeding_records_stage_matches_type` constraint, so a bad value is rejected with a Korean message instead of a raw Postgres error.

- [ ] **Step 1: Write the failing test**

`app/(dashboard)/campaigns/[id]/seeding-sheet/actions.test.ts`:

```ts
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/roles", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { updateSeedingRecord } from "./actions";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

function mockSupabase(updateError: { message: string } | null = null) {
  const scopeByCampaign = vi.fn().mockResolvedValue({ error: updateError });
  const scopeById = vi.fn().mockReturnValue({ eq: scopeByCampaign });
  const update = vi.fn().mockReturnValue({ eq: scopeById });
  mocked(createServerSupabaseClient).mockResolvedValue({ from: () => ({ update }) });
  return { update, scopeById, scopeByCampaign };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked(requireRole).mockResolvedValue({ id: "u1", role: "staff", full_name: "담당자" });
});

describe("updateSeedingRecord", () => {
  test("saves an allowed stage, scoped to the record and its campaign", async () => {
    const { update, scopeById, scopeByCampaign } = mockSupabase();

    const result = await updateSeedingRecord("camp-1", "shipping", "rec-1", {
      progress_stage: "수령완료",
    });

    expect(result).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({ progress_stage: "수령완료" });
    expect(scopeById).toHaveBeenCalledWith("id", "rec-1");
    expect(scopeByCampaign).toHaveBeenCalledWith("campaign_id", "camp-1");
  });

  test("rejects a stage that belongs to the other campaign type", async () => {
    const { update } = mockSupabase();

    const result = await updateSeedingRecord("camp-1", "visit", "rec-1", {
      progress_stage: "발송완료" as never,
    });

    expect(result).toEqual({ error: "이 캠페인 유형에서 사용할 수 없는 진행 단계입니다." });
    expect(update).not.toHaveBeenCalled();
  });

  test("accepts rewinding to 선정완료 on either campaign type", async () => {
    const { update } = mockSupabase();

    await expect(
      updateSeedingRecord("camp-1", "visit", "rec-1", { progress_stage: "선정완료" })
    ).resolves.toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({ progress_stage: "선정완료" });

    await expect(
      updateSeedingRecord("camp-2", "shipping", "rec-2", { progress_stage: "선정완료" })
    ).resolves.toEqual({ success: true });
  });

  test("rejects a malformed upload deadline", async () => {
    const { update } = mockSupabase();

    const result = await updateSeedingRecord("camp-1", "shipping", "rec-1", {
      upload_deadline: "2026/09/10",
    });

    expect(result).toEqual({ error: "업로드 기한은 YYYY-MM-DD 형식으로 입력해주세요." });
    expect(update).not.toHaveBeenCalled();
  });

  test("accepts clearing the upload deadline, which is nullable", async () => {
    mockSupabase();
    const result = await updateSeedingRecord("camp-1", "shipping", "rec-1", {
      upload_deadline: null,
    });
    expect(result).toEqual({ success: true });
  });

  test("rejects a negative or fractional 조회수", async () => {
    mockSupabase();

    await expect(
      updateSeedingRecord("camp-1", "shipping", "rec-1", { view_count: -1 })
    ).resolves.toEqual({ error: "조회수와 인게이지먼트는 0 이상의 정수로 입력해주세요." });

    await expect(
      updateSeedingRecord("camp-1", "shipping", "rec-1", { engagement_count: 1.5 })
    ).resolves.toEqual({ error: "조회수와 인게이지먼트는 0 이상의 정수로 입력해주세요." });
  });

  test("saves 수치 fields and revalidates the sheet", async () => {
    const { update } = mockSupabase();

    const result = await updateSeedingRecord("camp-1", "shipping", "rec-1", {
      view_count: 12000,
      engagement_count: 340,
      upload_url: "https://instagram.com/p/abc123",
    });

    expect(result).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({
      view_count: 12000,
      engagement_count: 340,
      upload_url: "https://instagram.com/p/abc123",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/campaigns/camp-1/seeding-sheet");
  });

  test("returns an error message when the database rejects the update", async () => {
    mockSupabase({ message: "boom" });

    const result = await updateSeedingRecord("camp-1", "shipping", "rec-1", { view_count: 1 });

    expect(result).toEqual({ error: "저장에 실패했습니다. 다시 시도해주세요." });
  });

  test("does nothing when the patch is empty", async () => {
    const { update } = mockSupabase();

    const result = await updateSeedingRecord("camp-1", "shipping", "rec-1", {});

    expect(result).toEqual({ success: true });
    expect(update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "campaigns/\[id\]/seeding-sheet/actions"`
Expected: FAIL — `Failed to resolve import "./actions"`.

- [ ] **Step 3: Write the shared row types**

`lib/seeding/sheetRow.ts`:

```ts
import type { SeedingStage } from "./stages";

/** One row of the 관리시트, exactly as `get_seeding_sheet` (migration 0012) returns it. */
export type SeedingSheetRow = {
  id: string;
  name: string;
  sns_url: string | null;
  shipping_address: string | null;
  visit_scheduled_at: string | null;
  visit_party_size: number | null;
  /** Not null in the DB: '선정완료' for a freshly selected row. */
  progress_stage: string;
  upload_deadline: string | null;
  upload_url: string | null;
  view_count: number | null;
  engagement_count: number | null;
  updated_at: string;
};

/**
 * The subset of a row the 담당자 may edit. 배송/방문 정보 is entered at 최종선정 time (Plan 4).
 * `progress_stage` has no null member: the column is not null, and 미시작 is '선정완료'.
 */
export type SeedingRecordPatch = {
  progress_stage?: SeedingStage;
  upload_deadline?: string | null;
  upload_url?: string | null;
  view_count?: number | null;
  engagement_count?: number | null;
};

/**
 * The save callback `SeedingSheetTable` receives. The internal page supplies it (bound to the
 * campaign); the public share page omits it, which is what makes that page 조회 전용.
 */
export type SaveSeedingRecord = (
  recordId: string,
  patch: SeedingRecordPatch
) => Promise<{ error: string } | { success: true }>;
```

- [ ] **Step 4: Write the server action**

`app/(dashboard)/campaigns/[id]/seeding-sheet/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isStageAllowed, type CampaignType } from "@/lib/seeding/stages";
import type { SeedingRecordPatch } from "@/lib/seeding/sheetRow";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function updateSeedingRecord(
  campaignId: string,
  campaignType: CampaignType,
  recordId: string,
  patch: SeedingRecordPatch
): Promise<{ error: string } | { success: true }> {
  await requireRole("staff");

  if (Object.keys(patch).length === 0) return { success: true };

  // Mirrors the seeding_records_stage_matches_type constraint from migration 0009, so a bad
  // value comes back as Korean copy instead of a raw Postgres constraint violation.
  if (patch.progress_stage !== undefined && !isStageAllowed(campaignType, patch.progress_stage)) {
    return { error: "이 캠페인 유형에서 사용할 수 없는 진행 단계입니다." };
  }

  if (
    patch.upload_deadline !== undefined &&
    patch.upload_deadline !== null &&
    !ISO_DATE.test(patch.upload_deadline)
  ) {
    return { error: "업로드 기한은 YYYY-MM-DD 형식으로 입력해주세요." };
  }

  for (const key of ["view_count", "engagement_count"] as const) {
    const value = patch[key];
    if (value !== undefined && value !== null && (!Number.isInteger(value) || value < 0)) {
      return { error: "조회수와 인게이지먼트는 0 이상의 정수로 입력해주세요." };
    }
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("seeding_records")
    .update(patch)
    .eq("id", recordId)
    .eq("campaign_id", campaignId);

  if (error) return { error: "저장에 실패했습니다. 다시 시도해주세요." };

  revalidatePath(`/campaigns/${campaignId}/seeding-sheet`);
  return { success: true };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- "campaigns/\[id\]/seeding-sheet/actions"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/seeding/sheetRow.ts "app/(dashboard)/campaigns/[id]/seeding-sheet/actions.ts" "app/(dashboard)/campaigns/[id]/seeding-sheet/actions.test.ts"
git commit -m "feat: add validated server action for seeding record updates" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: 진행 단계 Checklist Component

**Files:**
- Create: `app/seeding-sheet/[token]/StageChecklist.tsx`
- Test: `app/seeding-sheet/[token]/StageChecklist.test.tsx`

**Interfaces:**
- Consumes: `checklistStagesFor`, `isStageDone`, `toggleStage`, `progressLabel`, `CampaignType`, `SeedingStage` (Task 1).
- Produces: `<StageChecklist campaignType={CampaignType} progress_stage={string} readOnly?={boolean} onChange?={(next: SeedingStage) => void} />`. It renders the **four** spec steps as checkboxes labelled with their Korean names; every step at or before `progress_stage` renders checked, so `선정완료` renders with none checked. `onChange` never receives `null`.

- [ ] **Step 1: Write the failing test**

`app/seeding-sheet/[token]/StageChecklist.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import StageChecklist from "./StageChecklist";

describe("StageChecklist", () => {
  test("renders the four 제품배송형 steps and no 선정완료 checkbox", () => {
    render(<StageChecklist campaignType="shipping" progress_stage="선정완료" />);

    for (const label of ["발송완료", "가이드전달완료", "수령완료", "업로드완료"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.queryByLabelText("선정완료")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("확정완료")).not.toBeInTheDocument();
  });

  test("renders the four 현장방문형 steps and no 선정완료 checkbox", () => {
    render(<StageChecklist campaignType="visit" progress_stage="선정완료" />);

    for (const label of ["확정완료", "가이드전달완료", "방문완료", "업로드완료"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.queryByLabelText("선정완료")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("발송완료")).not.toBeInTheDocument();
  });

  test("a freshly selected 선정완료 row has nothing checked and reads 0/4", () => {
    render(<StageChecklist campaignType="shipping" progress_stage="선정완료" />);

    expect(screen.getByLabelText("발송완료")).not.toBeChecked();
    expect(screen.getByLabelText("가이드전달완료")).not.toBeChecked();
    expect(screen.getByLabelText("수령완료")).not.toBeChecked();
    expect(screen.getByLabelText("업로드완료")).not.toBeChecked();
    expect(screen.getByText("0/4")).toBeInTheDocument();
  });

  test("checks every step up to and including the current stage", () => {
    render(<StageChecklist campaignType="shipping" progress_stage="수령완료" />);

    expect(screen.getByLabelText("발송완료")).toBeChecked();
    expect(screen.getByLabelText("가이드전달완료")).toBeChecked();
    expect(screen.getByLabelText("수령완료")).toBeChecked();
    expect(screen.getByLabelText("업로드완료")).not.toBeChecked();
  });

  test("checking a step reports that step", () => {
    const onChange = vi.fn();
    render(
      <StageChecklist campaignType="shipping" progress_stage="선정완료" onChange={onChange} />
    );

    fireEvent.click(screen.getByLabelText("수령완료"));

    expect(onChange).toHaveBeenCalledWith("수령완료");
  });

  test("unchecking the current step reports the previous one", () => {
    const onChange = vi.fn();
    render(
      <StageChecklist campaignType="shipping" progress_stage="수령완료" onChange={onChange} />
    );

    fireEvent.click(screen.getByLabelText("수령완료"));

    expect(onChange).toHaveBeenCalledWith("가이드전달완료");
  });

  test("unchecking the first step reports 선정완료, not null", () => {
    const onChange = vi.fn();
    render(
      <StageChecklist campaignType="visit" progress_stage="확정완료" onChange={onChange} />
    );

    fireEvent.click(screen.getByLabelText("확정완료"));

    expect(onChange).toHaveBeenCalledWith("선정완료");
  });

  test("shows the progress count", () => {
    render(<StageChecklist campaignType="shipping" progress_stage="수령완료" />);
    expect(screen.getByText("3/4")).toBeInTheDocument();
  });

  test("read-only mode disables every checkbox", () => {
    const onChange = vi.fn();
    render(
      <StageChecklist
        campaignType="shipping"
        progress_stage="발송완료"
        readOnly
        onChange={onChange}
      />
    );

    expect(screen.getByLabelText("수령완료")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("수령완료"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- StageChecklist`
Expected: FAIL — `Failed to resolve import "./StageChecklist"`.

- [ ] **Step 3: Implement the component**

`app/seeding-sheet/[token]/StageChecklist.tsx`:

```tsx
"use client";

import {
  checklistStagesFor,
  isStageDone,
  progressLabel,
  toggleStage,
  type CampaignType,
  type SeedingStage,
} from "@/lib/seeding/stages";

export default function StageChecklist({
  campaignType,
  progress_stage,
  readOnly = false,
  onChange,
}: {
  campaignType: CampaignType;
  progress_stage: string;
  readOnly?: boolean;
  onChange?: (next: SeedingStage) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Only the four spec stages get a checkbox; 선정완료 is the none-checked state. */}
      {checklistStagesFor(campaignType).map((step) => {
        const done = isStageDone(campaignType, progress_stage, step);
        return (
          <label
            key={step}
            className={`flex items-center gap-1.5 rounded-token border px-2 py-1 text-xs ${
              done ? "border-accent text-text" : "border-border text-textMuted"
            }`}
          >
            <input
              type="checkbox"
              aria-label={step}
              checked={done}
              disabled={readOnly}
              onChange={() => onChange?.(toggleStage(campaignType, progress_stage, step))}
            />
            {step}
          </label>
        );
      })}
      <span className="ml-1 font-mono text-xs tabular-nums text-textMuted">
        {progressLabel(campaignType, progress_stage)}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- StageChecklist`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/seeding-sheet/[token]/StageChecklist.tsx" "app/seeding-sheet/[token]/StageChecklist.test.tsx"
git commit -m "feat: add per-campaign-type seeding stage checklist component" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: Shared Sheet Table + Internal 관리시트 Page

**Files:**
- Create: `app/seeding-sheet/[token]/SeedingSheetTable.tsx`
- Test: `app/seeding-sheet/[token]/SeedingSheetTable.test.tsx`
- Create: `app/(dashboard)/campaigns/[id]/seeding-sheet/page.tsx`
- Test: `app/(dashboard)/campaigns/[id]/seeding-sheet/page.test.tsx`

**Interfaces:**
- Consumes: `StageChecklist` (Task 6), `formatDday`/`ddayToneClass`/`toKstDateString` (Task 2), `SeedingSheetRow`/`SeedingRecordPatch`/`SaveSeedingRecord` (Task 5), `updateSeedingRecord` (Task 5), `get_seeding_sheet` RPC (Task 4), `requireRole`, `createServerSupabaseClient`.
- Produces:
  - `<SeedingSheetTable rows={SeedingSheetRow[]} campaignType={CampaignType} todayKst={string} onSave?={SaveSeedingRecord} />` — editable when `onSave` is given, read-only otherwise. Task 8 renders it with no `onSave`.
  - A page at `/campaigns/[id]/seeding-sheet`.

`todayKst` is a prop rather than a `new Date()` inside the component so the server and the client agree on today's date (no hydration mismatch) and so the tests are deterministic.

- [ ] **Step 1: Write the failing test for the table**

`app/seeding-sheet/[token]/SeedingSheetTable.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { SeedingSheetRow } from "@/lib/seeding/sheetRow";
import SeedingSheetTable from "./SeedingSheetTable";

const TODAY = "2026-08-30";

function makeRow(overrides: Partial<SeedingSheetRow> = {}): SeedingSheetRow {
  return {
    id: "rec-1",
    name: "김인플",
    sns_url: "https://instagram.com/kiminflu",
    shipping_address: "서울시 강남구 테헤란로 1",
    visit_scheduled_at: null,
    visit_party_size: null,
    progress_stage: "가이드전달완료",
    upload_deadline: "2026-09-02",
    upload_url: null,
    view_count: null,
    engagement_count: null,
    updated_at: "2026-08-30T01:00:00Z",
    ...overrides,
  };
}

describe("SeedingSheetTable", () => {
  test("shows the D-day computed from the upload deadline", () => {
    render(
      <SeedingSheetTable rows={[makeRow()]} campaignType="shipping" todayKst={TODAY} onSave={vi.fn()} />
    );
    expect(screen.getByText("D-3")).toBeInTheDocument();
  });

  test("shows D-DAY today and D+n once overdue", () => {
    render(
      <SeedingSheetTable
        rows={[
          makeRow({ id: "a", name: "가나다", upload_deadline: "2026-08-30" }),
          makeRow({ id: "b", name: "라마바", upload_deadline: "2026-08-27" }),
        ]}
        campaignType="shipping"
        todayKst={TODAY}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByText("D-DAY")).toBeInTheDocument();
    expect(screen.getByText("D+3")).toBeInTheDocument();
  });

  test("a freshly selected 선정완료 row shows no deadline, no D-day and 0/4", () => {
    render(
      <SeedingSheetTable
        rows={[makeRow({ progress_stage: "선정완료", upload_deadline: null })]}
        campaignType="shipping"
        todayKst={TODAY}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.getByText("0/4")).toBeInTheDocument();
    expect(screen.getByLabelText("발송완료")).not.toBeChecked();
    expect(screen.getByLabelText("김인플 업로드 기한")).toHaveValue("");
  });

  test("uses the 제품배송형 column header and shows the shipping address", () => {
    render(
      <SeedingSheetTable rows={[makeRow()]} campaignType="shipping" todayKst={TODAY} onSave={vi.fn()} />
    );
    expect(screen.getByText("배송 주소")).toBeInTheDocument();
    expect(screen.getByText("서울시 강남구 테헤란로 1")).toBeInTheDocument();
  });

  test("uses the 현장방문형 column header and shows the visit schedule and party size", () => {
    render(
      <SeedingSheetTable
        rows={[
          makeRow({
            shipping_address: null,
            visit_scheduled_at: "2026-09-05T05:00:00Z",
            visit_party_size: 2,
            progress_stage: "확정완료",
          }),
        ]}
        campaignType="visit"
        todayKst={TODAY}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByText("방문 일정 / 인원")).toBeInTheDocument();
    expect(screen.getByText("2026-09-05 05:00 / 2명")).toBeInTheDocument();
  });

  test("saves a manually entered 조회수 and shows it immediately", async () => {
    const onSave = vi.fn().mockResolvedValue({ success: true });
    render(
      <SeedingSheetTable rows={[makeRow()]} campaignType="shipping" todayKst={TODAY} onSave={onSave} />
    );

    const field = screen.getByLabelText("김인플 조회수");
    fireEvent.change(field, { target: { value: "12000" } });

    expect(field).toHaveValue(12000);
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("rec-1", { view_count: 12000 });
    });
  });

  test("saves 인게이지먼트 and 업로드 링크", async () => {
    const onSave = vi.fn().mockResolvedValue({ success: true });
    render(
      <SeedingSheetTable rows={[makeRow()]} campaignType="shipping" todayKst={TODAY} onSave={onSave} />
    );

    fireEvent.change(screen.getByLabelText("김인플 인게이지먼트"), { target: { value: "340" } });
    fireEvent.change(screen.getByLabelText("김인플 업로드 링크"), {
      target: { value: "https://instagram.com/p/abc123" },
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("rec-1", { engagement_count: 340 });
      expect(onSave).toHaveBeenCalledWith("rec-1", {
        upload_url: "https://instagram.com/p/abc123",
      });
    });
  });

  test("recomputes the D-day when the deadline changes", async () => {
    const onSave = vi.fn().mockResolvedValue({ success: true });
    render(
      <SeedingSheetTable rows={[makeRow()]} campaignType="shipping" todayKst={TODAY} onSave={onSave} />
    );

    fireEvent.change(screen.getByLabelText("김인플 업로드 기한"), {
      target: { value: "2026-08-31" },
    });

    expect(screen.getByText("D-1")).toBeInTheDocument();
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("rec-1", { upload_deadline: "2026-08-31" });
    });
  });

  test("advances the stage through the checklist", async () => {
    const onSave = vi.fn().mockResolvedValue({ success: true });
    render(
      <SeedingSheetTable rows={[makeRow()]} campaignType="shipping" todayKst={TODAY} onSave={onSave} />
    );

    fireEvent.click(screen.getByLabelText("수령완료"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("rec-1", { progress_stage: "수령완료" });
    });
  });

  test("rewinds the stage to 선정완료 when the first step is unchecked", async () => {
    const onSave = vi.fn().mockResolvedValue({ success: true });
    render(
      <SeedingSheetTable
        rows={[makeRow({ progress_stage: "발송완료" })]}
        campaignType="shipping"
        todayKst={TODAY}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByLabelText("발송완료"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("rec-1", { progress_stage: "선정완료" });
    });
  });

  test("surfaces a save failure", async () => {
    const onSave = vi.fn().mockResolvedValue({ error: "저장에 실패했습니다. 다시 시도해주세요." });
    render(
      <SeedingSheetTable rows={[makeRow()]} campaignType="shipping" todayKst={TODAY} onSave={onSave} />
    );

    fireEvent.change(screen.getByLabelText("김인플 조회수"), { target: { value: "1" } });

    await waitFor(() => {
      expect(screen.getByText("저장에 실패했습니다. 다시 시도해주세요.")).toBeInTheDocument();
    });
  });

  test("without onSave it is read-only: no inputs, disabled checkboxes, values as text", () => {
    render(
      <SeedingSheetTable
        rows={[makeRow({ upload_url: "https://instagram.com/p/abc123", view_count: 12000 })]}
        campaignType="shipping"
        todayKst={TODAY}
      />
    );

    expect(screen.queryByLabelText("김인플 조회수")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("김인플 업로드 기한")).not.toBeInTheDocument();
    expect(screen.getByLabelText("수령완료")).toBeDisabled();
    expect(screen.getByText("12,000")).toBeInTheDocument();
    expect(screen.getByText("2026-09-02")).toBeInTheDocument();
  });

  test("shows an empty-state row when nobody is selected yet", () => {
    render(<SeedingSheetTable rows={[]} campaignType="shipping" todayKst={TODAY} onSave={vi.fn()} />);
    expect(screen.getByText("최종선정된 인플루언서가 아직 없습니다.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SeedingSheetTable`
Expected: FAIL — `Failed to resolve import "./SeedingSheetTable"`.

- [ ] **Step 3: Implement the table**

`app/seeding-sheet/[token]/SeedingSheetTable.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import StageChecklist from "./StageChecklist";
import { ddayToneClass, formatDday } from "@/lib/seeding/dday";
import type { CampaignType } from "@/lib/seeding/stages";
import type { SaveSeedingRecord, SeedingRecordPatch, SeedingSheetRow } from "@/lib/seeding/sheetRow";

const CELL = "px-3 py-3 align-top";
const INPUT = "rounded-token border border-border bg-surface2 px-2 py-1 text-sm text-text";

function formatCount(value: number | null): string {
  return value === null ? "-" : value.toLocaleString("ko-KR");
}

function formatVisit(row: SeedingSheetRow): string {
  const when = row.visit_scheduled_at
    ? row.visit_scheduled_at.replace("T", " ").slice(0, 16)
    : "-";
  const who = row.visit_party_size === null ? "-" : `${row.visit_party_size}명`;
  return `${when} / ${who}`;
}

export default function SeedingSheetTable({
  rows,
  campaignType,
  todayKst,
  onSave,
}: {
  rows: SeedingSheetRow[];
  campaignType: CampaignType;
  todayKst: string;
  onSave?: SaveSeedingRecord;
}) {
  const readOnly = !onSave;
  const [draft, setDraft] = useState<SeedingSheetRow[]>(rows);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // 낙관적 업데이트: paint the change first, then persist (spec: 별도 동시편집 잠금 불필요).
  function apply(recordId: string, patch: SeedingRecordPatch) {
    setDraft((prev) => prev.map((row) => (row.id === recordId ? { ...row, ...patch } : row)));
    if (!onSave) return;
    setError(null);
    startTransition(async () => {
      const result = await onSave(recordId, patch);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div className="rounded-token border border-border bg-surface">
      {error && <p className="border-b border-border px-4 py-2 text-sm text-critical">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-textMuted">
              <th className="px-3 py-2">이름</th>
              <th className="px-3 py-2">SNS</th>
              <th className="px-3 py-2">
                {campaignType === "shipping" ? "배송 주소" : "방문 일정 / 인원"}
              </th>
              <th className="px-3 py-2">진행 단계</th>
              <th className="px-3 py-2">업로드 기한</th>
              <th className="px-3 py-2">D-day</th>
              <th className="px-3 py-2">업로드 링크</th>
              <th className="px-3 py-2 text-right">조회수</th>
              <th className="px-3 py-2 text-right">인게이지먼트</th>
            </tr>
          </thead>
          <tbody>
            {draft.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-textMuted">
                  최종선정된 인플루언서가 아직 없습니다.
                </td>
              </tr>
            )}

            {draft.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className={`${CELL} text-text`}>{row.name}</td>
                <td className={CELL}>
                  {row.sns_url ? (
                    <a href={row.sns_url} className="text-accent underline" target="_blank" rel="noreferrer">
                      {row.sns_url}
                    </a>
                  ) : (
                    <span className="text-textMuted">-</span>
                  )}
                </td>
                <td className={`${CELL} text-textMuted`}>
                  {campaignType === "shipping" ? row.shipping_address ?? "-" : formatVisit(row)}
                </td>
                <td className={CELL}>
                  <StageChecklist
                    campaignType={campaignType}
                    progress_stage={row.progress_stage}
                    readOnly={readOnly}
                    onChange={(next) => apply(row.id, { progress_stage: next })}
                  />
                </td>
                <td className={CELL}>
                  {readOnly ? (
                    <span className="font-mono tabular-nums text-text">{row.upload_deadline ?? "-"}</span>
                  ) : (
                    <input
                      type="date"
                      aria-label={`${row.name} 업로드 기한`}
                      value={row.upload_deadline ?? ""}
                      onChange={(e) => apply(row.id, { upload_deadline: e.target.value || null })}
                      className={INPUT}
                    />
                  )}
                </td>
                <td
                  className={`${CELL} font-mono tabular-nums ${ddayToneClass(row.upload_deadline, todayKst)}`}
                >
                  {formatDday(row.upload_deadline, todayKst)}
                </td>
                <td className={CELL}>
                  {readOnly ? (
                    row.upload_url ? (
                      <a href={row.upload_url} className="text-accent underline" target="_blank" rel="noreferrer">
                        {row.upload_url}
                      </a>
                    ) : (
                      <span className="text-textMuted">-</span>
                    )
                  ) : (
                    <input
                      type="url"
                      aria-label={`${row.name} 업로드 링크`}
                      value={row.upload_url ?? ""}
                      placeholder="https://"
                      onChange={(e) => apply(row.id, { upload_url: e.target.value || null })}
                      className={`${INPUT} w-56`}
                    />
                  )}
                </td>
                <td className={`${CELL} text-right`}>
                  {readOnly ? (
                    <span className="font-mono tabular-nums text-text">{formatCount(row.view_count)}</span>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      aria-label={`${row.name} 조회수`}
                      value={row.view_count ?? ""}
                      onChange={(e) =>
                        apply(row.id, {
                          view_count: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className={`${INPUT} w-28 text-right font-mono tabular-nums`}
                    />
                  )}
                </td>
                <td className={`${CELL} text-right`}>
                  {readOnly ? (
                    <span className="font-mono tabular-nums text-text">
                      {formatCount(row.engagement_count)}
                    </span>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      aria-label={`${row.name} 인게이지먼트`}
                      value={row.engagement_count ?? ""}
                      onChange={(e) =>
                        apply(row.id, {
                          engagement_count: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className={`${INPUT} w-28 text-right font-mono tabular-nums`}
                    />
                  )}
                </td>
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

Run: `npm test -- SeedingSheetTable`
Expected: PASS

- [ ] **Step 5: Write the failing test for the internal page**

`app/(dashboard)/campaigns/[id]/seeding-sheet/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/roles", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("./actions", () => ({ updateSeedingRecord: vi.fn() }));

import { requireRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import SeedingSheetPage from "./page";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

const CAMPAIGN = {
  id: "camp-1",
  name: "글로우랩 세럼",
  company_name: "글로우랩",
  campaign_type: "shipping",
  seeding_sheet_token: "tok-123",
};

function mockSupabase(campaign: Record<string, unknown> | null, sheet: unknown = null) {
  mocked(createServerSupabaseClient).mockResolvedValue({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: campaign }) }) }),
    }),
    rpc: async () => ({ data: sheet }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked(requireRole).mockResolvedValue({ id: "u1", role: "staff", full_name: "담당자" });
});

describe("SeedingSheetPage", () => {
  test("renders the campaign header and its freshly selected 선정완료 row", async () => {
    mockSupabase(CAMPAIGN, {
      campaign_type: "shipping",
      rows: [
        {
          id: "rec-1",
          name: "김인플",
          sns_url: "https://instagram.com/kiminflu",
          shipping_address: "서울시 강남구 테헤란로 1",
          visit_scheduled_at: null,
          visit_party_size: null,
          progress_stage: "선정완료",
          upload_deadline: null,
          upload_url: null,
          view_count: null,
          engagement_count: null,
          updated_at: "2026-08-30T01:00:00Z",
        },
      ],
    });

    render(await SeedingSheetPage({ params: Promise.resolve({ id: "camp-1" }) }));

    expect(screen.getByText("글로우랩 세럼 관리시트")).toBeInTheDocument();
    expect(screen.getByText("글로우랩 · 최종선정 1명")).toBeInTheDocument();
    expect(screen.getByText("김인플")).toBeInTheDocument();
    expect(screen.getByText("0/4")).toBeInTheDocument();
    expect(screen.getByLabelText("김인플 조회수")).toBeInTheDocument();
  });

  test("requires a signed-in staff member", async () => {
    mockSupabase(CAMPAIGN, { campaign_type: "shipping", rows: [] });

    await SeedingSheetPage({ params: Promise.resolve({ id: "camp-1" }) });

    expect(requireRole).toHaveBeenCalledWith("staff");
  });

  test("calls notFound when the campaign does not exist", async () => {
    mockSupabase(null);

    await expect(
      SeedingSheetPage({ params: Promise.resolve({ id: "missing" }) })
    ).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- "campaigns/\[id\]/seeding-sheet/page"`
Expected: FAIL — `Failed to resolve import "./page"`.

- [ ] **Step 7: Implement the internal page**

`app/(dashboard)/campaigns/[id]/seeding-sheet/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import SeedingSheetTable from "@/app/seeding-sheet/[token]/SeedingSheetTable";
import { toKstDateString } from "@/lib/seeding/dday";
import type { CampaignType } from "@/lib/seeding/stages";
import type { SeedingSheetRow } from "@/lib/seeding/sheetRow";
import { updateSeedingRecord } from "./actions";

export default async function SeedingSheetPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("staff");

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, company_name, campaign_type, seeding_sheet_token")
    .eq("id", id)
    .single();

  if (!campaign) notFound();

  // Same RPC the public share page and the export route use — one read path to audit.
  const { data: sheet } = await supabase.rpc("get_seeding_sheet", {
    p_token: campaign.seeding_sheet_token,
  });

  const campaignType = campaign.campaign_type as CampaignType;
  const rows = (sheet?.rows ?? []) as SeedingSheetRow[];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-text">{campaign.name} 관리시트</h1>
      <p className="mb-6 text-textMuted">
        {campaign.company_name} · 최종선정 {rows.length}명
      </p>

      <SeedingSheetTable
        rows={rows}
        campaignType={campaignType}
        todayKst={toKstDateString(new Date())}
        onSave={updateSeedingRecord.bind(null, campaign.id, campaignType)}
      />
    </div>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- "campaigns/\[id\]/seeding-sheet/page"`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add "app/seeding-sheet/[token]/SeedingSheetTable.tsx" "app/seeding-sheet/[token]/SeedingSheetTable.test.tsx" "app/(dashboard)/campaigns/[id]/seeding-sheet/page.tsx" "app/(dashboard)/campaigns/[id]/seeding-sheet/page.test.tsx"
git commit -m "feat: add editable seeding management sheet with D-day tracking" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: Public Read-Only Share Page

**Files:**
- Create: `app/seeding-sheet/[token]/page.tsx`
- Test: `app/seeding-sheet/[token]/page.test.tsx`

**Interfaces:**
- Consumes: `get_seeding_sheet` RPC (Task 4), `SeedingSheetTable` (Task 7), `toKstDateString` (Task 2), `SeedingSheetRow` (Task 5).
- Produces: the public route `/seeding-sheet/[token]`. It renders `SeedingSheetTable` **without** `onSave`, which is the mechanism that makes it 조회 전용 — there is no write path in this module's import graph at all.

- [ ] **Step 1: Write the failing test**

`app/seeding-sheet/[token]/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import PublicSeedingSheetPage from "./page";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

const SHEET = {
  campaign_name: "글로우랩 세럼",
  company_name: "글로우랩",
  campaign_type: "shipping",
  rows: [
    {
      id: "rec-1",
      name: "김인플",
      sns_url: "https://instagram.com/kiminflu",
      shipping_address: "서울시 강남구 테헤란로 1",
      visit_scheduled_at: null,
      visit_party_size: null,
      progress_stage: "수령완료",
      upload_deadline: "2026-09-02",
      upload_url: "https://instagram.com/p/abc123",
      view_count: 12000,
      engagement_count: 340,
      updated_at: "2026-08-30T01:00:00Z",
    },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe("PublicSeedingSheetPage", () => {
  test("renders the sheet for a valid token", async () => {
    mocked(createServerSupabaseClient).mockResolvedValue({ rpc: async () => ({ data: SHEET }) });

    render(await PublicSeedingSheetPage({ params: Promise.resolve({ token: "tok-123" }) }));

    expect(screen.getByText("글로우랩 관리시트")).toBeInTheDocument();
    expect(screen.getByText("글로우랩 세럼 · 조회 전용")).toBeInTheDocument();
    expect(screen.getByText("김인플")).toBeInTheDocument();
    expect(screen.getByText("12,000")).toBeInTheDocument();
    expect(screen.getByText("3/4")).toBeInTheDocument();
  });

  test("is read-only: no editable fields and no enabled checkboxes", async () => {
    mocked(createServerSupabaseClient).mockResolvedValue({ rpc: async () => ({ data: SHEET }) });

    render(await PublicSeedingSheetPage({ params: Promise.resolve({ token: "tok-123" }) }));

    expect(screen.queryByLabelText("김인플 조회수")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("김인플 업로드 기한")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("김인플 업로드 링크")).not.toBeInTheDocument();
    expect(screen.getByLabelText("업로드완료")).toBeDisabled();
  });

  test("calls notFound for an unknown token", async () => {
    mocked(createServerSupabaseClient).mockResolvedValue({ rpc: async () => ({ data: null }) });

    await expect(
      PublicSeedingSheetPage({ params: Promise.resolve({ token: "nope" }) })
    ).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "app/seeding-sheet/\[token\]/page"`
Expected: FAIL — `Failed to resolve import "./page"`.

- [ ] **Step 3: Implement the page**

`app/seeding-sheet/[token]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import SeedingSheetTable from "./SeedingSheetTable";
import { toKstDateString } from "@/lib/seeding/dday";
import type { CampaignType } from "@/lib/seeding/stages";
import type { SeedingSheetRow } from "@/lib/seeding/sheetRow";

type Sheet = {
  campaign_name: string;
  company_name: string;
  campaign_type: CampaignType;
  rows: SeedingSheetRow[];
};

export default async function PublicSeedingSheetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createServerSupabaseClient();

  // No table access for anon: the token-scoped RPC is the whole read surface,
  // and no write path is imported here — the page is 조회 전용 by construction.
  const { data } = await supabase.rpc("get_seeding_sheet", { p_token: token });

  if (!data) notFound();

  const sheet = data as Sheet;

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="mb-1 text-2xl font-bold text-text">{sheet.company_name} 관리시트</h1>
      <p className="mb-8 text-textMuted">{sheet.campaign_name} · 조회 전용</p>

      <SeedingSheetTable
        rows={sheet.rows}
        campaignType={sheet.campaign_type}
        todayKst={toKstDateString(new Date())}
      />

      <p className="mt-6 text-sm text-textMuted">
        내용 수정이 필요하시면 담당 에이전시에 알려주세요.
      </p>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- "app/seeding-sheet/\[token\]/page"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/seeding-sheet/[token]/page.tsx" "app/seeding-sheet/[token]/page.test.tsx"
git commit -m "feat: add read-only seeding sheet share page at /seeding-sheet/[token]" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 9: CSV Export

**Files:**
- Create: `lib/export/csv.ts`
- Test: `lib/export/csv.test.ts`
- Create: `lib/seeding/sheetCsv.ts`
- Test: `lib/seeding/sheetCsv.test.ts`
- Create: `app/(dashboard)/campaigns/[id]/seeding-sheet/export/route.ts`
- Test: `app/(dashboard)/campaigns/[id]/seeding-sheet/export/route.test.ts`
- Modify: `app/(dashboard)/campaigns/[id]/seeding-sheet/page.tsx` (add the 내보내기 link)

**Interfaces:**
- Consumes: `formatDday` (Task 2), `SeedingSheetRow` (Task 5), `CampaignType` (Task 1), `get_seeding_sheet` (Task 4), `getCurrentProfile`.
- Produces:
  - `type CsvColumn<T> = { header: string; value: (row: T) => string | number | null }`
  - `toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string` — RFC-4180 quoting, CRLF line endings
  - `withBom(csv: string): string` — prefixes `﻿` so Excel reads the file as UTF-8
  - `seedingSheetColumns(campaignType: CampaignType, todayKst: string): CsvColumn<SeedingSheetRow>[]`
  - `toSeedingSheetCsv(rows: SeedingSheetRow[], campaignType: CampaignType, todayKst: string): string`
  - `GET` route handler at `/campaigns/[id]/seeding-sheet/export`

**No new dependency.** See "CSV, not .xlsx" in the resolved-ambiguities list. `lib/export/csv.ts` is deliberately generic so Plan 3's 지원자 리스트 export can reuse it.

- [ ] **Step 1: Write the failing test for the generic CSV writer**

`lib/export/csv.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { toCsv, withBom, type CsvColumn } from "./csv";

type Row = { name: string; note: string | null; count: number | null };

const columns: CsvColumn<Row>[] = [
  { header: "이름", value: (r) => r.name },
  { header: "메모", value: (r) => r.note },
  { header: "수치", value: (r) => r.count },
];

describe("toCsv", () => {
  test("writes a header row followed by one line per row, CRLF separated", () => {
    const csv = toCsv([{ name: "김인플", note: "확인", count: 3 }], columns);
    expect(csv).toBe("이름,메모,수치\r\n김인플,확인,3");
  });

  test("writes only the header for an empty row list", () => {
    expect(toCsv([], columns)).toBe("이름,메모,수치");
  });

  test("renders null as an empty cell", () => {
    const csv = toCsv([{ name: "김인플", note: null, count: null }], columns);
    expect(csv).toBe("이름,메모,수치\r\n김인플,,");
  });

  test("quotes cells containing a comma", () => {
    const csv = toCsv([{ name: "김, 인플", note: null, count: null }], columns);
    expect(csv).toBe('이름,메모,수치\r\n"김, 인플",,');
  });

  test("doubles embedded quotes", () => {
    const csv = toCsv([{ name: '김"인플"', note: null, count: null }], columns);
    expect(csv).toBe('이름,메모,수치\r\n"김""인플""",,');
  });

  test("quotes cells containing a newline", () => {
    const csv = toCsv([{ name: "김인플", note: "1층\n201호", count: null }], columns);
    expect(csv).toBe('이름,메모,수치\r\n김인플,"1층\n201호",');
  });
});

describe("withBom", () => {
  test("prefixes the UTF-8 BOM so Excel does not mangle Korean text", () => {
    expect(withBom("이름")).toBe("﻿이름");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/export/csv`
Expected: FAIL — `Failed to resolve import "./csv"`.

- [ ] **Step 3: Implement the generic CSV writer**

`lib/export/csv.ts`:

```ts
export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | null;
};

function escapeCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC-4180 CSV: header row plus one line per row, CRLF separated. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((column) => escapeCell(column.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(column.value(row))).join(","));
  }
  return lines.join("\r\n");
}

/** Excel only reads a CSV as UTF-8 when it starts with a BOM; without it Korean text is mojibake. */
export function withBom(csv: string): string {
  return `﻿${csv}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/export/csv`
Expected: PASS

- [ ] **Step 5: Write the failing test for the sheet columns**

`lib/seeding/sheetCsv.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { SeedingSheetRow } from "./sheetRow";
import { seedingSheetColumns, toSeedingSheetCsv } from "./sheetCsv";

const TODAY = "2026-08-30";

function makeRow(overrides: Partial<SeedingSheetRow> = {}): SeedingSheetRow {
  return {
    id: "rec-1",
    name: "김인플",
    sns_url: "https://instagram.com/kiminflu",
    shipping_address: "서울시 강남구 테헤란로 1",
    visit_scheduled_at: null,
    visit_party_size: null,
    progress_stage: "수령완료",
    upload_deadline: "2026-09-02",
    upload_url: "https://instagram.com/p/abc123",
    view_count: 12000,
    engagement_count: 340,
    updated_at: "2026-08-30T01:00:00Z",
    ...overrides,
  };
}

describe("seedingSheetColumns", () => {
  test("제품배송형 has a 배송 주소 column and no 방문 columns", () => {
    const headers = seedingSheetColumns("shipping", TODAY).map((c) => c.header);
    expect(headers).toEqual([
      "이름",
      "SNS 링크",
      "배송 주소",
      "진행 단계",
      "업로드 기한",
      "D-day",
      "업로드 링크",
      "조회수",
      "인게이지먼트",
    ]);
  });

  test("현장방문형 has 방문 일정 and 방문 인원 columns and no 배송 주소", () => {
    const headers = seedingSheetColumns("visit", TODAY).map((c) => c.header);
    expect(headers).toEqual([
      "이름",
      "SNS 링크",
      "방문 일정",
      "방문 인원",
      "진행 단계",
      "업로드 기한",
      "D-day",
      "업로드 링크",
      "조회수",
      "인게이지먼트",
    ]);
  });
});

describe("toSeedingSheetCsv", () => {
  test("starts with a BOM and includes the computed D-day", () => {
    const csv = toSeedingSheetCsv([makeRow()], "shipping", TODAY);

    expect(csv.startsWith("﻿")).toBe(true);
    const [header, row] = csv.slice(1).split("\r\n");
    expect(header).toBe("이름,SNS 링크,배송 주소,진행 단계,업로드 기한,D-day,업로드 링크,조회수,인게이지먼트");
    expect(row).toBe(
      "김인플,https://instagram.com/kiminflu,서울시 강남구 테헤란로 1,수령완료,2026-09-02,D-3,https://instagram.com/p/abc123,12000,340"
    );
  });

  test("a freshly selected row exports 선정완료 with empty 수치 cells and a dash D-day", () => {
    const csv = toSeedingSheetCsv(
      [
        makeRow({
          progress_stage: "선정완료",
          upload_deadline: null,
          upload_url: null,
          view_count: null,
          engagement_count: null,
        }),
      ],
      "shipping",
      TODAY
    );

    const row = csv.slice(1).split("\r\n")[1];
    expect(row).toBe("김인플,https://instagram.com/kiminflu,서울시 강남구 테헤란로 1,선정완료,,-,,,");
  });

  test("현장방문형 writes the visit schedule and party size", () => {
    const csv = toSeedingSheetCsv(
      [
        makeRow({
          shipping_address: null,
          visit_scheduled_at: "2026-09-05T05:00:00Z",
          visit_party_size: 2,
          progress_stage: "방문완료",
        }),
      ],
      "visit",
      TODAY
    );

    const row = csv.slice(1).split("\r\n")[1];
    expect(row).toContain("2026-09-05 05:00,2,방문완료");
  });

  test("exports only the header row when nobody is selected yet", () => {
    const csv = toSeedingSheetCsv([], "shipping", TODAY);
    expect(csv.slice(1).split("\r\n")).toHaveLength(1);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- lib/seeding/sheetCsv`
Expected: FAIL — `Failed to resolve import "./sheetCsv"`.

- [ ] **Step 7: Implement the sheet columns**

`lib/seeding/sheetCsv.ts`:

```ts
import { toCsv, withBom, type CsvColumn } from "@/lib/export/csv";
import { formatDday } from "./dday";
import type { SeedingSheetRow } from "./sheetRow";
import type { CampaignType } from "./stages";

function visitSchedule(row: SeedingSheetRow): string | null {
  return row.visit_scheduled_at ? row.visit_scheduled_at.replace("T", " ").slice(0, 16) : null;
}

export function seedingSheetColumns(
  campaignType: CampaignType,
  todayKst: string
): CsvColumn<SeedingSheetRow>[] {
  const typeColumns: CsvColumn<SeedingSheetRow>[] =
    campaignType === "shipping"
      ? [{ header: "배송 주소", value: (row) => row.shipping_address }]
      : [
          { header: "방문 일정", value: visitSchedule },
          { header: "방문 인원", value: (row) => row.visit_party_size },
        ];

  return [
    { header: "이름", value: (row) => row.name },
    { header: "SNS 링크", value: (row) => row.sns_url },
    ...typeColumns,
    { header: "진행 단계", value: (row) => row.progress_stage },
    { header: "업로드 기한", value: (row) => row.upload_deadline },
    { header: "D-day", value: (row) => formatDday(row.upload_deadline, todayKst) },
    { header: "업로드 링크", value: (row) => row.upload_url },
    { header: "조회수", value: (row) => row.view_count },
    { header: "인게이지먼트", value: (row) => row.engagement_count },
  ];
}

/** UTF-8 CSV with a BOM — opens directly in Excel with Korean text intact. */
export function toSeedingSheetCsv(
  rows: SeedingSheetRow[],
  campaignType: CampaignType,
  todayKst: string
): string {
  return withBom(toCsv(rows, seedingSheetColumns(campaignType, todayKst)));
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- lib/seeding/sheetCsv`
Expected: PASS

- [ ] **Step 9: Write the failing test for the download route**

`app/(dashboard)/campaigns/[id]/seeding-sheet/export/route.test.ts`:

```ts
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/roles", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { getCurrentProfile } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { GET } from "./route";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

const ROW = {
  id: "rec-1",
  name: "김인플",
  sns_url: "https://instagram.com/kiminflu",
  shipping_address: "서울시 강남구 테헤란로 1",
  visit_scheduled_at: null,
  visit_party_size: null,
  progress_stage: "수령완료",
  upload_deadline: "2026-09-02",
  upload_url: "https://instagram.com/p/abc123",
  view_count: 12000,
  engagement_count: 340,
  updated_at: "2026-08-30T01:00:00Z",
};

function mockSupabase(campaign: Record<string, unknown> | null, sheet: unknown = null) {
  mocked(createServerSupabaseClient).mockResolvedValue({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: campaign }) }) }) }),
    rpc: async () => ({ data: sheet }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked(getCurrentProfile).mockResolvedValue({ id: "u1", role: "staff", full_name: "담당자" });
});

describe("GET /campaigns/[id]/seeding-sheet/export", () => {
  test("returns 401 when nobody is signed in", async () => {
    mocked(getCurrentProfile).mockResolvedValue(null);

    const response = await GET(new Request("http://test/export"), {
      params: Promise.resolve({ id: "camp-1" }),
    });

    expect(response.status).toBe(401);
  });

  test("returns 404 for an unknown campaign", async () => {
    mockSupabase(null);

    const response = await GET(new Request("http://test/export"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
  });

  test("returns a BOM-prefixed CSV attachment named after the campaign", async () => {
    mockSupabase(
      { name: "글로우랩 세럼", campaign_type: "shipping", seeding_sheet_token: "tok-123" },
      { rows: [ROW] }
    );

    const response = await GET(new Request("http://test/export"), {
      params: Promise.resolve({ id: "camp-1" }),
    });
    const body = await response.text();

    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(response.headers.get("Content-Disposition")).toContain(
      encodeURIComponent("글로우랩 세럼-관리시트.csv")
    );
    expect(body.startsWith("﻿")).toBe(true);
    expect(body).toContain("이름,SNS 링크,배송 주소,진행 단계");
    expect(body).toContain("김인플");
    expect(body).toContain("수령완료");
    expect(body).toContain("12000");
  });

  test("exports a header-only CSV when nobody is selected yet", async () => {
    mockSupabase(
      { name: "빈 캠페인", campaign_type: "visit", seeding_sheet_token: "tok-456" },
      { rows: [] }
    );

    const response = await GET(new Request("http://test/export"), {
      params: Promise.resolve({ id: "camp-2" }),
    });
    const body = await response.text();

    expect(body.slice(1).split("\r\n")).toHaveLength(1);
    expect(body).toContain("방문 일정,방문 인원");
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npm test -- "seeding-sheet/export/route"`
Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 11: Implement the download route**

`app/(dashboard)/campaigns/[id]/seeding-sheet/export/route.ts`:

```ts
import { getCurrentProfile } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { toKstDateString } from "@/lib/seeding/dday";
import { toSeedingSheetCsv } from "@/lib/seeding/sheetCsv";
import type { SeedingSheetRow } from "@/lib/seeding/sheetRow";
import type { CampaignType } from "@/lib/seeding/stages";

// The CSV is built entirely on the server so no sheet data has to reach the browser
// as JSON first, and so the auth gate is the same one the dashboard uses.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("UNAUTHORIZED", { status: 401 });

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("name, campaign_type, seeding_sheet_token")
    .eq("id", id)
    .single();

  if (!campaign) return new Response("NOT_FOUND", { status: 404 });

  const { data: sheet } = await supabase.rpc("get_seeding_sheet", {
    p_token: campaign.seeding_sheet_token,
  });

  const rows = (sheet?.rows ?? []) as SeedingSheetRow[];
  const csv = toSeedingSheetCsv(
    rows,
    campaign.campaign_type as CampaignType,
    toKstDateString(new Date())
  );
  const filename = `${campaign.name}-관리시트.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npm test -- "seeding-sheet/export/route"`
Expected: PASS

- [ ] **Step 13: Add the 내보내기 link to the internal sheet page**

In `app/(dashboard)/campaigns/[id]/seeding-sheet/page.tsx`, replace the header block

```tsx
      <h1 className="mb-1 text-2xl font-bold text-text">{campaign.name} 관리시트</h1>
      <p className="mb-6 text-textMuted">
        {campaign.company_name} · 최종선정 {rows.length}명
      </p>
```

with

```tsx
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-text">{campaign.name} 관리시트</h1>
          <p className="text-textMuted">
            {campaign.company_name} · 최종선정 {rows.length}명
          </p>
        </div>
        <a
          href={`/campaigns/${campaign.id}/seeding-sheet/export`}
          className="shrink-0 rounded-token border border-border px-4 py-2 text-sm text-text"
        >
          Excel/CSV 내보내기
        </a>
      </div>
```

(The "보고서 생성" button belongs beside this one, but Plan 6 owns it — do not add it here.)

- [ ] **Step 14: Run the sheet page test to confirm nothing regressed**

Run: `npm test -- "campaigns/\[id\]/seeding-sheet"`
Expected: PASS

- [ ] **Step 15: Commit**

```bash
git add lib/export "lib/seeding/sheetCsv.ts" "lib/seeding/sheetCsv.test.ts" "app/(dashboard)/campaigns/[id]/seeding-sheet"
git commit -m "feat: add server-side CSV export for the seeding management sheet" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 10: Entry Points on the Campaign Detail Page

**Files:**
- Modify: `app/(dashboard)/campaigns/[id]/page.tsx`
- Test: `app/(dashboard)/campaigns/[id]/page.test.tsx` (create — the file currently has no test)

> **SHARED-FILE WARNING:** `app/(dashboard)/campaigns/[id]/page.tsx` is also touched by Plan 3 (지원자 리스트 entry point) and Plan 4 (최종선정 flow, already merged). Expect a merge conflict in the JSX and in the `.select(...)` column list. Resolve by keeping **every** section and unioning the selected columns — the sections are independent `<section>` blocks. Plan 6 will add a "보고서 생성" button to the 관리시트 section later; leave room for it but do not add it.

**Interfaces:**
- Consumes: the `/campaigns/[id]/seeding-sheet` route (Task 7), the `/seeding-sheet/[token]` route (Task 8), the export route (Task 9), `campaigns.seeding_sheet_token`.
- Produces: no new module — this makes the three surfaces reachable. Without it they are dead UI.

- [ ] **Step 1: Write the failing test**

`app/(dashboard)/campaigns/[id]/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import CampaignDetailPage from "./page";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocked(createServerSupabaseClient).mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: "camp-1",
              name: "글로우랩 세럼",
              company_name: "글로우랩",
              campaign_type: "shipping",
              status: "active",
              pre_survey_token: "pre-tok",
              seeding_sheet_token: "sheet-tok",
            },
          }),
        }),
      }),
    }),
  });
});

describe("CampaignDetailPage 관리시트 section", () => {
  test("links to the internal 관리시트", async () => {
    render(await CampaignDetailPage({ params: Promise.resolve({ id: "camp-1" }) }));

    expect(screen.getByRole("link", { name: "관리시트 열기" })).toHaveAttribute(
      "href",
      "/campaigns/camp-1/seeding-sheet"
    );
  });

  test("shows the read-only share link for the client company", async () => {
    render(await CampaignDetailPage({ params: Promise.resolve({ id: "camp-1" }) }));

    expect(screen.getByText("/seeding-sheet/sheet-tok")).toBeInTheDocument();
    expect(screen.getByText("업체 공유 링크 (조회 전용)")).toBeInTheDocument();
  });

  test("does not leak the share token into the internal link", async () => {
    render(await CampaignDetailPage({ params: Promise.resolve({ id: "camp-1" }) }));

    expect(screen.getByRole("link", { name: "관리시트 열기" }).getAttribute("href")).not.toContain(
      "sheet-tok"
    );
  });

  test("keeps the existing 사전조사 section", async () => {
    render(await CampaignDetailPage({ params: Promise.resolve({ id: "camp-1" }) }));

    expect(screen.getByText("사전조사")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "에이전시가 대신 작성" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "campaigns/\[id\]/page"`
Expected: FAIL — no link named "관리시트 열기"; `seeding_sheet_token` is not selected.

- [ ] **Step 3: Add `seeding_sheet_token` to the query**

In `app/(dashboard)/campaigns/[id]/page.tsx`, change:

```tsx
    .select("id, name, company_name, campaign_type, status, pre_survey_token")
```

to:

```tsx
    .select("id, name, company_name, campaign_type, status, pre_survey_token, seeding_sheet_token")
```

(If Plan 3 or Plan 4 has already added columns here, union them rather than replacing the list.)

- [ ] **Step 4: Add the 관리시트 section**

In the same file, insert this `<section>` immediately after the existing 사전조사 `</section>`:

```tsx
      <section className="mt-6 max-w-2xl rounded-token border border-border bg-surface p-6">
        <h2 className="mb-1 text-lg font-bold text-text">관리시트</h2>
        <p className="mb-4 text-sm text-textMuted">
          최종선정된 인플루언서의 진행 단계와 업로드 성과를 관리합니다. 업체에는 조회 전용 링크로
          공유됩니다.
        </p>

        <div className="mb-4">
          <p className="mb-1 text-xs text-textMuted">업체 공유 링크 (조회 전용)</p>
          <code className="block overflow-x-auto rounded-token border border-border px-3 py-2 text-sm text-text">
            /seeding-sheet/{campaign.seeding_sheet_token}
          </code>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/campaigns/${campaign.id}/seeding-sheet`}
            className="inline-block rounded-token bg-accent px-4 py-2 text-sm font-medium text-onAccent"
          >
            관리시트 열기
          </Link>
          <a
            href={`/campaigns/${campaign.id}/seeding-sheet/export`}
            className="inline-block rounded-token border border-border px-4 py-2 text-sm text-text"
          >
            Excel/CSV 내보내기
          </a>
        </div>
      </section>
```

`Link` is already imported at the top of this file. The export link is a plain `<a>` on purpose: `next/link` would try to client-navigate to a route that returns a file download.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- "campaigns/\[id\]/page"`
Expected: PASS

- [ ] **Step 6: Run the whole suite and the type check**

Run: `npm test`
Run: `npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/campaigns/[id]/page.tsx" "app/(dashboard)/campaigns/[id]/page.test.tsx"
git commit -m "feat: link the seeding management sheet from the campaign detail page" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

**1. Spec coverage** — every clause of 핵심 화면/플로우 4번 maps to a task:

| Spec requirement | Task |
|---|---|
| "유형별 진행단계 체크리스트를 담당자가 갱신" — 제품배송형 4단계 | Tasks 1, 6, 7 (`SHIPPING_STAGES`, `checklistStagesFor`, `StageChecklist`) |
| 현장방문형 4단계 (다른 허용값) | Tasks 1, 6, 7 (`VISIT_STAGES`); server-side enforced in Task 5 |
| "업로드 기한 입력 시 D-day 자동 계산" | Task 2 (pure functions, unit tests incl. today / 지난 기한 / month, year, leap boundaries), rendered in Task 7 |
| "업로드 링크/조회수/인게이지먼트는 수동 입력" | Tasks 5, 7 (manual inputs; no SNS API anywhere — spec 제외 범위 honoured) |
| "별도 공유 페이지(`/seeding-sheet/[token]`)… 조회 전용" | Tasks 4, 8 (RPC + read-only page; no write path in that import graph) |
| `campaigns.seeding_sheet_token` 사용 | Tasks 4, 8, 9, 10 |
| "관리시트도 Excel/CSV로 내보내기 가능" | Task 9 (server-side, BOM'd UTF-8 CSV) |
| "`reserved` 상태는… 관리시트에는 포함되지 않는다" | Task 4 (`a.status = 'selected'` filter, with a regression test) |
| "낙관적 업데이트로 충분" | Task 7 (`apply()` paints first, persists in a transition) |
| "D-day와 진행률은 항상 tabular-nums" | Tasks 6, 7 (`font-mono tabular-nums`) |
| 공개 라우트는 토큰으로만 접근 제어 | Task 4 (`SECURITY DEFINER` + `revoke`/`grant`, mirroring 0005) |

Deliberately absent, owned elsewhere: the "보고서 생성" button (Plan 6), `seeding_records` creation and 배송/방문 정보 입력 at 최종선정 (Plan 4), the applicant list (Plan 3).

**2. Conformance to Plan 4's shipped `seeding_records` (migration 0009)** — checked column by column:

| 0009 column | Where this plan touches it | Conformant? |
|---|---|---|
| `progress_stage text not null default '선정완료'` | `SeedingSheetRow.progress_stage: string` (non-nullable), `SeedingRecordPatch.progress_stage?: SeedingStage` (no null member), RPC JSON key, `StageChecklist` prop, CSV column, all fixtures | yes — no `null` is ever written or typed |
| the 5-value-per-type check constraint | `SHIPPING_STAGES`/`VISIT_STAGES` quote all five values including `선정완료`; `isStageAllowed` accepts `선정완료` on both types | yes — the action's validation is a strict mirror, so it never rejects a value the DB accepts |
| `visit_party_size integer check (> 0)` | row type, RPC JSON key, `formatVisit`, CSV column, fixtures | yes |
| `campaign_type text not null` (no default) | every test insert into `seeding_records` supplies it | yes |
| `shipping_address`, `visit_scheduled_at`, `upload_deadline`, `upload_url`, `view_count`, `engagement_count` | unchanged from the original draft | yes — these already matched |
| `applicant_id … unique`, `created_at` | not written by this plan | n/a |
| the table itself | migration 0011 adds only a trigger, an index, and guarded policies | yes — no `alter table` on 0009's columns or constraints |

**3. Placeholder scan** — no TBD/TODO/"handle edge cases"; every code step contains runnable code, and every test step contains real assertions. The instruction-style steps (Task 9 Step 13, Task 10 Steps 3–4) show the exact before/after text rather than describing it.

**4. Type consistency** — `CampaignType` (Task 1) is the single campaign-type union used by Tasks 4–10. `SeedingStage` (all five stored values) is what `SeedingRecordPatch.progress_stage` (Task 5) and `StageChecklist.onChange` (Task 6) carry; `ChecklistStage` (the four rendered steps) is what `checklistStagesFor`, `isStageDone`, and `toggleStage`'s third parameter take. `SeedingSheetRow` (Task 5) matches the `json_build_object` key list in the Task 4 RPC field-for-field — including `progress_stage` and `visit_party_size` — and is the row type in Tasks 7, 8, 9. `SaveSeedingRecord` (Task 5) is exactly the shape of `updateSeedingRecord.bind(null, campaignId, campaignType)`, which is why `updateSeedingRecord`'s parameters are ordered `(campaignId, campaignType, recordId, patch)`. `toKstDateString`/`formatDday`/`ddayToneClass` (Task 2) keep the same names in Tasks 7, 8, 9. `toCsv`/`withBom`/`CsvColumn` (Task 9) are used only within Task 9.

**5. Migration budget** — 0011 and 0012 only, as reserved. Plan 4's 0009 is read and conformed to, never edited. No other migration number appears anywhere in this plan.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-30-seeding-management-sheet.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
