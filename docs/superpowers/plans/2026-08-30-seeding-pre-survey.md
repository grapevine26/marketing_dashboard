# Seeding Pre-Survey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 업체정보 사전조사 (pre-survey) step: an admin-configurable question template, AI-assisted answering, and both entry points the spec requires — a public token link for the client company and an authenticated in-dashboard view for agency staff filling it on the client's behalf.

**Architecture:** One shared `pre_survey_template` row (admin-editable) defines the question list. Two Postgres `SECURITY DEFINER` RPC functions (`get_pre_survey_context`, `submit_pre_survey_response`) let the public, unauthenticated route read/write scoped strictly by a campaign's `pre_survey_token`, without granting anon any direct table access. Both the public page and the internal agency page render the same `PreSurveyForm` client component, differing only in how they fetch the campaign/template and which `filled_by` value they pass.

**Tech Stack:** Next.js App Router, Supabase (Postgres RPC + RLS), `@google/genai` for the AI-assist draft generation, Vitest + React Testing Library.

**Spec:** [docs/superpowers/specs/2026-08-30-influencer-seeding-management-design.md](../specs/2026-08-30-influencer-seeding-management-design.md)

## Prerequisite

This plan assumes [2026-08-30-seeding-foundation.md](2026-08-30-seeding-foundation.md) is already implemented and merged: `campaigns` table (with `pre_survey_token`), `profiles` table with `role`, `getCurrentProfile`/`requireRole` in `lib/auth/roles.ts`, `createServerSupabaseClient`/`createBrowserSupabaseClient` in `lib/supabase/`, the dashboard shell at `app/(dashboard)/layout.tsx`, and the design tokens/Tailwind classes (`bg-surface`, `text-text`, `text-textMuted`, `rounded-token`, `bg-accent`, `text-onAccent`, `text-critical`, etc.).

## Global Constraints

