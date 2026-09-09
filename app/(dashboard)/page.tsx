import Link from "next/link";
import { toKstDateString, parseMonthParam, buildMonthGrid, shiftMonth } from "@/lib/seeding/dday";
import { collectOverviewItems, collectHomeSummary } from "@/lib/overview/collect";
import { getAuditLogs, getCampaigns, getSnsAccounts } from "@/lib/db";
import CalendarOverviewClient from "./CalendarOverviewClient";
import { ArrowUpRight } from "lucide-react";

export const revalidate = 0;

/**
 * 통합 오버뷰. 홈 화면.
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

  const [{ items, failedSources }, summary, recentLogs, campaigns, snsAccounts] = await Promise.all([
    collectOverviewItems(todayKst),
    collectHomeSummary(todayKst),
    getAuditLogs({ limit: 4 }),
    getCampaigns(),
    getSnsAccounts(),
  ]);

  const urgentItems = items.filter((item) => item.daysDiff <= 3);
  const monthItems = items.filter((item) => item.dateStr.startsWith(currentMonth));
  const contentDueThisWeek = items.filter(
    (item) => item.source === "sns" && item.daysDiff >= 0 && item.daysDiff <= 6
  ).length;
  const grid = buildMonthGrid(currentMonth, todayKst);

  const campaignNameById = new Map(campaigns.map((c) => [c.id, c.name]));
  const accountNameById = new Map(snsAccounts.map((a) => [a.id, `${a.company_name} · @${a.handle}`]));

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans">
      {/* 전체 요약 통계 줄 */}
      <div className="p-5 sm:p-6 rounded-3xl bg-surface border border-border flex items-center justify-between flex-wrap gap-5">
        <div>
          <h1 className="text-lg font-bold text-text">오늘의 현황</h1>
          <p className="text-xs text-text-sub mt-0.5">에이전시 전체 캠페인과 SNS 운영 현황을 한눈에 확인합니다.</p>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full sm:w-auto sm:flex sm:items-center sm:gap-8">
          <div className="text-left sm:text-right">
            <span className="block text-[11px] text-text-muted">진행중 캠페인</span>
            <span className="font-mono tabular-nums text-xl font-bold text-text">{summary.activeCampaignCount}</span>
          </div>
          <div className="h-8 w-px bg-border hidden sm:block" />
          <div className="text-left sm:text-right">
            <span className="block text-[11px] text-text-muted">이번달 신규 지원자</span>
            <span className="font-mono tabular-nums text-xl font-bold text-text">{summary.newApplicantsThisMonth}</span>
          </div>
          <div className="h-8 w-px bg-border hidden sm:block" />
          <div className="text-left sm:text-right">
            <span className="block text-[11px] text-text-muted">누적 최종선정</span>
            <span className="font-mono tabular-nums text-xl font-bold text-text">{summary.totalSelectedCount}</span>
          </div>
          <div className="h-8 w-px bg-border hidden sm:block" />
          <div className="text-left sm:text-right">
            <span className="block text-[11px] text-accent-link font-semibold">이번주 발행 예정</span>
            <span className="font-mono tabular-nums text-xl font-bold text-accent-link">{contentDueThisWeek}</span>
          </div>
        </div>
      </div>

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

      {/* 진행중인 캠페인 + 최근 활동 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-text">진행중인 캠페인</h2>
            <Link href="/campaigns" className="text-xs font-semibold text-accent-link inline-flex items-center gap-1 hover:underline">
              전체보기 <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {summary.activeCampaigns.length === 0 ? (
            <div className="p-6 text-center text-xs text-text-muted border border-dashed border-border rounded-2xl bg-bg">
              진행중인 캠페인이 없습니다.
            </div>
          ) : (
            <div className="space-y-2.5">
              {summary.activeCampaigns.map((c) => (
                <Link
                  key={c.id}
                  href={`/campaigns/${c.id}`}
                  className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-surface border border-border hover:border-accent-link/40 transition"
                >
                  <div className="space-y-1 min-w-0">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold">
                      {c.campaignType === "shipping" ? "배송형" : "방문형"} · {c.statusLabel}
                    </span>
                    <div className="text-sm font-bold text-text truncate">{c.name}</div>
                    <div className="text-[11px] text-text-sub font-mono tabular-nums">
                      지원자 {c.applicantCount}명 · 최종선정 {c.selectedCount}명
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-text-muted shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-bold text-text">최근 활동</h2>
          {recentLogs.length === 0 ? (
            <div className="p-6 text-center text-xs text-text-muted border border-dashed border-border rounded-2xl bg-bg">
              아직 기록된 활동이 없습니다.
            </div>
          ) : (
            <div className="rounded-2xl bg-surface border border-border divide-y divide-border">
              {recentLogs.map((log) => {
                const context = log.campaign_id
                  ? campaignNameById.get(log.campaign_id)
                  : log.account_id
                  ? accountNameById.get(log.account_id)
                  : undefined;
                return (
                  <div key={log.id} className="p-3.5 space-y-1">
                    <div className="text-xs text-text-2">{log.summary}</div>
                    <div className="text-[10px] text-text-muted font-mono tabular-nums">
                      {new Date(log.created_at).toLocaleString("ko-KR", {
                        timeZone: "Asia/Seoul",
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {context ? ` · ${context}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
