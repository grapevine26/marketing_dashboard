# Seeding Result Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 결과보고서 step: a "보고서 생성" action that freezes the campaign's current 지원자/관리시트 data into an immutable point-in-time snapshot, a web report view with the three 기본 섹션 plus user-added 커스텀 섹션, and downloads in PDF and editable PPTX.

**Architecture:** A `reports` row stores a `snapshot` JSONB built entirely inside one `SECURITY DEFINER` RPC (`create_campaign_report`) — a single statement reading `campaigns` + `applicants` + `seeding_records`, so the copy is atomic and taken at generation time. A `BEFORE UPDATE` trigger then makes `snapshot` physically immutable at the database level; only `custom_sections` is editable afterwards. One pure function, `buildReportSections(report)`, turns a stored report into a renderer-agnostic `ReportSection[]`; the web view, the PDF renderer, and the PPTX renderer are three consumers of that same array, so all three formats stay in sync by construction.

**Tech Stack:** Next.js 16 App Router (Node runtime route handlers), Supabase (Postgres RPC + RLS + trigger), `pdfkit` + an embedded IBM Plex Sans KR TTF for PDF, `pptxgenjs` for OOXML PPTX, Vitest + React Testing Library, `unpdf` and `jszip` as test-only inspectors.

**Spec:** [docs/superpowers/specs/2026-08-30-influencer-seeding-management-design.md](../specs/2026-08-30-influencer-seeding-management-design.md) — 데이터 모델 `reports`, 핵심 화면/플로우 5번 (결과보고서).

---

## Prerequisites

This plan assumes the following are **already implemented and merged**. Do not create or redefine any of them.

**From Plan 1 (foundation — done, deployed):** `profiles`, `campaigns` (`id, name, company_name, campaign_type, status, pre_survey_token, apply_token, applicant_list_token, seeding_sheet_token, created_by, created_at`), `createServerSupabaseClient()` (async — always `await` it) in `lib/supabase/server.ts`, `getCurrentProfile()` / `requireRole()` / `Profile` in `lib/auth/roles.ts`, `app/(dashboard)/layout.tsx`, `app/(dashboard)/campaigns/*`, the Tailwind design tokens, migrations 0001–0005.

**From Plan 3 (지원자 — must land first):** table `public.applicants`.

**From Plan 4 (관리시트 데이터 — must land first):** table `public.seeding_records`.

**From Plan 5 (관리시트 화면 — must land first):** the 관리시트 screen, which is where the spec puts the "보고서 생성" button. Task 10 of this plan exports `<GenerateReportButton campaignId={...} />` for Plan 5 to drop into that screen's header, and also wires a second entry point on the campaign detail page so this plan's screens are reachable before Plan 5 exists.

**Plans 3, 4, and 5 must land before this plan is executed.** Migration 0014 reads `applicants` and `seeding_records` directly and will fail to create otherwise.

### Assumed upstream column names

Plans 3 and 4 own these tables; the spec describes their fields in Korean. This plan assumes these English column names, and **every one of them is referenced in exactly one place — the `create_campaign_report` function in migration 0014.** If Plan 3/4 land with different names, fix them there and nowhere else.

- `public.applicants`: `id uuid`, `campaign_id uuid`, `name text` (이름), `sns_url text` (SNS 계정 링크), `nationality text` (국적), `contact text` (연락처), `privacy_consent boolean`, `secondary_use_consent boolean`, `custom_answers jsonb`, `status text` (`'applied' | 'selected' | 'reserved' | 'rejected'`), `applied_at timestamptz`, `status_changed_by text`, `status_changed_at timestamptz`.
- `public.seeding_records`: `id uuid`, `applicant_id uuid`, `campaign_id uuid`, `shipping_address text` (배송 주소), `visit_scheduled_at timestamptz` (방문 일정), `visit_party_size integer` (방문 인원), `progress_stage text` (진행 단계), `campaign_type text`, `upload_deadline date` (업로드 기한), `upload_url text` (업로드 링크), `view_count integer` (조회수), `engagement_count integer` (인게이지먼트), `updated_at timestamptz`.

---

## Global Constraints

- **Reserved migration numbers: 0013 and 0014 only.** Other plans own 0006–0012.
- **The snapshot is a real point-in-time copy.** Later edits to `applicants` or `seeding_records` must not change an already-generated report. This is enforced three ways and tested explicitly in Task 2: the snapshot is built in a single SQL statement inside one RPC call, the `reports` table has no `insert` policy (so the RPC is the only write path), and a `BEFORE UPDATE` trigger raises `REPORT_SNAPSHOT_IS_IMMUTABLE` if anything ever tries to change `snapshot` or `generated_at`.
- **Custom sections are the one editable part of a report** (spec: 사용자가 커스텀 섹션 추가 가능). They live in a separate `custom_sections` column, never inside `snapshot`.
- **Server actions MUST declare explicit return types** (e.g. `Promise<{ error: string } | { success: true }>`). Without them, TypeScript narrowing via `"error" in result` breaks `npm run build`. This bit Plan 2.
- **Any action calling `revalidatePath` needs `vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))` in its unit test.**
- **Binary output is tested by structure, never by snapshotting bytes:** file signature/magic bytes, plus asserting that expected Korean section titles and applicant names come back out of the extracted content.
- **PDF/PPTX/font tests must start with `// @vitest-environment node`.** The repo's `vitest.config.ts` sets `environment: "jsdom"` globally; under jsdom, Vite may resolve a package's `browser` entry, and `pdfkit`/`pptxgenjs` both ship browser builds that cannot produce a Node `Buffer`.
- **Route handlers that generate binaries declare `export const runtime = "nodejs";`** — the Edge runtime has no `fs` and cannot read the embedded font.
- Tailwind tokens only: `bg-bg`, `bg-surface`, `bg-surface2`, `border-border`, `text-text`, `text-textMuted`, `bg-accent`, `text-onAccent`, `text-critical`, `text-success`, `text-warning`, `rounded-token`. All UI copy in Korean.
- No new environment variables. Everything here runs off the existing `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`.
- Commit messages in English, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## Library Choices and Why

### PDF: `pdfkit` (0.20.x)

**Rejected — any headless browser.** `puppeteer` + `@sparticuz/chromium` (or `playwright-chromium`) would let us print the web report straight to PDF, and it is the wrong answer here. The Chromium binary is ~50 MB compressed, must be unpacked into `/tmp` on every cold start, needs its own `serverExternalPackages` entry plus a version-locked `puppeteer-core` pairing, and eats most of Vercel's serverless function budget before our code runs. Calling this out explicitly because it is the tempting default: **do not use a headless browser in this plan.**

**Rejected — `@react-pdf/renderer`.** Nice declarative API, but it drags in a Yoga WASM layout engine and has a long history of ESM/bundler friction inside Next.js. Too much surface area for three static section types.

**Rejected — `pdf-lib`.** Pure and small, but it has no text layout engine at all: we would hand-roll line breaking, column wrapping, and page breaks for Korean text. That is the hardest part of the job, not the easiest.

**Chosen — `pdfkit`.** Pure JS, streams to a `Buffer`, gives us real layout primitives (`text(str, x, y, { width })`, `heightOfString`, `addPage`), and — the deciding factor — embeds an arbitrary TTF/OTF with automatic **glyph subsetting and a ToUnicode CMap** via its bundled fontkit. Subsetting keeps a 5 MB Korean font from becoming a 5 MB PDF, and the ToUnicode CMap is what makes the generated PDF's Korean text selectable, searchable, and extractable — which is also how Task 5's test verifies it.

Two serverless gotchas, both handled in Tasks 4 and 5:
1. `pdfkit` loads Helvetica's `.afm` metrics file off disk when a document is constructed. Next's bundler does not trace those data files, so on Vercel you get `ENOENT` on the very first `new PDFDocument()`. Fix: construct with `new PDFDocument({ font: "" })`, which skips the built-in font entirely, then immediately register the embedded Korean font. We never touch a standard PDF font, so no AFM is ever needed.
2. `serverExternalPackages: ["pdfkit"]` in `next.config.ts` keeps the bundler from rewriting pdfkit's dynamic file reads.

### Korean text in the PDF: embed IBM Plex Sans KR

A PDF has no system-font fallback. Any glyph not embedded in the file renders as tofu or as nothing at all — this is the single most likely way this feature ships broken. The four fonts already loaded in the app (Big Shoulders Display, IBM Plex Sans/Mono, Fraunces, Karla) are Latin-first and contain **no Hangul**, so none of them can be reused here.

**Chosen: IBM Plex Sans KR, Regular + SemiBold, committed to `assets/fonts/`.** Reasons: it is the Korean sibling of the app's existing body font (IBM Plex Sans), so the PDF looks like the product; it is SIL Open Font License 1.1, which explicitly permits embedding in documents; and it ships as static per-weight TTFs (no variable-font axis handling, which pdfkit's subsetter is happier without).

Concretely: the files are downloaded and committed in Task 4, read once with `fs.readFileSync` and memoized in `lib/reports/fonts.ts`, resolved via `path.join(process.cwd(), "assets", "fonts", …)`, and force-included into the serverless bundle with `outputFileTracingIncludes: { "/api/reports/**": ["./assets/fonts/**"] }` in `next.config.ts` — without that entry the files exist locally, pass every test, and 500 on Vercel. Task 5's test proves the round trip by extracting Korean strings back out of a generated PDF.

### PPTX: `pptxgenjs` (4.x)

**Rejected — rendering slides to images.** Any html-to-image or canvas approach produces a deck of pictures. The spec asks for 편집 가능한 PPT; a picture of a slide is not editable. Task 6's test asserts there are zero entries under `ppt/media/` precisely to keep anyone from regressing into this.

**Rejected — `docxtemplater`'s pptx module.** Template-driven (we have no template) and the pptx module is commercially licensed.

**Chosen — `pptxgenjs`.** It writes genuine OOXML: every string lands in an `<a:t>` text run inside a shape or a real `<a:tbl>` table, so PowerPoint, Keynote, and Google Slides all open it as editable text boxes. Pure JS + zip, no native deps, no bundler configuration needed. The section→slide mapping is deliberately dumb (one `ReportSection` = one slide, in order), which is exactly what the spec asks for: "웹 리포트와 동일한 섹션 구성을 슬라이드로 단순 변환한 형태".

**Korean in PPTX needs no embedding** — PowerPoint resolves fonts on the viewer's machine. We deliberately do **not** set `fontFace`, because the obvious choices are platform-locked: "맑은 고딕" is Windows-only and "AppleGothic"/"Apple SD Gothic Neo" is macOS-only, so hardcoding either guarantees broken text for half the recipients. Leaving it unset lets PowerPoint apply its own East Asian font fallback on each platform.

### Test-only inspectors

- `unpdf` — a serverless-oriented pdf.js wrapper whose `extractText` pulls text back out of a generated PDF. Used only in `lib/reports/pdf.test.ts`.
- `jszip` — a `.pptx` is a zip; this reads `ppt/slides/slideN.xml` so the test can assert on real `<a:t>` runs. Used only in `lib/reports/pptx.test.ts`.

---

## File Structure

```
marketing/
├── assets/
│   └── fonts/
│       ├── IBMPlexSansKR-Regular.ttf     # embedded in every generated PDF
│       ├── IBMPlexSansKR-SemiBold.ttf
│       └── OFL.txt                       # license, kept next to the fonts
├── next.config.ts                        # MODIFY: serverExternalPackages + font tracing
├── supabase/migrations/
│   ├── 0013_reports.sql                  # reports table + snapshot-freeze trigger
│   └── 0014_create_campaign_report_rpc.sql
├── lib/reports/
│   ├── types.ts                          # ReportSnapshot, ReportRecord, ReportSection, ReportBlock
│   ├── sections.ts                       # buildReportSections(report) -> ReportSection[]
│   ├── fonts.ts                          # loadKoreanFonts() -> { regular, bold }
│   ├── pdf.ts                            # renderReportPdf(title, sections) -> Buffer
│   └── pptx.ts                           # renderReportPptx(title, sections) -> Buffer
├── app/
│   ├── (dashboard)/campaigns/[id]/
│   │   ├── page.tsx                      # MODIFY: add the 결과보고서 entry point
│   │   └── reports/
│   │       ├── actions.ts                # generateReport, addCustomSection, deleteCustomSection
│   │       ├── page.tsx                  # report list for the campaign
│   │       ├── GenerateReportButton.tsx   # "보고서 생성" — Plan 5's 관리시트 imports this
│   │       └── [reportId]/
│   │           ├── page.tsx              # web report view + download links
│   │           ├── ReportSectionsView.tsx # renders ReportSection[] as HTML
│   │           └── CustomSectionEditor.tsx
│   └── api/reports/[reportId]/
│       ├── pdf/route.ts
│       └── pptx/route.ts
```

