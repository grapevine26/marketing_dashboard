# Overview Calendar (서브 프로젝트 D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-line `/` scaffold with the unified overview screen: an 임박·지연 alert list plus a month calendar aggregating deadlines from seeding (A), events (B), and SNS contents (C), read-only, with per-source failure isolation.

**Architecture:** Pure server-side rendering. `lib/overview/sources.ts` holds four independent fetchers (one per query: seeding deadlines, events, event checklist items, SNS contents), each returning a success/failure discriminated union so a missing table or DB error never masquerades as "no data". `lib/overview/calendar.ts` holds pure date functions (month grid, month param parsing/navigation, due-soon/overdue partition) that operate on KST date strings only. `app/(dashboard)/page.tsx` is a server component that reads `?month=yyyy-mm`, runs the fetchers, and renders the banner, alert list, and grid — no client components, no `useState`, month navigation via plain `<Link href="/?month=...">`.

**Tech Stack:** Next.js App Router (server components), Supabase (`@supabase/supabase-js` via the existing dashboard client), Tailwind v4 token classes, Vitest + React Testing Library. **No new npm dependencies.**

**Spec:** [docs/superpowers/specs/2026-09-01-overview-calendar-design.md](../specs/2026-09-01-overview-calendar-design.md)

**Execution order — D lands LAST.** The B plan (`2026-09-01-event-management.md`, tables `events` / `event_checklist_items`) and the C plan (`2026-09-01-sns-operation.md`, table `sns_contents`) are implemented before this plan. Execute this plan only after both have landed. That said, every fetcher here is required to keep working even when those tables are absent (returning `{ ok: false }` on `relation does not exist`), so nothing in this plan hard-depends on their schema being live — see Task 2.

## Global Constraints

These are repo-wide conventions from STATUS.md ("코드 규약") and the spec. Every task's requirements implicitly include this section.

- **Two Supabase clients exist — picking the wrong one breaks only at runtime.** Dashboard code (`app/(dashboard)/**`, `app/api/**`) must use `createDashboardSupabaseClient()` from `@/lib/supabase/dashboard`; tests mock `@/lib/supabase/dashboard`. (Public routes use `createServerSupabaseClient()` from `@/lib/supabase/server` — D has no public routes, so it never touches that client.) Using the anon client in the dashboard makes tests pass while runtime queries silently return 0 rows, because every table's RLS is `to authenticated`.
- **Never collapse a query failure into an empty array.** STATUS.md's "조회 실패와 빈 결과 구분" item calls out the existing defect: a DB error (missing table, RLS problem, RPC failure) renders exactly like "no data", so operators can't tell a broken dashboard from an empty one. The spec explicitly forbids repeating this in D: success and failure must be distinct values (`{ ok: true; items: [...] } | { ok: false }`), a failed source triggers the "일부 데이터를 불러오지 못했습니다" banner, and a successful query with 0 rows is NOT a failure — it just renders empty.
- **All date and D-day math is server-side, pinned to KST.** Vercel runs in UTC; the agency works in Seoul. Client-side `new Date()` math would compute "today" in the visitor's timezone while the server computed it in UTC — producing off-by-one dates for nine hours a day and hydration-mismatch warnings whenever server and client disagree. `lib/seeding/dday.ts` already solves this with KST-pinned string math; reuse its exports (`toKstDateString`, `daysUntilDeadline`, `formatDday`, `ddayToneClass`) verbatim. **Do not modify `lib/seeding/dday.ts`** — anything missing goes in the new `lib/overview/calendar.ts`.
- **Explicit return types on server actions** (`Promise<{ error: string } | { success: true }>`) are mandatory repo-wide because inferred types break `"error" in result` narrowing and fail the build. **D has zero server actions** (pure read + link navigation), so this rule has no application here — but the same spirit applies: the fetchers in Task 2 declare an explicit `Promise<SourceResult>` return type.
- **Supabase CLI is NOT authenticated** on this machine (no DB password either) — `supabase db push` / `migration up` are unavailable; migrations are applied by hand in the dashboard SQL editor. **D needs no migrations and no new tables**, so this never comes up; do not create any file under `supabase/migrations/`.
- **UI copy is Korean.** Commit messages are English.
- **Tailwind: token classes only.** The full allowed set: `bg-bg` `bg-surface` `bg-surface2` `border-border` `text-text` `text-textMuted` `bg-accent` `text-accent` `bg-accent2` `text-accent2` `text-onAccent` `text-critical` `text-success` `text-warning` `rounded-token` (plus neutral utilities like flex/grid/gap/padding/font-mono/tabular-nums/truncate/opacity). `bg-accent2`/`text-accent2` are already wired (`--accent-2` in `app/globals.css`, `accent2` in `tailwind.config.ts`) — do not add tokens.
- **Tailwind only scans `app/**`** (`content: ["./app/**/*.{ts,tsx}"]` in `tailwind.config.ts`). Any literal class string that exists nowhere else must appear in a file under `app/` or it won't be generated. This is why the source→color maps live in `app/(dashboard)/page.tsx`, not in `lib/overview/`.
- **No new npm dependencies — explicitly no calendar libraries.** The month grid is a hand-rolled server component + Tailwind. This is a deliberate spec decision to avoid growing the dependency tree.
- **Never run the full `npm test`.** DB tests hit the production Supabase project (a shared singleton) and pollute it; parallel agents also stomp each other. Run only the test files this plan creates, with the exact commands given in each step.
- **Next.js App Router versions here treat `params` and `searchParams` as Promises** — `const { month } = await searchParams;`. Every existing page in this repo follows that pattern (see `app/(dashboard)/campaigns/[id]/seeding-sheet/page.tsx`). If any App Router API seems off, consult `node_modules/next/dist/docs/` per AGENTS.md before deviating.
- Commit trailer on every commit:

  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  ```

---

## File Structure

```
marketing/
├── lib/overview/
│   ├── types.ts               # OverviewItem, SourceResult (shared by sources + calendar + page)
│   ├── calendar.ts            # pure fns: parseMonthParam, addMonths, buildMonthGrid, partitionDueItems, formatMonthTitle
│   ├── calendar.test.ts
│   ├── sources.ts             # fetchSeedingItems / fetchEventItems / fetchEventChecklistItems / fetchSnsItems
│   └── sources.test.ts
└── app/(dashboard)/
    ├── page.tsx               # NEW — the overview screen at "/", inside the dashboard layout
    └── page.test.tsx
