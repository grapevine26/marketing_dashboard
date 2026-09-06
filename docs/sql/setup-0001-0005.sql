-- ============================================
-- supabase/migrations/0001_profiles.sql
-- ============================================
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

-- ============================================
-- supabase/migrations/0002_campaigns.sql
-- ============================================
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

-- ============================================
-- supabase/migrations/0003_pre_survey_template.sql
-- ============================================
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

-- ============================================
-- supabase/migrations/0004_pre_survey_responses.sql
-- ============================================
create table public.pre_survey_responses (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  answers jsonb not null,
  filled_by text not null check (filled_by in ('company', 'agency')),
  ai_assisted boolean not null default false,
  submitted_at timestamptz not null default now()
);

create index pre_survey_responses_campaign_id_idx
  on public.pre_survey_responses (campaign_id);

alter table public.pre_survey_responses enable row level security;

-- Deliberately no insert/update policy: every write goes through the
-- submit_pre_survey_response SECURITY DEFINER function (0005), so there is a
-- single audited write path shared by the public and agency entry points.
create policy "authenticated users can read pre-survey responses"
  on public.pre_survey_responses for select
  to authenticated
  using (true);

-- ============================================
-- supabase/migrations/0005_pre_survey_rpc.sql
-- ============================================
-- Both functions are SECURITY DEFINER so the public pre-survey link can read the
-- campaign and write a response scoped strictly by pre_survey_token, without
-- granting anon any direct table access.

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
  where c.pre_survey_token = p_token
    and t.id = 1;

  return result;
end;
$$;

revoke execute on function public.get_pre_survey_context(uuid) from public;
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

  select id into v_campaign_id
  from public.campaigns
  where pre_survey_token = p_token;

  if v_campaign_id is null then
    return false;
  end if;

  insert into public.pre_survey_responses (campaign_id, answers, filled_by, ai_assisted)
  values (v_campaign_id, p_answers, p_filled_by, p_ai_assisted);

  return true;
end;
$$;

revoke execute on function public.submit_pre_survey_response(uuid, jsonb, text, boolean) from public;
grant execute on function public.submit_pre_survey_response(uuid, jsonb, text, boolean) to anon, authenticated;

