import { toKstDateString, parseMonthParam, buildMonthGrid, shiftMonth } from "@/lib/seeding/dday";
import { collectOverviewItems } from "@/lib/overview/collect";
import CalendarOverviewClient from "./CalendarOverviewClient";

export const revalidate = 0;

/**
 * 통합 오버뷰 (서브프로젝트 D).
 * - 오늘/D-day/캘린더 셀은 전부 서버에서 KST로 계산해 props로 내려보낸다.
 * - 월 이동은 `/?month=YYYY-MM` 쿼리 파라미터. 형식이 잘못되면 오늘이 속한 달로 폴백.
 * - 소스별 조회 실패는 배너로 알리고 나머지 데이터는 정상 렌더링한다.
 */
export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const todayKst = toKstDateString();
  const currentMonth = parseMonthParam(month, todayKst);

  const { items, failedSources } = await collectOverviewItems(todayKst);

  const urgentItems = items.filter((item) => item.daysDiff <= 3);
  const monthItems = items.filter((item) => item.dateStr.startsWith(currentMonth));
  const grid = buildMonthGrid(currentMonth, todayKst);

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans">
      <CalendarOverviewClient
        currentMonth={currentMonth}
        prevMonth={shiftMonth(currentMonth, -1)}
        nextMonth={shiftMonth(currentMonth, 1)}
        todayMonth={todayKst.slice(0, 7)}
        leadingBlanks={grid.leadingBlanks}
        cells={grid.cells}
        urgentItems={urgentItems}
        monthItems={monthItems}
        failedSources={failedSources}
      />
    </div>
  );
}