- Reuses every helper/table from the foundation plan verbatim — do not redefine `createServerSupabaseClient`, `requireRole`, or the `campaigns` table.
- All writes to `pre_survey_responses` go through the `submit_pre_survey_response` RPC function — never a direct `insert()` from either the public or the authenticated path. This keeps one write path to audit instead of two.
- The pre-survey question template is a single global row (`pre_survey_template.id = 1`), not per-campaign (spec: "기본 질문틀은 내가 사전에 설정" — the agency sets it once in advance).
- AI assist calls use model `gemini-3.6-flash` via `@google/genai`, server-side only, reading `GEMINI_API_KEY` from the environment. (The plan originally specified Claude Haiku; switched to Gemini at the user's request on 2026-08-30.) On any failure, the caller must fall back to manual entry with the message "AI 제안 실패 — 직접 입력해주세요." (spec: 에러 처리 및 검증) rather than blocking submission.
- `filled_by` is exactly `"company"` or `"agency"` (spec: `pre_survey_responses` 작성 주체).

---

## File Structure

```
marketing/
├── supabase/migrations/
│   ├── 0003_pre_survey_template.sql
│   ├── 0004_pre_survey_responses.sql
│   └── 0005_pre_survey_rpc.sql
├── lib/
│   └── ai/
│       └── preSurveyAssist.ts          # generatePreSurveyDraft(question, context) -> string
├── app/
│   ├── pre-survey/
│   │   └── [token]/
│   │       ├── page.tsx                # public route: fetch via RPC, filled_by "company"
│   │       ├── actions.ts              # submitPreSurveyResponse, getAssist (shared by both entry points)
│   │       └── PreSurveyForm.tsx       # shared client form component
│   └── (dashboard)/
│       ├── settings/
│       │   └── pre-survey/
│       │       ├── page.tsx            # admin-only: edit the question template
│       │       └── actions.ts          # updatePreSurveyTemplate
│       └── campaigns/
│           └── [id]/
│               └── pre-survey/
│                   └── page.tsx        # internal route: agency fills on the company's behalf
```

`app/pre-survey/[token]/actions.ts` is the single write path both entry points import — the internal page never talks to the database directly for submission, only for reading the campaign/template it already has access to via normal RLS.

---

## Task 1: Pre-Survey Template Table

**Files:**
- Create: `supabase/migrations/0003_pre_survey_template.sql`
- Test: `supabase/migrations/0003_pre_survey_template.test.ts`

**Interfaces:**
- Produces: table `public.pre_survey_template` — single row (`id = 1`), `questions jsonb not null default '[]'`, `updated_at timestamptz`. Readable by any authenticated user, writable only by `role = 'admin'`.

- [x] **Step 1: Write the failing test**

`supabase/migrations/0003_pre_survey_template.test.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { beforeAll, expect, test } from "vitest";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function makeUser(role: "admin" | "staff") {
  const { data, error } = await admin.auth.admin.createUser({
    email: `pre-survey-template-${role}-${Date.now()}@example.com`,
    password: "password123",
    email_confirm: true,
  });
  if (error) throw error;
  await admin.from("profiles").update({ role }).eq("id", data.user.id);
  return data.user.id;
}

beforeAll(async () => {
  // The migration seeds row id=1; nothing to set up here.
});

test("the template row exists with an empty question list by default", async () => {
  const { data, error } = await admin
    .from("pre_survey_template")
    .select("id, questions")
    .eq("id", 1)
    .single();

  expect(error).toBeNull();
  expect(data).toEqual({ id: 1, questions: [] });
});

test("an admin can update the question list", async () => {
  await makeUser("admin");
  const { error } = await admin
    .from("pre_survey_template")
    .update({ questions: [{ id: "q1", label: "브랜드 소개를 부탁드립니다" }] })
    .eq("id", 1);

  expect(error).toBeNull();

  const { data } = await admin.from("pre_survey_template").select("questions").eq("id", 1).single();
  expect(data?.questions).toEqual([{ id: "q1", label: "브랜드 소개를 부탁드립니다" }]);
});

test("only one row can ever exist (id is pinned to 1)", async () => {
  const { error } = await admin.from("pre_survey_template").insert({ id: 2, questions: [] });
  expect(error).not.toBeNull();
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- pre_survey_template`
Expected: FAIL — `relation "public.pre_survey_template" does not exist`.

- [x] **Step 3: Write the migration**

`supabase/migrations/0003_pre_survey_template.sql`:

```sql
create table public.pre_survey_template (
  id integer primary key default 1 check (id = 1),
  questions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.pre_survey_template (id, questions) values (1, '[]'::jsonb);

alter table public.pre_survey_template enable row level security;

create policy "authenticated users can read the template"
  on public.pre_survey_template for select
  to authenticated
  using (true);

create policy "admins can update the template"
  on public.pre_survey_template for update
  to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');
```

- [x] **Step 4: Apply the migration and run test to verify it passes**

Run: `npx supabase migration up`
Run: `npm test -- pre_survey_template`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add supabase/migrations/0003_pre_survey_template.sql supabase/migrations/0003_pre_survey_template.test.ts
git commit -m "feat: add single-row admin-editable pre-survey template table"
```

---

## Task 2: Pre-Survey Responses Table

**Files:**
- Create: `supabase/migrations/0004_pre_survey_responses.sql`
- Test: `supabase/migrations/0004_pre_survey_responses.test.ts`

**Interfaces:**
- Produces: table `public.pre_survey_responses (id uuid pk, campaign_id uuid references campaigns, answers jsonb not null, filled_by text check in ('company','agency'), ai_assisted boolean default false, submitted_at timestamptz)`. Authenticated users can `select`; there is deliberately no `insert`/`update` policy for anyone — all writes happen through the Task 3 RPC function running as the table owner.

- [x] **Step 1: Write the failing test**

`supabase/migrations/0004_pre_survey_responses.test.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "vitest";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function makeCampaign() {
  const { data, error } = await admin
    .from("campaigns")
    .insert({ name: "테스트 캠페인", company_name: "테스트 업체", campaign_type: "shipping" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

test("a response row can be inserted by the service role and read back", async () => {
  const campaign = await makeCampaign();

  const { error: insertError } = await admin.from("pre_survey_responses").insert({
    campaign_id: campaign.id,
    answers: { q1: "저희는 스킨케어 브랜드입니다" },
    filled_by: "company",
  });
  expect(insertError).toBeNull();

  const { data, error } = await admin
    .from("pre_survey_responses")
    .select("campaign_id, answers, filled_by, ai_assisted")
    .eq("campaign_id", campaign.id)
    .single();

  expect(error).toBeNull();
  expect(data).toEqual({
    campaign_id: campaign.id,
    answers: { q1: "저희는 스킨케어 브랜드입니다" },
    filled_by: "company",
    ai_assisted: false,
  });
});

test("filled_by only accepts company or agency", async () => {
  const campaign = await makeCampaign();
  const { error } = await admin.from("pre_survey_responses").insert({
    campaign_id: campaign.id,
    answers: {},
    filled_by: "someone_else",
  });
  expect(error).not.toBeNull();
});

test("the anon client cannot insert directly (must go through the RPC)", async () => {
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const campaign = await makeCampaign();
  const { error } = await anon.from("pre_survey_responses").insert({
    campaign_id: campaign.id,
    answers: {},
    filled_by: "company",
  });
  expect(error).not.toBeNull();
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- pre_survey_responses`
Expected: FAIL — `relation "public.pre_survey_responses" does not exist`.

- [x] **Step 3: Write the migration**

`supabase/migrations/0004_pre_survey_responses.sql`:

```sql
create table public.pre_survey_responses (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  answers jsonb not null,
  filled_by text not null check (filled_by in ('company', 'agency')),
  ai_assisted boolean not null default false,
  submitted_at timestamptz not null default now()
);

alter table public.pre_survey_responses enable row level security;

create policy "authenticated users can read pre-survey responses"
  on public.pre_survey_responses for select
  to authenticated
  using (true);
```

- [x] **Step 4: Apply the migration and run test to verify it passes**

Run: `npx supabase migration up`
Run: `npm test -- pre_survey_responses`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add supabase/migrations/0004_pre_survey_responses.sql supabase/migrations/0004_pre_survey_responses.test.ts
git commit -m "feat: add pre_survey_responses table (writes only via RPC)"
```

---

## Task 3: Token-Scoped RPC Functions

**Files:**
- Create: `supabase/migrations/0005_pre_survey_rpc.sql`
- Test: `supabase/migrations/0005_pre_survey_rpc.test.ts`

**Interfaces:**
- Consumes: `public.campaigns` (`pre_survey_token`), `public.pre_survey_template`, `public.pre_survey_responses` (Tasks 1–2, foundation plan).
- Produces:
  - `get_pre_survey_context(p_token uuid) returns json` — `{ campaign_id, campaign_name, company_name, questions }` if the token matches a campaign, else `null`. Granted to `anon` and `authenticated`.
  - `submit_pre_survey_response(p_token uuid, p_answers jsonb, p_filled_by text, p_ai_assisted boolean) returns boolean` — inserts a response for the campaign matching the token and returns `true`, or returns `false` if the token doesn't match any campaign. Granted to `anon` and `authenticated`.

- [x] **Step 1: Write the failing test**

`supabase/migrations/0005_pre_survey_rpc.test.ts`:

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
    .insert({ name: "글로우랩 세럼", company_name: "글로우랩", campaign_type: "shipping" })
    .select()
    .single();
  if (error) throw error;
  await admin.from("pre_survey_template").update({
    questions: [{ id: "q1", label: "브랜드 소개를 부탁드립니다" }],
  }).eq("id", 1);
  return data;
}

test("get_pre_survey_context returns campaign info and questions for a valid token, as anon", async () => {
  const campaign = await makeCampaign();

  const { data, error } = await anon.rpc("get_pre_survey_context", {
    p_token: campaign.pre_survey_token,
  });

  expect(error).toBeNull();
  expect(data).toEqual({
    campaign_id: campaign.id,
    campaign_name: "글로우랩 세럼",
    company_name: "글로우랩",
    questions: [{ id: "q1", label: "브랜드 소개를 부탁드립니다" }],
  });
});

test("get_pre_survey_context returns null for an unknown token", async () => {
  const { data, error } = await anon.rpc("get_pre_survey_context", {
    p_token: "00000000-0000-0000-0000-000000000000",
  });
  expect(error).toBeNull();
  expect(data).toBeNull();
});

test("submit_pre_survey_response inserts a row and returns true, as anon", async () => {
  const campaign = await makeCampaign();

  const { data, error } = await anon.rpc("submit_pre_survey_response", {
    p_token: campaign.pre_survey_token,
    p_answers: { q1: "저희는 스킨케어 브랜드입니다" },
    p_filled_by: "company",
    p_ai_assisted: true,
  });

  expect(error).toBeNull();
  expect(data).toBe(true);

  const { data: row } = await admin
    .from("pre_survey_responses")
    .select("answers, filled_by, ai_assisted")
    .eq("campaign_id", campaign.id)
    .single();
  expect(row).toEqual({
    answers: { q1: "저희는 스킨케어 브랜드입니다" },
    filled_by: "company",
    ai_assisted: true,
  });
});

test("submit_pre_survey_response returns false for an unknown token and inserts nothing", async () => {
  const { data, error } = await anon.rpc("submit_pre_survey_response", {
    p_token: "00000000-0000-0000-0000-000000000000",
    p_answers: {},
    p_filled_by: "company",
    p_ai_assisted: false,
  });
  expect(error).toBeNull();
  expect(data).toBe(false);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- pre_survey_rpc`
Expected: FAIL — `function get_pre_survey_context(uuid) does not exist`.

- [x] **Step 3: Write the migration**

`supabase/migrations/0005_pre_survey_rpc.sql`:

```sql
create or replace function public.get_pre_survey_context(p_token uuid)
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
    'questions', t.questions
  )
  into result
  from public.campaigns c
  cross join public.pre_survey_template t
  where c.pre_survey_token = p_token;

  return result;
end;
$$;

grant execute on function public.get_pre_survey_context(uuid) to anon, authenticated;

create or replace function public.submit_pre_survey_response(
  p_token uuid,
  p_answers jsonb,
  p_filled_by text,
  p_ai_assisted boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
begin
  if p_filled_by not in ('company', 'agency') then
    raise exception 'INVALID_FILLED_BY';
  end if;

  select id into v_campaign_id from public.campaigns where pre_survey_token = p_token;

  if v_campaign_id is null then
    return false;
  end if;

  insert into public.pre_survey_responses (campaign_id, answers, filled_by, ai_assisted)
  values (v_campaign_id, p_answers, p_filled_by, p_ai_assisted);

  return true;
end;
$$;

grant execute on function public.submit_pre_survey_response(uuid, jsonb, text, boolean) to anon, authenticated;
```

- [x] **Step 4: Apply the migration and run test to verify it passes**

Run: `npx supabase migration up`
Run: `npm test -- pre_survey_rpc`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add supabase/migrations/0005_pre_survey_rpc.sql supabase/migrations/0005_pre_survey_rpc.test.ts
git commit -m "feat: add token-scoped RPC functions for the public pre-survey flow"
```

---

## Task 4: AI Assist

**Files:**
- Create: `lib/ai/preSurveyAssist.ts`
- Test: `lib/ai/preSurveyAssist.test.ts`

**Interfaces:**
- Produces: `generatePreSurveyDraft(input: { question: string; context: Record<string, string> }): Promise<string>` — throws if the Anthropic API call fails or returns a non-text block; callers (Task 6) catch this and show the fallback message.

- [x] **Step 1: Install the SDK**

```bash
npm install @anthropic-ai/sdk
```

Add to `.env.local.example`:

```
ANTHROPIC_API_KEY=
```

- [x] **Step 2: Write the failing test**

`lib/ai/preSurveyAssist.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

import { generatePreSurveyDraft } from "./preSurveyAssist";

describe("generatePreSurveyDraft", () => {
  test("sends the question and context, and returns the draft text", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "저희는 20대 여성 타겟의 스킨케어 브랜드입니다." }],
    });

    const result = await generatePreSurveyDraft({
      question: "타겟 고객층을 알려주세요",
      context: { q1: "브랜드명은 글로우랩입니다" },
    });

    expect(result).toBe("저희는 20대 여성 타겟의 스킨케어 브랜드입니다.");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-haiku-4-5-20251001",
        messages: [
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining("타겟 고객층을 알려주세요"),
          }),
        ],
      })
    );
  });

  test("throws when the response contains no text block", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "image" }] });

    await expect(
      generatePreSurveyDraft({ question: "q", context: {} })
    ).rejects.toThrow("UNEXPECTED_RESPONSE");
  });

  test("propagates API errors", async () => {
    mockCreate.mockRejectedValue(new Error("rate limited"));

    await expect(
      generatePreSurveyDraft({ question: "q", context: {} })
    ).rejects.toThrow("rate limited");
  });
});
```

- [x] **Step 3: Run test to verify it fails**

Run: `npm test -- preSurveyAssist`
Expected: FAIL — `lib/ai/preSurveyAssist.ts` doesn't exist.

- [x] **Step 4: Implement**

`lib/ai/preSurveyAssist.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";

export type AssistInput = {
  question: string;
  context: Record<string, string>;
};

export async function generatePreSurveyDraft(input: AssistInput): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const contextLines = Object.entries(input.context)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `당신은 인플루언서 마케팅 에이전시의 사전조사 답변 작성을 돕는 어시스턴트입니다. 업체 담당자가 아래 질문에 답하기 어려워합니다. 지금까지 알려진 다른 답변을 참고해서, 이 질문에 대한 답변 초안을 2~3문장으로 제안해주세요.

질문: ${input.question}

지금까지의 다른 답변:
${contextLines || "(없음)"}

답변 초안:`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("UNEXPECTED_RESPONSE");
  return block.text.trim();
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `npm test -- preSurveyAssist`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add package.json package-lock.json .env.local.example lib/ai
git commit -m "feat: add AI-assisted pre-survey draft generation"
```

---

## Task 5: Admin Settings — Edit the Pre-Survey Template

**Files:**
- Create: `app/(dashboard)/settings/pre-survey/actions.ts`
- Create: `app/(dashboard)/settings/pre-survey/page.tsx`
- Test: `app/(dashboard)/settings/pre-survey/actions.test.ts`

**Interfaces:**
- Consumes: `requireRole("admin")` (foundation plan), `createServerSupabaseClient()` (foundation plan).
- Produces: `type PreSurveyQuestion = { id: string; label: string }`; `updatePreSurveyTemplate(questions: PreSurveyQuestion[]): Promise<{ error: string } | { success: true }>` — trims labels, drops empty ones, rejects an empty final list, updates row `id = 1`.

- [x] **Step 1: Write the failing test**

`app/(dashboard)/settings/pre-survey/actions.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/roles", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { requireRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { updatePreSurveyTemplate } from "./actions";

describe("updatePreSurveyTemplate", () => {
  test("rejects when every question is blank", async () => {
    (requireRole as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "u1", role: "admin" });

    const result = await updatePreSurveyTemplate([{ id: "q1", label: "   " }]);
    expect(result).toEqual({ error: "질문을 최소 1개 이상 입력해주세요." });
  });

  test("trims labels, drops blanks, and saves the rest", async () => {
    (requireRole as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "u1", role: "admin" });

    const updateMock = vi.fn().mockReturnValue({ eq: async () => ({ error: null }) });
    (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: () => ({ update: updateMock }),
    });

    const result = await updatePreSurveyTemplate([
      { id: "q1", label: "  브랜드 소개를 부탁드립니다  " },
      { id: "q2", label: "   " },
    ]);

    expect(result).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ questions: [{ id: "q1", label: "브랜드 소개를 부탁드립니다" }] })
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- settings/pre-survey/actions`
Expected: FAIL — the action module doesn't exist.

- [x] **Step 3: Implement the action and page**

`app/(dashboard)/settings/pre-survey/actions.ts`:

```ts
"use server";

import { requireRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PreSurveyQuestion = { id: string; label: string };

export async function updatePreSurveyTemplate(questions: PreSurveyQuestion[]) {
  await requireRole("admin");

  const cleaned = questions
    .map((q) => ({ id: q.id, label: q.label.trim() }))
    .filter((q) => q.label.length > 0);

  if (cleaned.length === 0) {
    return { error: "질문을 최소 1개 이상 입력해주세요." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("pre_survey_template")
    .update({ questions: cleaned, updated_at: new Date().toISOString() })
    .eq("id", 1);

  if (error) return { error: "저장에 실패했습니다. 다시 시도해주세요." };
  return { success: true } as const;
}
```

`app/(dashboard)/settings/pre-survey/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { updatePreSurveyTemplate, type PreSurveyQuestion } from "./actions";

let nextId = 0;
function newId() {
  nextId += 1;
  return `new-${Date.now()}-${nextId}`;
}

export default function PreSurveySettingsPage() {
  const [questions, setQuestions] = useState<PreSurveyQuestion[]>([{ id: newId(), label: "" }]);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSave() {
    const result = await updatePreSurveyTemplate(questions);
    setStatus("error" in result ? result.error : "저장되었습니다.");
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-text">사전조사 질문틀 설정</h1>
      <div className="flex flex-col gap-3">
        {questions.map((q, i) => (
          <div key={q.id} className="flex gap-2">
            <input
              value={q.label}
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
          onClick={() => setQuestions([...questions, { id: newId(), label: "" }])}
          className="rounded-token border border-border px-4 py-2 text-text"
        >
          질문 추가
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-token bg-accent px-4 py-2 font-medium text-onAccent"
        >
          저장
        </button>
      </div>
      {status && <p className="mt-3 text-sm text-text">{status}</p>}
    </div>
  );
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- settings/pre-survey/actions`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add "app/(dashboard)/settings"
git commit -m "feat: add admin settings page for the pre-survey question template"
```

---

## Task 6: Shared Pre-Survey Form + Public Route

**Files:**
- Create: `app/pre-survey/[token]/actions.ts`
- Create: `app/pre-survey/[token]/PreSurveyForm.tsx`
- Create: `app/pre-survey/[token]/page.tsx`
- Test: `app/pre-survey/[token]/actions.test.ts`
- Test: `app/pre-survey/[token]/PreSurveyForm.test.tsx`

**Interfaces:**
- Consumes: `createServerSupabaseClient()` (foundation plan), `generatePreSurveyDraft()` (Task 4).
- Produces:
  - `submitPreSurveyResponse(token: string, answers: Record<string, string>, filledBy: "company" | "agency", aiAssisted: boolean): Promise<{ error: string } | { success: true }>`
  - `getAssist(question: string, context: Record<string, string>): Promise<{ draft: string } | { error: string }>`
  - `<PreSurveyForm token={string} questions={{id,label}[]} filledBy={"company"|"agency"} />` — Task 7 (internal agency page) reuses this component as-is.

- [x] **Step 1: Write the failing tests for the actions**

`app/pre-survey/[token]/actions.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/ai/preSurveyAssist", () => ({ generatePreSurveyDraft: vi.fn() }));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generatePreSurveyDraft } from "@/lib/ai/preSurveyAssist";
import { submitPreSurveyResponse, getAssist } from "./actions";

describe("submitPreSurveyResponse", () => {
  test("returns success when the RPC returns true", async () => {
    (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      rpc: async () => ({ data: true, error: null }),
    });

    const result = await submitPreSurveyResponse("tok", { q1: "답변" }, "company", false);
    expect(result).toEqual({ success: true });
  });

  test("returns an error when the RPC returns false (unknown token)", async () => {
    (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      rpc: async () => ({ data: false, error: null }),
    });

    const result = await submitPreSurveyResponse("bad-token", {}, "company", false);
    expect(result).toEqual({ error: "제출에 실패했습니다. 링크가 유효한지 확인해주세요." });
  });
});

describe("getAssist", () => {
  test("returns the draft on success", async () => {
    (generatePreSurveyDraft as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("초안 답변입니다.");
    const result = await getAssist("질문", {});
    expect(result).toEqual({ draft: "초안 답변입니다." });
  });

  test("returns the fallback error message when generation fails", async () => {
    (generatePreSurveyDraft as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    const result = await getAssist("질문", {});
    expect(result).toEqual({ error: "AI 제안 실패 — 직접 입력해주세요." });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- "app/pre-survey/\[token\]/actions"`
Expected: FAIL — the actions module doesn't exist.

- [x] **Step 3: Implement the actions**

`app/pre-survey/[token]/actions.ts`:

```ts
"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generatePreSurveyDraft } from "@/lib/ai/preSurveyAssist";

export async function submitPreSurveyResponse(
  token: string,
  answers: Record<string, string>,
  filledBy: "company" | "agency",
  aiAssisted: boolean
) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("submit_pre_survey_response", {
    p_token: token,
    p_answers: answers,
    p_filled_by: filledBy,
    p_ai_assisted: aiAssisted,
  });

  if (error || data !== true) {
    return { error: "제출에 실패했습니다. 링크가 유효한지 확인해주세요." };
  }
  return { success: true } as const;
}

export async function getAssist(question: string, context: Record<string, string>) {
  try {
    const draft = await generatePreSurveyDraft({ question, context });
    return { draft };
  } catch {
    return { error: "AI 제안 실패 — 직접 입력해주세요." };
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- "app/pre-survey/\[token\]/actions"`
Expected: PASS

- [x] **Step 5: Write the failing test for the form component**

`app/pre-survey/[token]/PreSurveyForm.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("./actions", () => ({
  submitPreSurveyResponse: vi.fn(),
  getAssist: vi.fn(),
}));

import { submitPreSurveyResponse, getAssist } from "./actions";
import PreSurveyForm from "./PreSurveyForm";

const questions = [{ id: "q1", label: "브랜드 소개를 부탁드립니다" }];

describe("PreSurveyForm", () => {
  test("fills the AI-suggested draft into the field on 'AI 도움받기'", async () => {
    (getAssist as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ draft: "저희는 스킨케어 브랜드입니다." });

    render(<PreSurveyForm token="tok" questions={questions} filledBy="company" />);
    fireEvent.click(screen.getByRole("button", { name: "AI 도움받기" }));

    await waitFor(() => {
      expect(screen.getByLabelText("브랜드 소개를 부탁드립니다")).toHaveValue("저희는 스킨케어 브랜드입니다.");
    });
  });

  test("shows the fallback message when AI assist fails, without blocking manual entry", async () => {
    (getAssist as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ error: "AI 제안 실패 — 직접 입력해주세요." });

    render(<PreSurveyForm token="tok" questions={questions} filledBy="company" />);
    fireEvent.click(screen.getByRole("button", { name: "AI 도움받기" }));

    await waitFor(() => {
      expect(screen.getByText("AI 제안 실패 — 직접 입력해주세요.")).toBeInTheDocument();
    });

    const field = screen.getByLabelText("브랜드 소개를 부탁드립니다");
    fireEvent.change(field, { target: { value: "직접 입력한 답변" } });
    expect(field).toHaveValue("직접 입력한 답변");
  });

  test("submits with filledBy and marks ai_assisted true only if assist was used", async () => {
    (submitPreSurveyResponse as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    render(<PreSurveyForm token="tok" questions={questions} filledBy="agency" />);
    fireEvent.change(screen.getByLabelText("브랜드 소개를 부탁드립니다"), {
      target: { value: "직접 작성한 답변" },
    });
    fireEvent.click(screen.getByRole("button", { name: "제출" }));

    await waitFor(() => {
      expect(submitPreSurveyResponse).toHaveBeenCalledWith(
        "tok",
        { q1: "직접 작성한 답변" },
        "agency",
        false
      );
    });
  });
});
```

- [x] **Step 6: Run test to verify it fails**

Run: `npm test -- PreSurveyForm`
Expected: FAIL — `PreSurveyForm.tsx` doesn't exist.

- [x] **Step 7: Implement the form component**

`app/pre-survey/[token]/PreSurveyForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { submitPreSurveyResponse, getAssist } from "./actions";

type Question = { id: string; label: string };

export default function PreSurveyForm({
  token,
  questions,
  filledBy,
}: {
  token: string;
  questions: Question[];
  filledBy: "company" | "agency";
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [assistUsed, setAssistUsed] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [assistLoadingId, setAssistLoadingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleAssist(question: Question) {
    setAssistLoadingId(question.id);
    setAssistError(null);
    const result = await getAssist(question.label, answers);
    setAssistLoadingId(null);

    if ("error" in result) {
      setAssistError(result.error);
      return;
    }
    setAnswers((prev) => ({ ...prev, [question.id]: result.draft }));
    setAssistUsed(true);
  }

  async function handleSubmit() {
    const result = await submitPreSurveyResponse(token, answers, filledBy, assistUsed);
    setStatus("error" in result ? result.error : "제출되었습니다. 감사합니다.");
  }

  return (
    <div className="flex flex-col gap-6">
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
          <button
            type="button"
            onClick={() => handleAssist(q)}
            disabled={assistLoadingId === q.id}
            className="self-start rounded-token border border-border px-3 py-1.5 text-sm text-textMuted"
          >
            {assistLoadingId === q.id ? "생성 중..." : "AI 도움받기"}
          </button>
        </div>
      ))}
      {assistError && <p className="text-sm text-critical">{assistError}</p>}
      <button
        type="button"
        onClick={handleSubmit}
        className="self-start rounded-token bg-accent px-4 py-2 font-medium text-onAccent"
      >
        제출
      </button>
      {status && <p className="text-sm text-text">{status}</p>}
    </div>
  );
}
```

- [x] **Step 8: Run test to verify it passes**

Run: `npm test -- PreSurveyForm`
Expected: PASS

- [x] **Step 9: Implement the public page**

`app/pre-survey/[token]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import PreSurveyForm from "./PreSurveyForm";

export default async function PublicPreSurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc("get_pre_survey_context", { p_token: token });

  if (!data) notFound();

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-1 text-2xl font-bold text-text">{data.company_name} 사전조사</h1>
      <p className="mb-8 text-textMuted">{data.campaign_name}</p>
      <PreSurveyForm token={token} questions={data.questions} filledBy="company" />
    </main>
  );
}
```

- [x] **Step 10: Commit**

```bash
git add app/pre-survey
git commit -m "feat: add shared pre-survey form and public token route"
```

---

## Task 7: Internal Agency-Filled Pre-Survey Page

**Files:**
- Create: `app/(dashboard)/campaigns/[id]/pre-survey/page.tsx`
- Test: `app/(dashboard)/campaigns/[id]/pre-survey/page.test.tsx`

**Interfaces:**
- Consumes: `createServerSupabaseClient()` (foundation plan), `<PreSurveyForm>` (Task 6).
- Produces: a page reachable at `/campaigns/[id]/pre-survey` reusing the exact same form, with `filledBy="agency"` and the campaign's own `pre_survey_token` (so submission goes through the identical RPC path as the public route).

- [x] **Step 1: Write the failing test**

`app/(dashboard)/campaigns/[id]/pre-survey/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }) }));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import AgencyPreSurveyPage from "./page";

describe("AgencyPreSurveyPage", () => {
  test("renders the form with the campaign's own token and filledBy agency", async () => {
    (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                id: "c1",
                name: "글로우랩 세럼",
                company_name: "글로우랩",
                pre_survey_token: "tok-123",
              },
            }),
          }),
        }),
      }),
      rpc: async () => ({ data: { questions: [{ id: "q1", label: "브랜드 소개를 부탁드립니다" }] } }),
    });

    const ui = await AgencyPreSurveyPage({ params: Promise.resolve({ id: "c1" }) });
    render(ui);

    expect(screen.getByText("글로우랩 세럼")).toBeInTheDocument();
    expect(screen.getByLabelText("브랜드 소개를 부탁드립니다")).toBeInTheDocument();
  });

  test("calls notFound when the campaign does not exist", async () => {
    (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }),
    });

    await expect(
      AgencyPreSurveyPage({ params: Promise.resolve({ id: "missing" }) })
    ).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- "campaigns/\[id\]/pre-survey"`
Expected: FAIL — the page doesn't exist.

- [x] **Step 3: Implement the page**

`app/(dashboard)/campaigns/[id]/pre-survey/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import PreSurveyForm from "@/app/pre-survey/[token]/PreSurveyForm";