```

**`app/page.tsx` (the current one-line `<h1>Seeding Dashboard</h1>` scaffold) is DELETED.** It sits at the app root, *outside* the `(dashboard)` route group, so today `/` renders without the sidebar/auth layout. The spec requires `/` to live under `app/(dashboard)/layout.tsx` (which already provides `getCurrentProfile()` → `/login` redirect and the sidebar whose "오버뷰" link points at `/` — verified; do not edit the layout). Next.js forbids two pages resolving to the same path, so the root `app/page.tsx` must be removed in the same commit that adds `app/(dashboard)/page.tsx`, or the build fails with "two parallel pages that resolve to the same path".

No migrations, no server actions, no client components, no API routes.

---

## Task 1: Overview Types + Calendar Pure Functions

**Files:**
- Create: `lib/overview/types.ts`
- Create: `lib/overview/calendar.ts`
- Test: `lib/overview/calendar.test.ts`

**Interfaces:**
- Consumes: `daysUntilDeadline(deadline: string, todayKst: string): number` from `@/lib/seeding/dday` (existing — do not modify that file).
- Produces (Tasks 2 and 3 rely on these exact names and types):
  - `type OverviewItem = { source: "seeding" | "event" | "sns"; label: string; date: string /* KST yyyy-mm-dd */; href: string }` (in `types.ts`)
  - `type SourceResult = { ok: true; items: OverviewItem[] } | { ok: false }` (in `types.ts`)
  - `type CalendarCell = { date: string; inMonth: boolean }`
  - `parseMonthParam(param: string | undefined, todayKst: string): string` — returns `param` if it matches strict `yyyy-mm` (month 01–12), else the month of `todayKst`.
  - `addMonths(month: string, delta: number): string` — `"2026-12" + 1 → "2027-01"`.
  - `buildMonthGrid(month: string): CalendarCell[][]` — full weeks, Sunday-first; leading/trailing cells from adjacent months carry `inMonth: false`.
  - `partitionDueItems(items: OverviewItem[], todayKst: string): { overdue: OverviewItem[]; dueSoon: OverviewItem[] }` — overdue = past deadline (지연), dueSoon = D-3~D-0 inclusive (임박); both sorted by date ascending; D-4 and later excluded.
  - `formatMonthTitle(month: string): string` — `"2026-09" → "2026년 9월"`.

- [ ] **Step 1: Write the failing test**

`lib/overview/calendar.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { OverviewItem } from "./types";
import {
  addMonths,
  buildMonthGrid,
  formatMonthTitle,
  parseMonthParam,
  partitionDueItems,
} from "./calendar";

describe("parseMonthParam", () => {
  test("returns a valid yyyy-mm param unchanged", () => {
    expect(parseMonthParam("2026-02", "2026-09-15")).toBe("2026-02");
  });

  test("falls back to today's month when the param is missing", () => {
    expect(parseMonthParam(undefined, "2026-09-15")).toBe("2026-09");
  });

  test("falls back on a malformed param", () => {
    expect(parseMonthParam("garbage", "2026-09-15")).toBe("2026-09");
    expect(parseMonthParam("2026-9", "2026-09-15")).toBe("2026-09");
    expect(parseMonthParam("2026-09-01", "2026-09-15")).toBe("2026-09");
  });

  test("falls back on a nonexistent month", () => {
    expect(parseMonthParam("2026-13", "2026-09-15")).toBe("2026-09");
    expect(parseMonthParam("2026-00", "2026-09-15")).toBe("2026-09");
  });
});

