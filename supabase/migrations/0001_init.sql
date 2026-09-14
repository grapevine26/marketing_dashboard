-- 마케팅 대시보드 초기 스키마.
-- 옛 JSON 문서의 최상위 키 하나가 테이블 하나다. 중첩 객체는 jsonb 로 둔다.

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_name text not null,
  campaign_type text not null check (campaign_type in ('shipping','visit')),
  status text not null default 'recruiting'
    check (status in ('draft','recruiting','selecting','seeding','reporting','completed')),
  pre_survey_token text not null unique,
  apply_form_token text not null unique,
  applicants_share_token text not null unique,
  seeding_sheet_share_token text not null unique,
  message_templates jsonb,
  webhook_url text,
  pre_survey_questions jsonb,
  created_at timestamptz not null default now()
);

-- 단일 행. 앱이 처음 읽을 때 기본 질문으로 채운다.
create table public.pre_survey_template (
  id integer primary key check (id = 1),
  questions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.pre_survey_responses (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  used_ai_assist boolean not null default false,
  submitted_at timestamptz not null default now()
);

create table public.form_configs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  intro_text text not null default '',
  custom_questions jsonb not null default '[]'::jsonb,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.applicants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  sns_link text not null,
  nationality text not null,
  contact text not null,
  follower_count integer,
  category text,
  agency_memo text,
  shipping_address text,
  visit_schedule text,
  visit_party_size integer,
  custom_answers jsonb not null default '{}'::jsonb,
  privacy_agreed boolean not null default true,
  secondary_use_agreed boolean not null default false,
  status text not null default 'applied' check (status in ('applied','selected','reserved','rejected')),
  status_changed_by text not null default 'agency' check (status_changed_by in ('agency','company')),
  status_changed_at timestamptz,
  applied_at timestamptz not null default now()
);
create index applicants_campaign_idx on public.applicants (campaign_id, applied_at);

-- 지원자 한 명당 시딩 기록은 하나다. 선정이 반복돼도 두 번 만들지 않는다.
create table public.seeding_records (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  applicant_id uuid not null unique references public.applicants(id) on delete cascade,
  progress_stage text not null default '선정완료'
    check (progress_stage in ('선정완료','발송완료','가이드전달완료','수령완료','방문완료','확정완료','업로드완료')),
  upload_deadline date,
  upload_link text,
  views integer not null default 0,
  engagement integer not null default 0,
  notes text,
  shipping_address text,
  visit_scheduled_at text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index seeding_records_campaign_idx on public.seeding_records (campaign_id, created_at);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null,
  snapshot_data jsonb,
  custom_sections jsonb not null default '[]'::jsonb,
  generated_at timestamptz,
  created_at timestamptz not null default now()
);
create index reports_campaign_idx on public.reports (campaign_id, created_at);

-- 업로드한 템플릿만 저장한다. 내장 템플릿은 코드에 있고 읽을 때 합친다.
create table public.ppt_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('event','sns','report')),
  name text not null,
  file_key text,
  placeholders jsonb not null default '[]'::jsonb,
  uploaded_at timestamptz not null default now()
);

-- 사용자가 지운 내장 템플릿. 내장은 코드에서 매번 채워 넣으므로 지운 사실을 따로 기억해야 한다.
create table public.hidden_builtin_templates (
  template_id uuid primary key,
  hidden_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  event_at timestamptz,
  venue text,
  memo text,
  status text not null default 'preparing' check (status in ('preparing','done','canceled')),
  created_at timestamptz not null default now()
);
create index events_campaign_idx on public.events (campaign_id, created_at);

-- 지원자가 지워져도 초대 기록은 남긴다.
create table public.event_invitees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  applicant_id uuid references public.applicants(id) on delete set null,
  name text not null,
  sns_url text,
  contact text,
  rsvp_status text not null default 'pending' check (rsvp_status in ('pending','attending','not_attending')),
  attended boolean not null default false,
  memo text,
  created_at timestamptz not null default now()
);
create index event_invitees_event_idx on public.event_invitees (event_id, created_at);

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
create index event_checklist_event_idx on public.event_checklist_items (event_id, sort_order);

-- template_id 는 내장 템플릿(코드)을 가리킬 수 있어 fk 를 두지 않는다.
create table public.event_plans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  template_id uuid not null,
  field_values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.sns_accounts (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  platform text not null check (platform in ('instagram','youtube','tiktok','other')),
  handle text not null,
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('active','ended')),
  intake_token text not null unique,
  approval_token text not null unique,
  intake_questions jsonb,
  created_at timestamptz not null default now()
);

create table public.sns_intake_template (
  id integer primary key check (id = 1),
  questions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.sns_intake_responses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.sns_accounts(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now()
);

create table public.sns_plans (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.sns_accounts(id) on delete cascade,
  template_id uuid,
  field_values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.sns_contents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.sns_accounts(id) on delete cascade,
  title text not null,
  scheduled_on date,
  assignee text,
  status text not null default 'planning'
    check (status in ('planning','producing','pending_approval','approved','posted')),
  caption text,
  hashtags text,
  media_note text,
  media_attachments jsonb not null default '[]'::jsonb,
  client_comment text,
  post_url text,
  view_count integer,
  like_count integer,
  comment_count integer,
  status_changed_at timestamptz,
  created_at timestamptz not null default now()
);
create index sns_contents_account_idx on public.sns_contents (account_id, scheduled_on desc nulls last);
-- 첨부 id 로 콘텐츠를 찾는 조회(/api/media/:id)를 위한 인덱스.
create index sns_contents_media_gin on public.sns_contents using gin (media_attachments jsonb_path_ops);

-- 삭제 기록이 삭제와 함께 사라지면 안 되므로 fk 를 두지 않는다.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid,
  account_id uuid,
  entity_type text not null
    check (entity_type in ('campaign','applicant','seeding_record','sns_account','sns_content','event')),
  entity_id text not null,
  action text not null,
  actor_type text not null check (actor_type in ('agency','company','public','system')),
  actor_name text,
  summary text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_campaign_idx on public.audit_logs (campaign_id, created_at desc);
create index audit_logs_account_idx on public.audit_logs (account_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- 서버만 service_role 로 접근한다. RLS 를 켜고 정책을 두지 않으면 anon 은 아무것도 못 본다.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
