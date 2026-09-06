# Seeding Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js/Supabase/Vercel foundation for the influencer-seeding dashboard: project scaffold, design tokens, Supabase Auth with admin/staff roles, and campaign CRUD (create/list/view) — no public forms, applicants, or reports yet (those are later plans).

**Architecture:** Next.js App Router (TypeScript) with Supabase for Postgres + Auth, using `@supabase/ssr` for cookie-based sessions across server components, server actions, and middleware. Local development and tests run against a local Supabase stack via the Supabase CLI. Deployed to Vercel.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, `@supabase/supabase-js` + `@supabase/ssr`, Supabase CLI (local Postgres via Docker), Vitest + React Testing Library, Vercel.

**Spec:** [docs/superpowers/specs/2026-08-30-influencer-seeding-management-design.md](../specs/2026-08-30-influencer-seeding-management-design.md)

## Global Constraints

- Node.js 20+ and npm (project package manager).
- Docker Desktop must be running locally — the Supabase CLI's local stack (`supabase start`) requires it.
- Roles are exactly two values: `admin`, `staff` (spec: 인증 및 권한). No further permission granularity in this plan.
- Campaign type is exactly two values: `shipping` (제품배송형), `visit` (현장방문형) (spec: 데이터 모델 `campaigns`).
- Design tokens (colors, fonts, radius) come verbatim from the spec's "UI/디자인 시스템" section — dark default ("Ops Console"), light on `prefers-color-scheme: light` or explicit `data-theme="light"` (dark-first token pattern, explicit choice always wins over OS preference).
- All Supabase access from server code goes through the helpers built in Task 3 — no ad-hoc `createClient` calls elsewhere.

---

## File Structure

```
marketing/
├── app/
│   ├── layout.tsx                     # root layout, theme tokens, fonts
│   ├── globals.css                    # Tailwind + CSS variable tokens
│   ├── login/
│   │   └── page.tsx                   # email/password sign-in
│   └── (dashboard)/
│       ├── layout.tsx                 # protected shell: sidebar + auth guard
│       └── campaigns/
│           ├── page.tsx               # campaign list
│           ├── actions.ts             # createCampaign server action
│           ├── new/
│           │   └── page.tsx           # create campaign form
│           └── [id]/
│               └── page.tsx           # campaign detail
├── lib/
│   ├── supabase/
│   │   ├── client.ts                  # browser client
│   │   ├── server.ts                  # server client (cookies)
│   │   └── middleware.ts              # session refresh helper for middleware.ts
│   └── auth/
│       └── roles.ts                   # getCurrentProfile, requireRole
├── middleware.ts                      # route protection
├── supabase/
│   ├── config.toml                    # created by `supabase init`
│   └── migrations/
│       ├── 0001_profiles.sql
│       └── 0002_campaigns.sql
├── tests/
│   └── setup.ts                       # RTL/jsdom setup
├── vitest.config.ts
├── tailwind.config.ts
└── package.json
```

Each file has one job: `lib/supabase/*` only ever creates clients, `lib/auth/roles.ts` only ever answers "who is this and what can they do", `campaigns/actions.ts` only ever mutates campaign data. Pages stay thin — they call these helpers and render.

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Test: `tests/smoke.test.tsx`

**Interfaces:**
- Produces: a running Next.js app at `/` rendering a heading, reachable by later tasks' pages under `app/`.

- [ ] **Step 1: Scaffold the project**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --no-turbopack
```

Answer prompts: package manager `npm`, no `src/` directory.

- [ ] **Step 2: Replace the default home page with a minimal placeholder**

`app/page.tsx`:

```tsx
export default function HomePage() {
  return <h1>Seeding Dashboard</h1>;
}
```

- [ ] **Step 3: Install the test toolchain**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

`tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Add to `package.json` `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write the failing smoke test**

`tests/smoke.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import HomePage from "@/app/page";