`lib/reports/sections.ts` is the single source of truth for what a report contains. The web view, the PDF route, and the PPTX route all call `buildReportSections` and differ only in how they draw the resulting blocks — that is what keeps the three formats identical in structure without a shared template language.

---

## Task 1: `reports` Table with an Immutable Snapshot

**Files:**
- Create: `supabase/migrations/0013_reports.sql`
- Test: `supabase/migrations/0013_reports.test.ts`

**Interfaces:**
- Consumes: `public.campaigns`, `public.profiles` (Plan 1).
- Produces: table `public.reports (id uuid pk, campaign_id uuid references campaigns on delete cascade, snapshot jsonb not null, custom_sections jsonb not null default '[]', generated_at timestamptz not null default now(), generated_by uuid references profiles)`. Authenticated users may `select`, `update`, and `delete`; there is deliberately **no** `insert` policy — Task 2's RPC is the only write path. A `BEFORE UPDATE` trigger raises `REPORT_SNAPSHOT_IS_IMMUTABLE` if `snapshot` or `generated_at` changes.

- [ ] **Step 1: Write the failing test**

`supabase/migrations/0013_reports.test.ts`:

```ts
// @vitest-environment node
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

const SNAPSHOT = {
  campaign: {
    id: "00000000-0000-0000-0000-000000000000",
    name: "글로우랩 세럼",
    company_name: "글로우랩",
    campaign_type: "shipping",
    status: "active",
  },
  influencers: [],
  totals: {
    applicant_count: 0,
    selected_count: 0,
    uploaded_count: 0,
    total_views: 0,
    total_engagement: 0,
  },
};

async function makeCampaign() {
  const { data, error } = await admin
    .from("campaigns")
    .insert({ name: "글로우랩 세럼", company_name: "글로우랩", campaign_type: "shipping" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function makeReport() {
  const campaign = await makeCampaign();
  const { data, error } = await admin
    .from("reports")
    .insert({ campaign_id: campaign.id, snapshot: SNAPSHOT })
    .select()
    .single();
  if (error) throw error;
  return data;
}

test("a report stores a snapshot and defaults to an empty custom section list", async () => {
  const report = await makeReport();

  expect(report.snapshot).toEqual(SNAPSHOT);
  expect(report.custom_sections).toEqual([]);
  expect(report.generated_at).toBeTruthy();
});

test("custom_sections can be updated after generation", async () => {
  const report = await makeReport();

  const { error } = await admin
    .from("reports")
    .update({ custom_sections: [{ id: "custom-1", title: "담당자 코멘트", body: "반응이 좋았습니다." }] })
    .eq("id", report.id);

  expect(error).toBeNull();

  const { data } = await admin.from("reports").select("custom_sections").eq("id", report.id).single();
  expect(data?.custom_sections).toEqual([
    { id: "custom-1", title: "담당자 코멘트", body: "반응이 좋았습니다." },
  ]);
});

test("the snapshot cannot be changed once the report exists", async () => {
  const report = await makeReport();

  const { error } = await admin
    .from("reports")
    .update({ snapshot: { ...SNAPSHOT, influencers: [{ name: "몰래 추가된 인플루언서" }] } })
    .eq("id", report.id);

  expect(error).not.toBeNull();
  expect(error?.message).toContain("REPORT_SNAPSHOT_IS_IMMUTABLE");

  const { data } = await admin.from("reports").select("snapshot").eq("id", report.id).single();
  expect(data?.snapshot).toEqual(SNAPSHOT);
});

test("generated_at cannot be back-dated", async () => {
  const report = await makeReport();

  const { error } = await admin
    .from("reports")
    .update({ generated_at: "2020-01-01T00:00:00Z" })
    .eq("id", report.id);

  expect(error).not.toBeNull();
  expect(error?.message).toContain("REPORT_SNAPSHOT_IS_IMMUTABLE");
});

test("the anon client cannot insert a report directly (must go through the RPC)", async () => {
  const campaign = await makeCampaign();

  const { error } = await anon
    .from("reports")
    .insert({ campaign_id: campaign.id, snapshot: SNAPSHOT });

  expect(error).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- 0013_reports`
Expected: FAIL — `relation "public.reports" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0013_reports.sql`:

```sql
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  snapshot jsonb not null,
  custom_sections jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  generated_by uuid references public.profiles(id)
);

create index reports_campaign_generated_at_idx
  on public.reports (campaign_id, generated_at desc);

-- The snapshot is a point-in-time copy: once a report row exists, its snapshot
-- and generation time are frozen. Only custom_sections may change afterwards.
create or replace function public.reports_freeze_snapshot()
returns trigger
language plpgsql
as $$
begin
  if new.snapshot is distinct from old.snapshot then
    raise exception 'REPORT_SNAPSHOT_IS_IMMUTABLE';
  end if;
  if new.generated_at is distinct from old.generated_at then
    raise exception 'REPORT_SNAPSHOT_IS_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger reports_freeze_snapshot
  before update on public.reports
  for each row execute function public.reports_freeze_snapshot();

alter table public.reports enable row level security;

create policy "authenticated users can read reports"
  on public.reports for select
  to authenticated
  using (true);

-- Only custom_sections is actually mutable; the trigger above blocks the rest.
create policy "authenticated users can update reports"
  on public.reports for update
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can delete reports"
  on public.reports for delete
  to authenticated
  using (true);

-- Deliberately no insert policy: public.create_campaign_report (migration 0014)
-- is the only path that creates a report.
```

- [ ] **Step 4: Apply the migration and run test to verify it passes**

Run: `npx supabase migration up`
Run: `npm test -- 0013_reports`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0013_reports.sql supabase/migrations/0013_reports.test.ts
git commit -m "$(cat <<'EOF'
feat: add reports table with a database-enforced immutable snapshot

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `create_campaign_report` RPC — the Point-in-Time Snapshot

**Files:**
- Create: `supabase/migrations/0014_create_campaign_report_rpc.sql`
- Test: `supabase/migrations/0014_create_campaign_report_rpc.test.ts`

**Interfaces:**
- Consumes: `public.campaigns` (Plan 1), `public.applicants` (Plan 3), `public.seeding_records` (Plan 4), `public.reports` (Task 1).
- Produces: `create_campaign_report(p_campaign_id uuid) returns uuid` — builds the snapshot in one statement, inserts a `reports` row, and returns its id; returns `null` if no campaign matches. Granted to `authenticated` only (report generation is an internal, logged-in action — the spec gives reports no public share token).
- Produces the snapshot shape, which Task 3 mirrors in TypeScript as `ReportSnapshot`:

```json
{
  "campaign":    { "id", "name", "company_name", "campaign_type", "status" },
  "influencers": [ { "applicant_id", "name", "sns_url", "nationality",
                     "stage", "upload_url", "upload_deadline", "views", "engagement" } ],
  "totals":      { "applicant_count", "selected_count", "uploaded_count",
                   "total_views", "total_engagement" }
}
```

`influencers` contains only `status = 'selected'` applicants — the 참여 인플루언서 리스트 is who actually participated, and per the spec `reserved` applicants never reach the 관리시트. `totals.applicant_count` counts every applicant regardless of status.

- [ ] **Step 1: Write the failing test**

This is the test that proves the snapshot is a real point-in-time copy: it mutates the source rows after generation and asserts the stored report does not move, then generates a second report and asserts that one *does* see the new values (which rules out "the report just looks frozen because nothing was re-read").

`supabase/migrations/0014_create_campaign_report_rpc.test.ts`:

```ts
// @vitest-environment node
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "vitest";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seedCampaign() {
  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .insert({ name: "글로우랩 세럼", company_name: "글로우랩", campaign_type: "shipping" })
    .select()
    .single();
  if (campaignError) throw campaignError;

  const { data: applicants, error: applicantError } = await admin
    .from("applicants")
    .insert([
      {
        campaign_id: campaign.id,
        name: "김미영",
        sns_url: "https://instagram.com/kimmiyoung",
        nationality: "대한민국",
        status: "selected",
      },
      {
        campaign_id: campaign.id,
        name: "박준호",
        sns_url: "https://instagram.com/parkjunho",
        nationality: "대한민국",
        status: "selected",
      },
      {
        campaign_id: campaign.id,
        name: "최지우",
        sns_url: "https://instagram.com/choijiwoo",
        nationality: "대한민국",
        status: "rejected",
      },
    ])
    .select();
  if (applicantError) throw applicantError;

  const selected = applicants.filter((a) => a.status === "selected");
  const { error: recordError } = await admin.from("seeding_records").insert([
    {
      applicant_id: selected[0].id,
      campaign_id: campaign.id,
      progress_stage: "업로드완료",
      upload_url: "https://instagram.com/p/aaa",
      view_count: 12000,
      engagement_count: 800,
    },
    {
      applicant_id: selected[1].id,
      campaign_id: campaign.id,
      progress_stage: "수령완료",
      upload_url: null,
      view_count: 0,
      engagement_count: 0,
    },
  ]);
  if (recordError) throw recordError;

  return { campaign, selected };
}

test("the snapshot captures the campaign, selected influencers, and totals", async () => {
  const { campaign } = await seedCampaign();

  const { data: reportId, error } = await admin.rpc("create_campaign_report", {
    p_campaign_id: campaign.id,
  });
  expect(error).toBeNull();
  expect(reportId).toBeTruthy();

  const { data: report } = await admin
    .from("reports")
    .select("snapshot")
    .eq("id", reportId)
    .single();

  expect(report!.snapshot.campaign).toEqual({
    id: campaign.id,
    name: "글로우랩 세럼",
    company_name: "글로우랩",
    campaign_type: "shipping",
    status: "draft",
  });

  const names = report!.snapshot.influencers.map((i: { name: string }) => i.name);
  expect(names).toEqual(["김미영", "박준호"]);
  expect(names).not.toContain("최지우");

  expect(report!.snapshot.totals).toEqual({
    applicant_count: 3,
    selected_count: 2,
    uploaded_count: 1,
    total_views: 12000,
    total_engagement: 800,
  });
});

test("editing applicants or seeding_records afterwards does not change an existing report", async () => {
  const { campaign, selected } = await seedCampaign();

  const { data: reportId } = await admin.rpc("create_campaign_report", {
    p_campaign_id: campaign.id,
  });
  const { data: before } = await admin
    .from("reports")
    .select("snapshot")
    .eq("id", reportId)
    .single();

  await admin.from("applicants").update({ name: "이름이 바뀐 인플루언서" }).eq("id", selected[0].id);
  await admin
    .from("seeding_records")
    .update({ view_count: 999999, engagement_count: 55555, upload_url: "https://instagram.com/p/zzz" })
    .eq("applicant_id", selected[1].id);

  const { data: after } = await admin
    .from("reports")
    .select("snapshot")
    .eq("id", reportId)
    .single();

  expect(after!.snapshot).toEqual(before!.snapshot);
  expect(after!.snapshot.totals.total_views).toBe(12000);
  expect(after!.snapshot.influencers.map((i: { name: string }) => i.name)).toEqual([
    "김미영",
    "박준호",
  ]);
});

test("a report generated after the edits sees the new values", async () => {
  const { campaign, selected } = await seedCampaign();

  const { data: firstId } = await admin.rpc("create_campaign_report", {
    p_campaign_id: campaign.id,
  });
  await admin.from("seeding_records").update({ view_count: 50000 }).eq("applicant_id", selected[0].id);
  const { data: secondId } = await admin.rpc("create_campaign_report", {
    p_campaign_id: campaign.id,
  });

  const { data: first } = await admin.from("reports").select("snapshot").eq("id", firstId).single();
  const { data: second } = await admin.from("reports").select("snapshot").eq("id", secondId).single();

  expect(first!.snapshot.totals.total_views).toBe(12000);
  expect(second!.snapshot.totals.total_views).toBe(50000);
});

test("an unknown campaign id returns null and inserts nothing", async () => {
  const { data, error } = await admin.rpc("create_campaign_report", {
    p_campaign_id: "00000000-0000-0000-0000-000000000000",
  });

  expect(error).toBeNull();
  expect(data).toBeNull();

  const { count } = await admin
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", "00000000-0000-0000-0000-000000000000");
  expect(count).toBe(0);
});

test("a campaign with no applicants still produces a valid empty snapshot", async () => {
  const { data: campaign } = await admin
    .from("campaigns")
    .insert({ name: "빈 캠페인", company_name: "글로우랩", campaign_type: "visit" })
    .select()
    .single();

  const { data: reportId } = await admin.rpc("create_campaign_report", {
    p_campaign_id: campaign!.id,
  });
  const { data: report } = await admin
    .from("reports")
    .select("snapshot")
    .eq("id", reportId)
    .single();

  expect(report!.snapshot.influencers).toEqual([]);
  expect(report!.snapshot.totals).toEqual({
    applicant_count: 0,
    selected_count: 0,
    uploaded_count: 0,
    total_views: 0,
    total_engagement: 0,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- 0014_create_campaign_report_rpc`
