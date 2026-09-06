-- 신규 마이그레이션 0006~0014 통합본
-- Supabase 대시보드 → SQL Editor에 전체 붙여넣고 실행하세요.
-- 0001~0005는 이미 적용됨. 이 파일은 그 이후 분량만 담고 있습니다.

-- ============================================
-- 0006_campaign_form_config.sql
-- ============================================
-- One application-form configuration per campaign: the AI-drafted-then-staff-edited
-- 소개문구, the campaign's custom questions, and whether the public /apply link is live.
-- campaign_id is the primary key, which enforces the 1:1 relationship for free.
create table public.campaign_form_config (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  intro_text text not null default '',
  custom_questions jsonb not null default '[]'::jsonb,
  is_published boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.campaign_form_config enable row level security;

-- No anon policy on purpose: the public /apply route reads this only through the
-- token-scoped get_apply_form RPC in 0008.
create policy "authenticated users can read form config"
  on public.campaign_form_config for select
  to authenticated
  using (true);

create policy "authenticated users can create form config"
  on public.campaign_form_config for insert
  to authenticated
  with check (true);

create policy "authenticated users can update form config"
  on public.campaign_form_config for update
  to authenticated
  using (true)
  with check (true);

-- ============================================
-- 0007_applicants.sql
-- ============================================
-- The six 표준 필드 from the spec are real columns so they can be indexed, exported,
-- and duplicate-checked; only the per-campaign custom questions live in JSONB.
create table public.applicants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  sns_url text not null,
  nationality text not null,
  contact text not null,
  -- 개인정보 수집 동의는 필수. 2차활용 동의는 선택이라 값만 기록한다.
  privacy_consent boolean not null check (privacy_consent),
  secondary_use_consent boolean not null default false,
  custom_answers jsonb not null default '{}'::jsonb,
  status text not null default 'applied'
    check (status in ('applied', 'selected', 'reserved', 'rejected')),
  applied_at timestamptz not null default now(),
  -- 최종선정/예비선정 감사 추적용. 이 계획서는 값을 쓰지 않는다 (Plan 4 담당).
  status_changed_by text check (status_changed_by in ('agency', 'company')),
  status_changed_at timestamptz
);

create index applicants_campaign_id_applied_at_idx
  on public.applicants (campaign_id, applied_at);

alter table public.applicants enable row level security;

-- Read-only for authenticated users. There is deliberately no insert or update
-- policy for any role: submissions go through submit_application (0008), and the
-- 최종선정/예비선정 write path is a separate RPC owned by the selection plan.
create policy "authenticated users can read applicants"
  on public.applicants for select
  to authenticated
  using (true);

-- ============================================
-- 0008_apply_rpc.sql
-- ============================================
-- All three functions are SECURITY DEFINER so the public /apply and /applicants
-- links can work scoped strictly by their own campaign token, without granting
-- anon any direct table access. Each token is single-purpose: apply_token can
-- never read the applicant list, and applicant_list_token can never submit.

create or replace function public.get_apply_form(p_token uuid)
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
    'campaign_type', c.campaign_type,
    'is_published', coalesce(f.is_published, false),
    -- An unpublished draft must not leak through the public link.
    'intro_text', case when coalesce(f.is_published, false) then f.intro_text else null end,
    'custom_questions', case
      when coalesce(f.is_published, false) then f.custom_questions
      else '[]'::jsonb
    end
  )
  into result
  from public.campaigns c
  left join public.campaign_form_config f on f.campaign_id = c.id
  where c.apply_token = p_token;

  return result;
end;
$$;

revoke execute on function public.get_apply_form(uuid) from public;
grant execute on function public.get_apply_form(uuid) to anon, authenticated;

create or replace function public.submit_application(
  p_token uuid,
  p_name text,
  p_sns_url text,
  p_nationality text,
  p_contact text,
  p_privacy_consent boolean,
  p_secondary_use_consent boolean,
  p_custom_answers jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
begin
  if coalesce(btrim(p_name), '') = ''
     or coalesce(btrim(p_sns_url), '') = ''
     or coalesce(btrim(p_nationality), '') = ''
     or coalesce(btrim(p_contact), '') = '' then
    raise exception 'MISSING_REQUIRED_FIELD';
  end if;

  if p_privacy_consent is not true then
    raise exception 'PRIVACY_CONSENT_REQUIRED';
  end if;

  select c.id into v_campaign_id
  from public.campaigns c
  join public.campaign_form_config f on f.campaign_id = c.id
  where c.apply_token = p_token
    and f.is_published;

  if v_campaign_id is null then
    return false;
  end if;

  insert into public.applicants (
    campaign_id, name, sns_url, nationality, contact,
    privacy_consent, secondary_use_consent, custom_answers
  )
  values (
    v_campaign_id,
    btrim(p_name),
    btrim(p_sns_url),
    btrim(p_nationality),
    btrim(p_contact),
    true,
    coalesce(p_secondary_use_consent, false),
    coalesce(p_custom_answers, '{}'::jsonb)
  );

  return true;
end;
$$;

revoke execute on function public.submit_application(uuid, text, text, text, text, boolean, boolean, jsonb) from public;
grant execute on function public.submit_application(uuid, text, text, text, text, boolean, boolean, jsonb) to anon, authenticated;

create or replace function public.get_applicant_list(p_token uuid)
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
    'campaign_type', c.campaign_type,
    'custom_questions', coalesce(f.custom_questions, '[]'::jsonb),
    'applicants', coalesce(
      (
        select json_agg(
          json_build_object(
            'id', a.id,
            'name', a.name,
            'sns_url', a.sns_url,
            'nationality', a.nationality,
            'contact', a.contact,
            'privacy_consent', a.privacy_consent,
            'secondary_use_consent', a.secondary_use_consent,
            'custom_answers', a.custom_answers,
            'status', a.status,
            'applied_at', a.applied_at,
            'status_changed_by', a.status_changed_by,
            'status_changed_at', a.status_changed_at
          )
          -- Ascending so existing row numbers stay put as new applications arrive.
          order by a.applied_at, a.id
        )
        from public.applicants a
        where a.campaign_id = c.id
      ),
      '[]'::json
    )
  )
  into result
  from public.campaigns c
  left join public.campaign_form_config f on f.campaign_id = c.id
  where c.applicant_list_token = p_token;

  return result;
end;
$$;

revoke execute on function public.get_applicant_list(uuid) from public;
grant execute on function public.get_applicant_list(uuid) to anon, authenticated;

-- ============================================
-- 0009_seeding_records.sql
-- ============================================
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

-- ============================================
-- 0010_selection_rpc.sql
-- ============================================
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

-- ============================================
-- 0011_seeding_records_sheet_support.sql
-- ============================================
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

-- ============================================
-- 0012_seeding_sheet_rpc.sql
-- ============================================
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

-- ============================================
-- 0013_reports.sql
-- ============================================
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

-- ============================================
-- 0014_create_campaign_report_rpc.sql
-- ============================================
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

revoke execute on function public.create_campaign_report(uuid) from public;
grant execute on function public.create_campaign_report(uuid) to authenticated;