test("renders the home page heading", () => {
  render(<HomePage />);
  expect(screen.getByRole("heading", { name: "Seeding Dashboard" })).toBeInTheDocument();
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/app/page'` (or similar) if scaffold/alias isn't wired yet; otherwise confirm it fails for the right reason before Step 2 is in place. If Step 2 is already done, skip to Step 6.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts app tests vitest.config.ts
git commit -m "chore: scaffold Next.js app with Vitest smoke test"
```

---

## Task 2: Design Tokens (Tailwind Theme)

**Files:**
- Modify: `app/globals.css`
- Modify: `tailwind.config.ts`
- Modify: `app/layout.tsx`
- Test: `tests/design-tokens.test.tsx`

**Interfaces:**
- Produces: CSS custom properties (`--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`, `--accent`, `--accent-soft`, `--accent-2`, `--success`, `--warning`, `--critical`, `--on-accent`, `--radius`, `--shadow`, `--font-display`, `--font-body`, `--font-mono`) available globally, plus Tailwind theme colors `bg`, `surface`, `surface2`, `border`, `text`, `textMuted`, `accent`, `accent2`, `success`, `warning`, `critical`, `onAccent` and font families `display`, `body`, `mono` that read from those variables. Later tasks style with `bg-surface`, `text-text-muted`, `font-display`, etc. — never raw hex or a hardcoded font stack.
- The Google Fonts referenced by `--font-display`/`--font-body`/`--font-mono` (Big Shoulders Display, IBM Plex Sans, IBM Plex Mono, Fraunces, Karla — spec: UI/디자인 시스템) are loaded via `<link>` tags added to `app/layout.tsx`'s `<head>`; both theme's faces load unconditionally so the swap on `prefers-color-scheme`/`data-theme` never triggers a network fetch.

- [ ] **Step 1: Write the failing test**

`tests/design-tokens.test.tsx`:

```tsx
import { readFileSync } from "fs";

test("globals.css defines the dark-first token set and a light override", () => {
  const css = readFileSync("app/globals.css", "utf-8");
  expect(css).toMatch(/--accent:\s*#FF6A3D/);
  expect(css).toMatch(/prefers-color-scheme:\s*light/);
  expect(css).toMatch(/--accent:\s*#D6336C/);
  expect(css).toMatch(/\[data-theme="light"\]/);
  expect(css).toMatch(/--font-display:\s*"Big Shoulders Display"/);
  expect(css).toMatch(/--font-display:\s*"Fraunces"/);
});

test("layout.tsx loads the Google Fonts used by both themes", () => {
  const layout = readFileSync("app/layout.tsx", "utf-8");
  expect(layout).toMatch(/fonts\.googleapis\.com/);
  expect(layout).toMatch(/Big\+Shoulders\+Display/);
  expect(layout).toMatch(/Fraunces/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- design-tokens`
Expected: FAIL — `app/globals.css` doesn't contain those tokens yet.

- [ ] **Step 3: Write the token CSS**

Replace the Tailwind-generated boilerplate in `app/globals.css` with:

```css
@import "tailwindcss";

:root {
  --bg: #0E1114;
  --surface: #171B1F;
  --surface-2: #1E2429;
  --border: #2A3138;
  --text: #E8EDF0;
  --text-muted: #8B96A0;
  --accent: #FF6A3D;
  --accent-soft: #3A241C;
  --accent-2: #35D0BA;
  --success: #35D0BA;
  --warning: #F5B84E;
  --critical: #FF5470;
  --on-accent: #0E1114;
  --radius: 4px;
  --shadow: none;
  --font-display: "Big Shoulders Display", "Arial Narrow", sans-serif;
  --font-body: "IBM Plex Sans", -apple-system, "Segoe UI", sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace;
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    --bg: #F3F1F6;
    --surface: #FFFFFF;
    --surface-2: #ECE7F2;
    --border: #DDD6E5;
    --text: #241B2E;
    --text-muted: #746A80;
    --accent: #D6336C;
    --accent-soft: #FBE4ED;
    --accent-2: #7048E8;
    --success: #2F9E44;
    --warning: #E8A33D;
    --critical: #E03131;
    --on-accent: #FFFFFF;
    --radius: 14px;
    --shadow: 0 1px 2px rgba(36,27,46,.06), 0 8px 24px -12px rgba(36,27,46,.18);
    --font-display: "Fraunces", Georgia, serif;
    --font-body: "Karla", -apple-system, "Segoe UI", sans-serif;
    --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  }
}

:root[data-theme="light"] {
  --bg: #F3F1F6;
  --surface: #FFFFFF;
  --surface-2: #ECE7F2;
  --border: #DDD6E5;
  --text: #241B2E;
  --text-muted: #746A80;
  --accent: #D6336C;
  --accent-soft: #FBE4ED;
  --accent-2: #7048E8;
  --success: #2F9E44;
  --warning: #E8A33D;
  --critical: #E03131;
  --on-accent: #FFFFFF;
  --radius: 14px;
  --shadow: 0 1px 2px rgba(36,27,46,.06), 0 8px 24px -12px rgba(36,27,46,.18);
  --font-display: "Fraunces", Georgia, serif;
  --font-body: "Karla", -apple-system, "Segoe UI", sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
}

body {
  font-family: var(--font-body);
  background: var(--bg);
  color: var(--text);
}
```

`tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        surface2: "var(--surface-2)",
        border: "var(--border)",
        text: "var(--text)",
        textMuted: "var(--text-muted)",
        accent: "var(--accent)",
        accentSoft: "var(--accent-soft)",
        accent2: "var(--accent-2)",
        success: "var(--success)",
        warning: "var(--warning)",
        critical: "var(--critical)",
        onAccent: "var(--on-accent)",
      },
      borderRadius: {
        token: "var(--radius)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
    },
  },
} satisfies Config;
```

- [ ] **Step 4: Load the Google Fonts both themes need**

Modify `app/layout.tsx` — add these tags inside `<head>` (create-next-app's default layout already has a `<head>` or an implicit one via the `Metadata` export; add an explicit `<head>` with these links if one isn't already there):

```tsx
<head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Karla:wght@400;500;700&display=swap"
    rel="stylesheet"
  />
</head>
```

Both themes' font families load unconditionally in one request — only the CSS variables (Task 2's `--font-*` tokens) switch which loaded family actually renders, so there's no added network fetch when the theme flips.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- design-tokens`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/layout.tsx tailwind.config.ts tests/design-tokens.test.tsx
git commit -m "feat: add dark-first design tokens and fonts (Ops Console / Studio Board)"
```

---

## Task 3: Supabase Project + Client Helpers

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`
- Create: `.env.local.example`
- Test: `lib/supabase/client.test.ts`

**Interfaces:**
- Produces:
  - `createBrowserSupabaseClient(): SupabaseClient` (`lib/supabase/client.ts`)
  - `createServerSupabaseClient(): Promise<SupabaseClient>` (`lib/supabase/server.ts`) — reads/writes auth cookies via `next/headers`
  - `updateSession(request: NextRequest): Promise<NextResponse>` (`lib/supabase/middleware.ts`) — used by `middleware.ts` in Task 5
- Consumes: env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

- [ ] **Step 1: Install Supabase packages and CLI**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D supabase
```

- [ ] **Step 2: Initialize and start the local Supabase stack**

```bash
npx supabase init
npx supabase start
```

Run: `npx supabase status`
Copy the printed `API URL` and `anon key` into a new `.env.local` (not committed):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<from supabase status>
```

Create `.env.local.example` (committed, no real values):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 3: Write the failing test for the browser client**

`lib/supabase/client.test.ts`:

```ts
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

test("creates a Supabase client configured with the public URL", () => {
  const client = createBrowserSupabaseClient();
  expect(client.supabaseUrl).toBe(process.env.NEXT_PUBLIC_SUPABASE_URL);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- lib/supabase/client`
Expected: FAIL — `lib/supabase/client.ts` doesn't exist.

- [ ] **Step 5: Implement the clients**

`lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

`lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component with no request context to write to;
            // middleware.ts (Task 5) refreshes the session on every request instead.
          }
        },
      },
    }
  );
}
```

`lib/supabase/middleware.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();
  return response;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- lib/supabase/client`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/supabase package.json package-lock.json .env.local.example supabase/config.toml
git commit -m "feat: add Supabase client/server/middleware helpers"
```

