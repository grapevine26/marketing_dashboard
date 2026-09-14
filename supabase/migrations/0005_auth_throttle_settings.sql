-- 로그인·가입 시도 제한과 앱 설정(가입 초대 코드).
--
-- 서버리스(Vercel)에서는 프로세스 메모리가 요청마다 사라지므로, 시도 횟수는 DB 에 세야 한다.
-- lib/security/throttle.ts 가 이 테이블을 읽고 쓴다.
--
-- 두 테이블 모두 RLS 만 켜고 정책은 두지 않는다. 다른 테이블과 같이 service_role 만 닿는다.

-- 실패·시도 횟수. 키는 "login:<아이디>", "login-ip:<IP>", "signup-ip:<IP>" 모양이다.
create table public.auth_throttle (
  key text primary key,
  failures integer not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz
);

-- 오래된 행 정리는 로그인 때 확률적으로 한다. 그때 window_start 로 훑는다.
create index auth_throttle_window_idx on public.auth_throttle (window_start);

-- 키-값 설정. 지금은 signup_invite_code 하나뿐이다.
-- 초기 값은 넣지 않는다. 코드가 없으면 가입이 막히고, 대표 관리자가 화면에서 처음 만든다.
create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.auth_throttle enable row level security;
alter table public.app_settings enable row level security;
