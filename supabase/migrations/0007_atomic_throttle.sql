-- 시도 제한 카운트를 원자적으로 만든다.
--
-- 전에는 lib/security/throttle.ts 가 읽고 → 더하고 → 덮어썼다. 그래서 요청 50개를 **동시에**
-- 보내면 50개가 전부 0을 읽고 전부 1을 써서, 실제로는 1회로 세어졌다. 상한이 10회여도
-- 병렬로 보내면 수백 번을 시도할 수 있었다. 잠금이 있으나 마나였다.
--
-- 이제 update 한 번으로 세고 잠근다. Postgres 가 행 잠금을 잡아 주므로 동시에 들어와도
-- 하나씩 차례로 처리된다.
--
-- 이 함수를 anon 에게 열어두면 아무나 아무 키나 잠글 수 있다(남의 아이디를 잠그는 공격).
-- 그래서 실행 권한을 회수한다. 서버는 service_role 로 부르므로 영향이 없다.

create or replace function public.bump_auth_throttle(
  p_key text,
  p_max integer,
  p_window_seconds double precision,
  p_lock_seconds double precision
) returns timestamptz
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_cutoff timestamptz := now() - make_interval(secs => p_window_seconds);
  v_failures integer;
  v_locked timestamptz;
begin
  insert into public.auth_throttle as t (key, failures, window_start, locked_until)
  values (p_key, 1, v_now, null)
  on conflict (key) do update set
    -- 창이 지났으면 처음부터 다시 센다.
    failures = case when t.window_start > v_cutoff then t.failures + 1 else 1 end,
    window_start = case when t.window_start > v_cutoff then t.window_start else v_now end,
    -- 남아 있는 잠금은 유지한다. 창이 새로 시작해도 잠금이 풀리면 안 된다.
    locked_until = case when t.locked_until > v_now then t.locked_until else null end
  returning t.failures, t.locked_until into v_failures, v_locked;

  if v_failures >= p_max then
    update public.auth_throttle
      set locked_until = v_now + make_interval(secs => p_lock_seconds)
      where key = p_key
      returning locked_until into v_locked;
  end if;

  return v_locked;
end;
$$;

revoke all on function public.bump_auth_throttle(text, integer, double precision, double precision)
  from public, anon, authenticated;

-- 마이그레이션 기록표에도 RLS 를 켠다.
-- 0001 의 일괄 적용에서 이 표만 빠져 있었다(런너가 그 뒤에 만들기 때문에).
-- 개인정보는 없지만 적용된 마이그레이션 목록은 스키마를 짐작하는 재료가 된다.
alter table public.schema_migrations enable row level security;