(`.env.local` stays untracked — confirm `.gitignore` already excludes it, which `create-next-app` sets up by default.)

---

## Task 4: Database Schema — Profiles & Roles

**Files:**
- Create: `supabase/migrations/0001_profiles.sql`
- Test: `supabase/migrations/0001_profiles.test.ts`

**Interfaces:**
- Produces: table `public.profiles (id uuid primary key references auth.users, role text not null default 'staff', full_name text, created_at timestamptz not null default now())` with a `role` check constraint (`'admin'` or `'staff'`), RLS enabled, and a trigger that inserts a `profiles` row whenever a new `auth.users` row is created.

- [ ] **Step 1: Write the failing integration test**

`supabase/migrations/0001_profiles.test.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { beforeAll, expect, test } from "vitest";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let userId: string;

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `profile-test-${Date.now()}@example.com`,
    password: "password123",
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
});

test("a profile row is auto-created with role 'staff' when a user signs up", async () => {
  const { data, error } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .single();

  expect(error).toBeNull();
  expect(data).toEqual({ id: userId, role: "staff" });
});

test("role is constrained to admin or staff", async () => {
  const { error } = await admin
    .from("profiles")
    .update({ role: "superuser" })
    .eq("id", userId);

  expect(error).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx supabase start` (if not already running), then `npm test -- profiles`
