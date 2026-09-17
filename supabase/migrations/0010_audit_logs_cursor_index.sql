-- 활동 기록의 정렬 기준에 인덱스를 맞춘다.
--
-- 왜 필요한가 — 활동 기록은 커서 방식으로 넘긴다(D묶음). offset 은 새 로그가 끼면 창이 밀려
-- 이미 본 행이 다시 나오고 일부는 영구히 건너뛰었다. 그래서 정렬을 `(created_at desc, id desc)`
-- 로 바꿔 동점까지 고정했다.
--
-- 그런데 인덱스는 `(created_at desc)` 까지만 있다. 같은 밀리초에 여러 건이 들어오는 것은
-- 드문 일이 아니라(한 번의 저장이 로그 여러 줄을 남긴다) 두 번째 칸으로 정렬해야 하는데,
-- 인덱스가 거기서 끊기니 매번 정렬이 따라붙는다. 로그는 지우지 않고 쌓이기만 하는 표다.
--
-- 세 인덱스를 전부 `id desc` 까지 늘린다. 옛 인덱스는 새 것의 **앞부분**이라 새 것으로 전부
-- 대신할 수 있다. 남겨두면 쓰이지도 않으면서 로그를 쓸 때마다 갱신 비용만 든다.
-- (인덱스 개수는 그대로 셋이다. 쓰기 비용이 늘지 않는다.)
--
-- 검색(summary/actor_name ilike)은 여기서 다루지 않는다. 그건 부분일치라 이 모양의
-- 인덱스로는 어차피 못 타고, 지금 규모에서 trigram 인덱스를 얹을 만한 비용이 아니다.

create index if not exists audit_logs_created_id_idx
  on public.audit_logs (created_at desc, id desc);
create index if not exists audit_logs_campaign_created_id_idx
  on public.audit_logs (campaign_id, created_at desc, id desc);
create index if not exists audit_logs_account_created_id_idx
  on public.audit_logs (account_id, created_at desc, id desc);

-- 새 인덱스를 만든 **뒤에** 옛것을 버린다. 순서가 반대면 그 사이 조회가 인덱스 없이 돈다.
drop index if exists public.audit_logs_created_idx;
drop index if exists public.audit_logs_campaign_idx;
drop index if exists public.audit_logs_account_idx;
