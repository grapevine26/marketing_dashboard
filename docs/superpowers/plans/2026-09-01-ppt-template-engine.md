# PPT Template Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared PPT template engine (`lib/ppt/`), the `ppt_templates` table + private `ppt-templates` storage bucket, and the admin screen at `/settings/ppt-templates` where templates are uploaded, their `{{placeholder}}` fields are extracted and shown, and templates are deleted.

**Architecture:** A `.pptx` is a ZIP of XML parts. The engine opens it with `jszip`, scans `ppt/slides/slide*.xml`, and works **per paragraph (`<a:p>`)**: it concatenates the text of all `<a:t>` runs in the paragraph, finds/replaces `{{...}}` placeholders in the joined string, then writes the result back into the first run and empties the others — because PowerPoint splits sentences across runs, so `{{` and `}}` frequently land in different `<a:t>` elements. Everything else in the ZIP (layouts, masters, `ppt/media/`) passes through untouched, which is how the design survives 100%. Uploaded files live in a private Supabase Storage bucket; metadata (including the extracted placeholder list as jsonb) lives in the `ppt_templates` table.

**Tech Stack:** Next.js App Router (server actions), Supabase (Postgres + Storage), `jszip`, Vitest + React Testing Library.

**Spec:** [docs/superpowers/specs/2026-09-01-influencer-event-management-design.md](../specs/2026-09-01-influencer-event-management-design.md) — sections "PPT 템플릿 엔진 (`lib/ppt/`)", "`ppt_templates` (0015)", and 화면/플로우 6 (템플릿 설정) are this plan's scope. The events/invitees/checklist screens (0016–0017) and the SNS side are separate plans that **import this plan's exports**.

## Prerequisite

The seeding sub-project (migrations 0001–0014, `lib/auth/roles.ts`, `lib/supabase/dashboard.ts`, the dashboard shell at `app/(dashboard)/layout.tsx`, Tailwind tokens) is already implemented and committed. Do not redefine any of it.

## Global Constraints

These are this repo's non-negotiable conventions, copied here in full because the executor has no other context. Every task's requirements implicitly include this section.

1. **Two Supabase clients exist — picking the wrong one passes tests but breaks only at runtime.** Dashboard pages/actions (`app/(dashboard)/**`, `app/api/**`) use `createDashboardSupabaseClient()` from `@/lib/supabase/dashboard`, and their tests mock `@/lib/supabase/dashboard`. (Public routes use `@/lib/supabase/server`, but this plan has **no public routes** — everything here is dashboard-side, so every DB/storage call in this plan goes through `createDashboardSupabaseClient()`.) All table RLS is `to authenticated`, so using the anon client in the dashboard silently returns 0 rows in production.
2. **Every server action must have an explicit return type annotation** such as `Promise<{ error: string } | { success: true }>`. Without it, `"error" in result` narrowing breaks in callers and **the production build fails**.
3. **Any action that calls `revalidatePath` needs `vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))` in its test file**, or the test crashes outside a Next request context.
4. **The Supabase CLI is NOT authenticated in this environment and there is no DB password.** Never run `supabase migration up` or `supabase db push` — they will fail. Migrations are applied by a human pasting the `docs/sql/` bundle into the Supabase dashboard → SQL Editor. Consequence: **DB-dependent tests (Task 1) fail with "relation does not exist" until that manual paste happens. That is the expected state — write the migration + bundle + test, verify the test fails for exactly that reason, and move on.** Non-DB tests (Tasks 2–6) must pass for real.
5. **Never run the full `npm test` during development.** The DB tests hit the production Supabase project and overwrite a shared singleton row (`pre_survey_template`). Run only the test file(s) belonging to the task you are on, e.g. `npm test -- lib/ppt/template`.
6. **All UI copy is Korean.** Tailwind styling uses **token classes only**: `bg-bg` `bg-surface` `bg-surface2` `border-border` `text-text` `text-textMuted` `bg-accent` `text-onAccent` `text-critical` `text-success` `text-warning` `rounded-token`. No raw palette classes like `bg-gray-100`.
7. **Commit messages are in English** and end with the trailer line `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
8. **Every function exported from a `"use server"` module is a directly callable public endpoint.** Export only the intended actions (type-only exports are fine — types are erased). Both actions in this plan gate with `await requireRole("admin")` as their first statement (spec: 템플릿 업로드·삭제는 admin 전용).
9. **Screens that load saved settings read on the server and pass data down as props** — never initialize a client form/list as empty and refetch, or a save can wipe existing data. The template list page follows the existing `app/(dashboard)/settings/pre-survey/page.tsx` pattern: server component fetches, client component receives props.
10. **`jszip` must end up in `dependencies`, not `devDependencies`** — the engine runs inside server actions at runtime (Task 2 handles the promotion).
11. **THE ENGINE API IS ASYNC — B and C plans, take note.** The spec sketch writes `extractPlaceholders(buffer): string[]` and `fillTemplate(...): buffer`, but `jszip`'s `loadAsync` and `generateAsync` are both Promise-based, so a sync signature is impossible without lying. The pinned, authoritative signatures every other plan must import are:
    - `extractPlaceholders(pptx: Buffer): Promise<string[]>`
    - `fillTemplate(pptx: Buffer, values: Record<string, string>): Promise<Buffer>`

---

## File Structure

```
marketing/
├── supabase/migrations/
│   ├── 0015_ppt_templates.sql          # table + RLS + storage bucket
│   └── 0015_ppt_templates.test.ts      # DB test (red until SQL is pasted — expected)
├── docs/sql/
│   ├── setup-0015.sql                  # paste-into-dashboard copy of 0015
│   └── README.md                       # modify: add the setup-0015 row
├── lib/ppt/
│   ├── template.ts                     # extractPlaceholders / fillTemplate (THE shared engine)
│   ├── template.test.ts                # includes the in-test .pptx fixture builder
│   ├── storage.ts                      # upload/download/remove against the ppt-templates bucket
│   └── storage.test.ts
├── app/(dashboard)/
│   ├── layout.tsx                      # modify: sidebar link in the admin block
│   └── settings/ppt-templates/
│       ├── page.tsx                    # server component: requireRole + fetch list
│       ├── actions.ts                  # uploadPptTemplate / deletePptTemplate
│       ├── actions.test.ts
│       ├── PptTemplateManager.tsx      # client component: upload form + list + delete
│       └── PptTemplateManager.test.tsx
└── package.json                        # modify: jszip promoted to dependencies
```

`lib/ppt/template.ts` and `lib/ppt/storage.ts` are the public API consumed by the other plans (event 운영안 export, SNS side). Their signatures are pinned in the task Interfaces below — do not rename anything in them.

---

## Task 1: Migration 0015 — `ppt_templates` Table + Storage Bucket

**Files:**
- Create: `supabase/migrations/0015_ppt_templates.sql`
- Create: `docs/sql/setup-0015.sql`
- Modify: `docs/sql/README.md`
- Test: `supabase/migrations/0015_ppt_templates.test.ts`

**Interfaces:**
- Produces: table `public.ppt_templates (id uuid pk default gen_random_uuid(), kind text not null check in ('event','sns'), name text not null, storage_path text not null, placeholders jsonb not null default '[]', uploaded_at timestamptz not null default now())`. RLS: authenticated read; admin-only insert/delete (same `profiles.role` subquery pattern as migration 0003). Also the private storage bucket `ppt-templates`.
- Note: no `storage.objects` policies are created — by design, file access happens **only** through server actions/route handlers using the dashboard client (spec: 업로드/다운로드는 서버 액션·라우트 핸들러를 통해서만). Under the current `AUTH_DISABLED = true` state the dashboard client is service-role and bypasses storage RLS entirely.

- [ ] **Step 1: Write the failing test**

`supabase/migrations/0015_ppt_templates.test.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { afterAll, expect, test } from "vitest";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const createdIds: string[] = [];