Expected: FAIL — `function create_campaign_report(uuid) does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0014_create_campaign_report_rpc.sql`:

```sql
-- Builds the whole snapshot in one statement so the copy is atomic: everything
-- in the resulting JSONB is read at the same instant, and nothing re-reads the
-- source tables afterwards.
create or replace function public.create_campaign_report(p_campaign_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
  v_report_id uuid;
begin
  select jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'company_name', c.company_name,
      'campaign_type', c.campaign_type,
      'status', c.status
    ),
    'influencers', coalesce(inf.rows, '[]'::jsonb),
    'totals', jsonb_build_object(
      'applicant_count', coalesce(agg.applicant_count, 0),
      'selected_count', coalesce(agg.selected_count, 0),
      'uploaded_count', coalesce(agg.uploaded_count, 0),
      'total_views', coalesce(agg.total_views, 0),
      'total_engagement', coalesce(agg.total_engagement, 0)
    )
  )
  into v_snapshot
  from public.campaigns c
  left join lateral (
    select jsonb_agg(
             jsonb_build_object(
               'applicant_id', a.id,
               'name', a.name,
               'sns_url', a.sns_url,
               'nationality', a.nationality,
               'stage', s.progress_stage,
               'upload_url', s.upload_url,
               'upload_deadline', s.upload_deadline,
               'views', s.view_count,
               'engagement', s.engagement_count
             )
             order by a.applied_at, a.id
           ) as rows
    from public.applicants a
    left join public.seeding_records s on s.applicant_id = a.id
    where a.campaign_id = c.id
      and a.status = 'selected'
  ) inf on true
  left join lateral (
    select
      count(*) as applicant_count,
      count(*) filter (where a.status = 'selected') as selected_count,
      count(*) filter (where s.upload_url is not null and s.upload_url <> '') as uploaded_count,
      coalesce(sum(coalesce(s.view_count, 0)), 0) as total_views,
      coalesce(sum(coalesce(s.engagement_count, 0)), 0) as total_engagement
    from public.applicants a
    left join public.seeding_records s on s.applicant_id = a.id
    where a.campaign_id = c.id
  ) agg on true
  where c.id = p_campaign_id;

  if v_snapshot is null then
    return null;
  end if;

  insert into public.reports (campaign_id, snapshot, generated_by)
  values (p_campaign_id, v_snapshot, auth.uid())
  returning id into v_report_id;

  return v_report_id;
end;
$$;

grant execute on function public.create_campaign_report(uuid) to authenticated;
```

- [ ] **Step 4: Apply the migration and run test to verify it passes**

Run: `npx supabase migration up`
Run: `npm test -- 0014_create_campaign_report_rpc`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0014_create_campaign_report_rpc.sql supabase/migrations/0014_create_campaign_report_rpc.test.ts
git commit -m "$(cat <<'EOF'
feat: add create_campaign_report RPC taking an atomic point-in-time snapshot

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Report Section Model

**Files:**
- Create: `lib/reports/types.ts`
- Create: `lib/reports/sections.ts`
- Test: `lib/reports/sections.test.ts`

**Interfaces:**
- Consumes: the snapshot shape produced by Task 2.
- Produces (every later task imports from here):

```ts
type ReportSnapshotCampaign = { id: string; name: string; company_name: string; campaign_type: "shipping" | "visit"; status: string };
type ReportSnapshotInfluencer = { applicant_id: string; name: string; sns_url: string | null; nationality: string | null; stage: string | null; upload_url: string | null; upload_deadline: string | null; views: number | null; engagement: number | null };
type ReportSnapshotTotals = { applicant_count: number; selected_count: number; uploaded_count: number; total_views: number; total_engagement: number };
type ReportSnapshot = { campaign: ReportSnapshotCampaign; influencers: ReportSnapshotInfluencer[]; totals: ReportSnapshotTotals };
type CustomSection = { id: string; title: string; body: string };
type ReportRecord = { id: string; campaign_id: string; snapshot: ReportSnapshot; custom_sections: CustomSection[]; generated_at: string };
type ReportBlock =
  | { type: "keyValue"; items: { label: string; value: string }[] }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "text"; body: string };
type ReportSection = { id: string; title: string; blocks: ReportBlock[] };

function buildReportSections(report: ReportRecord): ReportSection[];
```

- [ ] **Step 1: Write the failing test**

`lib/reports/sections.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { buildReportSections } from "./sections";
import type { ReportRecord } from "./types";

function makeReport(overrides: Partial<ReportRecord> = {}): ReportRecord {
  return {
    id: "r1",
    campaign_id: "c1",
    generated_at: "2026-08-30T12:00:00.000Z",
    custom_sections: [],
    snapshot: {
      campaign: {
        id: "c1",
        name: "글로우랩 세럼",
        company_name: "글로우랩",
        campaign_type: "shipping",
        status: "active",
      },
      influencers: [
        {
          applicant_id: "a1",
          name: "김미영",
          sns_url: "https://instagram.com/kimmiyoung",
          nationality: "대한민국",
          progress_stage: "업로드완료",
          upload_url: "https://instagram.com/p/aaa",
          upload_deadline: "2026-09-15",
          views: 12000,
          engagement: 800,
        },
        {
          applicant_id: "a2",
          name: "박준호",
          sns_url: "https://instagram.com/parkjunho",
          nationality: "대한민국",
          progress_stage: "수령완료",
          upload_url: null,
          upload_deadline: "2026-09-15",
          views: 0,
          engagement: 0,
        },
      ],
      totals: {
        applicant_count: 3,
        selected_count: 2,
        uploaded_count: 1,
        total_views: 12000,
        total_engagement: 800,
      },
    },
    ...overrides,
  };
}

describe("buildReportSections", () => {
  test("produces the three 기본 섹션 in spec order", () => {
    const sections = buildReportSections(makeReport());

    expect(sections.map((s) => s.title)).toEqual([
      "캠페인 개요",
      "참여 인플루언서 리스트",
      "성과 요약",
    ]);
  });

  test("캠페인 개요 lists the campaign facts and the generation date", () => {
    const [overview] = buildReportSections(makeReport());

    expect(overview.blocks).toEqual([
      {
        type: "keyValue",
        items: [
          { label: "캠페인명", value: "글로우랩 세럼" },
          { label: "업체명", value: "글로우랩" },
          { label: "캠페인 유형", value: "제품배송형" },
          { label: "보고서 생성일", value: "2026년 8월 30일" },
        ],
      },
    ]);
  });

  test("참여 인플루언서 리스트 is a 이름/SNS링크/업로드링크 table", () => {
    const influencers = buildReportSections(makeReport())[1];

    expect(influencers.blocks).toEqual([
      {
        type: "table",
        columns: ["이름", "SNS 링크", "업로드 링크"],
        rows: [
          ["김미영", "https://instagram.com/kimmiyoung", "https://instagram.com/p/aaa"],
          ["박준호", "https://instagram.com/parkjunho", "미업로드"],
        ],
      },
    ]);
  });

  test("성과 요약 formats numbers and computes the engagement rate", () => {
    const performance = buildReportSections(makeReport())[2];

    expect(performance.blocks).toEqual([
      {
        type: "keyValue",
        items: [
          { label: "총 지원자", value: "3명" },
          { label: "최종 선정", value: "2명" },
          { label: "업로드 완료", value: "1건" },
          { label: "총 조회수", value: "12,000" },
          { label: "총 인게이지먼트", value: "800" },
          { label: "평균 인게이지먼트율", value: "6.7%" },
        ],
      },
    ]);
  });

  test("the engagement rate is a dash when there are no views", () => {
    const report = makeReport();
    report.snapshot.totals.total_views = 0;
    report.snapshot.totals.total_engagement = 0;

    const performance = buildReportSections(report)[2];
    const items = (performance.blocks[0] as { items: { label: string; value: string }[] }).items;

    expect(items.find((i) => i.label === "평균 인게이지먼트율")?.value).toBe("-");
  });

  test("an empty influencer list renders a message instead of an empty table", () => {
    const report = makeReport();
    report.snapshot.influencers = [];

    const influencers = buildReportSections(report)[1];
    expect(influencers.blocks).toEqual([
      { type: "text", body: "참여한 인플루언서가 없습니다." },
    ]);
  });

  test("custom sections are appended after the 기본 섹션, in order", () => {
    const report = makeReport({
      custom_sections: [
        { id: "custom-1", title: "담당자 코멘트", body: "반응이 좋았습니다." },
        { id: "custom-2", title: "다음 캠페인 제안", body: "리뉴얼 제품으로 재진행 추천." },
      ],
    });

    const sections = buildReportSections(report);

    expect(sections.map((s) => s.title)).toEqual([
      "캠페인 개요",
      "참여 인플루언서 리스트",
      "성과 요약",
      "담당자 코멘트",
      "다음 캠페인 제안",
    ]);
    expect(sections[3]).toEqual({
      id: "custom-1",
      title: "담당자 코멘트",
      blocks: [{ type: "text", body: "반응이 좋았습니다." }],
    });
  });

  test("현장방문형 campaigns show the visit type label", () => {
    const report = makeReport();
    report.snapshot.campaign.campaign_type = "visit";

    const [overview] = buildReportSections(report);
    const items = (overview.blocks[0] as { items: { label: string; value: string }[] }).items;

    expect(items.find((i) => i.label === "캠페인 유형")?.value).toBe("현장방문형");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- reports/sections`
Expected: FAIL — `lib/reports/sections.ts` doesn't exist.

- [ ] **Step 3: Write the types**

`lib/reports/types.ts`:

```ts
export type ReportSnapshotCampaign = {
  id: string;
  name: string;
  company_name: string;
  campaign_type: "shipping" | "visit";
  status: string;
};

export type ReportSnapshotInfluencer = {
  applicant_id: string;
  name: string;
  sns_url: string | null;
  nationality: string | null;
  stage: string | null;
  upload_url: string | null;
  upload_deadline: string | null;
  views: number | null;
  engagement: number | null;
};

export type ReportSnapshotTotals = {
  applicant_count: number;
  selected_count: number;
  uploaded_count: number;
  total_views: number;
  total_engagement: number;
};

/** Frozen at generation time by public.create_campaign_report. Never edited. */
export type ReportSnapshot = {
  campaign: ReportSnapshotCampaign;
  influencers: ReportSnapshotInfluencer[];
  totals: ReportSnapshotTotals;
};

/** The one editable part of a report. */
export type CustomSection = { id: string; title: string; body: string };

export type ReportRecord = {
  id: string;
  campaign_id: string;
  snapshot: ReportSnapshot;
  custom_sections: CustomSection[];
  generated_at: string;
};

export type ReportBlock =
  | { type: "keyValue"; items: { label: string; value: string }[] }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "text"; body: string };

export type ReportSection = { id: string; title: string; blocks: ReportBlock[] };
```

- [ ] **Step 4: Write the section builder**

`lib/reports/sections.ts`:

```ts
import type { ReportRecord, ReportSection } from "./types";

const TYPE_LABEL: Record<string, string> = {
  shipping: "제품배송형",
  visit: "현장방문형",
};

function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function buildReportSections(report: ReportRecord): ReportSection[] {
  const { campaign, influencers, totals } = report.snapshot;

  const engagementRate =
    totals.total_views > 0
      ? `${((totals.total_engagement / totals.total_views) * 100).toFixed(1)}%`
      : "-";

  const sections: ReportSection[] = [
    {
      id: "overview",
      title: "캠페인 개요",
      blocks: [
        {
          type: "keyValue",
          items: [
            { label: "캠페인명", value: campaign.name },
            { label: "업체명", value: campaign.company_name },
            {
              label: "캠페인 유형",
              value: TYPE_LABEL[campaign.campaign_type] ?? campaign.campaign_type,
            },
            { label: "보고서 생성일", value: formatDate(report.generated_at) },
          ],
        },
      ],
    },
    {
      id: "influencers",
      title: "참여 인플루언서 리스트",
      blocks:
        influencers.length === 0
          ? [{ type: "text", body: "참여한 인플루언서가 없습니다." }]
          : [
              {
                type: "table",
                columns: ["이름", "SNS 링크", "업로드 링크"],
                rows: influencers.map((i) => [
                  i.name,
                  i.sns_url ?? "-",
                  i.upload_url ?? "미업로드",
                ]),
              },
            ],
    },
    {
      id: "performance",
      title: "성과 요약",
      blocks: [
        {
          type: "keyValue",
          items: [
            { label: "총 지원자", value: `${formatNumber(totals.applicant_count)}명` },
            { label: "최종 선정", value: `${formatNumber(totals.selected_count)}명` },
            { label: "업로드 완료", value: `${formatNumber(totals.uploaded_count)}건` },
            { label: "총 조회수", value: formatNumber(totals.total_views) },
            { label: "총 인게이지먼트", value: formatNumber(totals.total_engagement) },
            { label: "평균 인게이지먼트율", value: engagementRate },
          ],
        },
      ],
    },
  ];

  for (const custom of report.custom_sections) {
    sections.push({
      id: custom.id,
      title: custom.title,
      blocks: [{ type: "text", body: custom.body }],
    });
  }

  return sections;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- reports/sections`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/reports/types.ts lib/reports/sections.ts lib/reports/sections.test.ts
