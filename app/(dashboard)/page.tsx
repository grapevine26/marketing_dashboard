import Link from "next/link";
import { toKstDateString, parseMonthParam, buildMonthGrid, shiftMonth } from "@/lib/seeding/dday";
import { collectOverviewItems, collectHomeSummary } from "@/lib/overview/collect";
import { getAuditLogs, getCampaigns, getSnsAccounts } from "@/lib/db";
import CalendarOverviewClient, { UrgentItemsWidget } from "./CalendarOverviewClient";
import {
  ArrowUpRight,
  FolderKanban,
  PartyPopper,
  Clock,
  Camera,
  Activity,
} from "lucide-react";

export const revalidate = 0;

/**
 * 오버뷰 홈 화면.
 * - 상단: 4대 핵심 지표 인터랙티브 카드 (클릭 시 해당 관리 탭으로 이동)
 * - 데스크톱 2단 스플릿 레이아웃:
 *   - 좌측 메인 (8/12): 마케팅 통합 캘린더 (달력/목록 토글) + 진행중인 캠페인 그리드
 *   - 우측 사이드 (4/12): 긴급 조치 일정 (D-3 ~ 지연) + 최근 플랫폼 활동 타임라인
 * - 모바일(sm): 긴급 일정 우선 노출 후 캘린더 및 캠페인이 깔끔하게 스택
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
    getAuditLogs({ limit: 5 }),
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
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      {/* 1. 상단 클릭형 KPI 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* 진행중 캠페인 */}
        <Link
          href="/campaigns"
          className="p-4 sm:p-5 rounded-3xl bg-surface border border-border hover:border-accent-link/40 hover:bg-surface2/30 transition duration-150 group flex flex-col justify-between space-y-3 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-muted group-hover:text-text transition">
              진행중 캠페인
            </span>
            <div className="w-7 h-7 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <FolderKanban className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="font-mono tabular-nums text-2xl sm:text-3xl font-bold text-text">
              {summary.activeCampaignCount}
            </div>
            <p className="text-[11px] text-text-sub mt-0.5">시딩 및 초청 행사 관리</p>
          </div>
        </Link>

        {/* 준비중인 행사 */}
        <Link
          href="/events"
          className="p-4 sm:p-5 rounded-3xl bg-surface border border-border hover:border-accent-link/40 hover:bg-surface2/30 transition duration-150 group flex flex-col justify-between space-y-3 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-muted group-hover:text-text transition">
              준비중인 행사
            </span>
            <div className="w-7 h-7 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
              <PartyPopper className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="font-mono tabular-nums text-2xl sm:text-3xl font-bold text-text">
              {summary.preparingEventCount}
            </div>
            <p className="text-[11px] text-text-sub mt-0.5">오프라인 초청 및 팝업</p>
          </div>
        </Link>

        {/* 승인 대기 콘텐츠 */}
        <Link
          href="/sns"
          className="p-4 sm:p-5 rounded-3xl bg-surface border border-border hover:border-accent-link/40 hover:bg-surface2/30 transition duration-150 group flex flex-col justify-between space-y-3 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-muted group-hover:text-text transition">
              승인 대기 콘텐츠
            </span>
            <div className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/20 text-warn flex items-center justify-center shrink-0">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className={`font-mono tabular-nums text-2xl sm:text-3xl font-bold ${summary.pendingApprovalSnsCount > 0 ? "text-warn" : "text-text"}`}>
              {summary.pendingApprovalSnsCount}
            </div>
            <p className="text-[11px] text-text-sub mt-0.5">광고주 시안 컨펌 대기</p>
          </div>
        </Link>

        {/* 이번주 발행 예정 */}
        <Link
          href="/sns"
          className="p-4 sm:p-5 rounded-3xl bg-surface border border-border hover:border-accent-link/40 hover:bg-surface2/30 transition duration-150 group flex flex-col justify-between space-y-3 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-accent-link group-hover:text-text transition">
              이번주 발행 예정
            </span>
            <div className="w-7 h-7 rounded-xl bg-accent2/10 border border-accent2/20 text-accent2 flex items-center justify-center shrink-0">
              <Camera className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="font-mono tabular-nums text-2xl sm:text-3xl font-bold text-accent-link">
              {contentDueThisWeek}
            </div>
            <p className="text-[11px] text-text-sub mt-0.5">SNS 공식 채널 피드/릴스</p>
          </div>
        </Link>
      </div>

      {/* 2. 데스크톱 2단 스플릿 메인 대시보드 */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* 좌측 메인 워크스페이스 (8/12 컬럼) */}
        <div className="xl:col-span-8 space-y-6 order-2 xl:order-1">
          {/* 마케팅 통합 캘린더 (달력/목록 뷰 토글 지원) */}
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
            renderUrgent={false}
          />

          {/* 진행중인 캠페인 카드 섹션 */}
          <div className="p-5 sm:p-6 rounded-3xl bg-surface border border-border space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-blue-400" />
                <h2 className="text-sm sm:text-base font-bold text-text">진행중인 캠페인</h2>
              </div>
              <Link
                href="/campaigns"
                className="text-xs font-semibold text-accent-link inline-flex items-center gap-1 hover:underline"
              >
                전체보기 <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {summary.activeCampaigns.length === 0 ? (
              <div className="p-8 text-center text-xs text-text-muted border border-dashed border-border rounded-2xl bg-bg">
                현재 진행중인 캠페인이 없습니다.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {summary.activeCampaigns.map((c) => (
                  <Link
                    key={c.id}
                    href={`/campaigns/${c.id}`}
                    className="flex flex-col justify-between gap-3 p-4 rounded-2xl bg-bg border border-border hover:border-accent-link/40 transition group"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold">
                          {c.campaignType === "shipping" ? "배송형" : "방문형"} · {c.statusLabel}
                        </span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-text-muted group-hover:text-accent-link shrink-0 transition" />
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-text group-hover:text-accent-link transition truncate">
                        {c.name}
                      </div>
                    </div>
                    <div className="text-[11px] text-text-sub font-mono tabular-nums pt-2 border-t border-border/70 flex items-center justify-between">
                      <span>지원자 {c.applicantCount}명</span>
                      <span className="text-text font-semibold">최종선정 {c.selectedCount}명</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 우측 액션 사이드 패널 (4/12 컬럼) */}
        <div className="xl:col-span-4 space-y-6 order-1 xl:order-2">
          {/* 긴급 조치 일정 피드 */}
          <UrgentItemsWidget urgentItems={urgentItems} failedSources={failedSources} />

          {/* 최근 플랫폼 활동 로그 */}
          <div className="p-5 sm:p-6 rounded-3xl bg-surface border border-border space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-text-sub shrink-0" />
                <h2 className="text-sm sm:text-base font-bold text-text">최근 활동</h2>
              </div>
            </div>

            {recentLogs.length === 0 ? (
              <div className="p-7 text-center text-xs text-text-muted border border-dashed border-border rounded-2xl bg-bg">
                아직 기록된 최근 활동이 없습니다.
              </div>
            ) : (
              <div className="rounded-2xl bg-bg border border-border divide-y divide-border overflow-hidden">
                {recentLogs.map((log) => {
                  const context = log.campaign_id
                    ? campaignNameById.get(log.campaign_id)
                    : log.account_id
                    ? accountNameById.get(log.account_id)
                    : undefined;
                  return (
                    <div key={log.id} className="p-3.5 space-y-1">
                      <div className="text-xs text-text leading-snug">{log.summary}</div>
                      <div className="text-[10px] text-text-muted font-mono tabular-nums flex items-center justify-between">
                        <span>
                          {new Date(log.created_at).toLocaleString("ko-KR", {
                            timeZone: "Asia/Seoul",
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {context && <span className="truncate max-w-[140px] text-text-sub">· {context}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
