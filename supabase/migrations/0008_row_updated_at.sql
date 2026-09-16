-- 행 단위 낙관적 잠금을 위한 updated_at.
--
-- 왜 필요한가 — 둘이 **같은 칸**을 고치면 나중에 저장한 쪽이 앞사람 것을 조용히 덮어썼다.
-- 앞사람은 자기 작업이 사라진 줄도 모른다. 이걸 막으려면 "내가 불러온 뒤로 이 행이
-- 바뀌었는가" 를 알아야 하고, 그 기준이 updated_at 이다.
--
-- **트리거로 둔다.** 지금은 코드가 손으로 nowIso() 를 넣는데, 갱신 경로가 늘어날 때마다
-- 빠뜨릴 수 있다. 한 곳이라도 빠뜨리면 그 경로로 바뀐 행은 updated_at 이 그대로라
-- **잠금이 조용히 무력해진다** — 충돌을 못 잡고 덮어쓰면서 아무 표시도 없다.
-- DB 가 직접 찍으면 어떤 경로로 들어와도 빠질 수 없다.

-- 1) 갱신 함수. 어떤 update 든 지금 시각을 찍는다.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 2) 없는 테이블에 칸을 만든다. 기존 행은 default 로 채워진다.
alter table public.applicants   add column if not exists updated_at timestamptz not null default now();
alter table public.sns_contents add column if not exists updated_at timestamptz not null default now();
alter table public.events       add column if not exists updated_at timestamptz not null default now();

-- 3) updated_at 이 있는 테이블 전부에 같은 트리거를 건다.
--    이미 있던 테이블(seeding_records 등)도 함께 건다 — 코드가 손으로 넣던 것을
--    DB 가 대신 하게 해서 규칙을 한 가지로 만든다.
do $$
declare t text;
begin
  foreach t in array array[
    'applicants',
    'sns_contents',
    'events',
    'seeding_records',
    'event_plans',
    'sns_plans',
    'pre_survey_template',
    'sns_intake_template'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end $$;
