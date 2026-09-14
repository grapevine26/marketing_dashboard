-- 역할을 세 단계로 넓힌다.
--
--   owner (대표 관리자) > admin (관리자) > staff (직원)
--
-- 관리자는 직원만 관리한다. 등급 변경과 대표 관리자에 대한 조치는 대표 관리자만 할 수 있다.
-- 기존 admin 계정은 그대로 admin 으로 남는다. 누구를 대표로 올릴지는 사람이 정할 일이다.

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('owner', 'admin', 'staff'));

-- 활성 관리자 조회 인덱스는 owner 도 함께 찾아야 한다.
drop index if exists profiles_role_idx;
create index profiles_role_idx on public.profiles (role) where status = 'active';