Expected: FAIL — `relation "public.profiles" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0001_profiles.sql`:

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can update their own profile, not their role"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 4: Apply the migration and run test to verify it passes**

Run: `npx supabase migration up`
Run: `npm test -- profiles`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_profiles.sql supabase/migrations/0001_profiles.test.ts
git commit -m "feat: add profiles table with admin/staff role and auto-create trigger"
```

---

## Task 5: Database Schema — Campaigns

**Files:**
- Create: `supabase/migrations/0002_campaigns.sql`
- Test: `supabase/migrations/0002_campaigns.test.ts`

**Interfaces:**
- Produces: table `public.campaigns (id uuid primary key default gen_random_uuid(), name text not null, company_name text not null, campaign_type text not null, status text not null default 'draft', pre_survey_token uuid not null default gen_random_uuid(), apply_token uuid not null default gen_random_uuid(), applicant_list_token uuid not null default gen_random_uuid(), seeding_sheet_token uuid not null default gen_random_uuid(), created_by uuid references public.profiles(id), created_at timestamptz not null default now())`, `campaign_type` constrained to `'shipping'`/`'visit'`, RLS restricting all access to authenticated users only (no public/anon access — public form routes are built in a later plan and will use `SECURITY DEFINER` functions scoped by token, not direct table RLS).

- [ ] **Step 1: Write the failing integration test**

`supabase/migrations/0002_campaigns.test.ts`:

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

test("a campaign can be created with required fields and gets default tokens", async () => {
  const { data, error } = await admin
    .from("campaigns")
    .insert({ name: "글로우랩 세럼 런칭 시딩", company_name: "글로우랩", campaign_type: "shipping" })
    .select()
    .single();

  expect(error).toBeNull();
  expect(data.status).toBe("draft");
  expect(data.pre_survey_token).toBeTruthy();
  expect(data.apply_token).not.toBe(data.pre_survey_token);
});

test("campaign_type only accepts shipping or visit", async () => {
  const { error } = await admin
    .from("campaigns")
    .insert({ name: "x", company_name: "x", campaign_type: "invalid" });

  expect(error).not.toBeNull();
});

test("anonymous clients cannot read campaigns", async () => {
  const { data, error } = await anon.from("campaigns").select();
  expect(data).toEqual([]);
  expect(error).toBeNull(); // RLS silently returns zero rows rather than erroring
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- campaigns`
Expected: FAIL — `relation "public.campaigns" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0002_campaigns.sql`:

```sql
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_name text not null,
  campaign_type text not null check (campaign_type in ('shipping', 'visit')),
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  pre_survey_token uuid not null default gen_random_uuid(),
  apply_token uuid not null default gen_random_uuid(),
  applicant_list_token uuid not null default gen_random_uuid(),
  seeding_sheet_token uuid not null default gen_random_uuid(),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.campaigns enable row level security;

create policy "authenticated users can read all campaigns"
  on public.campaigns for select
  to authenticated
  using (true);

create policy "authenticated users can create campaigns"
  on public.campaigns for insert
  to authenticated
  with check (true);

create policy "authenticated users can update campaigns"
  on public.campaigns for update
  to authenticated
  using (true);
```

- [ ] **Step 4: Apply the migration and run test to verify it passes**