afterAll(async () => {
  if (createdIds.length > 0) {
    await admin.from("ppt_templates").delete().in("id", createdIds);
  }
});

test("a template row can be inserted and placeholders defaults to []", async () => {
  const { data, error } = await admin
    .from("ppt_templates")
    .insert({ kind: "event", name: "행사 기본 템플릿", storage_path: "test/기본.pptx" })
    .select("id, kind, name, storage_path, placeholders")
    .single();

  expect(error).toBeNull();
  expect(data?.kind).toBe("event");
  expect(data?.name).toBe("행사 기본 템플릿");
  expect(data?.placeholders).toEqual([]);
  if (data) createdIds.push(data.id);
});

test("kind only accepts event or sns", async () => {
  const { error } = await admin
    .from("ppt_templates")
    .insert({ kind: "poster", name: "잘못된 종류", storage_path: "test/x.pptx" });
  expect(error).not.toBeNull();
});

test("placeholders can store an extracted string array", async () => {
  const { data, error } = await admin
    .from("ppt_templates")
    .insert({
      kind: "sns",
      name: "SNS 템플릿",
      storage_path: "test/sns.pptx",
      placeholders: ["브랜드명", "행사일시"],
    })
    .select("id, placeholders")
    .single();

  expect(error).toBeNull();
  expect(data?.placeholders).toEqual(["브랜드명", "행사일시"]);
  if (data) createdIds.push(data.id);
});

test("the ppt-templates storage bucket exists and is private", async () => {
  const { data, error } = await admin.storage.getBucket("ppt-templates");
  expect(error).toBeNull();
  expect(data?.public).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- 0015_ppt_templates`
Expected: FAIL — `relation "public.ppt_templates" does not exist` (PGRST205 or similar "could not find the table" message).

**This test stays red until a human pastes `docs/sql/setup-0015.sql` into the Supabase dashboard SQL editor (Global Constraint 4). Do NOT try to apply it with the CLI. Verify the failure reason is the missing relation, then continue.**

- [ ] **Step 3: Write the migration**

`supabase/migrations/0015_ppt_templates.sql`:

```sql
create table public.ppt_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('event', 'sns')),
  name text not null,
  storage_path text not null,
  placeholders jsonb not null default '[]'::jsonb,
  uploaded_at timestamptz not null default now()
);

alter table public.ppt_templates enable row level security;

create policy "authenticated users can read ppt templates"
  on public.ppt_templates for select
  to authenticated
  using (true);

create policy "admins can insert ppt templates"
  on public.ppt_templates for insert
  to authenticated
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "admins can delete ppt templates"
  on public.ppt_templates for delete
  to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

insert into storage.buckets (id, name, public)
values ('ppt-templates', 'ppt-templates', false)
on conflict (id) do nothing;
```

- [ ] **Step 4: Create the dashboard SQL bundle**

`docs/sql/setup-0015.sql` (a copy — the migration file stays the source of truth):

```sql
-- ============================================
-- 0015_ppt_templates.sql
-- ============================================
create table public.ppt_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('event', 'sns')),
  name text not null,
  storage_path text not null,
  placeholders jsonb not null default '[]'::jsonb,
  uploaded_at timestamptz not null default now()
);

alter table public.ppt_templates enable row level security;

create policy "authenticated users can read ppt templates"
  on public.ppt_templates for select
  to authenticated
  using (true);

create policy "admins can insert ppt templates"
  on public.ppt_templates for insert
  to authenticated
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "admins can delete ppt templates"
  on public.ppt_templates for delete
  to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

insert into storage.buckets (id, name, public)
values ('ppt-templates', 'ppt-templates', false)
on conflict (id) do nothing;
```

In `docs/sql/README.md`, in the `## 파일` table, add this row directly below the `setup-0006-0014.sql` row:

```markdown
| [setup-0015.sql](setup-0015.sql) | ppt_templates 테이블 + ppt-templates 스토리지 버킷 | **적용 대기** |
```

- [ ] **Step 5: Confirm the expected failure state**

Run: `npm test -- 0015_ppt_templates`
Expected: still FAIL with the missing-relation error (the SQL has not been pasted into the dashboard yet — that is correct and expected; it will pass after the human applies `docs/sql/setup-0015.sql`).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0015_ppt_templates.sql supabase/migrations/0015_ppt_templates.test.ts docs/sql/setup-0015.sql docs/sql/README.md
git commit -m "feat: add ppt_templates table, RLS, and private storage bucket (0015)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: Engine Part 1 — Promote jszip + `extractPlaceholders`

**Files:**
- Modify: `package.json` (via `npm install jszip`)
- Create: `lib/ppt/template.ts`
- Test: `lib/ppt/template.test.ts`