git commit -m "$(cat <<'EOF'
feat: add report snapshot types and the shared section builder

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Embedded Korean Font

**Files:**
- Create: `assets/fonts/IBMPlexSansKR-Regular.ttf`
- Create: `assets/fonts/IBMPlexSansKR-SemiBold.ttf`
- Create: `assets/fonts/OFL.txt`
- Create: `lib/reports/fonts.ts`
- Modify: `next.config.ts`
- Test: `lib/reports/fonts.test.ts`

**Interfaces:**
- Produces: `loadKoreanFonts(): { regular: Buffer; bold: Buffer }` — reads both TTFs from `assets/fonts/` once and memoizes them. Task 5's PDF renderer is the only consumer.

- [ ] **Step 1: Download the fonts**

```bash
mkdir -p assets/fonts
curl -fL -o assets/fonts/IBMPlexSansKR-Regular.ttf \
  https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexsanskr/IBMPlexSansKR-Regular.ttf
curl -fL -o assets/fonts/IBMPlexSansKR-SemiBold.ttf \
  https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexsanskr/IBMPlexSansKR-SemiBold.ttf
curl -fL -o assets/fonts/OFL.txt \
  https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexsanskr/OFL.txt
```

Verify you got real font binaries and not an HTML error page — each file should be several megabytes and start with an sfnt signature:

```bash
ls -l assets/fonts
xxd -l 4 assets/fonts/IBMPlexSansKR-Regular.ttf   # expect: 0001 0000  (or 4f54 544f for OTTO)
```

If the raw.githubusercontent path 404s (the Google Fonts repo occasionally reorganises family directories), download the family manually from https://fonts.google.com/specimen/IBM+Plex+Sans+KR, unzip it, and copy the Regular and SemiBold static TTFs to the same two paths. Any OFL-licensed Korean family with a Regular and a Bold weight works; the rest of this plan only cares about the two filenames.

Confirm git will actually track them (some `.gitignore` templates exclude binary asset globs):

```bash
git check-ignore -v assets/fonts/IBMPlexSansKR-Regular.ttf || echo "not ignored - good"
```

- [ ] **Step 2: Write the failing test**

`lib/reports/fonts.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, test } from "vitest";
import { loadKoreanFonts } from "./fonts";

describe("loadKoreanFonts", () => {
  test("returns both weights as real sfnt font binaries", () => {
    const fonts = loadKoreanFonts();

    for (const buffer of [fonts.regular, fonts.bold]) {
      // A PDF has no system-font fallback, so the Hangul glyphs have to be in
      // the file we ship. If this is not a font, every Korean character in the
      // generated PDF renders as tofu.
      const signature = buffer.subarray(0, 4).toString("hex");
      expect(["00010000", "4f54544f"]).toContain(signature);
      expect(buffer.byteLength).toBeGreaterThan(1_000_000);
    }
  });

  test("memoizes so repeated report generation does not re-read from disk", () => {
    expect(loadKoreanFonts()).toBe(loadKoreanFonts());
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- reports/fonts`
Expected: FAIL — `lib/reports/fonts.ts` doesn't exist.

- [ ] **Step 4: Write the loader**

`lib/reports/fonts.ts`:

```ts
import fs from "node:fs";
import path from "node:path";

export type KoreanFonts = { regular: Buffer; bold: Buffer };

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

let cached: KoreanFonts | null = null;

/**
 * A PDF embeds its own fonts — there is no system fallback. The app's UI fonts
 * (Big Shoulders Display / IBM Plex Sans / Fraunces / Karla) are all Latin-first
 * and carry no Hangul, so the PDF renderer embeds IBM Plex Sans KR instead.
 * pdfkit subsets it, so only the glyphs actually used end up in the output file.
 *
 * These files reach Vercel via `outputFileTracingIncludes` in next.config.ts.
 */
export function loadKoreanFonts(): KoreanFonts {
  if (cached) return cached;

  cached = {
    regular: fs.readFileSync(path.join(FONT_DIR, "IBMPlexSansKR-Regular.ttf")),
    bold: fs.readFileSync(path.join(FONT_DIR, "IBMPlexSansKR-SemiBold.ttf")),
  };

  return cached;
}
```

- [ ] **Step 5: Make the fonts survive the Vercel bundle**

`next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit reads data files at runtime; leave it out of the bundler's hands.
  serverExternalPackages: ["pdfkit"],
  // Without this, the Korean TTFs exist locally, every test passes, and the
  // download routes 500 on Vercel with ENOENT because nothing imports the
  // font files statically for the tracer to find.
  outputFileTracingIncludes: {
    "/api/reports/**": ["./assets/fonts/**"],
  },
};

export default nextConfig;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- reports/fonts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add assets/fonts lib/reports/fonts.ts lib/reports/fonts.test.ts next.config.ts
git commit -m "$(cat <<'EOF'
feat: embed IBM Plex Sans KR for Korean PDF rendering

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: PDF Renderer

**Files:**
- Create: `lib/reports/pdf.ts`
- Test: `lib/reports/pdf.test.ts`
- Modify: `package.json` (adds `pdfkit`, `@types/pdfkit`, `unpdf`)

**Interfaces:**
- Consumes: `loadKoreanFonts()` (Task 4), `ReportSection` / `ReportBlock` (Task 3).
- Produces: `renderReportPdf(title: string, sections: ReportSection[]): Promise<Buffer>`.

- [ ] **Step 1: Install the libraries**

```bash
npm install pdfkit
npm install --save-dev @types/pdfkit unpdf
```

`pdfkit` renders the PDF; `@types/pdfkit` provides the global `PDFKit` namespace used in the signatures below; `unpdf` is test-only and reads text back out of the generated file.

- [ ] **Step 2: Write the failing test**

Note on assertions: PDF text extraction returns one item per drawn text run, so only assert on strings that this renderer draws in a **single** `doc.text()` call (a whole `"라벨: 값"` line, a whole table cell, a whole section title). Never assert on a phrase that spans two runs.

`lib/reports/pdf.test.ts`:

```ts
// @vitest-environment node
import { beforeAll, describe, expect, test } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { renderReportPdf } from "./pdf";
import type { ReportSection } from "./types";

const sections: ReportSection[] = [
  {
    id: "overview",
    title: "캠페인 개요",
    blocks: [
      {
        type: "keyValue",
        items: [
          { label: "캠페인명", value: "글로우랩 세럼" },
          { label: "업체명", value: "글로우랩" },
          { label: "캠페인 유형", value: "제품배송형" },
        ],
      },
    ],
  },
  {
    id: "influencers",
    title: "참여 인플루언서 리스트",
    blocks: [
      {
        type: "table",
        columns: ["이름", "SNS 링크", "업로드 링크"],
        rows: [
          ["김미영", "https://instagram.com/kimmiyoung", "https://instagram.com/p/aaa"],
          ["박준호", "https://instagram.com/parkjunho", "미업로드"],
        ],
      },
    ],
  },
  {
    id: "custom-1",
    title: "담당자 코멘트",
    blocks: [{ type: "text", body: "20대 여성 타겟에서 반응이 특히 좋았습니다." }],
  },
];

describe("renderReportPdf", () => {
  let pdf: Buffer;
  let text: string;

  beforeAll(async () => {
    pdf = await renderReportPdf("글로우랩 세럼 결과보고서", sections);
    const proxy = await getDocumentProxy(new Uint8Array(pdf));
    const extracted = await extractText(proxy, { mergePages: true });
    text = extracted.text;
  }, 30_000);

  test("produces a real PDF file", () => {
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.subarray(-6).toString("latin1")).toContain("%%EOF");
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });

  test("embeds a subset rather than the whole 5MB font", () => {
    // Proof the pdfkit subsetter is doing its job: a three-section report uses a
    // few hundred glyphs, so the output must be far smaller than the source TTF.
    expect(pdf.byteLength).toBeLessThan(1_500_000);
  });

  test("renders the report title and every section title in Korean", () => {
    expect(text).toContain("글로우랩 세럼 결과보고서");
    expect(text).toContain("캠페인 개요");
    expect(text).toContain("참여 인플루언서 리스트");
    expect(text).toContain("담당자 코멘트");
  });

  test("renders key/value lines, table cells, and free text", () => {
    expect(text).toContain("캠페인명: 글로우랩 세럼");
    expect(text).toContain("김미영");
    expect(text).toContain("박준호");
    expect(text).toContain("미업로드");
    expect(text).toContain("20대 여성 타겟에서 반응이 특히 좋았습니다.");
  });

  test("paginates instead of overflowing when there are many rows", async () => {
    const many: ReportSection[] = [
      {
        id: "influencers",
        title: "참여 인플루언서 리스트",
        blocks: [
          {
            type: "table",
            columns: ["이름", "SNS 링크", "업로드 링크"],
            rows: Array.from({ length: 120 }, (_, i) => [
              `인플루언서${i}`,
              `https://instagram.com/user${i}`,
              "미업로드",
            ]),
          },
        ],
      },
    ];

    const big = await renderReportPdf("대형 캠페인 결과보고서", many);
    const proxy = await getDocumentProxy(new Uint8Array(big));
    expect(proxy.numPages).toBeGreaterThan(1);

    const { text: bigText } = await extractText(proxy, { mergePages: true });
    expect(bigText).toContain("인플루언서0");
    expect(bigText).toContain("인플루언서119");
  }, 30_000);
});
```

If `text` comes back empty, the cause is almost always that the font failed to embed (check Task 4's test first) — not the extractor.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- reports/pdf`
Expected: FAIL — `lib/reports/pdf.ts` doesn't exist.

- [ ] **Step 4: Write the renderer**

`lib/reports/pdf.ts`:

```ts
import PDFDocument from "pdfkit";
import { loadKoreanFonts } from "./fonts";
import type { ReportSection } from "./types";

const MARGIN = 50;
const CELL_PADDING = 4;

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

function drawTable(
  doc: PDFKit.PDFDocument,
  columns: string[],
  rows: string[][],
  contentWidth: number
): void {
  const colWidth = contentWidth / columns.length;
  const innerWidth = colWidth - CELL_PADDING * 2;

  const writeRow = (cells: string[], font: "KR" | "KR-Bold") => {
    doc.font(font).fontSize(9);
    const rowHeight =
      Math.max(...cells.map((c) => doc.heightOfString(c, { width: innerWidth }))) +
      CELL_PADDING * 2;

    ensureSpace(doc, rowHeight);
    const top = doc.y;

    cells.forEach((cell, i) => {
      doc.text(cell, MARGIN + i * colWidth + CELL_PADDING, top + CELL_PADDING, {
        width: innerWidth,
      });
    });

    doc.y = top + rowHeight;
    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(MARGIN + contentWidth, doc.y)
      .lineWidth(0.5)
      .strokeColor("#CCCCCC")
      .stroke();
    doc.x = MARGIN;
  };

  writeRow(columns, "KR-Bold");
  for (const row of rows) writeRow(row, "KR");
}

export async function renderReportPdf(
  title: string,
  sections: ReportSection[]
): Promise<Buffer> {
  const fonts = loadKoreanFonts();

  // `font: ""` skips pdfkit's built-in Helvetica. Its .afm metrics file is not
  // traced into the Vercel serverless bundle, so constructing a document the
  // normal way throws ENOENT in production. Every glyph we draw comes from the
  // embedded Korean font below instead, so no standard font is ever needed.
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, font: "" });
  doc.registerFont("KR", fonts.regular);
  doc.registerFont("KR-Bold", fonts.bold);

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const contentWidth = doc.page.width - MARGIN * 2;

  doc.font("KR-Bold").fontSize(22).text(title, { width: contentWidth });
  doc.moveDown(1.5);

  for (const section of sections) {
    ensureSpace(doc, 60);
    doc.x = MARGIN;
    doc.font("KR-Bold").fontSize(15).text(section.title, { width: contentWidth });
    doc.moveDown(0.5);

    for (const block of section.blocks) {
      if (block.type === "keyValue") {
        doc.font("KR").fontSize(10.5);
        for (const item of block.items) {
          ensureSpace(doc, 20);
          doc.x = MARGIN;
          doc.text(`${item.label}: ${item.value}`, { width: contentWidth });
        }
      } else if (block.type === "text") {
        ensureSpace(doc, 30);
        doc.x = MARGIN;
        doc.font("KR").fontSize(10.5).text(block.body, { width: contentWidth });
      } else {
        drawTable(doc, block.columns, block.rows, contentWidth);
      }
    }

    doc.moveDown(1.2);
  }

  doc.end();
  return done;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- reports/pdf`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/reports/pdf.ts lib/reports/pdf.test.ts
