-- 아이디·비밀번호 로그인과 관리자 승인제.
--
-- 로그인은 Supabase Auth 가 맡고(auth.users), 앱이 쓰는 정보는 여기 profiles 에 둔다.
-- 아이디는 내부적으로 <아이디>@moa.local 이라는 이메일로 저장되며 사용자는 보지 않는다.
-- username 컬럼이 그 아이디 원본이다.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  status text not null default 'pending' check (status in ('pending', 'active', 'blocked')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null
);

create index profiles_status_idx on public.profiles (status, created_at);
create index profiles_role_idx on public.profiles (role) where status = 'active';

alter table public.profiles enable row level security;

/**
 * 가입하면 프로필 행을 바로 만든다.
 *
 * 앱 코드가 만들지 않는 이유: 가입은 됐는데 프로필이 없는 순간이 생기면 그 계정은
 * 로그인해도 아무 상태도 아니게 된다. 트리거로 묶어 그 틈을 없앤다.
 *
 * username 과 display_name 은 가입 시 raw_user_meta_data 로 넘긴다.
 * 없으면 이메일 앞부분으로 채운다.
 */
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 인증 관련 동작(승인·차단·권한 변경·삭제)을 기록하려면 entity_type 에 user 가 있어야 한다.
alter table public.audit_logs drop constraint audit_logs_entity_type_check;
alter table public.audit_logs add constraint audit_logs_entity_type_check
  check (entity_type in ('campaign','applicant','seeding_record','sns_account','sns_content','event','user'));