**Interfaces:**
- Produces (PINNED — the whole B/C surface depends on these exact names and types):
  - `extractPlaceholders(pptx: Buffer): Promise<string[]>` — deduplicated placeholder names (inner text of `{{...}}`, trimmed), in first-appearance order across `ppt/slides/slide*.xml`, scanning **paragraph-joined** text so placeholders split across `<a:t>` runs are found. Rejects (throws) if the buffer is not a valid ZIP — callers catch.
  - Also produces the in-test fixture builders `buildTestPptx` and `para` (exported from `lib/ppt/template.test.ts`) that Task 3 reuses. No binary fixture files are ever committed — tests build a minimal valid `.pptx` in memory with jszip.

- [ ] **Step 1: Promote jszip to a runtime dependency**

```bash
npm install jszip
```

Then open `package.json` and verify `"jszip": "^3.10.1"` now appears under `"dependencies"` and is **gone from** `"devDependencies"`. (npm ≥7 moves it automatically; if your npm left it in `devDependencies`, delete that line, add it to `dependencies` manually, and run `npm install` again.) This matters because the engine runs inside server actions at runtime — a devDependency would break the production build.

- [ ] **Step 2: Write the failing test (with the in-memory fixture builder)**

`lib/ppt/template.test.ts`:

```ts
// @vitest-environment node
import JSZip from "jszip";
import { describe, expect, test } from "vitest";
import { extractPlaceholders } from "./template";

/**
 * Builds one <p:sp> shape holding a single <a:p> paragraph whose text is
 * split across the given runs — exactly how PowerPoint fragments a sentence.
 * para("일시: {", "{행사일시}", "}") models the split-run case.
 */
export function para(...runTexts: string[]): string {
  return `<p:sp><p:txBody><a:p>${runTexts
    .map((t) => `<a:r><a:rPr lang="ko-KR"/><a:t>${t}</a:t></a:r>`)
    .join("")}</a:p></p:txBody></p:sp>`;
}

/**
 * Builds a minimal valid .pptx in memory. `slides` is an array of slides,
 * each slide an array of shape XML strings (use para()). extraFiles lets a
 * test plant e.g. ppt/media/image1.png to verify pass-through preservation.
 */
export async function buildTestPptx(
  slides: string[][],
  extraFiles: Record<string, string | Buffer> = {}
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
${slides
  .map(
    (_, i) =>
      `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  )
  .join("\n")}
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
  );
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`
  );
  slides.forEach((shapes, i) => {
    zip.file(
      `ppt/slides/slide${i + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>${shapes.join(
        ""
      )}</p:spTree></p:cSld></p:sld>`
    );
  });
  for (const [name, content] of Object.entries(extraFiles)) {
    zip.file(name, content);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("extractPlaceholders", () => {
  test("collects a placeholder contained in a single run", async () => {
    const pptx = await buildTestPptx([[para("행사명: {{행사명}}")]]);
    expect(await extractPlaceholders(pptx)).toEqual(["행사명"]);
  });

  test("collects a placeholder split across multiple runs", async () => {
    const pptx = await buildTestPptx([[para("일시: {", "{행사일시}", "}")]]);
    expect(await extractPlaceholders(pptx)).toEqual(["행사일시"]);
  });

  test("deduplicates across slides and preserves first-appearance order", async () => {
    const pptx = await buildTestPptx([
      [para("{{브랜드명}}"), para("{{행사일시}}")],
      [para("{{브랜드명}}"), para("{{행사개요}}")],
    ]);
    expect(await extractPlaceholders(pptx)).toEqual(["브랜드명", "행사일시", "행사개요"]);
  });

  test("returns an empty array when there are no placeholders", async () => {
    const pptx = await buildTestPptx([[para("고정 문구만 있는 슬라이드")]]);
    expect(await extractPlaceholders(pptx)).toEqual([]);
  });

  test("rejects when the buffer is not a zip", async () => {
    await expect(extractPlaceholders(Buffer.from("이건 pptx가 아님"))).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- lib/ppt/template`
Expected: FAIL — `lib/ppt/template.ts` does not exist.

- [ ] **Step 4: Implement `extractPlaceholders`**

`lib/ppt/template.ts`:

```ts
import JSZip from "jszip";

/**
 * PPT 템플릿 엔진 — B(행사)·C(SNS) 공유.
 *
 * 핵심 난제: PowerPoint는 한 문장을 여러 <a:t> 런으로 쪼개므로 "{{"와 "}}"가
 * 다른 런에 걸칠 수 있다. 그래서 항상 문단(<a:p>) 단위로 런 텍스트를 이어붙여
 * 스캔/치환하고, 치환 결과는 첫 런에 몰아 쓰고 나머지 런은 비운다.
 * 슬라이드 XML 외의 모든 파트(레이아웃·마스터·ppt/media)는 그대로 통과시켜
 * 디자인을 100% 보존한다.
 */

const PLACEHOLDER_RE = /\{\{([^{}]+)\}\}/g;
const HAS_PLACEHOLDER_RE = /\{\{[^{}]+\}\}/;
const PARAGRAPH_RE = /<a:p\b[^>]*>[\s\S]*?<\/a:p>/g;
const RUN_TEXT_RE = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function slideFileNames(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/)![1]);
      const nb = Number(b.match(/slide(\d+)\.xml$/)![1]);
      return na - nb;
    });
}

/** Joins the (XML-unescaped) text of every <a:t> run inside one paragraph. */
function paragraphText(paragraphXml: string): string {
  let text = "";
  for (const match of paragraphXml.matchAll(RUN_TEXT_RE)) {
    text += unescapeXml(match[1]);
  }
  return text;
}

export async function extractPlaceholders(pptx: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(pptx);
  const found: string[] = [];
  for (const name of slideFileNames(zip)) {
    const xml = await zip.file(name)!.async("string");
    for (const paragraph of xml.match(PARAGRAPH_RE) ?? []) {
      for (const match of paragraphText(paragraph).matchAll(PLACEHOLDER_RE)) {
        const key = match[1].trim();
        if (!found.includes(key)) found.push(key);
      }
    }
  }
  return found;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lib/ppt/template`
Expected: PASS (all 5 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/ppt/template.ts lib/ppt/template.test.ts
git commit -m "feat: add pptx placeholder extraction with split-run handling; promote jszip to runtime dep

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Engine Part 2 — `fillTemplate`

**Files:**
- Modify: `lib/ppt/template.ts` (append `fillTemplate` below `extractPlaceholders`)
- Modify: `lib/ppt/template.test.ts` (append a `describe("fillTemplate", ...)` block)

**Interfaces:**
- Consumes: `buildTestPptx` / `para` fixture builders and the private helpers (`PARAGRAPH_RE`, `RUN_TEXT_RE`, `paragraphText`, `escapeXml`, `HAS_PLACEHOLDER_RE`) defined in Task 2 — same files, do not redeclare them.
- Produces (PINNED — B's export route and C call this exact signature): `fillTemplate(pptx: Buffer, values: Record<string, string>): Promise<Buffer>` — replaces every `{{name}}` (matched on paragraph-joined text) with `values[name]`, XML-escaped; missing keys become the empty string; every non-slide part of the ZIP, including `ppt/media/`, is preserved byte-for-byte.

- [ ] **Step 1: Write the failing tests**

Append to `lib/ppt/template.test.ts` (and extend the import at the top to `import { extractPlaceholders, fillTemplate } from "./template";`):

```ts
async function slideXml(pptx: Buffer, slide = 1): Promise<string> {
  const zip = await JSZip.loadAsync(pptx);
  return zip.file(`ppt/slides/slide${slide}.xml`)!.async("string");
}

describe("fillTemplate", () => {
  test("replaces a single-run placeholder with the value", async () => {
    const pptx = await buildTestPptx([[para("행사명: {{행사명}}")]]);
    const out = await fillTemplate(pptx, { 행사명: "글로우랩 팝업" });
    const xml = await slideXml(out);
    expect(xml).toContain("<a:t>행사명: 글로우랩 팝업</a:t>");
    expect(xml).not.toContain("{{");
  });

  test("replaces a split-run placeholder: result goes into the first run, the rest are emptied", async () => {
    const pptx = await buildTestPptx([[para("일시: {", "{행사일시}", "}")]]);
    const out = await fillTemplate(pptx, { 행사일시: "2026-09-12 14:00" });
    const xml = await slideXml(out);
    expect(xml).toContain("<a:t>일시: 2026-09-12 14:00</a:t>");
    // The paragraph still has 3 runs — 2 now empty — so run formatting nodes survive.
    expect(xml.match(/<a:t>/g)).toHaveLength(3);
    expect(xml.match(/<a:t><\/a:t>/g)).toHaveLength(2);
  });

  test("XML-escapes values containing & and <", async () => {
    const pptx = await buildTestPptx([[para("{{브랜드명}}")]]);
    const out = await fillTemplate(pptx, { 브랜드명: "K&B <프리미엄>" });
    const xml = await slideXml(out); // loading it proves the output is a valid zip
    expect(xml).toContain("<a:t>K&amp;B &lt;프리미엄&gt;</a:t>");
    expect(xml).not.toContain("<a:t>K&B");
  });

  test("a placeholder with no value becomes the empty string", async () => {
    const pptx = await buildTestPptx([[para("주최: {{브랜드명}} 드림")]]);
    const out = await fillTemplate(pptx, {});
    const xml = await slideXml(out);
    expect(xml).toContain("<a:t>주최:  드림</a:t>");
  });

  test("preserves ppt/media files byte-for-byte", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const pptx = await buildTestPptx([[para("{{행사명}}")]], {
      "ppt/media/image1.png": png,
    });
    const out = await fillTemplate(pptx, { 행사명: "쇼케이스" });
    const zip = await JSZip.loadAsync(out);
    const media = await zip.file("ppt/media/image1.png")!.async("nodebuffer");
    expect(media.equals(png)).toBe(true);
  });

  test("leaves paragraphs without placeholders completely untouched", async () => {
    const pptx = await buildTestPptx([[para("고정", " 문구")]]);
    const out = await fillTemplate(pptx, { 행사명: "무관한 값" });
    const xml = await slideXml(out);
    expect(xml).toContain("<a:t>고정</a:t>");
    expect(xml).toContain("<a:t> 문구</a:t>");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/ppt/template`
Expected: FAIL — `fillTemplate` is not exported from `./template`.

- [ ] **Step 3: Implement `fillTemplate`**

Append to `lib/ppt/template.ts`:

```ts
export async function fillTemplate(
  pptx: Buffer,
  values: Record<string, string>
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(pptx);

  for (const name of slideFileNames(zip)) {
    const xml = await zip.file(name)!.async("string");

    const replaced = xml.replace(PARAGRAPH_RE, (paragraph) => {
      const joined = paragraphText(paragraph);
      if (!HAS_PLACEHOLDER_RE.test(joined)) return paragraph;

      const filled = joined.replace(
        PLACEHOLDER_RE,
        (_m, key: string) => values[key.trim()] ?? ""
      );

      // Write the whole filled paragraph text into the first run; empty the rest.
      // Run elements (and their <a:rPr> formatting) are kept, only text moves.
      let runIndex = 0;
      return paragraph.replace(RUN_TEXT_RE, (runMatch) => {
        const openingTag = runMatch.slice(0, runMatch.indexOf(">") + 1);
        const content = runIndex === 0 ? escapeXml(filled) : "";
        runIndex += 1;
        return `${openingTag}${content}</a:t>`;
      });
    });

    zip.file(name, replaced);
  }

  return zip.generateAsync({ type: "nodebuffer" }) as Promise<Buffer>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/ppt/template`
Expected: PASS (all 11 tests — 5 extract + 6 fill).

- [ ] **Step 5: Commit**

```bash
git add lib/ppt/template.ts lib/ppt/template.test.ts
git commit -m "feat: add fillTemplate with split-run replacement, XML escaping, and media preservation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: Storage Helpers for the `ppt-templates` Bucket

**Files:**
- Create: `lib/ppt/storage.ts`
- Test: `lib/ppt/storage.test.ts`

**Interfaces:**
- Consumes: `createDashboardSupabaseClient()` from `@/lib/supabase/dashboard`.
- Produces (PINNED — B's export route downloads through this; the admin actions in Task 5 upload/remove through this):
  - `uploadTemplateFile(storagePath: string, file: Buffer): Promise<{ error: string } | { success: true }>`
  - `downloadTemplateFile(storagePath: string): Promise<Buffer | null>` — `null` on any failure; B's export route maps `null` to the spec message "템플릿 파일을 불러오지 못했습니다. 다시 업로드해주세요."
  - `removeTemplateFile(storagePath: string): Promise<{ error: string } | { success: true }>`

- [ ] **Step 1: Write the failing test**

`lib/ppt/storage.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/dashboard", () => ({ createDashboardSupabaseClient: vi.fn() }));

import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { downloadTemplateFile, removeTemplateFile, uploadTemplateFile } from "./storage";

const upload = vi.fn();
const download = vi.fn();
const remove = vi.fn();
const from = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  from.mockReturnValue({ upload, download, remove });
  (createDashboardSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    storage: { from },
  });
});