git commit -m "$(cat <<'EOF'
feat: render report sections to PDF with embedded Korean font

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: PPTX Renderer

**Files:**
- Create: `lib/reports/pptx.ts`
- Test: `lib/reports/pptx.test.ts`
- Modify: `package.json` (adds `pptxgenjs`, `jszip`)

**Interfaces:**
- Consumes: `ReportSection` / `ReportBlock` (Task 3).
- Produces: `renderReportPptx(title: string, sections: ReportSection[]): Promise<Buffer>` — a cover slide plus exactly one slide per section, in order.

- [ ] **Step 1: Install the libraries**

```bash
npm install pptxgenjs
npm install --save-dev jszip
```

`jszip` is test-only: a `.pptx` is a zip, and the test opens it to check that the slide XML holds real editable text runs.

- [ ] **Step 2: Write the failing test**

`lib/reports/pptx.test.ts`:

```ts
// @vitest-environment node
import JSZip from "jszip";
import { beforeAll, describe, expect, test } from "vitest";
import { renderReportPptx } from "./pptx";
import type { ReportSection } from "./types";

const sections: ReportSection[] = [
  {
    id: "overview",
    title: "캠페인 개요",
    blocks: [
      {
        type: "keyValue",
        items: [
          { label: "캠페인명", value: "글로우랩 세럼" },
          { label: "업체명", value: "글로우랩" },
        ],
      },
    ],
  },
  {
    id: "influencers",
    title: "참여 인플루언서 리스트",
    blocks: [
      {
        type: "table",
        columns: ["이름", "SNS 링크", "업로드 링크"],
        rows: [["김미영", "https://instagram.com/kimmiyoung", "https://instagram.com/p/aaa"]],
      },
    ],
  },
  {
    id: "custom-1",
    title: "담당자 코멘트",
    blocks: [{ type: "text", body: "20대 여성 타겟에서 반응이 특히 좋았습니다." }],
  },
];

describe("renderReportPptx", () => {
  let pptx: Buffer;
  let zip: JSZip;
  let slideNames: string[];
  let slideXml: string;

  beforeAll(async () => {
    pptx = await renderReportPptx("글로우랩 세럼 결과보고서", sections);
    zip = await JSZip.loadAsync(pptx);
    slideNames = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort();
    slideXml = (
      await Promise.all(slideNames.map((n) => zip.file(n)!.async("string")))
    ).join("");
  }, 30_000);

  test("produces a real OOXML package", () => {
    expect(pptx.subarray(0, 4).toString("latin1")).toBe("PK");
    expect(zip.file("ppt/presentation.xml")).not.toBeNull();
    expect(zip.file("[Content_Types].xml")).not.toBeNull();
  });

  test("maps one slide per section, plus a cover slide", () => {
    expect(slideNames).toHaveLength(sections.length + 1);
  });

  test("every section title is an editable text run, not an image", () => {
    // <a:t> is an OOXML text run. If these strings only existed inside a picture
    // the deck would open as a slideshow of screenshots, which the spec forbids.
    expect(slideXml).toMatch(/<a:t[^>]*>[^<]*캠페인 개요[^<]*<\/a:t>/);
    expect(slideXml).toMatch(/<a:t[^>]*>[^<]*참여 인플루언서 리스트[^<]*<\/a:t>/);
    expect(slideXml).toMatch(/<a:t[^>]*>[^<]*담당자 코멘트[^<]*<\/a:t>/);
  });

  test("influencer names and key/value lines are editable text", () => {
    expect(slideXml).toMatch(/<a:t[^>]*>[^<]*김미영[^<]*<\/a:t>/);
    expect(slideXml).toMatch(/<a:t[^>]*>[^<]*글로우랩 세럼[^<]*<\/a:t>/);
    expect(slideXml).toMatch(/<a:t[^>]*>[^<]*20대 여성 타겟에서 반응이 특히 좋았습니다\.[^<]*<\/a:t>/);
  });

  test("tables are real PowerPoint tables", () => {
    expect(slideXml).toContain("<a:tbl>");
  });

  test("contains no rasterized slide images", () => {
    const media = Object.keys(zip.files).filter((n) => n.startsWith("ppt/media/"));
    expect(media).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- reports/pptx`
Expected: FAIL — `lib/reports/pptx.ts` doesn't exist.

- [ ] **Step 4: Write the renderer**

`lib/reports/pptx.ts`:

```ts
import PptxGenJS from "pptxgenjs";
import type { ReportSection } from "./types";

const LEFT = 0.6;
const WIDTH = 8.8;

/**
 * The spec asks for "웹 리포트와 동일한 섹션 구성을 슬라이드로 단순 변환한 형태",
 * so the mapping is deliberately one section = one slide, in order.
 *
 * We never set `fontFace`: the usual Korean choices are platform-locked
 * ("맑은 고딕" is Windows-only, "Apple SD Gothic Neo" is macOS-only), so
 * hardcoding either breaks the deck for half the recipients. Leaving it unset
 * lets PowerPoint apply its own East Asian font fallback per platform.
 */
export async function renderReportPptx(
  title: string,
  sections: ReportSection[]
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";

  const cover = pptx.addSlide();
  cover.addText(title, {
    x: LEFT,
    y: 2.2,
    w: WIDTH,
    h: 1.2,
    fontSize: 32,
    bold: true,
  });

  for (const section of sections) {
    const slide = pptx.addSlide();
    slide.addText(section.title, {
      x: LEFT,
      y: 0.4,
      w: WIDTH,
      h: 0.7,
      fontSize: 24,
      bold: true,
    });

    let y = 1.4;

    for (const block of section.blocks) {
      if (block.type === "keyValue") {
        slide.addText(block.items.map((i) => `${i.label}: ${i.value}`).join("\n"), {
          x: LEFT,
          y,
          w: WIDTH,
          h: 3.4,
          fontSize: 14,
          valign: "top",
        });
        y += 3.5;
      } else if (block.type === "text") {
        slide.addText(block.body, {
          x: LEFT,
          y,
          w: WIDTH,
          h: 3.4,
          fontSize: 14,
          valign: "top",
        });
        y += 3.5;
      } else {
        slide.addTable(
          [
            block.columns.map((c) => ({ text: c, options: { bold: true } })),
            ...block.rows.map((row) => row.map((cell) => ({ text: cell }))),
          ],
          {
            x: LEFT,
            y,
            w: WIDTH,
            fontSize: 11,
            border: { type: "solid", pt: 0.5, color: "CCCCCC" },
            autoPage: true,
          }
        );
        y += 3.5;
      }
    }
  }

  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- reports/pptx`
Expected: PASS

If `slideNames` comes back longer than expected, `autoPage: true` split a long table across extra slides — that is correct behaviour for a large campaign. The test's fixture has a single table row precisely so the count stays deterministic.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/reports/pptx.ts lib/reports/pptx.test.ts
git commit -m "$(cat <<'EOF'
feat: render report sections to an editable PPTX deck

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Report Server Actions

**Files:**
- Create: `app/(dashboard)/campaigns/[id]/reports/actions.ts`
- Test: `app/(dashboard)/campaigns/[id]/reports/actions.test.ts`

**Interfaces:**
- Consumes: `requireRole("staff")` (Plan 1), `createServerSupabaseClient()` (Plan 1), `create_campaign_report` RPC (Task 2), `CustomSection` (Task 3).
- Produces (note the explicit return types — without them `"error" in result` narrowing fails the build):
  - `generateReport(campaignId: string): Promise<{ error: string } | { success: true; reportId: string }>`
  - `addCustomSection(reportId: string, title: string, body: string): Promise<{ error: string } | { success: true }>`
  - `deleteCustomSection(reportId: string, sectionId: string): Promise<{ error: string } | { success: true }>`

- [ ] **Step 1: Write the failing test**

`app/(dashboard)/campaigns/[id]/reports/actions.test.ts`:

```ts
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/roles", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { requireRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateReport, addCustomSection, deleteCustomSection } from "./actions";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocked(requireRole).mockResolvedValue({ id: "u1", role: "staff", full_name: "담당자" });
});

describe("generateReport", () => {
  test("returns the new report id when the RPC succeeds", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "report-1", error: null });
    mocked(createServerSupabaseClient).mockResolvedValue({ rpc });

    const result = await generateReport("campaign-1");

    expect(result).toEqual({ success: true, reportId: "report-1" });
    expect(rpc).toHaveBeenCalledWith("create_campaign_report", { p_campaign_id: "campaign-1" });
  });

  test("returns an error when the campaign does not exist (RPC returns null)", async () => {
    mocked(createServerSupabaseClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const result = await generateReport("missing");
    expect(result).toEqual({ error: "보고서 생성에 실패했습니다. 다시 시도해주세요." });
  });
});

describe("addCustomSection", () => {
  function mockReport(customSections: unknown[]) {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mocked(createServerSupabaseClient).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { campaign_id: "campaign-1", custom_sections: customSections },
              error: null,
            }),
          }),
        }),
        update,
      }),
    });
    return update;
  }

  test("rejects a blank title", async () => {
    const result = await addCustomSection("report-1", "   ", "내용");
    expect(result).toEqual({ error: "섹션 제목을 입력해주세요." });
  });

  test("appends a trimmed section to the existing list", async () => {
    const update = mockReport([{ id: "custom-1", title: "기존 섹션", body: "기존 내용" }]);

    const result = await addCustomSection("report-1", "  담당자 코멘트  ", "  반응이 좋았습니다.  ");

    expect(result).toEqual({ success: true });
    const written = update.mock.calls[0][0].custom_sections;
    expect(written).toHaveLength(2);
    expect(written[0]).toEqual({ id: "custom-1", title: "기존 섹션", body: "기존 내용" });
    expect(written[1].title).toBe("담당자 코멘트");
    expect(written[1].body).toBe("반응이 좋았습니다.");
    expect(written[1].id).toMatch(/^custom-/);
  });

  test("never touches the frozen snapshot", async () => {
    const update = mockReport([]);
    await addCustomSection("report-1", "담당자 코멘트", "내용");

    expect(Object.keys(update.mock.calls[0][0])).toEqual(["custom_sections"]);
  });
});

describe("deleteCustomSection", () => {
  test("removes only the matching section", async () => {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mocked(createServerSupabaseClient).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                campaign_id: "campaign-1",
                custom_sections: [
                  { id: "custom-1", title: "A", body: "a" },
                  { id: "custom-2", title: "B", body: "b" },
                ],
              },
              error: null,
            }),
          }),
        }),
        update,
      }),
    });

    const result = await deleteCustomSection("report-1", "custom-1");

    expect(result).toEqual({ success: true });
    expect(update.mock.calls[0][0].custom_sections).toEqual([
      { id: "custom-2", title: "B", body: "b" },
    ]);
  });

  test("returns an error when the report is missing", async () => {
    mocked(createServerSupabaseClient).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({ single: async () => ({ data: null, error: { message: "no rows" } }) }),
        }),
      }),
    });

    const result = await deleteCustomSection("missing", "custom-1");
    expect(result).toEqual({ error: "보고서를 찾을 수 없습니다." });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "campaigns/\[id\]/reports/actions"`
Expected: FAIL — the actions module doesn't exist.

- [ ] **Step 3: Implement the actions**