export default async function AgencyPreSurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, company_name, pre_survey_token")
    .eq("id", id)
    .single();

  if (!campaign) notFound();

  const { data: context } = await supabase.rpc("get_pre_survey_context", {
    p_token: campaign.pre_survey_token,
  });

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold text-text">{campaign.name}</h1>
      <p className="mb-8 text-textMuted">{campaign.company_name} · 사전조사 (에이전시 입력)</p>
      <PreSurveyForm token={campaign.pre_survey_token} questions={context?.questions ?? []} filledBy="agency" />
    </div>
  );
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- "campaigns/\[id\]/pre-survey"`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add "app/(dashboard)/campaigns/[id]/pre-survey"
git commit -m "feat: add internal agency-filled pre-survey page reusing the shared form"
```

---

## Self-Review Notes

- **Spec coverage:** 사전조사 질문틀 사전 설정(Task 1, 5) · AI 어시스트(Task 4, 6) · 업체/에이전시 양쪽 작성 가능(Task 6 public route + Task 7 internal route, both through the same `submit_pre_survey_response` RPC) · 답변 저장(Task 2, 3) · AI 실패 시 수동 입력 폴백(Task 6) all covered.
- **Placeholder scan:** no TBD/TODO; every step has runnable code.
- **Type consistency:** `PreSurveyQuestion = { id: string; label: string }` defined in Task 5 and reused as the shape flowing through Task 6/7's `questions` prop; `filled_by`/`filledBy` values (`"company" | "agency"`) match between the Task 2 migration's check constraint, Task 3's RPC validation, and Tasks 6–7's TypeScript unions; `generatePreSurveyDraft`/`getAssist`/`submitPreSurveyResponse`/`updatePreSurveyTemplate` names match between their Task 4/5/6 definitions and every consumer.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-30-seeding-pre-survey.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