describe("uploadTemplateFile", () => {
  test("uploads to the ppt-templates bucket with the pptx content type", async () => {
    upload.mockResolvedValue({ data: { path: "abc.pptx" }, error: null });

    const result = await uploadTemplateFile("abc.pptx", Buffer.from("PK"));

    expect(result).toEqual({ success: true });
    expect(from).toHaveBeenCalledWith("ppt-templates");
    expect(upload).toHaveBeenCalledWith("abc.pptx", expect.any(Buffer), {
      contentType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      upsert: false,
    });
  });

  test("returns a Korean error message when the upload fails", async () => {
    upload.mockResolvedValue({ data: null, error: { message: "boom" } });
    const result = await uploadTemplateFile("abc.pptx", Buffer.from("PK"));
    expect(result).toEqual({ error: "파일 업로드에 실패했습니다. 다시 시도해주세요." });
  });
});

describe("downloadTemplateFile", () => {
  test("returns the file content as a Buffer", async () => {
    download.mockResolvedValue({ data: new Blob([Buffer.from("pptx-bytes")]), error: null });

    const result = await downloadTemplateFile("abc.pptx");

    expect(from).toHaveBeenCalledWith("ppt-templates");
    expect(download).toHaveBeenCalledWith("abc.pptx");
    expect(result?.toString()).toBe("pptx-bytes");
  });

  test("returns null when the download fails", async () => {
    download.mockResolvedValue({ data: null, error: { message: "not found" } });
    expect(await downloadTemplateFile("missing.pptx")).toBeNull();
  });
});