`app/(dashboard)/campaigns/[id]/reports/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CustomSection } from "@/lib/reports/types";

export async function generateReport(
  campaignId: string
): Promise<{ error: string } | { success: true; reportId: string }> {
  await requireRole("staff");

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_campaign_report", {
    p_campaign_id: campaignId,
  });

  if (error || !data) {
    return { error: "보고서 생성에 실패했습니다. 다시 시도해주세요." };
  }

  revalidatePath(`/campaigns/${campaignId}/reports`);
  return { success: true, reportId: data as string };
}

async function readReport(
  reportId: string
): Promise<{ campaign_id: string; custom_sections: CustomSection[] } | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("reports")
    .select("campaign_id, custom_sections")
    .eq("id", reportId)
    .single();

  if (error || !data) return null;
  return data as { campaign_id: string; custom_sections: CustomSection[] };
}

async function writeCustomSections(
  reportId: string,
  campaignId: string,
  sections: CustomSection[],
  failureMessage: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createServerSupabaseClient();

  // Only custom_sections is ever written. The snapshot is frozen at generation
  // time and the database trigger rejects any attempt to change it.
  const { error } = await supabase
    .from("reports")
    .update({ custom_sections: sections })
    .eq("id", reportId);

  if (error) return { error: failureMessage };

  revalidatePath(`/campaigns/${campaignId}/reports/${reportId}`);
  return { success: true };
}

export async function addCustomSection(
  reportId: string,
  title: string,
  body: string
): Promise<{ error: string } | { success: true }> {
  await requireRole("staff");

  const trimmedTitle = title.trim();
  if (!trimmedTitle) return { error: "섹션 제목을 입력해주세요." };

  const report = await readReport(reportId);
  if (!report) return { error: "보고서를 찾을 수 없습니다." };

  const next: CustomSection[] = [
    ...report.custom_sections,
    {
      id: `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: trimmedTitle,
      body: body.trim(),
    },
  ];

  return writeCustomSections(
    reportId,
    report.campaign_id,
    next,
    "섹션 추가에 실패했습니다. 다시 시도해주세요."
  );
}

export async function deleteCustomSection(
  reportId: string,
  sectionId: string
): Promise<{ error: string } | { success: true }> {
  await requireRole("staff");

  const report = await readReport(reportId);
  if (!report) return { error: "보고서를 찾을 수 없습니다." };

  const next = report.custom_sections.filter((s) => s.id !== sectionId);

  return writeCustomSections(
    reportId,
    report.campaign_id,
    next,
    "섹션 삭제에 실패했습니다. 다시 시도해주세요."
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- "campaigns/\[id\]/reports/actions"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/campaigns/[id]/reports/actions.ts" "app/(dashboard)/campaigns/[id]/reports/actions.test.ts"
git commit -m "$(cat <<'EOF'
feat: add report generation and custom section server actions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Report List Screen and "보고서 생성" Button

**Files:**
- Create: `app/(dashboard)/campaigns/[id]/reports/GenerateReportButton.tsx`
- Create: `app/(dashboard)/campaigns/[id]/reports/page.tsx`
- Test: `app/(dashboard)/campaigns/[id]/reports/GenerateReportButton.test.tsx`
- Test: `app/(dashboard)/campaigns/[id]/reports/page.test.tsx`

**Interfaces:**
- Consumes: `generateReport` (Task 7), `createServerSupabaseClient()` (Plan 1).
- Produces: `<GenerateReportButton campaignId={string} />` — a client component that calls `generateReport` and navigates to the new report. **Plan 5 imports this component into the 관리시트 screen header**; it is written as a standalone, prop-only component precisely so it can be dropped anywhere.
- Produces: a page at `/campaigns/[id]/reports` listing that campaign's generated reports, newest first.

- [ ] **Step 1: Write the failing test for the button**

`app/(dashboard)/campaigns/[id]/reports/GenerateReportButton.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("./actions", () => ({ generateReport: vi.fn() }));

import { generateReport } from "./actions";
import GenerateReportButton from "./GenerateReportButton";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("GenerateReportButton", () => {
  test("generates a report and navigates to it", async () => {
    mocked(generateReport).mockResolvedValue({ success: true, reportId: "report-1" });

    render(<GenerateReportButton campaignId="campaign-1" />);
    fireEvent.click(screen.getByRole("button", { name: "보고서 생성" }));

    await waitFor(() => {
      expect(generateReport).toHaveBeenCalledWith("campaign-1");
      expect(push).toHaveBeenCalledWith("/campaigns/campaign-1/reports/report-1");
    });
  });

  test("shows the error message and stays put when generation fails", async () => {
    mocked(generateReport).mockResolvedValue({ error: "보고서 생성에 실패했습니다. 다시 시도해주세요." });

    render(<GenerateReportButton campaignId="campaign-1" />);
    fireEvent.click(screen.getByRole("button", { name: "보고서 생성" }));

    await waitFor(() => {
      expect(screen.getByText("보고서 생성에 실패했습니다. 다시 시도해주세요.")).toBeInTheDocument();
    });
    expect(push).not.toHaveBeenCalled();
  });

  test("disables itself while generating", async () => {
    let resolve!: (v: { success: true; reportId: string }) => void;
    mocked(generateReport).mockReturnValue(new Promise((r) => (resolve = r)));

    render(<GenerateReportButton campaignId="campaign-1" />);
    fireEvent.click(screen.getByRole("button", { name: "보고서 생성" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "생성 중..." })).toBeDisabled();
    });

    resolve({ success: true, reportId: "report-1" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- GenerateReportButton`
Expected: FAIL — the component doesn't exist.

- [ ] **Step 3: Implement the button**

`app/(dashboard)/campaigns/[id]/reports/GenerateReportButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateReport } from "./actions";

/**
 * The spec puts this button on the 관리시트 screen (핵심 화면/플로우 5). It takes
 * only a campaignId so Plan 5 can drop it into that screen's header unchanged.
 */
export default function GenerateReportButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);

    const result = await generateReport(campaignId);

    if ("error" in result) {
      setError(result.error);
      setBusy(false);
      return;
    }

    router.push(`/campaigns/${campaignId}/reports/${result.reportId}`);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="rounded-token bg-accent px-4 py-2 font-medium text-onAccent disabled:opacity-50"
      >
        {busy ? "생성 중..." : "보고서 생성"}
      </button>
      {error && <p className="text-sm text-critical">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- GenerateReportButton`
Expected: PASS

- [ ] **Step 5: Write the failing test for the list page**

`app/(dashboard)/campaigns/[id]/reports/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import ReportsPage from "./page";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

function mockSupabase(campaign: unknown, reports: unknown[]) {
  mocked(createServerSupabaseClient).mockResolvedValue({
    from: (table: string) =>
      table === "campaigns"
        ? { select: () => ({ eq: () => ({ single: async () => ({ data: campaign }) }) }) }
        : {
            select: () => ({
              eq: () => ({ order: async () => ({ data: reports }) }),
            }),
          },
  });
}

describe("ReportsPage", () => {
  test("lists generated reports newest first", async () => {
    mockSupabase({ id: "c1", name: "글로우랩 세럼", company_name: "글로우랩" }, [
      { id: "r2", generated_at: "2026-08-30T12:00:00.000Z" },
      { id: "r1", generated_at: "2026-08-20T12:00:00.000Z" },
    ]);

    render(await ReportsPage({ params: Promise.resolve({ id: "c1" }) }));

    expect(screen.getByText("글로우랩 세럼")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "보고서 생성" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /결과보고서/ })).toHaveLength(2);
  });

  test("shows an empty state when no report has been generated yet", async () => {
    mockSupabase({ id: "c1", name: "글로우랩 세럼", company_name: "글로우랩" }, []);

    render(await ReportsPage({ params: Promise.resolve({ id: "c1" }) }));

    expect(screen.getByText("아직 생성된 보고서가 없습니다")).toBeInTheDocument();
  });

  test("calls notFound for an unknown campaign", async () => {
    mockSupabase(null, []);

    await expect(ReportsPage({ params: Promise.resolve({ id: "missing" }) })).rejects.toThrow(
      "NOT_FOUND"
    );
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- "campaigns/\[id\]/reports/page"`
Expected: FAIL — the page doesn't exist.

- [ ] **Step 7: Implement the list page**

`app/(dashboard)/campaigns/[id]/reports/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import GenerateReportButton from "./GenerateReportButton";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default async function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, company_name")
    .eq("id", id)
    .single();

  if (!campaign) notFound();

  const { data: reports } = await supabase
    .from("reports")
    .select("id, generated_at")
    .eq("campaign_id", id)
    .order("generated_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">{campaign.name}</h1>
          <p className="text-textMuted">{campaign.company_name} · 결과보고서</p>
        </div>
        <GenerateReportButton campaignId={campaign.id} />
      </div>

      <p className="mb-4 text-sm text-textMuted">
        보고서는 생성 시점의 지원자·관리시트 데이터를 그대로 보관합니다. 이후 데이터를 수정해도 이미
        생성된 보고서는 바뀌지 않습니다.
      </p>

      {!reports || reports.length === 0 ? (
        <p className="text-textMuted">아직 생성된 보고서가 없습니다</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((r) => (
            <li key={r.id}>
              <Link
                href={`/campaigns/${campaign.id}/reports/${r.id}`}
                className="block rounded-token border border-border bg-surface p-4 text-text"
              >
                결과보고서 · {formatDateTime(r.generated_at)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- "campaigns/\[id\]/reports/page"`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add "app/(dashboard)/campaigns/[id]/reports"
git commit -m "$(cat <<'EOF'
feat: add report list screen and the reusable 보고서 생성 button

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Web Report View with Custom Sections

**Files:**
- Create: `app/(dashboard)/campaigns/[id]/reports/[reportId]/ReportSectionsView.tsx`
- Create: `app/(dashboard)/campaigns/[id]/reports/[reportId]/CustomSectionEditor.tsx`
- Create: `app/(dashboard)/campaigns/[id]/reports/[reportId]/page.tsx`
- Test: `app/(dashboard)/campaigns/[id]/reports/[reportId]/ReportSectionsView.test.tsx`
- Test: `app/(dashboard)/campaigns/[id]/reports/[reportId]/CustomSectionEditor.test.tsx`
- Test: `app/(dashboard)/campaigns/[id]/reports/[reportId]/page.test.tsx`

**Interfaces:**
- Consumes: `buildReportSections` (Task 3), `ReportRecord` / `ReportSection` (Task 3), `addCustomSection` / `deleteCustomSection` (Task 7).
- Produces: `<ReportSectionsView sections={ReportSection[]} />`; `<CustomSectionEditor reportId={string} sections={CustomSection[]} />`; a page at `/campaigns/[id]/reports/[reportId]` that renders the report and links to both downloads.

- [ ] **Step 1: Write the failing test for the section renderer**

`app/(dashboard)/campaigns/[id]/reports/[reportId]/ReportSectionsView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import ReportSectionsView from "./ReportSectionsView";
import type { ReportSection } from "@/lib/reports/types";

const sections: ReportSection[] = [
  {
    id: "overview",
    title: "캠페인 개요",
    blocks: [{ type: "keyValue", items: [{ label: "캠페인명", value: "글로우랩 세럼" }] }],
  },
  {
    id: "influencers",
    title: "참여 인플루언서 리스트",
    blocks: [
      {
        type: "table",
        columns: ["이름", "SNS 링크", "업로드 링크"],
        rows: [["김미영", "https://instagram.com/kimmiyoung", "https://instagram.com/p/aaa"]],
      },
    ],
  },
  {
    id: "custom-1",
    title: "담당자 코멘트",
    blocks: [{ type: "text", body: "반응이 좋았습니다." }],
  },
];

describe("ReportSectionsView", () => {
  test("renders every section title as a heading", () => {
    render(<ReportSectionsView sections={sections} />);

    expect(screen.getByRole("heading", { name: "캠페인 개요" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "참여 인플루언서 리스트" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "담당자 코멘트" })).toBeInTheDocument();
  });

  test("renders key/value pairs", () => {
    render(<ReportSectionsView sections={sections} />);

    expect(screen.getByText("캠페인명")).toBeInTheDocument();
    expect(screen.getByText("글로우랩 세럼")).toBeInTheDocument();
  });

  test("renders the influencer table with linked SNS and upload URLs", () => {
    render(<ReportSectionsView sections={sections} />);

    expect(screen.getByRole("columnheader", { name: "이름" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "김미영" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "https://instagram.com/kimmiyoung" })
    ).toHaveAttribute("href", "https://instagram.com/kimmiyoung");
  });

  test("renders free text bodies", () => {
    render(<ReportSectionsView sections={sections} />);
    expect(screen.getByText("반응이 좋았습니다.")).toBeInTheDocument();
  });

  test("renders a non-URL cell as plain text, not a link", () => {
    const withPlaceholder: ReportSection[] = [
      {
        id: "influencers",
        title: "참여 인플루언서 리스트",
        blocks: [
          {
            type: "table",
            columns: ["이름", "SNS 링크", "업로드 링크"],
            rows: [["박준호", "https://instagram.com/parkjunho", "미업로드"]],
          },
        ],
      },
    ];

    render(<ReportSectionsView sections={withPlaceholder} />);

    expect(screen.getByRole("cell", { name: "미업로드" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "미업로드" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ReportSectionsView`
Expected: FAIL — the component doesn't exist.

- [ ] **Step 3: Implement the section renderer**

`app/(dashboard)/campaigns/[id]/reports/[reportId]/ReportSectionsView.tsx`:

```tsx
import type { ReportSection } from "@/lib/reports/types";

function Cell({ value }: { value: string }) {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return (
      <a href={value} target="_blank" rel="noreferrer" className="text-accent underline">
        {value}
      </a>
    );
  }
  return <>{value}</>;
}

export default function ReportSectionsView({ sections }: { sections: ReportSection[] }) {
  return (
    <div className="flex flex-col gap-8">
      {sections.map((section) => (
        <section key={section.id} className="rounded-token border border-border bg-surface p-6">
          <h2 className="mb-4 text-lg font-bold text-text">{section.title}</h2>

          {section.blocks.map((block, index) => {
            if (block.type === "keyValue") {
              return (
                <dl key={index} className="grid grid-cols-[160px_1fr] gap-y-2">
                  {block.items.map((item) => (
                    <div key={item.label} className="contents">
                      <dt className="text-sm text-textMuted">{item.label}</dt>
                      <dd className="text-sm tabular-nums text-text">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              );
            }

            if (block.type === "text") {
              return (
                <p key={index} className="whitespace-pre-wrap text-sm text-text">
                  {block.body}
                </p>
              );
            }

            return (
              <div key={index} className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {block.columns.map((column) => (
                        <th key={column} className="py-2 pr-4 font-semibold text-textMuted">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b border-border">
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="py-2 pr-4 text-text">
                            <Cell value={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ReportSectionsView`
Expected: PASS

- [ ] **Step 5: Write the failing test for the custom section editor**

`app/(dashboard)/campaigns/[id]/reports/[reportId]/CustomSectionEditor.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("../actions", () => ({
  addCustomSection: vi.fn(),
  deleteCustomSection: vi.fn(),
}));

import { addCustomSection, deleteCustomSection } from "../actions";
import CustomSectionEditor from "./CustomSectionEditor";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("CustomSectionEditor", () => {
  test("adds a section and refreshes the page", async () => {
    mocked(addCustomSection).mockResolvedValue({ success: true });

    render(<CustomSectionEditor reportId="report-1" sections={[]} />);

    fireEvent.change(screen.getByLabelText("섹션 제목"), {
      target: { value: "담당자 코멘트" },
    });
    fireEvent.change(screen.getByLabelText("섹션 내용"), {
      target: { value: "반응이 좋았습니다." },
    });
    fireEvent.click(screen.getByRole("button", { name: "섹션 추가" }));

    await waitFor(() => {
      expect(addCustomSection).toHaveBeenCalledWith("report-1", "담당자 코멘트", "반응이 좋았습니다.");
      expect(refresh).toHaveBeenCalled();
    });
  });

  test("shows the error message when adding fails", async () => {
    mocked(addCustomSection).mockResolvedValue({ error: "섹션 제목을 입력해주세요." });

    render(<CustomSectionEditor reportId="report-1" sections={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "섹션 추가" }));

    await waitFor(() => {
      expect(screen.getByText("섹션 제목을 입력해주세요.")).toBeInTheDocument();
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  test("deletes an existing section", async () => {
    mocked(deleteCustomSection).mockResolvedValue({ success: true });

    render(
      <CustomSectionEditor
        reportId="report-1"
        sections={[{ id: "custom-1", title: "담당자 코멘트", body: "반응이 좋았습니다." }]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "담당자 코멘트 삭제" }));

    await waitFor(() => {
      expect(deleteCustomSection).toHaveBeenCalledWith("report-1", "custom-1");
      expect(refresh).toHaveBeenCalled();
    });
  });

  test("clears the inputs after a successful add", async () => {
    mocked(addCustomSection).mockResolvedValue({ success: true });

    render(<CustomSectionEditor reportId="report-1" sections={[]} />);

    const titleField = screen.getByLabelText("섹션 제목");
    fireEvent.change(titleField, { target: { value: "담당자 코멘트" } });
    fireEvent.click(screen.getByRole("button", { name: "섹션 추가" }));

    await waitFor(() => expect(titleField).toHaveValue(""));
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- CustomSectionEditor`
Expected: FAIL — the component doesn't exist.

- [ ] **Step 7: Implement the custom section editor**

`app/(dashboard)/campaigns/[id]/reports/[reportId]/CustomSectionEditor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addCustomSection, deleteCustomSection } from "../actions";
import type { CustomSection } from "@/lib/reports/types";

export default function CustomSectionEditor({
  reportId,
  sections,
}: {
  reportId: string;
  sections: CustomSection[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    setBusy(true);
    setError(null);

    const result = await addCustomSection(reportId, title, body);
    setBusy(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    setTitle("");
    setBody("");
    router.refresh();
  }

  async function handleDelete(sectionId: string) {
    setError(null);
    const result = await deleteCustomSection(reportId, sectionId);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-token border border-border bg-surface2 p-6">
      <h2 className="mb-4 text-lg font-bold text-text">커스텀 섹션</h2>

      {sections.length > 0 && (
        <ul className="mb-6 flex flex-col gap-2">
          {sections.map((section) => (
            <li
              key={section.id}
              className="flex items-center justify-between rounded-token border border-border px-3 py-2"
            >
              <span className="text-sm text-text">{section.title}</span>
              <button
                type="button"
                aria-label={`${section.title} 삭제`}
                onClick={() => handleDelete(section.id)}
                className="rounded-token border border-border px-3 py-1 text-sm text-textMuted"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="custom-section-title" className="text-sm text-textMuted">
            섹션 제목
          </label>
          <input
            id="custom-section-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-token border border-border bg-surface px-3 py-2 text-text"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="custom-section-body" className="text-sm text-textMuted">
            섹션 내용
          </label>
          <textarea
            id="custom-section-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="rounded-token border border-border bg-surface px-3 py-2 text-text"
          />
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={busy}
          className="self-start rounded-token bg-accent px-4 py-2 font-medium text-onAccent disabled:opacity-50"
        >
          섹션 추가
        </button>

        {error && <p className="text-sm text-critical">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- CustomSectionEditor`
Expected: PASS

- [ ] **Step 9: Write the failing test for the report page**

`app/(dashboard)/campaigns/[id]/reports/[reportId]/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import ReportPage from "./page";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

const REPORT = {
  id: "report-1",
  campaign_id: "c1",
  generated_at: "2026-08-30T12:00:00.000Z",
  custom_sections: [{ id: "custom-1", title: "담당자 코멘트", body: "반응이 좋았습니다." }],
  snapshot: {
    campaign: {
      id: "c1",
      name: "글로우랩 세럼",
      company_name: "글로우랩",
      campaign_type: "shipping",
      status: "active",
    },
    influencers: [
      {
        applicant_id: "a1",
        name: "김미영",
        sns_url: "https://instagram.com/kimmiyoung",
        nationality: "대한민국",
        progress_stage: "업로드완료",
        upload_url: "https://instagram.com/p/aaa",
        upload_deadline: "2026-09-15",
        views: 12000,
        engagement: 800,
      },
    ],
    totals: {
      applicant_count: 3,
      selected_count: 1,
      uploaded_count: 1,
      total_views: 12000,
      total_engagement: 800,
    },
  },
};

function mockReport(data: unknown) {
  mocked(createServerSupabaseClient).mockResolvedValue({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data }) }) }) }),
  });
}

describe("ReportPage", () => {
  test("renders the 기본 섹션 and the custom section", async () => {
    mockReport(REPORT);

    render(await ReportPage({ params: Promise.resolve({ id: "c1", reportId: "report-1" }) }));

    expect(screen.getByRole("heading", { name: "캠페인 개요" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "참여 인플루언서 리스트" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "성과 요약" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "담당자 코멘트" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "김미영" })).toBeInTheDocument();
  });

  test("offers both download formats", async () => {
    mockReport(REPORT);

    render(await ReportPage({ params: Promise.resolve({ id: "c1", reportId: "report-1" }) }));

    expect(screen.getByRole("link", { name: "PDF 다운로드" })).toHaveAttribute(
      "href",
      "/api/reports/report-1/pdf"
    );
    expect(screen.getByRole("link", { name: "PPT 다운로드" })).toHaveAttribute(
      "href",
      "/api/reports/report-1/pptx"
    );
  });

  test("calls notFound for an unknown report", async () => {
    mockReport(null);

    await expect(
      ReportPage({ params: Promise.resolve({ id: "c1", reportId: "missing" }) })
    ).rejects.toThrow("NOT_FOUND");
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npm test -- "reports/\[reportId\]/page"`
Expected: FAIL — the page doesn't exist.

- [ ] **Step 11: Implement the report page**

`app/(dashboard)/campaigns/[id]/reports/[reportId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildReportSections } from "@/lib/reports/sections";
import type { ReportRecord } from "@/lib/reports/types";
import ReportSectionsView from "./ReportSectionsView";
import CustomSectionEditor from "./CustomSectionEditor";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { reportId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("reports")
    .select("id, campaign_id, snapshot, custom_sections, generated_at")
    .eq("id", reportId)
    .single();

  if (!data) notFound();

  const report = data as ReportRecord;
  const sections = buildReportSections(report);
  const title = `${report.snapshot.campaign.name} 결과보고서`;

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">{title}</h1>
          <p className="text-textMuted">{report.snapshot.campaign.company_name}</p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/reports/${report.id}/pdf`}
            className="rounded-token border border-border px-4 py-2 text-sm text-text"
          >
            PDF 다운로드
          </a>
          <a
            href={`/api/reports/${report.id}/pptx`}
            className="rounded-token bg-accent px-4 py-2 text-sm font-medium text-onAccent"
          >
            PPT 다운로드
          </a>
        </div>
      </div>

      <ReportSectionsView sections={sections} />

      <div className="mt-8">
        <CustomSectionEditor reportId={report.id} sections={report.custom_sections} />
      </div>
    </div>
  );
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npm test -- "reports/\[reportId\]"`
Expected: PASS

- [ ] **Step 13: Commit**

```bash
git add "app/(dashboard)/campaigns/[id]/reports/[reportId]"
git commit -m "$(cat <<'EOF'
feat: add the web report view with editable custom sections

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: PDF and PPTX Download Routes