Run: `npx supabase migration up`
Run: `npm test -- campaigns`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_campaigns.sql supabase/migrations/0002_campaigns.test.ts
git commit -m "feat: add campaigns table with per-purpose share tokens"
```

---

## Task 6: Role Helpers

**Files:**
- Create: `lib/auth/roles.ts`
- Test: `lib/auth/roles.test.ts`

**Interfaces:**
- Consumes: `createServerSupabaseClient()` from `lib/supabase/server.ts` (Task 3).
- Produces:
  - `type Profile = { id: string; role: "admin" | "staff"; full_name: string | null }`
  - `getCurrentProfile(): Promise<Profile | null>` — `null` when not logged in
  - `requireRole(role: "admin" | "staff"): Promise<Profile>` — throws `Error("UNAUTHORIZED")` if not logged in, `Error("FORBIDDEN")` if logged in with the wrong role and `role === "admin"` was required (staff never needs elevation to act as staff)

- [ ] **Step 1: Write the failing test**

`lib/auth/roles.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireRole } from "@/lib/auth/roles";

function mockSupabase({ userId, profile }: { userId: string | null; profile?: { role: string; full_name: string | null } }) {
  (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: profile ? { id: userId, ...profile } : null }),
        }),
      }),
    }),
  });
}

describe("getCurrentProfile", () => {
  test("returns null when nobody is logged in", async () => {
    mockSupabase({ userId: null });
    expect(await getCurrentProfile()).toBeNull();
  });

  test("returns the profile for a logged-in user", async () => {
    mockSupabase({ userId: "u1", profile: { role: "staff", full_name: "이나영" } });
    expect(await getCurrentProfile()).toEqual({ id: "u1", role: "staff", full_name: "이나영" });
  });
});