describe("removeTemplateFile", () => {
  test("removes the object from the bucket", async () => {
    remove.mockResolvedValue({ data: [{}], error: null });

    const result = await removeTemplateFile("abc.pptx");

    expect(result).toEqual({ success: true });
    expect(remove).toHaveBeenCalledWith(["abc.pptx"]);
  });

  test("returns a Korean error message when removal fails", async () => {
    remove.mockResolvedValue({ data: null, error: { message: "boom" } });
    const result = await removeTemplateFile("abc.pptx");
    expect(result).toEqual({ error: "파일 삭제에 실패했습니다. 다시 시도해주세요." });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/ppt/storage`
Expected: FAIL — `lib/ppt/storage.ts` does not exist.

- [ ] **Step 3: Implement the helpers**

`lib/ppt/storage.ts`:

```ts
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";

const BUCKET = "ppt-templates";
const PPTX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export async function uploadTemplateFile(
  storagePath: string,
  file: Buffer
): Promise<{ error: string } | { success: true }> {
  const supabase = await createDashboardSupabaseClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: PPTX_CONTENT_TYPE, upsert: false });

  if (error) return { error: "파일 업로드에 실패했습니다. 다시 시도해주세요." };
  return { success: true } as const;
}

export async function downloadTemplateFile(storagePath: string): Promise<Buffer | null> {
  const supabase = await createDashboardSupabaseClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);

  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function removeTemplateFile(
  storagePath: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createDashboardSupabaseClient();
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);

  if (error) return { error: "파일 삭제에 실패했습니다. 다시 시도해주세요." };
  return { success: true } as const;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/ppt/storage`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ppt/storage.ts lib/ppt/storage.test.ts
git commit -m "feat: add ppt-templates bucket upload/download/remove helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: Admin Actions — Upload and Delete Templates

**Files:**
- Create: `app/(dashboard)/settings/ppt-templates/actions.ts`
- Test: `app/(dashboard)/settings/ppt-templates/actions.test.ts`

**Interfaces:**
- Consumes: `requireRole("admin")` (`@/lib/auth/roles`), `createDashboardSupabaseClient()` (`@/lib/supabase/dashboard`), `extractPlaceholders` (Task 2), `uploadTemplateFile` / `removeTemplateFile` (Task 4).
- Produces:
  - `type PptTemplate = { id: string; kind: "event" | "sns"; name: string; storage_path: string; placeholders: string[]; uploaded_at: string }` (type-only export — mirrors the `ppt_templates` row; B/C also import this type when listing templates)
  - `uploadPptTemplate(formData: FormData): Promise<{ error: string } | { success: true }>` — expects form fields `file` (File), `name` (text), `kind` ("event" | "sns")
  - `deletePptTemplate(id: string): Promise<{ error: string } | { success: true }>` — removes the storage object first, then the row

- [ ] **Step 1: Write the failing test**

`app/(dashboard)/settings/ppt-templates/actions.test.ts`:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/roles", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/dashboard", () => ({ createDashboardSupabaseClient: vi.fn() }));
vi.mock("@/lib/ppt/template", () => ({ extractPlaceholders: vi.fn() }));
vi.mock("@/lib/ppt/storage", () => ({
  uploadTemplateFile: vi.fn(),
  removeTemplateFile: vi.fn(),
}));

import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { extractPlaceholders } from "@/lib/ppt/template";
import { removeTemplateFile, uploadTemplateFile } from "@/lib/ppt/storage";
import { deletePptTemplate, uploadPptTemplate } from "./actions";

type Mock = ReturnType<typeof vi.fn>;

function makeFormData(overrides: Partial<Record<"file" | "name" | "kind", unknown>> = {}) {
  const fd = new FormData();
  const file =
    "file" in overrides
      ? overrides.file
      : new File([Buffer.from("PK-fake-pptx")], "행사템플릿.pptx");
  if (file instanceof File) fd.set("file", file);
  fd.set("name", ("name" in overrides ? overrides.name : "행사 기본 템플릿") as string);
  fd.set("kind", ("kind" in overrides ? overrides.kind : "event") as string);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  (requireRole as Mock).mockResolvedValue({ id: "u1", role: "admin" });
});

describe("uploadPptTemplate", () => {
  test("rejects when no file is attached", async () => {
    const fd = makeFormData();
    fd.delete("file");
    expect(await uploadPptTemplate(fd)).toEqual({ error: "파일을 선택해주세요." });
  });

  test("rejects a non-pptx file", async () => {
    const fd = makeFormData({ file: new File([Buffer.from("x")], "발표자료.pdf") });
    expect(await uploadPptTemplate(fd)).toEqual({
      error: ".pptx 파일만 업로드할 수 있습니다.",
    });
  });

  test("rejects a blank name", async () => {
    expect(await uploadPptTemplate(makeFormData({ name: "   " }))).toEqual({
      error: "템플릿 이름을 입력해주세요.",
    });
  });

  test("rejects an invalid kind", async () => {
    expect(await uploadPptTemplate(makeFormData({ kind: "poster" }))).toEqual({
      error: "템플릿 종류가 올바르지 않습니다.",
    });
  });

  test("returns a readable error when the file is not a valid pptx", async () => {
    (extractPlaceholders as Mock).mockRejectedValue(new Error("not a zip"));
    expect(await uploadPptTemplate(makeFormData())).toEqual({
      error: "pptx 파일을 읽지 못했습니다. 파일이 손상되지 않았는지 확인해주세요.",
    });
  });

  test("extracts placeholders, uploads the file, and inserts the row", async () => {
    (extractPlaceholders as Mock).mockResolvedValue(["브랜드명", "행사일시"]);
    (uploadTemplateFile as Mock).mockResolvedValue({ success: true });
    const insert = vi.fn().mockResolvedValue({ error: null });
    (createDashboardSupabaseClient as Mock).mockResolvedValue({ from: () => ({ insert }) });

    const result = await uploadPptTemplate(makeFormData());

    expect(result).toEqual({ success: true });
    expect(uploadTemplateFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.pptx$/),
      expect.any(Buffer)
    );
    expect(insert).toHaveBeenCalledWith({
      kind: "event",
      name: "행사 기본 템플릿",
      storage_path: expect.stringMatching(/\.pptx$/),
      placeholders: ["브랜드명", "행사일시"],
    });
  });

  test("cleans up the uploaded file when the row insert fails", async () => {
    (extractPlaceholders as Mock).mockResolvedValue([]);
    (uploadTemplateFile as Mock).mockResolvedValue({ success: true });
    (removeTemplateFile as Mock).mockResolvedValue({ success: true });
    const insert = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    (createDashboardSupabaseClient as Mock).mockResolvedValue({ from: () => ({ insert }) });

    const result = await uploadPptTemplate(makeFormData());

    expect(result).toEqual({ error: "템플릿 저장에 실패했습니다. 다시 시도해주세요." });
    expect(removeTemplateFile).toHaveBeenCalledWith(expect.stringMatching(/\.pptx$/));
  });
});

describe("deletePptTemplate", () => {
  test("removes the storage object first, then deletes the row", async () => {
    (removeTemplateFile as Mock).mockResolvedValue({ success: true });
    const del = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    (createDashboardSupabaseClient as Mock).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: "t1", storage_path: "abc.pptx" } }),
          }),
        }),
        delete: del,
      }),
    });

    const result = await deletePptTemplate("t1");

    expect(result).toEqual({ success: true });
    expect(removeTemplateFile).toHaveBeenCalledWith("abc.pptx");
    expect(del).toHaveBeenCalled();
  });

  test("returns an error when the template row does not exist", async () => {
    (createDashboardSupabaseClient as Mock).mockResolvedValue({
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }),
      }),
    });

    expect(await deletePptTemplate("missing")).toEqual({
      error: "템플릿을 찾을 수 없습니다.",
    });
    expect(removeTemplateFile).not.toHaveBeenCalled();
  });

  test("keeps the row when the storage removal fails", async () => {
    (removeTemplateFile as Mock).mockResolvedValue({
      error: "파일 삭제에 실패했습니다. 다시 시도해주세요.",
    });
    const del = vi.fn();
    (createDashboardSupabaseClient as Mock).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { id: "t1", storage_path: "abc.pptx" } }),
          }),
        }),
        delete: del,
      }),
    });

    expect(await deletePptTemplate("t1")).toEqual({
      error: "파일 삭제에 실패했습니다. 다시 시도해주세요.",
    });
    expect(del).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- settings/ppt-templates/actions`
Expected: FAIL — the actions module does not exist.

- [ ] **Step 3: Implement the actions**

`app/(dashboard)/settings/ppt-templates/actions.ts`:

```ts
"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import { extractPlaceholders } from "@/lib/ppt/template";
import { removeTemplateFile, uploadTemplateFile } from "@/lib/ppt/storage";

export type PptTemplate = {
  id: string;
  kind: "event" | "sns";
  name: string;
  storage_path: string;
  placeholders: string[];
  uploaded_at: string;
};

export async function uploadPptTemplate(
  formData: FormData
): Promise<{ error: string } | { success: true }> {
  await requireRole("admin");

  const file = formData.get("file");
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "파일을 선택해주세요." };
  }
  if (!file.name.toLowerCase().endsWith(".pptx")) {
    return { error: ".pptx 파일만 업로드할 수 있습니다." };
  }
  if (name.length === 0) {
    return { error: "템플릿 이름을 입력해주세요." };
  }
  if (kind !== "event" && kind !== "sns") {
    return { error: "템플릿 종류가 올바르지 않습니다." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let placeholders: string[];
  try {
    placeholders = await extractPlaceholders(buffer);
  } catch {
    return { error: "pptx 파일을 읽지 못했습니다. 파일이 손상되지 않았는지 확인해주세요." };
  }

  const storagePath = `${randomUUID()}.pptx`;

  const uploaded = await uploadTemplateFile(storagePath, buffer);
  if ("error" in uploaded) return uploaded;

  const supabase = await createDashboardSupabaseClient();
  const { error } = await supabase
    .from("ppt_templates")
    .insert({ kind, name, storage_path: storagePath, placeholders });

  if (error) {
    await removeTemplateFile(storagePath); // don't leave an orphan file behind
    return { error: "템플릿 저장에 실패했습니다. 다시 시도해주세요." };
  }

  revalidatePath("/settings/ppt-templates");
  return { success: true } as const;
}

export async function deletePptTemplate(
  id: string
): Promise<{ error: string } | { success: true }> {
  await requireRole("admin");

  const supabase = await createDashboardSupabaseClient();
  const { data: row } = await supabase
    .from("ppt_templates")
    .select("id, storage_path")
    .eq("id", id)
    .single();

  if (!row) return { error: "템플릿을 찾을 수 없습니다." };

  // Spec order: remove the storage object first, then the row.
  const removed = await removeTemplateFile(row.storage_path);
  if ("error" in removed) return removed;

  const { error } = await supabase.from("ppt_templates").delete().eq("id", id);
  if (error) return { error: "삭제에 실패했습니다. 다시 시도해주세요." };

  revalidatePath("/settings/ppt-templates");
  return { success: true } as const;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- settings/ppt-templates/actions`
Expected: PASS (all 10 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/settings/ppt-templates/actions.ts" "app/(dashboard)/settings/ppt-templates/actions.test.ts"
git commit -m "feat: add admin upload/delete server actions for ppt templates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: Admin Screen `/settings/ppt-templates` + Sidebar Link

**Files:**
- Create: `app/(dashboard)/settings/ppt-templates/PptTemplateManager.tsx`
- Create: `app/(dashboard)/settings/ppt-templates/page.tsx`
- Modify: `app/(dashboard)/layout.tsx` (admin sidebar block, lines 20–26)
- Test: `app/(dashboard)/settings/ppt-templates/PptTemplateManager.test.tsx`

**Interfaces:**
- Consumes: `uploadPptTemplate`, `deletePptTemplate`, `type PptTemplate` (Task 5), `requireRole` / `createDashboardSupabaseClient` (existing), the `ppt_templates` table (Task 1).
- Produces: the admin page at `/settings/ppt-templates` and `<PptTemplateManager templates={PptTemplate[]} />`. Nothing else imports these; they are leaves.

- [ ] **Step 1: Write the failing component test**

Note: the upload path (validation, extraction, insert) is fully covered by Task 5's action tests, so this test covers rendering and the delete interaction — submitting a React 19 `<form action>` from jsdom is flaky and adds nothing the action tests don't already prove.

`app/(dashboard)/settings/ppt-templates/PptTemplateManager.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("./actions", () => ({
  uploadPptTemplate: vi.fn(),
  deletePptTemplate: vi.fn(),
}));

import { deletePptTemplate, type PptTemplate } from "./actions";
import PptTemplateManager from "./PptTemplateManager";

const templates: PptTemplate[] = [
  {
    id: "t1",
    kind: "event",
    name: "행사 기본 템플릿",
    storage_path: "abc.pptx",
    placeholders: ["브랜드명", "행사일시"],
    uploaded_at: "2026-09-01T09:00:00.000Z",
  },
  {
    id: "t2",
    kind: "sns",
    name: "SNS 월간 리포트",
    storage_path: "def.pptx",
    placeholders: [],
    uploaded_at: "2026-09-01T10:00:00.000Z",
  },
];

describe("PptTemplateManager", () => {
  test("renders each template with its kind label and placeholder chips", () => {
    render(<PptTemplateManager templates={templates} />);

    expect(screen.getByText("행사 기본 템플릿")).toBeInTheDocument();
    expect(screen.getByText("행사 운영안")).toBeInTheDocument();
    expect(screen.getByText("{{브랜드명}}")).toBeInTheDocument();
    expect(screen.getByText("{{행사일시}}")).toBeInTheDocument();
    expect(screen.getByText("SNS 월간 리포트")).toBeInTheDocument();
    expect(screen.getByText("SNS 운영")).toBeInTheDocument();
  });

  test("shows a warning badge when a template has no placeholders", () => {
    render(<PptTemplateManager templates={templates} />);
    expect(screen.getByText("치환 필드 없음")).toBeInTheDocument();
  });

  test("shows the empty state when there are no templates", () => {
    render(<PptTemplateManager templates={[]} />);
    expect(screen.getByText("등록된 템플릿이 없습니다.")).toBeInTheDocument();
  });

  test("clicking 삭제 calls deletePptTemplate with the template id", async () => {
    (deletePptTemplate as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    });

    render(<PptTemplateManager templates={templates} />);
    fireEvent.click(screen.getAllByRole("button", { name: "삭제" })[0]);

    await waitFor(() => {
      expect(deletePptTemplate).toHaveBeenCalledWith("t1");
    });
  });

  test("shows the error message when deletion fails", async () => {
    (deletePptTemplate as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: "삭제에 실패했습니다. 다시 시도해주세요.",
    });

    render(<PptTemplateManager templates={templates} />);
    fireEvent.click(screen.getAllByRole("button", { name: "삭제" })[0]);

    await waitFor(() => {
      expect(screen.getByText("삭제에 실패했습니다. 다시 시도해주세요.")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- PptTemplateManager`
Expected: FAIL — `PptTemplateManager.tsx` does not exist.

- [ ] **Step 3: Implement the client component**

`app/(dashboard)/settings/ppt-templates/PptTemplateManager.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { deletePptTemplate, uploadPptTemplate, type PptTemplate } from "./actions";

const KIND_LABELS: Record<PptTemplate["kind"], string> = {
  event: "행사 운영안",
  sns: "SNS 운영",
};

export default function PptTemplateManager({ templates }: { templates: PptTemplate[] }) {
  const [status, setStatus] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleUpload(formData: FormData) {
    setBusy(true);
    setStatus(null);
    const result = await uploadPptTemplate(formData);
    setBusy(false);
    if ("error" in result) {
      setStatus({ kind: "error", message: result.error });
      return;
    }
    formRef.current?.reset();
    setStatus({ kind: "ok", message: "업로드되었습니다." });
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setStatus(null);
    const result = await deletePptTemplate(id);
    setBusy(false);
    setStatus(
      "error" in result
        ? { kind: "error", message: result.error }
        : { kind: "ok", message: "삭제되었습니다." }
    );
  }

  return (
    <div className="max-w-3xl">
      <form
        ref={formRef}
        action={handleUpload}
        className="flex flex-col gap-3 rounded-token border border-border bg-surface p-4"
      >
        <div className="flex gap-2">
          <input
            name="name"
            aria-label="템플릿 이름"
            placeholder="템플릿 이름"
            className="flex-1 rounded-token border border-border bg-surface px-3 py-2 text-text"
          />
          <select
            name="kind"
            aria-label="템플릿 종류"
            defaultValue="event"
            className="rounded-token border border-border bg-surface px-3 py-2 text-text"
          >
            <option value="event">행사 운영안</option>
            <option value="sns">SNS 운영</option>
          </select>
        </div>
        <input
          type="file"
          name="file"
          accept=".pptx"
          aria-label="pptx 파일"
          className="text-sm text-textMuted"
        />
        <button
          type="submit"
          disabled={busy}
          className="self-start rounded-token bg-accent px-4 py-2 font-medium text-onAccent disabled:opacity-60"
        >
          {busy ? "처리 중..." : "업로드"}
        </button>
      </form>

      {status && (
        <p className={`mt-3 text-sm ${status.kind === "error" ? "text-critical" : "text-text"}`}>
          {status.message}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {templates.length === 0 && (
          <p className="text-sm text-textMuted">등록된 템플릿이 없습니다.</p>
        )}
        {templates.map((t) => (
          <div
            key={t.id}
            className="flex flex-col gap-2 rounded-token border border-border bg-surface p-4"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-text">{t.name}</span>
              <span className="rounded-token bg-surface2 px-2 py-0.5 text-xs text-textMuted">
                {KIND_LABELS[t.kind]}
              </span>
              <span className="font-mono text-xs tabular-nums text-textMuted">
                {t.uploaded_at.slice(0, 10)}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(t.id)}
                disabled={busy}
                className="ml-auto rounded-token border border-border px-3 py-1.5 text-sm text-textMuted disabled:opacity-60"
              >
                삭제
              </button>
            </div>
            {t.placeholders.length === 0 ? (
              <span className="self-start text-xs text-warning">치환 필드 없음</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {t.placeholders.map((p) => (
                  <span
                    key={p}
                    className="rounded-token bg-surface2 px-2 py-0.5 font-mono text-xs text-text"
                  >
                    {`{{${p}}}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- PptTemplateManager`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Implement the server page**

`app/(dashboard)/settings/ppt-templates/page.tsx`:

```tsx
import { requireRole } from "@/lib/auth/roles";
import { createDashboardSupabaseClient } from "@/lib/supabase/dashboard";
import PptTemplateManager from "./PptTemplateManager";
import type { PptTemplate } from "./actions";

export default async function PptTemplatesSettingsPage() {
  await requireRole("admin");

  const supabase = await createDashboardSupabaseClient();
  const { data } = await supabase
    .from("ppt_templates")
    .select("id, kind, name, storage_path, placeholders, uploaded_at")
    .order("uploaded_at", { ascending: false });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-text">PPT 템플릿 설정</h1>
      <p className="mb-8 text-textMuted">
        행사 운영안·SNS 운영에 쓰는 .pptx 템플릿을 관리합니다. 본문에{" "}
        {"{{치환필드}}"} 표시를 넣어 업로드하면 그 자리만 바꿔 완성본을 만듭니다.
      </p>
      <PptTemplateManager templates={(data ?? []) as PptTemplate[]} />
    </div>
  );
}
```

- [ ] **Step 6: Add the sidebar link**

In `app/(dashboard)/layout.tsx`, the admin block currently reads:

```tsx
        {profile.role === "admin" && (
          <div className="flex flex-col gap-1 border-t border-border pt-4">
            <Link href="/settings/pre-survey" className="rounded-token px-3 py-2 text-sm text-textMuted">
              사전조사 질문틀
            </Link>
          </div>
        )}
```

Change it to (adding one link below the existing one, nothing else):

```tsx
        {profile.role === "admin" && (
          <div className="flex flex-col gap-1 border-t border-border pt-4">
            <Link href="/settings/pre-survey" className="rounded-token px-3 py-2 text-sm text-textMuted">
              사전조사 질문틀
            </Link>
            <Link href="/settings/ppt-templates" className="rounded-token px-3 py-2 text-sm text-textMuted">
              PPT 템플릿
            </Link>
          </div>
        )}
```

- [ ] **Step 7: Type-check and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds. (Do NOT run the full `npm test` — Global Constraint 5.)

- [ ] **Step 8: Commit**

```bash
git add "app/(dashboard)/settings/ppt-templates" "app/(dashboard)/layout.tsx"
git commit -m "feat: add admin ppt-templates settings screen and sidebar link

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** engine with split-run scan/replace fixed by tests (Task 2–3, spec 핵심 난제 문단) · XML escaping + missing-placeholder-to-empty-string (Task 3, spec `fillTemplate` 정의) · media/design preservation test (Task 3, spec 검증 테스트 3) · jszip promoted to runtime dependency (Task 2 Step 1, spec 의존성 문단) · `ppt_templates` schema + admin-only RLS + private bucket in one migration (Task 1, spec 0015) · admin-only upload with kind select and extraction-on-upload, list, delete, `.pptx`-only validation, zero-placeholder warning (Tasks 5–6, spec 화면 6 + 에러 처리) · sidebar link added while the 인플루언서 행사 disabled item is deliberately left untouched (Task 6 Step 6, spec 화면 6). Out of this plan's scope by design: events/invitees/checklist/plan tables (0016–0017), the export route, and AI drafts — those belong to the B screens plan, which consumes the interfaces pinned here.
- **Placeholder scan:** no TBD/TODO/"similar to" anywhere; every code step is complete and runnable.
- **Type consistency:** `extractPlaceholders(pptx: Buffer): Promise<string[]>` and `fillTemplate(pptx: Buffer, values: Record<string, string>): Promise<Buffer>` are identical in Global Constraint 11, Task 2/3 Interfaces, and the implementations. `uploadTemplateFile`/`downloadTemplateFile`/`removeTemplateFile` names match between Task 4's definitions and Task 5's mocks/imports. `PptTemplate` (defined Task 5) is the shape Task 6's page/component pass around, and its fields mirror the Task 1 column names exactly (`storage_path`, `placeholders`, `uploaded_at`).
- **Resolved spec ambiguities (recorded so B/C planners can see them):**
  1. The spec sketches the engine as sync (`string[]` / `buffer`); jszip is Promise-only, so both functions are **async** — pinned loudly in Global Constraint 11.
  2. `kind` is `not null` in the migration; the spec's schema line omitted nullability, but a kind-less template is meaningless and every writer (the upload action) always provides it, so `not null` cannot break any consumer.
  3. No `storage.objects` RLS policies are created: the spec routes all file access through server actions/route handlers only, and the dashboard client is service-role under the current `AUTH_DISABLED = true`. When real auth is restored (a tracked STATUS.md work item), storage policies must be added as part of that effort.
  4. Delete order on failure: if the storage object removal fails, the row is kept and an error is returned (no half-deleted state where the row points nowhere); if the row insert fails after an upload, the uploaded file is removed (no orphan files).
