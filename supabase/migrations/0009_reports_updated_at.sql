-- 결과보고서에도 낙관적 잠금을 건다.
--
-- 왜 필요한가 — 총평(custom_sections)은 **문서 전체를 통째로 덮어쓴다.** 그런데 이 표만
-- 잠금이 없었다. 같은 성격의 다른 문서(행사 운영안, SNS 운영안, 공용 질문 템플릿, SNS 콘텐츠)는
-- 전부 기준 시각을 보내고 그 사이 남이 저장했으면 거부한다.
--
-- 실제로 벌어지는 일: 보고서를 탭 두 개로 연다(하나는 PDF 받으려고, 하나는 총평 쓰려고 —
-- 흔한 사용이다). A 탭에서 총평 세 개를 쓰고 저장한 뒤, B 탭(옛 내용)에서 오타 하나를 고쳐
-- 저장하면 **A 가 쓴 세 개가 통째로 사라진다.** 경고도, 흔적도 없다.
--
-- 0008 이 만들어 둔 set_updated_at 트리거를 그대로 쓴다. 코드가 손으로 시각을 넣으면
-- 갱신 경로가 늘 때 빠뜨릴 수 있고, **한 곳만 빠뜨려도 잠금이 조용히 무력해진다.**

-- 기존 행은 default 로 채워진다. 그 값은 "마지막 수정 시각" 이 아니라 "이 칸이 생긴 시각" 이지만,
-- 잠금은 **이후의 변화**만 보면 되므로 문제가 없다.
alter table public.reports add column if not exists updated_at timestamptz not null default now();

-- 0008 과 같은 방식으로 건다. drop 을 먼저 하는 것은 다시 돌려도 안전하게 하기 위해서다.
drop trigger if exists set_updated_at on public.reports;
create trigger set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();
