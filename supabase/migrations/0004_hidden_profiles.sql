-- 유지보수용 계정을 사용자 관리 목록에서 감춘다.
--
-- 개발자가 점검할 때 쓰는 계정이 고객이 보는 목록에 섞이면 혼란스럽다.
-- 다만 완전히 없는 것처럼 만들지는 않는다. 화면에 "숨긴 계정 N개" 를 남겨,
-- 모든 권한을 가진 계정이 흔적 없이 존재하는 상태가 되지 않게 한다.
--
-- 이 값은 화면에서 바꾸지 않는다. 숨김 스위치가 화면에 있으면 그것 자체가 목록에 드러난다.
-- `npm run db:hide-user <아이디>` 로만 바꾼다.

alter table public.profiles
  add column hidden boolean not null default false;

-- 목록은 숨기지 않은 계정만 훑는다.
create index profiles_visible_idx on public.profiles (hidden, status, created_at);