**Files:**
- Create: `app/api/reports/[reportId]/pdf/route.ts`
- Create: `app/api/reports/[reportId]/pptx/route.ts`
- Test: `app/api/reports/[reportId]/pdf/route.test.ts`
- Test: `app/api/reports/[reportId]/pptx/route.test.ts`

**Interfaces:**
- Consumes: `getCurrentProfile()` (Plan 1), `createServerSupabaseClient()` (Plan 1), `buildReportSections` (Task 3), `renderReportPdf` (Task 5), `renderReportPptx` (Task 6).
- Produces: `GET /api/reports/[reportId]/pdf` and `GET /api/reports/[reportId]/pptx` — 401 when logged out, 404 for an unknown report, otherwise the binary with an attachment `Content-Disposition`.

Both routes run on the Node runtime: the Edge runtime has no `fs`, so the PDF route could not read the embedded Korean font there.

- [ ] **Step 1: Write the failing tests**

The renderers are mocked here — their own output is already covered by Tasks 5 and 6. These tests are about auth, lookup, and headers.

`app/api/reports/[reportId]/pdf/route.test.ts`:

```ts
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/roles", () => ({ getCurrentProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/reports/pdf", () => ({ renderReportPdf: vi.fn() }));

import { getCurrentProfile } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { renderReportPdf } from "@/lib/reports/pdf";
import { GET } from "./route";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

const REPORT = {
  id: "report-1",
  campaign_id: "c1",
  generated_at: "2026-08-30T12:00:00.000Z",
  custom_sections: [],
  snapshot: {
    campaign: {
      id: "c1",
      name: "글로우랩 세럼",
      company_name: "글로우랩",
      campaign_type: "shipping",
      status: "active",
    },
    influencers: [],
    totals: {
      applicant_count: 0,
      selected_count: 0,
      uploaded_count: 0,
      total_views: 0,
      total_engagement: 0,
    },
  },
};

function mockReport(data: unknown) {
  mocked(createServerSupabaseClient).mockResolvedValue({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data }) }) }) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked(getCurrentProfile).mockResolvedValue({ id: "u1", role: "staff", full_name: "담당자" });
  mocked(renderReportPdf).mockResolvedValue(Buffer.from("%PDF-1.3 fake"));
});

describe("GET /api/reports/[reportId]/pdf", () => {
  test("returns 401 when not logged in", async () => {
    mocked(getCurrentProfile).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/reports/report-1/pdf"), {
      params: Promise.resolve({ reportId: "report-1" }),
    });

    expect(response.status).toBe(401);
    expect(renderReportPdf).not.toHaveBeenCalled();
  });

  test("returns 404 for an unknown report", async () => {
    mockReport(null);

    const response = await GET(new Request("http://localhost/api/reports/missing/pdf"), {
      params: Promise.resolve({ reportId: "missing" }),
    });

    expect(response.status).toBe(404);
  });

  test("returns the PDF with an attachment disposition and a UTF-8 filename", async () => {
    mockReport(REPORT);

    const response = await GET(new Request("http://localhost/api/reports/report-1/pdf"), {
      params: Promise.resolve({ reportId: "report-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");

    const disposition = response.headers.get("Content-Disposition")!;
    expect(disposition).toContain("attachment");
    // Korean filenames must go through RFC 5987, never raw in the header.
    expect(disposition).toContain(`filename*=UTF-8''${encodeURIComponent("글로우랩 세럼 결과보고서")}.pdf`);

    const body = Buffer.from(await response.arrayBuffer());
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  test("renders the sections built from the stored snapshot", async () => {
    mockReport(REPORT);

    await GET(new Request("http://localhost/api/reports/report-1/pdf"), {
      params: Promise.resolve({ reportId: "report-1" }),
    });

    const [title, sections] = mocked(renderReportPdf).mock.calls[0];
    expect(title).toBe("글로우랩 세럼 결과보고서");
    expect(sections.map((s: { title: string }) => s.title)).toEqual([
      "캠페인 개요",
      "참여 인플루언서 리스트",
      "성과 요약",
    ]);
  });
});
```

