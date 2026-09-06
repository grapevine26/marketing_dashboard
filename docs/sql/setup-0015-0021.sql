-- 신규 마이그레이션 0015~0021 통합본 (서브프로젝트 B/C/D)
-- Supabase 대시보드 → SQL Editor에 전체 붙여넣고 실행하세요.
-- 선행 조건: setup-0006-0014.sql이 먼저 적용되어 있어야 합니다.

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

-- ============================================
-- 0018_sns_accounts.sql
-- ============================================
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

-- ============================================
-- 0019_sns_intake.sql
-- ============================================
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

-- ============================================
-- 0020_sns_plans_contents.sql
-- ============================================
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

-- ============================================
-- 0021_sns_approval_rpc.sql
-- ============================================
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

