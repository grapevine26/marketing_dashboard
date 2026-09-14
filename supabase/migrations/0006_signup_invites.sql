-- 가입 초대를 "모두가 같은 코드"에서 "한 사람당 1회용 링크"로 바꾼다.
--
-- 코드 방식의 약점은 한 번 새면 바꿀 때까지 계속 유효하다는 것이다. 단톡방에 올라가거나
-- 전달되면 그대로 퍼지고, 누가 그 코드로 들어왔는지 알 방법도 없다.
-- 링크는 한 번 쓰면 죽으므로 전달해도 소용이 없고, 누구에게 발급했는지 기록으로 남는다.
--
-- 만료를 짧게 두는 것보다 1회용인 것이 중요하다. 한 번 쓰면 죽는다면 만료가 며칠이어도
-- 위험하지 않다. 반대로 만료만 짧고 여러 번 쓸 수 있으면 그 시간 동안은 코드와 다를 게 없다.

create table public.signup_invites (
  token text primary key,
  -- 누구에게 주려고 만든 링크인지. 발급자가 적는 메모다.
  label text,
  -- 발급자가 계정을 잃어도 "누가 불렀는지"는 남아야 한다. 그래서 이름을 따로 복사해 둔다.
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text not null,
  expires_at timestamptz not null,
  -- 이 두 값이 채워지는 순간 링크는 죽는다. 되살리지 않는다.
  used_at timestamptz,
  used_by_username text,
  created_at timestamptz not null default now()
);

-- 아직 살아 있는 초대를 훑는 목록 화면용.
create index signup_invites_open_idx on public.signup_invites (used_at, expires_at);

alter table public.signup_invites enable row level security;

-- 코드 방식은 걷어낸다. app_settings 는 이 코드 하나만 담고 있었고 다른 쓰임이 없다.
-- 쓰지 않는 표를 남겨 두면 다음 사람이 "이건 뭐지" 하고 들여다보게 된다.
drop table if exists public.app_settings;