`app/api/reports/[reportId]/pptx/route.test.ts` is the same file with these four substitutions: import `renderReportPptx` from `@/lib/reports/pptx` (and mock that module instead), the mocked buffer is `Buffer.from("PK fake", "latin1")`, the expected `Content-Type` is `"application/vnd.openxmlformats-officedocument.presentationml.presentation"`, the expected filename suffix is `.pptx`, and the body assertion is `expect(body.subarray(0, 4).toString("latin1")).toBe("PK")`. Write it out in full — do not import shared fixtures across route test files.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- "api/reports"`
Expected: FAIL — neither route module exists.

- [ ] **Step 3: Implement the PDF route**

`app/api/reports/[reportId]/pdf/route.ts`:

```ts
import { getCurrentProfile } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildReportSections } from "@/lib/reports/sections";
import { renderReportPdf } from "@/lib/reports/pdf";
import type { ReportRecord } from "@/lib/reports/types";

// The Edge runtime has no fs, so it cannot read the embedded Korean font.
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> }
): Promise<Response> {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { reportId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("reports")
    .select("id, campaign_id, snapshot, custom_sections, generated_at")
    .eq("id", reportId)
    .single();

  if (!data) return new Response("Not Found", { status: 404 });

  const report = data as ReportRecord;
  const title = `${report.snapshot.campaign.name} 결과보고서`;
  const pdf = await renderReportPdf(title, buildReportSections(report));

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // A raw Korean filename is not a legal header value; RFC 5987 encodes it,
      // with an ASCII fallback for older clients.
      "Content-Disposition": `attachment; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(
        title
      )}.pdf`,
    },
  });
}
```

- [ ] **Step 4: Implement the PPTX route**

`app/api/reports/[reportId]/pptx/route.ts`:

```ts
import { getCurrentProfile } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildReportSections } from "@/lib/reports/sections";
import { renderReportPptx } from "@/lib/reports/pptx";
import type { ReportRecord } from "@/lib/reports/types";

export const runtime = "nodejs";

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> }
): Promise<Response> {
  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const { reportId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("reports")
    .select("id, campaign_id, snapshot, custom_sections, generated_at")
    .eq("id", reportId)
    .single();

  if (!data) return new Response("Not Found", { status: 404 });

  const report = data as ReportRecord;
  const title = `${report.snapshot.campaign.name} 결과보고서`;
  const pptx = await renderReportPptx(title, buildReportSections(report));

  return new Response(new Uint8Array(pptx), {
    headers: {
      "Content-Type": PPTX_MIME,
      "Content-Disposition": `attachment; filename="report.pptx"; filename*=UTF-8''${encodeURIComponent(
        title
      )}.pptx`,
    },
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- "api/reports"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/reports
git commit -m "$(cat <<'EOF'
feat: add PDF and PPTX report download routes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Entry Points and Full Verification

**Files:**
- Modify: `app/(dashboard)/campaigns/[id]/page.tsx`
- Test: `app/(dashboard)/campaigns/[id]/page.test.tsx` (create — the page currently has no test)

**Interfaces:**
- Consumes: nothing new.
- Produces: a 결과보고서 card on the campaign detail page linking to `/campaigns/[id]/reports`, so this plan's screens are reachable before Plan 5's 관리시트 exists.

Without this task the report screens are dead UI: nothing in the running app links to them. The 관리시트 entry point the spec actually calls for is handed to Plan 5 as `<GenerateReportButton campaignId={...} />` (Task 8) — this task adds the second, independent path.

- [ ] **Step 1: Write the failing test**

`app/(dashboard)/campaigns/[id]/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import CampaignDetailPage from "./page";

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

describe("CampaignDetailPage", () => {
  test("links to the campaign's reports", async () => {
    mocked(createServerSupabaseClient).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                id: "c1",
                name: "글로우랩 세럼",
                company_name: "글로우랩",
                campaign_type: "shipping",
                status: "active",
                pre_survey_token: "tok-123",
              },
            }),
          }),
        }),
      }),
    });

    render(await CampaignDetailPage({ params: Promise.resolve({ id: "c1" }) }));

    expect(screen.getByRole("link", { name: "결과보고서 보기" })).toHaveAttribute(
      "href",
      "/campaigns/c1/reports"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "campaigns/\[id\]/page"`
Expected: FAIL — no link named "결과보고서 보기".

- [ ] **Step 3: Add the entry point**

In `app/(dashboard)/campaigns/[id]/page.tsx`, append this section immediately after the existing 사전조사 `</section>` and before the closing `</div>`:

```tsx
      <section className="mt-6 max-w-2xl rounded-token border border-border bg-surface p-6">
        <h2 className="mb-1 text-lg font-bold text-text">결과보고서</h2>
        <p className="mb-4 text-sm text-textMuted">
          생성 시점의 지원자·관리시트 데이터를 스냅샷으로 보관합니다. PDF와 편집 가능한 PPT로
          내려받을 수 있습니다.
        </p>
        <Link
          href={`/campaigns/${campaign.id}/reports`}
          className="inline-block rounded-token border border-border px-4 py-2 text-sm text-text"
        >
          결과보고서 보기
        </Link>
      </section>
```

`Link` is already imported at the top of that file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- "campaigns/\[id\]/page"`
Expected: PASS

- [ ] **Step 5: Verify the whole suite and the production build**

```bash
npm test
npm run build
```

Expected: all tests pass, and `next build` succeeds. `npm run build` is the step that catches missing explicit return types on server actions — the exact failure mode from Plan 2.

- [ ] **Step 6: Verify the two downloads by hand**

```bash
npm run dev
```

Log in, open a campaign that has selected applicants, go to 결과보고서 → 보고서 생성, then:
- Click **PDF 다운로드** and open the file. Every Korean character must render — if you see empty boxes, the font did not embed (revisit Task 4).
- Click **PPT 다운로드** and open the file in PowerPoint or Keynote. Click into a section title and type: it must be an editable text box, not an image.
- Edit a `seeding_records` row (change a 조회수), reload the report page, and confirm the numbers did **not** move. Then generate a second report and confirm the new one does show the new number.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/campaigns/[id]/page.tsx" "app/(dashboard)/campaigns/[id]/page.test.tsx"
git commit -m "$(cat <<'EOF'
feat: link the campaign detail page to its result reports

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Handoff Notes for Plan 5 (관리시트)

The spec puts the "보고서 생성" button on the 관리시트 screen. That screen belongs to Plan 5, so this plan ships the button as a self-contained component instead. Plan 5 should add to its 관리시트 header:

```tsx
import GenerateReportButton from "@/app/(dashboard)/campaigns/[id]/reports/GenerateReportButton";

// ...inside the 관리시트 header:
<GenerateReportButton campaignId={campaign.id} />
```

It needs no other props and navigates to the generated report on its own. Note the shared-link 관리시트 page (`/seeding-sheet/[token]`) is 조회 전용 per the spec, so the button belongs only on the internal screen.

---

## Self-Review Notes

**1. Spec coverage** — every clause of 핵심 화면/플로우 5번 and the `reports` data-model entry maps to a task:

- `reports` 테이블: `campaign_id` FK, 생성 시점 스냅샷 (JSONB: 캠페인 개요 + 지원자/관리시트 데이터), 커스텀 섹션 (JSONB), `generated_at` → Task 1.
- "관리시트에서 '보고서 생성' 버튼 클릭 시 현재 데이터 스냅샷으로 웹 리포트 생성" → Tasks 2, 7, 8, plus the Plan 5 handoff note for the button's final home.
- Point-in-time guarantee → Task 1's freeze trigger and no-insert-policy, Task 2's single-statement snapshot, and Task 2's three dedicated tests (frozen after edits / second report sees the new values / empty campaign).
- 기본 섹션 캠페인 개요 · 참여 인플루언서 리스트(이름/SNS링크/업로드링크) · 성과 요약 → Task 3, rendered in Task 9.
- 사용자가 커스텀 섹션 추가 가능 → Tasks 7 and 9.
- PDF 다운로드 → Tasks 4, 5, 10.
- 편집 가능한 PPT(.pptx), "웹 리포트와 동일한 섹션 구성을 슬라이드로 단순 변환한 형태" → Tasks 6 and 10; the one-section-one-slide mapping and the no-`ppt/media/` assertion enforce both halves.
- 권한: staff도 보고서 생성까지 가능 → Task 7 uses `requireRole("staff")`, matching the spec's "staff: 캠페인 생성부터 보고서 생성까지 실무 전체 가능".
- 낙관적 업데이트로 충분, 동시편집 잠금 불필요 → no locking anywhere; `router.refresh()` after each custom-section write.

Deliberately out of scope, per the task boundaries: `applicants` / `seeding_records` tables, the application form, the applicant list, selection actions, and the 관리시트 screen itself.

**2. Placeholder scan** — no TBD/TODO/"similar to Task N". Every code step carries runnable code. The one prose-described file is the PPTX route test in Task 10 Step 1, and its four differences from the PDF version are enumerated exactly rather than gestured at.

**3. Type consistency** — `ReportSnapshot` / `ReportSnapshotInfluencer` / `ReportSnapshotTotals` (Task 3) match the JSONB keys emitted by `create_campaign_report` (Task 2) field for field, including `views` / `engagement` mapping from `view_count` / `engagement_count`. `CustomSection = { id, title, body }` is defined in Task 3 and used identically in Tasks 7 and 9 and in the Task 1 migration test fixture. `ReportSection` / `ReportBlock` are produced by `buildReportSections` (Task 3) and consumed unchanged by `renderReportPdf` (Task 5), `renderReportPptx` (Task 6), and `ReportSectionsView` (Task 9) — all three take `(title: string, sections: ReportSection[])` or `{ sections }`. `generateReport` returns `{ success: true; reportId: string }`, and Task 8's button reads `result.reportId`. `loadKoreanFonts()` returns `{ regular, bold }`, matching Task 5's `fonts.regular` / `fonts.bold`.

**4. Judgment calls made** — (a) the 참여 인플루언서 리스트 table carries exactly the three columns the spec names (이름/SNS링크/업로드링크) and nothing more, even though 진행 단계 and 조회수 are in the snapshot and available to a future revision; (b) reports have no public share token, because `campaigns` defines only four tokens and none is a report token, so downloads require login; (c) `influencers` includes only `selected` applicants, following the spec's rule that `reserved` never reaches the 관리시트; (d) 평균 인게이지먼트율 is added to 성과 요약 as a derived figure — the spec says "성과 요약" without enumerating fields, and a rate is the standard summary metric alongside raw totals.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-30-seeding-report.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