describe("addMonths", () => {
  test("moves within a year", () => {
    expect(addMonths("2026-09", 1)).toBe("2026-10");
    expect(addMonths("2026-09", -1)).toBe("2026-08");
  });

  test("crosses year boundaries in both directions", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});

describe("buildMonthGrid", () => {
  test("September 2026 (starts on a Tuesday) spans 5 full Sunday-first weeks", () => {
    const weeks = buildMonthGrid("2026-09");
    expect(weeks).toHaveLength(5);
    for (const week of weeks) expect(week).toHaveLength(7);
    expect(weeks[0][0]).toEqual({ date: "2026-08-30", inMonth: false });
    expect(weeks[0][2]).toEqual({ date: "2026-09-01", inMonth: true });
    expect(weeks[4][6]).toEqual({ date: "2026-10-03", inMonth: false });
  });

  test("February 2026 (starts on a Sunday, 28 days) is exactly 4 weeks with no out-of-month cells", () => {
    const weeks = buildMonthGrid("2026-02");
    expect(weeks).toHaveLength(4);
    expect(weeks[0][0]).toEqual({ date: "2026-02-01", inMonth: true });
    expect(weeks[3][6]).toEqual({ date: "2026-02-28", inMonth: true });
    expect(weeks.flat().every((cell) => cell.inMonth)).toBe(true);
  });

  test("August 2026 (starts on a Saturday, 31 days) needs 6 weeks", () => {
    const weeks = buildMonthGrid("2026-08");
    expect(weeks).toHaveLength(6);
    expect(weeks[0][0]).toEqual({ date: "2026-07-26", inMonth: false });
    expect(weeks[0][6]).toEqual({ date: "2026-08-01", inMonth: true });
    expect(weeks[5][6]).toEqual({ date: "2026-09-05", inMonth: false });
  });

  test("leap-year February 2024 includes Feb 29 as an in-month cell", () => {
    const weeks = buildMonthGrid("2024-02");
    const flat = weeks.flat();
    expect(flat.find((c) => c.date === "2024-02-29")).toEqual({ date: "2024-02-29", inMonth: true });
    expect(weeks[0][0]).toEqual({ date: "2024-01-28", inMonth: false });
    expect(weeks[weeks.length - 1][6]).toEqual({ date: "2024-03-02", inMonth: false });
  });

  test("non-leap February 2025 has no Feb 29", () => {
    const flat = buildMonthGrid("2025-02").flat();
    expect(flat.some((c) => c.date === "2025-02-29")).toBe(false);
    expect(flat.find((c) => c.date === "2025-02-28")).toEqual({ date: "2025-02-28", inMonth: true });
  });
});

describe("partitionDueItems", () => {
  const item = (date: string, label = date): OverviewItem => ({
    source: "seeding",
    label,
    date,
    href: "/campaigns/c1/seeding-sheet",
  });

  test("splits overdue (past) from due-soon (D-3 through D-DAY inclusive)", () => {
    const { overdue, dueSoon } = partitionDueItems(
      [item("2026-09-16"), item("2026-09-13"), item("2026-09-15"), item("2026-09-18")],
      "2026-09-15"
    );
    expect(overdue.map((i) => i.date)).toEqual(["2026-09-13"]);
    expect(dueSoon.map((i) => i.date)).toEqual(["2026-09-15", "2026-09-16", "2026-09-18"]);
  });

  test("a deadline due today is 임박, not 지연", () => {
    const { overdue, dueSoon } = partitionDueItems([item("2026-09-15")], "2026-09-15");
    expect(overdue).toHaveLength(0);
    expect(dueSoon).toHaveLength(1);
  });

  test("D-4 and later are excluded entirely", () => {
    const { overdue, dueSoon } = partitionDueItems([item("2026-09-19")], "2026-09-15");
    expect(overdue).toHaveLength(0);
    expect(dueSoon).toHaveLength(0);
  });

  test("both partitions are sorted by date ascending", () => {
    const { overdue, dueSoon } = partitionDueItems(
      [item("2026-09-14"), item("2026-09-10"), item("2026-09-17"), item("2026-09-15")],
      "2026-09-15"
    );
    expect(overdue.map((i) => i.date)).toEqual(["2026-09-10", "2026-09-14"]);
    expect(dueSoon.map((i) => i.date)).toEqual(["2026-09-15", "2026-09-17"]);
  });
});

describe("formatMonthTitle", () => {
  test("formats without zero-padding the month", () => {
    expect(formatMonthTitle("2026-09")).toBe("2026년 9월");
    expect(formatMonthTitle("2026-12")).toBe("2026년 12월");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/overview/calendar`
Expected: FAIL — `lib/overview/calendar.ts` (and `./types`) do not exist.

- [ ] **Step 3: Write the types module and the implementation**

`lib/overview/types.ts`:

```ts
/**
 * One deadline-bearing row from any of the three sub-projects, normalized for
 * the overview screen. `date` is always a KST calendar date ("yyyy-mm-dd") —
 * timestamptz sources are converted server-side before an item is built.
 */
export type OverviewItem = {
  source: "seeding" | "event" | "sns";
  label: string;
  date: string;
  href: string;
};

/**
 * Success and failure are distinct values on purpose. A failed query (missing
 * table, RLS error) must never be represented as an empty items array, because
 * then the UI cannot tell "nothing due" from "the dashboard is broken"
 * (STATUS.md "조회 실패와 빈 결과 구분"). `{ ok: false }` drives the
 * "일부 데이터를 불러오지 못했습니다" banner; `{ ok: true, items: [] }` renders
 * as a normal empty state.
 */
export type SourceResult = { ok: true; items: OverviewItem[] } | { ok: false };
```

`lib/overview/calendar.ts`:

```ts
// Pure KST calendar math for the overview screen. Everything operates on
// "yyyy-mm-dd" / "yyyy-mm" strings and UTC-millisecond arithmetic, so results
// are identical regardless of the server's timezone (Vercel runs in UTC).
// Extends lib/seeding/dday.ts without modifying it.
import { daysUntilDeadline } from "@/lib/seeding/dday";
import type { OverviewItem } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type CalendarCell = { date: string; inMonth: boolean };

/** Valid "yyyy-mm" param passes through; anything else falls back to today's KST month. */
export function parseMonthParam(param: string | undefined, todayKst: string): string {
  if (param && MONTH_RE.test(param)) return param;
  return todayKst.slice(0, 7);
}

/** "2026-12" + 1 → "2027-01". Pure integer month arithmetic — no Date objects. */
export function addMonths(month: string, delta: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  const total = year * 12 + (monthNum - 1) + delta;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * Sunday-first weeks covering the whole month. Cells spilling into the
 * previous/next month are included (so every week has 7 cells) and flagged
 * `inMonth: false` for dimmed rendering.
 */
export function buildMonthGrid(month: string): CalendarCell[][] {
  const [year, monthNum] = month.split("-").map(Number);
  const firstMs = Date.UTC(year, monthNum - 1, 1);
  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const leading = new Date(firstMs).getUTCDay(); // 0 = Sunday
  const startMs = firstMs - leading * MS_PER_DAY;
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;

  const weeks: CalendarCell[][] = [];
  for (let offset = 0; offset < totalCells; offset += 7) {
    const week: CalendarCell[] = [];
    for (let day = 0; day < 7; day++) {
      const date = new Date(startMs + (offset + day) * MS_PER_DAY).toISOString().slice(0, 10);
      week.push({ date, inMonth: date.slice(0, 7) === month });
    }
    weeks.push(week);
  }
  return weeks;
}

/**
 * 지연 (past deadline) and 임박 (D-3 through D-DAY inclusive), each sorted by
 * date ascending. Items due in 4+ days belong to neither. The 3-day inclusion
 * window is deliberately wider than ddayToneClass's warning threshold (D-1) —
 * inclusion is decided here, tone is decided by ddayToneClass unchanged.
 */
export function partitionDueItems(
  items: OverviewItem[],
  todayKst: string
): { overdue: OverviewItem[]; dueSoon: OverviewItem[] } {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  return {
    overdue: sorted.filter((item) => daysUntilDeadline(item.date, todayKst) < 0),
    dueSoon: sorted.filter((item) => {
      const days = daysUntilDeadline(item.date, todayKst);
      return days >= 0 && days <= 3;
    }),
  };
}

/** "2026-09" → "2026년 9월" (calendar header). */
export function formatMonthTitle(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  return `${year}년 ${monthNum}월`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/overview/calendar`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add lib/overview/types.ts lib/overview/calendar.ts lib/overview/calendar.test.ts
git commit -m "feat: add overview item types and pure KST calendar functions" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Source Fetchers

**Files:**
- Create: `lib/overview/sources.ts`
- Test: `lib/overview/sources.test.ts`

**Interfaces:**
- Consumes: `createDashboardSupabaseClient()` from `@/lib/supabase/dashboard` (existing), `toKstDateString(instant: Date): string` from `@/lib/seeding/dday` (existing), `OverviewItem` / `SourceResult` from `./types` (Task 1).
- Produces (Task 3 imports these exact names):
  - `fetchSeedingItems(): Promise<SourceResult>`
  - `fetchEventItems(): Promise<SourceResult>`
  - `fetchEventChecklistItems(): Promise<SourceResult>`
  - `fetchSnsItems(): Promise<SourceResult>`

Four fetchers, not three: the spec mandates four independent queries (A upload deadlines, B events, B checklist items, C contents) whose successes/failures never affect each other. Both B fetchers emit `source: "event"` so the UI treats them as one color/badge.

**Pinned source columns (do not invent others):**

| Source | Table / columns | Filter | Label | Link |
|---|---|---|---|---|
| A (live) | `seeding_records.upload_deadline` (date), FK joins `applicants.name`, `campaigns.name` | `progress_stage != '업로드완료'` | `지원자이름 · 캠페인명` | `/campaigns/[campaignId]/seeding-sheet` |
| B | `events.event_at` (timestamptz), `events.name`, `events.campaign_id` | `status = 'preparing'` | `events.name` | `/campaigns/[campaignId]/events/[eventId]` |
| B | `event_checklist_items.due_date` (date), `.label`, join `events(id, name, campaign_id)` | `done = false` | `항목 label · 행사명` | same event detail link |
| C | `sns_contents.scheduled_on` (date) | `status != 'posted'` | 콘텐츠 제목 · 계정 handle | `/sns/[accountId]` |

> **C column caveat (spec-mandated recheck):** the C spec pins only `scheduled_on`, `status`, the "title + handle" label, and the `/sns/[accountId]` link. The exact names of the title column, the account FK, and the handle column are owned by the C plan. Before implementing `fetchSnsItems`, open `docs/superpowers/plans/2026-09-01-sns-operation.md` and confirm the names this plan assumes: `sns_contents.title`, `sns_contents.account_id`, and `sns_accounts.handle` (joined via the FK). If C's plan uses different names, use C's names — the pinned four items above may not change.

- [ ] **Step 1: Write the failing test**

`lib/overview/sources.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/dashboard", () => ({ createDashboardSupabaseClient: vi.fn() }));

import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import {
  fetchEventChecklistItems,
  fetchEventItems,
  fetchSeedingItems,
  fetchSnsItems,
} from "./sources";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

/** Every fetcher's chain ends in exactly one filter call (.neq or .eq), so one mock covers all four. */
function mockQuery(result: { data?: unknown; error?: unknown }) {
  asMock(createDashboardSupabaseClient).mockResolvedValue({
    from: () => ({
      select: () => ({
        neq: async () => ({ data: result.data ?? null, error: result.error ?? null }),
        eq: async () => ({ data: result.data ?? null, error: result.error ?? null }),
      }),
    }),
  });
}

const relationMissing = {
  code: "42P01",
  message: 'relation "public.events" does not exist',
};

describe("fetchSeedingItems", () => {
  test("maps rows to overview items with the applicant · campaign label", async () => {
    mockQuery({
      data: [
        {
          campaign_id: "c1",
          upload_deadline: "2026-09-20",
          applicants: { name: "김하늘" },
          campaigns: { name: "글로우랩 세럼" },
        },
      ],
    });

    expect(await fetchSeedingItems()).toEqual({
      ok: true,
      items: [
        {
          source: "seeding",
          label: "김하늘 · 글로우랩 세럼",
          date: "2026-09-20",
          href: "/campaigns/c1/seeding-sheet",
        },
      ],
    });
  });

  test("silently drops rows with a broken join or no deadline", async () => {
    mockQuery({
      data: [
        { campaign_id: "c1", upload_deadline: "2026-09-20", applicants: null, campaigns: { name: "캠" } },
        { campaign_id: "c1", upload_deadline: null, applicants: { name: "김하늘" }, campaigns: { name: "캠" } },
      ],
    });

    expect(await fetchSeedingItems()).toEqual({ ok: true, items: [] });
  });

  test("a successful query with zero rows is ok:true, NOT a failure", async () => {
    mockQuery({ data: [] });
    expect(await fetchSeedingItems()).toEqual({ ok: true, items: [] });
  });

  test("a Supabase error response is ok:false, NOT an empty list", async () => {
    mockQuery({ error: { code: "500", message: "boom" } });
    expect(await fetchSeedingItems()).toEqual({ ok: false });
  });

  test("a thrown error (network/client) is ok:false", async () => {
    asMock(createDashboardSupabaseClient).mockRejectedValue(new Error("connect failed"));
    expect(await fetchSeedingItems()).toEqual({ ok: false });
  });
});

describe("fetchEventItems", () => {
  test("converts event_at (timestamptz) to a KST calendar date", async () => {
    // 2026-09-14T20:00:00Z is 2026-09-15 05:00 in KST (UTC+9).
    mockQuery({
      data: [{ id: "e1", campaign_id: "c1", name: "런칭 행사", event_at: "2026-09-14T20:00:00Z" }],
    });

    expect(await fetchEventItems()).toEqual({
      ok: true,
      items: [
        {
          source: "event",
          label: "런칭 행사",
          date: "2026-09-15",
          href: "/campaigns/c1/events/e1",
        },
      ],
    });
  });

  test("returns ok:false while the events table does not exist yet (B unbuilt)", async () => {
    mockQuery({ error: relationMissing });
    expect(await fetchEventItems()).toEqual({ ok: false });
  });
});

describe("fetchEventChecklistItems", () => {
  test("labels items with the checklist label and the event name", async () => {
    mockQuery({
      data: [
        {
          label: "케이터링 예약",
          due_date: "2026-09-18",
          events: { id: "e1", name: "런칭 행사", campaign_id: "c1" },
        },
      ],
    });

    expect(await fetchEventChecklistItems()).toEqual({
      ok: true,
      items: [
        {
          source: "event",
          label: "케이터링 예약 · 런칭 행사",
          date: "2026-09-18",
          href: "/campaigns/c1/events/e1",
        },
      ],
    });
  });

  test("drops rows whose event join failed (event deleted)", async () => {
    mockQuery({ data: [{ label: "케이터링 예약", due_date: "2026-09-18", events: null }] });
    expect(await fetchEventChecklistItems()).toEqual({ ok: true, items: [] });
  });

  test("returns ok:false while the table does not exist yet (B unbuilt)", async () => {
    mockQuery({ error: relationMissing });
    expect(await fetchEventChecklistItems()).toEqual({ ok: false });
  });
});

describe("fetchSnsItems", () => {
  test("labels items with the content title and the account handle", async () => {
    mockQuery({
      data: [
        {
          title: "9월 신제품 릴스",
          scheduled_on: "2026-09-22",
          account_id: "a1",
          sns_accounts: { handle: "glowlab_official" },
        },
      ],
    });

    expect(await fetchSnsItems()).toEqual({
      ok: true,
      items: [
        {
          source: "sns",
          label: "9월 신제품 릴스 · glowlab_official",
          date: "2026-09-22",
          href: "/sns/a1",
        },
      ],
    });
  });

  test("returns ok:false while the table does not exist yet (C unbuilt)", async () => {
    mockQuery({ error: relationMissing });
    expect(await fetchSnsItems()).toEqual({ ok: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/overview/sources`
Expected: FAIL — `lib/overview/sources.ts` does not exist.

- [ ] **Step 3: Implement the fetchers**

`lib/overview/sources.ts`:

```ts
// Four independent read-only queries feeding the overview screen. Each fetcher
// owns its own failure handling: any Supabase error response (including
// "relation does not exist" while B/C tables are unbuilt) or thrown error
// becomes { ok: false } — never an empty list. See lib/overview/types.ts for
// why the distinction matters.
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { toKstDateString } from "@/lib/seeding/dday";
import type { OverviewItem, SourceResult } from "./types";

type SeedingRow = {
  campaign_id: string | null;
  upload_deadline: string | null;
  applicants: { name: string } | null;
  campaigns: { name: string } | null;
};

export async function fetchSeedingItems(): Promise<SourceResult> {
  try {
    const supabase = await createDashboardSupabaseClient();
    const { data, error } = await supabase
      .from("seeding_records")
      .select("campaign_id, upload_deadline, applicants(name), campaigns(name)")
      .neq("progress_stage", "업로드완료");
    if (error) return { ok: false };

    const items: OverviewItem[] = [];
    for (const row of (data ?? []) as SeedingRow[]) {
      // Rows with a broken join (deleted applicant/campaign) or no deadline
      // are silently excluded per the spec — they must not fail the source.
      if (!row.upload_deadline || !row.campaign_id || !row.applicants || !row.campaigns) continue;
      items.push({
        source: "seeding",
        label: `${row.applicants.name} · ${row.campaigns.name}`,
        date: row.upload_deadline,
        href: `/campaigns/${row.campaign_id}/seeding-sheet`,
      });
    }
    return { ok: true, items };
  } catch {
    return { ok: false };
  }
}

type EventRow = {
  id: string;
  campaign_id: string | null;
  name: string;
  event_at: string | null;
};

export async function fetchEventItems(): Promise<SourceResult> {
  try {
    const supabase = await createDashboardSupabaseClient();
    const { data, error } = await supabase
      .from("events")
      .select("id, campaign_id, name, event_at")
      .eq("status", "preparing");
    if (error) return { ok: false };

    const items: OverviewItem[] = [];
    for (const row of (data ?? []) as EventRow[]) {
      if (!row.event_at || !row.campaign_id) continue;
      items.push({
        source: "event",
        label: row.name,
        // event_at is timestamptz — convert the instant to its KST calendar day.
        date: toKstDateString(new Date(row.event_at)),
        href: `/campaigns/${row.campaign_id}/events/${row.id}`,
      });
    }
    return { ok: true, items };
  } catch {
    return { ok: false };
  }
}

type ChecklistRow = {
  label: string;
  due_date: string | null;
  events: { id: string; name: string; campaign_id: string | null } | null;
};

export async function fetchEventChecklistItems(): Promise<SourceResult> {
  try {
    const supabase = await createDashboardSupabaseClient();
    const { data, error } = await supabase
      .from("event_checklist_items")
      .select("label, due_date, events(id, name, campaign_id)")
      .eq("done", false);
    if (error) return { ok: false };

    const items: OverviewItem[] = [];
    for (const row of (data ?? []) as ChecklistRow[]) {
      if (!row.due_date || !row.events || !row.events.campaign_id) continue;
      items.push({
        source: "event",
        label: `${row.label} · ${row.events.name}`,
        date: row.due_date,
        href: `/campaigns/${row.events.campaign_id}/events/${row.events.id}`,
      });
    }
    return { ok: true, items };
  } catch {
    return { ok: false };
  }
}

type SnsRow = {
  title: string;
  scheduled_on: string | null;
  account_id: string | null;
  sns_accounts: { handle: string } | null;
};

export async function fetchSnsItems(): Promise<SourceResult> {
  try {
    const supabase = await createDashboardSupabaseClient();
    const { data, error } = await supabase
      .from("sns_contents")
      .select("title, scheduled_on, account_id, sns_accounts(handle)")
      .neq("status", "posted");
    if (error) return { ok: false };

    const items: OverviewItem[] = [];
    for (const row of (data ?? []) as SnsRow[]) {
      if (!row.scheduled_on || !row.account_id || !row.sns_accounts) continue;
      items.push({
        source: "sns",
        label: `${row.title} · ${row.sns_accounts.handle}`,
        date: row.scheduled_on,
        href: `/sns/${row.account_id}`,
      });
    }
    return { ok: true, items };
  } catch {
    return { ok: false };
  }
}
```

(Reminder from the caveat above: if the C plan's implemented column names for the title/handle/FK differ from `title` / `account_id` / `sns_accounts.handle`, adjust `fetchSnsItems` and its test to C's names before this step. `scheduled_on`, `status != 'posted'`, the "title · handle" label shape, and `/sns/[accountId]` stay as-is.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/overview/sources`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/overview/sources.ts lib/overview/sources.test.ts
git commit -m "feat: add failure-isolated overview source fetchers" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Overview Page at `/`

**Files:**
- Delete: `app/page.tsx` (the one-line `<h1>Seeding Dashboard</h1>` scaffold)
- Create: `app/(dashboard)/page.tsx`
- Test: `app/(dashboard)/page.test.tsx`

**Interfaces:**
- Consumes:
  - `fetchSeedingItems` / `fetchEventItems` / `fetchEventChecklistItems` / `fetchSnsItems` (Task 2) — the page test mocks the `@/lib/overview/sources` module, not Supabase.
  - `parseMonthParam` / `addMonths` / `buildMonthGrid` / `partitionDueItems` / `formatMonthTitle` and `CalendarCell` (Task 1).
  - `toKstDateString` / `formatDday` / `ddayToneClass` from `@/lib/seeding/dday` (existing).
  - `app/(dashboard)/layout.tsx` — already links 오버뷰 → `/` in the sidebar and gates with `getCurrentProfile()`. **Verified; do not edit it.**
- Produces: the `/` route, rendered inside the dashboard layout. No exports consumed by other code.

Why the file moves: `app/page.tsx` sits outside the `(dashboard)` route group, so it renders without the sidebar and without the auth gate. The spec places `/` under the dashboard layout. Next.js rejects a build where both `app/page.tsx` and `app/(dashboard)/page.tsx` exist (two pages for one path), so the delete and the create happen together.

Tone rule (from the spec, applied exactly): whether an item appears in the 임박·지연 list is decided by `partitionDueItems` (window: overdue plus D-3~D-0). The text tone of a listed item is decided by `ddayToneClass` **unchanged**: overdue → `text-critical`, D-DAY/D-1 → `text-warning`, D-2/D-3 → `text-text`. Do not write a new tone function and do not widen `ddayToneClass`'s thresholds — the spec chose to reuse it as-is.

- [ ] **Step 1: Write the failing test**

`app/(dashboard)/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/overview/sources", () => ({
  fetchSeedingItems: vi.fn(),
  fetchEventItems: vi.fn(),
  fetchEventChecklistItems: vi.fn(),
  fetchSnsItems: vi.fn(),
}));

import {
  fetchEventChecklistItems,
  fetchEventItems,
  fetchSeedingItems,
  fetchSnsItems,
} from "@/lib/overview/sources";
import OverviewPage from "./page";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

function mockAllSourcesOk() {
  for (const fetcher of [fetchSeedingItems, fetchEventItems, fetchEventChecklistItems, fetchSnsItems]) {
    asMock(fetcher).mockResolvedValue({ ok: true, items: [] });
  }
}

async function renderPage(month?: string) {
  render(await OverviewPage({ searchParams: Promise.resolve({ month }) }));
}

beforeEach(() => {
  // Freeze "now" at 2026-09-15 12:00 KST (03:00 UTC) so todayKst is deterministic.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T03:00:00Z"));
  mockAllSourcesOk();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("OverviewPage — failure banner", () => {
  test("no banner when every source succeeds", async () => {
    await renderPage();
    expect(screen.queryByText("일부 데이터를 불러오지 못했습니다")).not.toBeInTheDocument();
  });

  test("shows the banner on partial failure and still renders the surviving sources", async () => {
    asMock(fetchSnsItems).mockResolvedValue({ ok: false });
    asMock(fetchSeedingItems).mockResolvedValue({
      ok: true,
      items: [
        { source: "seeding", label: "김하늘 · 글로우랩 세럼", date: "2026-09-16", href: "/campaigns/c1/seeding-sheet" },
      ],
    });

    await renderPage();
    expect(screen.getByText("일부 데이터를 불러오지 못했습니다")).toBeInTheDocument();
    expect(screen.getAllByText("김하늘 · 글로우랩 세럼").length).toBeGreaterThan(0);
  });
});

describe("OverviewPage — 임박·지연 list", () => {
  test("shows the empty message when nothing is due within 3 days", async () => {
    // Due in 4 days — calendar only, not the alert list.
    asMock(fetchSeedingItems).mockResolvedValue({
      ok: true,
      items: [
        { source: "seeding", label: "먼 마감", date: "2026-09-19", href: "/campaigns/c1/seeding-sheet" },
      ],
    });

    await renderPage();
    expect(screen.getByText("임박하거나 지연된 항목이 없습니다")).toBeInTheDocument();
    expect(screen.getAllByText("먼 마감").length).toBeGreaterThan(0); // still on the calendar
  });

  test("renders overdue above due-soon with D-day text, source badge, and link", async () => {
    asMock(fetchSeedingItems).mockResolvedValue({
      ok: true,
      items: [
        { source: "seeding", label: "임박 시딩", date: "2026-09-17", href: "/campaigns/c1/seeding-sheet" },
        { source: "seeding", label: "지연 시딩", date: "2026-09-13", href: "/campaigns/c2/seeding-sheet" },
      ],
    });
    asMock(fetchEventItems).mockResolvedValue({
      ok: true,
      items: [
        { source: "event", label: "런칭 행사", date: "2026-09-15", href: "/campaigns/c1/events/e1" },
      ],
    });

    await renderPage();

    expect(screen.getByText("D+2")).toHaveClass("text-critical");
    expect(screen.getByText("D-DAY")).toHaveClass("text-warning");
    expect(screen.getByText("D-2")).toHaveClass("text-text"); // spec: ddayToneClass unchanged

    const overdueLink = screen.getByRole("link", { name: /지연 시딩/ });
    expect(overdueLink).toHaveAttribute("href", "/campaigns/c2/seeding-sheet");

    // Overdue (9/13) sorts above D-DAY (9/15) and 임박 (9/17).
    const labels = screen
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
    const overdueIndex = labels.findIndex((t) => t.includes("지연 시딩"));
    const dueSoonIndex = labels.findIndex((t) => t.includes("임박 시딩"));
    expect(overdueIndex).toBeGreaterThanOrEqual(0);
    expect(overdueIndex).toBeLessThan(dueSoonIndex);

    expect(screen.getAllByText("시딩").length).toBeGreaterThan(0); // source badge
    expect(screen.getAllByText("행사").length).toBeGreaterThan(0);
  });
});

describe("OverviewPage — month navigation", () => {
  test("defaults to the current KST month with correct prev/next links", async () => {
    await renderPage();
    expect(screen.getByText("2026년 9월")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "‹ 이전 달" })).toHaveAttribute("href", "/?month=2026-08");
    expect(screen.getByRole("link", { name: "다음 달 ›" })).toHaveAttribute("href", "/?month=2026-10");
  });

  test("honors ?month= across a year boundary", async () => {
    await renderPage("2026-01");
    expect(screen.getByText("2026년 1월")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "‹ 이전 달" })).toHaveAttribute("href", "/?month=2025-12");
    expect(screen.getByRole("link", { name: "다음 달 ›" })).toHaveAttribute("href", "/?month=2026-02");
  });

  test("falls back to the current month on a malformed ?month=", async () => {
    await renderPage("not-a-month");
    expect(screen.getByText("2026년 9월")).toBeInTheDocument();
  });
});

describe("OverviewPage — calendar grid", () => {
  test("caps items per cell and shows a +N overflow marker", async () => {
    asMock(fetchSnsItems).mockResolvedValue({
      ok: true,
      items: [1, 2, 3, 4].map((n) => ({
        source: "sns" as const,
        label: `콘텐츠 ${n}`,
        date: "2026-09-20",
        href: `/sns/a${n}`,
      })),
    });

    await renderPage();
    expect(screen.getByText("콘텐츠 1")).toBeInTheDocument();
    expect(screen.getByText("콘텐츠 3")).toBeInTheDocument();
    expect(screen.queryByText("콘텐츠 4")).not.toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "\(dashboard\)/page.test"`

(The parentheses are escaped because Vitest treats the CLI filter as a pattern; the quoted form works in both PowerShell and bash. The filter matches only `app/(dashboard)/page.test.tsx` — the string `(dashboard)/page.test` does not occur in `app/(dashboard)/campaigns/page.test.tsx`.)

Expected: FAIL — `app/(dashboard)/page.tsx` does not exist.

- [ ] **Step 3: Delete the old scaffold and implement the page**

Delete the old root page (its full current content is `export default function HomePage() { return <h1>Seeding Dashboard</h1>; }` — nothing else imports it):

```bash
git rm app/page.tsx
```

`app/(dashboard)/page.tsx`:

```tsx
import Link from "next/link";
import { ddayToneClass, formatDday, toKstDateString } from "@/lib/seeding/dday";
import {
  addMonths,
  buildMonthGrid,
  formatMonthTitle,
  parseMonthParam,
  partitionDueItems,
} from "@/lib/overview/calendar";
import {
  fetchEventChecklistItems,
  fetchEventItems,
  fetchSeedingItems,
  fetchSnsItems,
} from "@/lib/overview/sources";
import type { OverviewItem } from "@/lib/overview/types";

// Tailwind's content glob only scans app/** (tailwind.config.ts), so these
// token class strings must live here literally — never assembled in lib/.
const SOURCE_LABEL: Record<OverviewItem["source"], string> = {
  seeding: "시딩",
  event: "행사",
  sns: "SNS",
};
const SOURCE_BG: Record<OverviewItem["source"], string> = {
  seeding: "bg-accent",
  event: "bg-accent2",
  sns: "bg-success",
};
const MAX_ITEMS_PER_CELL = 3;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function AlertRow({ item, todayKst }: { item: OverviewItem; todayKst: string }) {
  return (
    <li>
      <Link
        href={item.href}
        className="flex items-center gap-3 rounded-token border border-border bg-surface px-4 py-3"
      >
        <span
          className={`rounded-token px-2 py-0.5 text-xs font-medium text-onAccent ${SOURCE_BG[item.source]}`}
        >
          {SOURCE_LABEL[item.source]}
        </span>
        <span
          className={`w-14 shrink-0 font-mono text-sm tabular-nums ${ddayToneClass(item.date, todayKst)}`}
        >
          {formatDday(item.date, todayKst)}
        </span>
        <span className="truncate text-sm text-text">{item.label}</span>
      </Link>
    </li>
  );
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;

  // All date math stays on the server in KST. Doing it client-side would mix
  // the visitor's timezone with Vercel's UTC — off-by-one dates plus
  // hydration-mismatch warnings when the two renders disagree.
  const todayKst = toKstDateString(new Date());
  const month = parseMonthParam(monthParam, todayKst);

  // Every fetcher catches its own errors and resolves with { ok: false }
  // instead of rejecting, so Promise.all here behaves like allSettled:
  // one broken source can never sink the others.
  const results = await Promise.all([
    fetchSeedingItems(),
    fetchEventItems(),
    fetchEventChecklistItems(),
    fetchSnsItems(),
  ]);
  const anyFailed = results.some((result) => !result.ok);
  const items = results.flatMap((result) => (result.ok ? result.items : []));

  const { overdue, dueSoon } = partitionDueItems(items, todayKst);
  const alerts = [...overdue, ...dueSoon];

  const weeks = buildMonthGrid(month);
  const itemsByDate = new Map<string, OverviewItem[]>();
  for (const item of items) {
    const bucket = itemsByDate.get(item.date);
    if (bucket) bucket.push(item);
    else itemsByDate.set(item.date, [item]);
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold text-text">오버뷰</h1>

      {anyFailed && (
        <p className="rounded-token border border-border bg-surface px-4 py-3 text-sm text-warning">
          일부 데이터를 불러오지 못했습니다
        </p>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-text">임박·지연</h2>
        {alerts.length === 0 ? (
          <p className="text-textMuted">임박하거나 지연된 항목이 없습니다</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {alerts.map((item, index) => (
              <AlertRow key={`${item.href}-${item.date}-${index}`} item={item} todayKst={todayKst} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <Link
            href={`/?month=${addMonths(month, -1)}`}
            className="rounded-token border border-border px-3 py-1.5 text-sm text-textMuted"
          >
            ‹ 이전 달
          </Link>
          <h2 className="text-lg font-semibold text-text">{formatMonthTitle(month)}</h2>
          <Link
            href={`/?month=${addMonths(month, 1)}`}
            className="rounded-token border border-border px-3 py-1.5 text-sm text-textMuted"
          >
            다음 달 ›
          </Link>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-token border border-border bg-border">
          {WEEKDAYS.map((day) => (
            <p key={day} className="bg-surface2 px-2 py-1 text-center text-xs text-textMuted">
              {day}
            </p>
          ))}
          {weeks.flat().map((cell) => {
            const cellItems = itemsByDate.get(cell.date) ?? [];
            const hiddenCount = cellItems.length - MAX_ITEMS_PER_CELL;
            const isToday = cell.date === todayKst;
            return (
              <div
                key={cell.date}
                className={`min-h-24 p-1.5 ${isToday ? "bg-surface2" : "bg-surface"} ${cell.inMonth ? "" : "opacity-50"}`}
              >
                <p
                  className={`mb-1 font-mono text-xs tabular-nums ${isToday ? "font-bold text-accent" : "text-textMuted"}`}
                >
                  {Number(cell.date.slice(8, 10))}
                </p>
                {cellItems.slice(0, MAX_ITEMS_PER_CELL).map((item, index) => (
                  <Link
                    key={`${item.href}-${index}`}
                    href={item.href}
                    className="mb-0.5 flex items-center gap-1 text-xs text-text"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${SOURCE_BG[item.source]}`} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                ))}
                {hiddenCount > 0 && <p className="text-xs text-textMuted">+{hiddenCount}</p>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- "\(dashboard\)/page.test"`
Expected: PASS.

- [ ] **Step 5: Run the other overview test files and the type check**

Run: `npm test -- lib/overview`
Expected: PASS (calendar + sources, unchanged).

Run: `npx tsc --noEmit`
Expected: no errors. (Do NOT run the bare `npm test` — it hits the production DB.)

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx "app/(dashboard)/page.tsx" "app/(dashboard)/page.test.tsx"
git commit -m "feat: replace scaffold home with overview calendar and due-soon list" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(`git add app/page.tsx` stages the deletion recorded by `git rm` in Step 3; it is already staged, but adding it again is harmless and keeps the command copy-pasteable.)

---

## Self-Review Notes

- **Spec coverage:** 임박·지연 목록 with badge/D-day/tone/링크/empty message (Task 3) · month grid with prev/next `?month=` links, KST default month, Sunday-first weeks, out-of-month dimming, today highlight, per-source colors, +N overflow (Tasks 1, 3) · four independent failure-isolated queries with the banner and the ok/fail value distinction (Task 2, banner in Task 3) · relation-missing tolerance while B/C are unbuilt (Task 2 tests) · broken-join rows silently dropped (Task 2) · malformed `month` fallback (Tasks 1, 3) · no new tables/migrations/actions/dependencies (structural — no such files exist in this plan) · `/` under the dashboard layout (Task 3 file move). Excluded per spec: stats cards, activity feed, notifications, external calendar sync, week/day views.
- **Placeholder scan:** no TBD/TODO; every code step is complete and runnable. The single deliberately-deferred point — C's title/handle/FK column names — is a spec-mandated recheck against the C plan, with concrete assumed names and a bounded substitution rule, not an open placeholder.
- **Type consistency:** `OverviewItem`/`SourceResult` defined once in `lib/overview/types.ts` (Task 1) and imported by Tasks 2–3; fetcher names (`fetchSeedingItems`, `fetchEventItems`, `fetchEventChecklistItems`, `fetchSnsItems`) match between Task 2 exports, Task 3 imports, and both test files' mocks; calendar function names (`parseMonthParam`, `addMonths`, `buildMonthGrid`, `partitionDueItems`, `formatMonthTitle`) match between Task 1 and Task 3; dday helpers (`toKstDateString`, `daysUntilDeadline`, `formatDday`, `ddayToneClass`) match the actual exports of `lib/seeding/dday.ts`.
- **Tone-rule resolution:** the spec's prose says 임박(D-3~D-0) is `text-warning`, but its operational rule says to apply `ddayToneClass` unchanged (which yields warning only for D-0/D-1 and `text-text` for D-2/D-3). The operational rule wins per the spec's own wording ("톤 클래스는 … `ddayToneClass`를 그대로 적용한다"); the Task 3 test pins `D-2` → `text-text` so the executor doesn't "fix" it either way.

---

**Plan complete and saved to `docs/superpowers/plans/2026-09-01-overview-calendar.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