describe("requireRole", () => {
  test("throws UNAUTHORIZED when nobody is logged in", async () => {
    mockSupabase({ userId: null });
    await expect(requireRole("staff")).rejects.toThrow("UNAUTHORIZED");
  });

  test("throws FORBIDDEN when a staff user needs admin", async () => {
    mockSupabase({ userId: "u1", profile: { role: "staff", full_name: null } });
    await expect(requireRole("admin")).rejects.toThrow("FORBIDDEN");
  });

  test("returns the profile when a staff user needs staff", async () => {
    mockSupabase({ userId: "u1", profile: { role: "staff", full_name: null } });
    await expect(requireRole("staff")).resolves.toEqual({ id: "u1", role: "staff", full_name: null });
  });

  test("an admin satisfies a staff requirement", async () => {
    mockSupabase({ userId: "u1", profile: { role: "admin", full_name: null } });
    await expect(requireRole("staff")).resolves.toEqual({ id: "u1", role: "admin", full_name: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/auth/roles`
Expected: FAIL — `lib/auth/roles.ts` doesn't exist.

- [ ] **Step 3: Implement the helpers**

`lib/auth/roles.ts`:

```ts
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  role: "admin" | "staff";
  full_name: string | null;
};

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .single();

  return (data as Profile) ?? null;
}

export async function requireRole(role: "admin" | "staff"): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("UNAUTHORIZED");
  if (role === "admin" && profile.role !== "admin") throw new Error("FORBIDDEN");
  return profile;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/auth/roles`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/auth/roles.ts lib/auth/roles.test.ts
git commit -m "feat: add getCurrentProfile/requireRole auth helpers"
```

---

## Task 7: Login Page & Route Protection Middleware

**Files:**
- Create: `app/login/page.tsx`, `app/login/actions.ts`
- Create: `middleware.ts`
- Test: `app/login/actions.test.ts`

**Interfaces:**
- Consumes: `createServerSupabaseClient()` (Task 3), `updateSession()` (Task 3).
- Produces: `signIn(formData: FormData): Promise<{ error: string } | never>` (server action; redirects to `/campaigns` on success via `redirect()`, so its non-error return type is `never`).

- [ ] **Step 1: Write the failing test for the sign-in action**

`app/login/actions.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { signIn } from "@/app/login/actions";

function formData(email: string, password: string) {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", password);
  return fd;
}

describe("signIn", () => {
  test("returns an error message on invalid credentials", async () => {
    (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        signInWithPassword: async () => ({ error: { message: "Invalid login credentials" } }),
      },
    });

    const result = await signIn(formData("wrong@example.com", "wrongpass"));
    expect(result).toEqual({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
  });

  test("redirects to /campaigns on success", async () => {
    (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        signInWithPassword: async () => ({ error: null }),
      },
    });

    await expect(signIn(formData("user@example.com", "correctpass"))).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/campaigns");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/login/actions`
Expected: FAIL — `app/login/actions.ts` doesn't exist.

- [ ] **Step 3: Implement the sign-in action, page, and middleware**

`app/login/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  redirect("/campaigns");
}
```

`app/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    const result = await signIn(formData);
    if (result?.error) setError(result.error);
  }

  return (
    <main className="mx-auto mt-24 max-w-sm rounded-token border border-border bg-surface p-8">
      <h1 className="mb-6 text-xl font-semibold text-text">로그인</h1>
      <form action={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-text">
          이메일
          <input name="email" type="email" required className="rounded-token border border-border bg-bg px-3 py-2 text-text" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text">
          비밀번호
          <input name="password" type="password" required className="rounded-token border border-border bg-bg px-3 py-2 text-text" />
        </label>
        {error && <p className="text-sm text-critical">{error}</p>}
        <button type="submit" className="rounded-token bg-accent px-4 py-2 font-medium text-onAccent">
          로그인
        </button>
      </form>
    </main>
  );
}
```

`middleware.ts`:

```ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- app/login/actions`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/login middleware.ts
git commit -m "feat: add login page/action and session-refresh middleware"
```

---

## Task 8: Protected Dashboard Shell

**Files:**
- Create: `app/(dashboard)/layout.tsx`
- Test: `app/(dashboard)/layout.test.tsx`

**Interfaces:**
- Consumes: `getCurrentProfile()` (Task 6).
- Produces: a layout component that redirects to `/login` when `getCurrentProfile()` returns `null`, and otherwise renders a sidebar (오버뷰/인플루언서 시딩/인플루언서 행사/SNS 운영/전체 일정 — links stubbed to `#` except campaigns, which points at `/campaigns`) plus `{children}`.

- [ ] **Step 1: Write the failing test**

`app/(dashboard)/layout.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/roles", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

import { getCurrentProfile } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import DashboardLayout from "./layout";

describe("DashboardLayout", () => {
  test("redirects to /login when nobody is logged in", async () => {
    (getCurrentProfile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(DashboardLayout({ children: <div /> })).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  test("renders the sidebar and children for a logged-in user", async () => {
    (getCurrentProfile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1",
      role: "staff",
      full_name: "이나영",
    });

    const ui = await DashboardLayout({ children: <p>페이지 내용</p> });
    render(ui);

    expect(screen.getByText("오버뷰")).toBeInTheDocument();
    expect(screen.getByText("페이지 내용")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- "app/(dashboard)/layout"`
Expected: FAIL — `app/(dashboard)/layout.tsx` doesn't exist.

- [ ] **Step 3: Implement the layout**

`app/(dashboard)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/roles";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <div className="grid min-h-screen grid-cols-[232px_1fr]">
      <nav className="flex flex-col gap-7 border-r border-border bg-surface p-6">
        <div className="px-2 text-lg font-bold text-text">CAMP·OS</div>
        <div className="flex flex-col gap-1">
          <Link href="/" className="rounded-token px-3 py-2 text-sm text-textMuted">오버뷰</Link>
          <Link href="/campaigns" className="rounded-token px-3 py-2 text-sm text-textMuted">인플루언서 시딩</Link>
          <span className="rounded-token px-3 py-2 text-sm text-textMuted opacity-50">인플루언서 행사</span>
          <span className="rounded-token px-3 py-2 text-sm text-textMuted opacity-50">SNS 운영</span>
          <span className="rounded-token px-3 py-2 text-sm text-textMuted opacity-50">전체 일정</span>
        </div>
        <div className="mt-auto border-t border-border pt-4 text-sm text-text">
          {profile.full_name ?? "담당자"} · {profile.role}
        </div>
      </nav>
      <main className="p-10">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- "app/(dashboard)/layout"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/layout.tsx" "app/(dashboard)/layout.test.tsx"
git commit -m "feat: add protected dashboard shell with sidebar nav"
```

---

## Task 9: Create Campaign (Server Action + Form)

**Files:**
- Create: `app/(dashboard)/campaigns/actions.ts`
- Create: `app/(dashboard)/campaigns/new/page.tsx`
- Test: `app/(dashboard)/campaigns/actions.test.ts`

**Interfaces:**
- Consumes: `requireRole("staff")` (Task 6), `createServerSupabaseClient()` (Task 3).
- Produces: `createCampaign(formData: FormData): Promise<{ error: string } | never>` — validates `name`, `company_name`, `campaign_type` (must be `"shipping"` or `"visit"`) are non-empty, inserts a row, then `redirect()`s to `/campaigns/[id]`.

- [ ] **Step 1: Write the failing test**

`app/(dashboard)/campaigns/actions.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/roles", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

import { requireRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { createCampaign } from "./actions";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("createCampaign", () => {
  test("returns an error when campaign_type is missing", async () => {
    (requireRole as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "u1", role: "staff" });

    const result = await createCampaign(formData({ name: "글로우랩 세럼", company_name: "글로우랩" }));
    expect(result).toEqual({ error: "캠페인 유형을 선택해주세요." });
  });

  test("inserts the campaign and redirects to its detail page", async () => {
    (requireRole as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "u1", role: "staff" });
    (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: { id: "campaign-1" }, error: null }),
          }),
        }),
      }),
    });

    await expect(
      createCampaign(formData({ name: "글로우랩 세럼", company_name: "글로우랩", campaign_type: "shipping" }))
    ).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/campaigns/campaign-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- campaigns/actions`
Expected: FAIL — `app/(dashboard)/campaigns/actions.ts` doesn't exist.

- [ ] **Step 3: Implement the action and form**

`app/(dashboard)/campaigns/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function createCampaign(formData: FormData) {
  const profile = await requireRole("staff");

  const name = String(formData.get("name") ?? "").trim();
  const company_name = String(formData.get("company_name") ?? "").trim();
  const campaign_type = String(formData.get("campaign_type") ?? "");

  if (!name) return { error: "캠페인 이름을 입력해주세요." };
  if (!company_name) return { error: "업체명을 입력해주세요." };
  if (campaign_type !== "shipping" && campaign_type !== "visit") {
    return { error: "캠페인 유형을 선택해주세요." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("campaigns")
    .insert({ name, company_name, campaign_type, created_by: profile.id })
    .select()
    .single();

  if (error || !data) return { error: "캠페인 생성에 실패했습니다. 다시 시도해주세요." };

  redirect(`/campaigns/${data.id}`);
}
```

`app/(dashboard)/campaigns/new/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { createCampaign } from "../actions";

export default function NewCampaignPage() {
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    const result = await createCampaign(formData);
    if (result?.error) setError(result.error);
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-bold text-text">새 캠페인</h1>
      <form action={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-text">
          캠페인 이름
          <input name="name" required className="rounded-token border border-border bg-surface px-3 py-2 text-text" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text">
          업체명
          <input name="company_name" required className="rounded-token border border-border bg-surface px-3 py-2 text-text" />
        </label>
        <fieldset className="flex flex-col gap-2 text-sm text-text">
          <legend className="mb-1">캠페인 유형</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="campaign_type" value="shipping" /> 제품배송형
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="campaign_type" value="visit" /> 현장방문형
          </label>
        </fieldset>
        {error && <p className="text-sm text-critical">{error}</p>}
        <button type="submit" className="rounded-token bg-accent px-4 py-2 font-medium text-onAccent">
          생성
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- campaigns/actions`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/campaigns/actions.ts" "app/(dashboard)/campaigns/actions.test.ts" "app/(dashboard)/campaigns/new"
git commit -m "feat: add createCampaign action and new-campaign form"
```

---

## Task 10: Campaign List & Detail Pages

**Files:**
- Create: `app/(dashboard)/campaigns/page.tsx`
- Create: `app/(dashboard)/campaigns/[id]/page.tsx`
- Test: `app/(dashboard)/campaigns/page.test.tsx`

**Interfaces:**
- Consumes: `createServerSupabaseClient()` (Task 3).
- Produces: list page rendering each campaign's name, company, type, and status as a `bg-surface` card linking to `/campaigns/[id]`; an empty state ("아직 캠페인이 없습니다") when there are none; a detail page showing the same fields for one campaign.

- [ ] **Step 1: Write the failing test**

`app/(dashboard)/campaigns/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import CampaignsPage from "./page";

describe("CampaignsPage", () => {
  test("shows an empty state when there are no campaigns", async () => {
    (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: () => ({ select: () => ({ order: async () => ({ data: [] }) }) }),
    });

    render(await CampaignsPage());
    expect(screen.getByText("아직 캠페인이 없습니다")).toBeInTheDocument();
  });

  test("lists each campaign with a link to its detail page", async () => {
    (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: () => ({
        select: () => ({
          order: async () => ({
            data: [
              { id: "c1", name: "글로우랩 세럼 런칭 시딩", company_name: "글로우랩", campaign_type: "shipping", status: "draft" },
            ],
          }),
        }),
      }),
    });

    render(await CampaignsPage());
    const link = screen.getByRole("link", { name: /글로우랩 세럼 런칭 시딩/ });
    expect(link).toHaveAttribute("href", "/campaigns/c1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- campaigns/page`
Expected: FAIL — `app/(dashboard)/campaigns/page.tsx` doesn't exist.

- [ ] **Step 3: Implement the pages**

`app/(dashboard)/campaigns/page.tsx`:

```tsx
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const TYPE_LABEL: Record<string, string> = { shipping: "제품배송형", visit: "현장방문형" };

export default async function CampaignsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, company_name, campaign_type, status")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text">인플루언서 시딩</h1>
        <Link href="/campaigns/new" className="rounded-token bg-accent px-4 py-2 font-medium text-onAccent">
          새 캠페인
        </Link>
      </div>

      {!campaigns || campaigns.length === 0 ? (
        <p className="text-textMuted">아직 캠페인이 없습니다</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link
                href={`/campaigns/${c.id}`}
                className="block rounded-token border border-border bg-surface p-4"
              >
                <p className="font-semibold text-text">{c.name}</p>
                <p className="text-sm text-textMuted">
                  {c.company_name} · {TYPE_LABEL[c.campaign_type]} · {c.status}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

`app/(dashboard)/campaigns/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const TYPE_LABEL: Record<string, string> = { shipping: "제품배송형", visit: "현장방문형" };

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, company_name, campaign_type, status")
    .eq("id", id)
    .single();

  if (!campaign) notFound();

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-text">{campaign.name}</h1>
      <p className="text-textMuted">
        {campaign.company_name} · {TYPE_LABEL[campaign.campaign_type]} · {campaign.status}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- campaigns/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/campaigns/page.tsx" "app/(dashboard)/campaigns/page.test.tsx" "app/(dashboard)/campaigns/[id]"
git commit -m "feat: add campaign list and detail pages"
```

---

## Task 11: Deploy to Vercel

**Files:**
- Create: `vercel.json` (only if a non-default build setting is needed — Next.js is auto-detected, so this may end up empty/unnecessary; skip creating it if `vercel dev` requires no overrides)

**Interfaces:**
- Produces: a deployed preview URL serving `/login` and the protected `/campaigns` flow against a **hosted** Supabase project (not the local Docker stack).

- [ ] **Step 1: Create a hosted Supabase project**

Via the Supabase dashboard, create a new project. Note its Project URL, anon key, and service role key.

- [ ] **Step 2: Push local migrations to the hosted project**

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

- [ ] **Step 3: Create the first admin user**

In the hosted Supabase dashboard's Auth panel, create a user, then run in the SQL editor:

```sql
update public.profiles set role = 'admin' where id = '<the new user''s id>';
```

- [ ] **Step 4: Connect the Vercel project**

```bash
npx vercel link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

(Paste the hosted project's values when prompted for each.)

- [ ] **Step 5: Deploy**

```bash
npx vercel --prod
```

- [ ] **Step 6: Verify manually**

Open the deployed URL, sign in with the admin user from Step 3, create a campaign, and confirm it appears on `/campaigns` and its detail page.

- [ ] **Step 7: Commit any config changes**

```bash
git add vercel.json 2>/dev/null; git commit -m "chore: configure Vercel deployment" --allow-empty
```

---

## Self-Review Notes

- **Spec coverage:** 아키텍처(Task 1,3,11) · 데이터 모델 profiles/campaigns(Task 4,5) · 인증 및 권한 admin/staff(Task 4,6,7,8) · UI/디자인 시스템 dark-first tokens(Task 2,8) covered. 사전조사/신청폼/지원자/관리시트/보고서는 후속 계획(Plan 2~5)에서 다룸 — 의도된 범위 밖.
- **Placeholder scan:** no TBD/TODO; every step has runnable code or an exact CLI command.
- **Type consistency:** `Profile` type (Task 6) reused as-is in Tasks 7–10; `createServerSupabaseClient`/`createBrowserSupabaseClient` names match between Task 3's definition and every later consumer; campaign field names (`name`, `company_name`, `campaign_type`, `status`) match between the Task 5 migration and Tasks 9–10's code.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-30-seeding-foundation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
