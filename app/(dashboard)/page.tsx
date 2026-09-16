import Link from "next/link";
import { toKstDateString, parseMonthParam, buildMonthGrid, shiftMonth } from "@/lib/seeding/dday";
import { collectOverviewItems, collectHomeSummary } from "@/lib/overview/collect";
import { getCurrentUser, isManager, isOwner } from "@/lib/auth/session";
import { countPendingUsers } from "@/lib/auth/users";
import CalendarOverviewClient, { UrgentItemsWidget } from "./CalendarOverviewClient";
import PendingApprovalSnsCard from "./PendingApprovalSnsCard";
import ScheduledSnsThisWeekCard from "./ScheduledSnsThisWeekCard";
import BackupStatusBanner, { getBackupStatus } from "./BackupStatusBanner";
import {
  ArrowUpRight,
  FolderKanban,
  PartyPopper,
  BookOpen,
  Plus,
  UserPlus,
} from "lucide-react";

export const revalidate = 0;

/**
 * 오버뷰 홈 화면. 위에서 아래로 한 줄이다 — 화면 너비와 등급에 상관없이 같은 순서다.
 *
 *   지표 4개 → 임박 및 지연 일정 → 캘린더 → 진행중인 캠페인
 *
 * 전에는 넓은 화면에서 8/12 + 4/12 두 단이었고, 오른쪽 단에 임박 일정과 최근 활동이
 * 들어갔다. **그런데 최근 활동은 대표 관리자만 본다.** 관리자도 못 본다. 그래서 그 한 명을
 * 뺀 전원에게는 오른쪽 단에 위젯이 하나뿐이었고, 왼쪽(캘린더+캠페인)이 훨씬 길어서
 * 화면 오른쪽 아래가 크게 비었다.
 *
 * 빈 자리를 채울 위젯을 새로 만드는 대신 단을 없앴다. 그 위젯은 필요해서가 아니라
 * 레이아웃 때문에 생긴 것이 되고, 쓸모없다고 드러나도 지우기 어려워진다.
 * 단을 없애니 이 화면의 주인공인 캘린더가 가로를 다 쓰게 되어 날짜 칸마다 일정이 더 보인다.
 *
 * 최근 활동은 여기서 빼고 전용 페이지(`설정 → 활동 기록`)에만 둔다. 로그는 문제가 있을 때
 * 찾아보는 것이지 매일 훑는 것이 아니다. 덕분에 이 페이지가 캠페인·SNS 계정 목록을
 * 통째로 읽던 것도 없어졌다 — 그 둘은 로그에 이름을 붙이려고만 읽고 있었다.
 */
export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const role = (await getCurrentUser())?.role ?? "staff";
  // 백업이 끊긴 걸 보고 실제로 손쓸 수 있는 사람은 대표 관리자뿐이라, 경고도 거기까지만 보인다.
  const canSeeBackupStatus = isOwner(role);
  // 승인 대기자는 승인할 수 있는 사람(관리자 이상)에게만 알린다.
  // layout 이 같은 값을 이미 세지만 레이아웃→페이지로 props 를 넘길 수 없어 여기서 한 번 더 센다(count 쿼리 하나).
  const canApproveUsers = isManager(role);
  const { month } = await searchParams;
  const todayKst = toKstDateString();
  const currentMonth = parseMonthParam(month, todayKst);

  const [{ items, failedSources }, summary, pendingUserCount, backupStatus] = await Promise.all([
    collectOverviewItems(todayKst),
    collectHomeSummary(todayKst),
    canApproveUsers ? countPendingUsers() : Promise.resolve(0),
    // 대표 관리자가 아니면 저장소 조회 자체를 하지 않는다. 볼 수 없는 값을 굳이 읽어 올 이유가 없다.
    canSeeBackupStatus ? getBackupStatus() : Promise.resolve(null),
  ]);

  const urgentItems = items.filter((item) => item.daysDiff <= 3);
  const monthItems = items.filter((item) => item.dateStr.startsWith(currentMonth));
  const grid = buildMonthGrid(currentMonth, todayKst);

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto font-sans">
      {/* 0-0. 백업 경고. 데이터가 통째로 날아가는 일과 직결되므로 다른 알림보다 위에 둔다.
          상태가 정상이면(또는 대표 관리자가 아니면) 배너 자체가 그려지지 않는다. */}
      <BackupStatusBanner status={backupStatus} />

      {/* 0. 가입 승인 대기 알림. 관리자 이상에게만, 대기자가 있을 때만 보인다.
          사이드바 배지는 메뉴를 펼쳐야 보이므로 첫 화면에서 한 번 더 짚어 준다. */}
      {canApproveUsers && pendingUserCount > 0 && (
        <Link
          href="/settings/users"
          className="flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-surface border border-accent2/30 hover:border-accent2/60 hover:bg-surface2/30 transition duration-150 group shadow-xs btn-press"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-accent2/10 border border-accent2/20 text-accent2 flex items-center justify-center shrink-0">
              <UserPlus className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs sm:text-sm text-text truncate">
              가입 승인을 기다리는 사용자가{" "}
              <strong className="font-bold text-accent2 font-mono tabular-nums">{pendingUserCount}명</strong> 있습니다
            </span>
          </div>
          <span className="text-xs font-semibold text-accent-link inline-flex items-center gap-1 shrink-0 group-hover:underline">
            사용자 관리 <ArrowUpRight className="w-3.5 h-3.5" />
          </span>
        </Link>
      )}

      {/* 1. 상단 클릭형 KPI 통계 카드 (모바일 2열 정렬 및 균일 높이 보장) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* 진행중 캠페인 */}
        <Link
          href="/campaigns"
          className="p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl bg-surface border border-border hover:border-accent-link/40 hover:bg-surface2/30 transition duration-150 group flex flex-col justify-between space-y-2.5 sm:space-y-3 shadow-xs min-h-[100px] sm:min-h-[116px] btn-press stagger-item"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-text-muted group-hover:text-text transition truncate">
              진행중 캠페인
            </span>
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg sm:rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <FolderKanban className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </div>
          </div>
          <div>
            <div className="font-mono tabular-nums text-xl sm:text-3xl font-bold text-text">
              {summary.activeCampaignCount}
            </div>
            <p className="text-[10px] sm:text-[11px] text-text-sub mt-0.5 truncate">시딩 및 초청 행사 관리</p>
          </div>
        </Link>

        {/* 준비중인 행사 */}
        <Link
          href="/events"
          className="p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl bg-surface border border-border hover:border-accent-link/40 hover:bg-surface2/30 transition duration-150 group flex flex-col justify-between space-y-2.5 sm:space-y-3 shadow-xs min-h-[100px] sm:min-h-[116px] btn-press stagger-item"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-text-muted group-hover:text-text transition truncate">
              준비중인 행사
            </span>
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg sm:rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
              <PartyPopper className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </div>
          </div>
          <div>
            <div className="font-mono tabular-nums text-xl sm:text-3xl font-bold text-text">
              {summary.preparingEventCount}
            </div>
            <p className="text-[10px] sm:text-[11px] text-text-sub mt-0.5 truncate">오프라인 초청 및 팝업</p>
          </div>
        </Link>

        {/* 승인 대기 콘텐츠 (클릭 시 모달 팝업) */}
        <div className="stagger-item h-full">
          <PendingApprovalSnsCard
            count={summary.pendingApprovalSnsCount}
            items={summary.pendingApprovalSnsContents}
          />
        </div>

        {/* 이번주 발행 예정 (클릭 시 모달 팝업) */}
        <div className="stagger-item h-full">
          <ScheduledSnsThisWeekCard
            count={summary.scheduledSnsThisWeekCount}
            items={summary.scheduledSnsThisWeek}
          />
        </div>
      </div>

      {/* 2. 임박 및 지연 일정. 화면 너비와 등급에 상관없이 캘린더 위다.
          지금 당장 손대야 하는 것이라 제일 먼저 눈에 들어와야 한다.
          건수가 0일 때도 그린다 — "모든 일정이 정상 진행 중입니다" 가 그 자체로 답이라,
          칸이 사라지면 확인한 것인지 아직 안 본 것인지 구분할 수 없다. */}
      <UrgentItemsWidget urgentItems={urgentItems} failedSources={failedSources} />

      {/* 3. 마케팅 통합 캘린더(달력/목록 토글). 이 화면의 주인공이라 가로를 다 쓴다. */}
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
      <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-surface border border-border space-y-3.5 sm:space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderKanban className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
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
          <div className="p-6 sm:p-8 text-center text-xs text-text-muted border border-dashed border-border rounded-xl sm:rounded-2xl bg-bg space-y-3">
            <p>현재 진행중인 캠페인이 없습니다.</p>
            {/* 처음 들어온 사람이 다음에 뭘 할지 바로 알 수 있게 길을 둘 열어 둔다. */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link
                href="/campaigns/new"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-accent text-accent-on text-xs font-bold hover:opacity-90 transition btn-press"
              >
                <Plus className="w-3.5 h-3.5" />
                첫 캠페인 만들기
              </Link>
              <Link
                href="/guide"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface2 border border-border text-xs font-semibold text-text-sub hover:text-text transition btn-press"
              >
                <BookOpen className="w-3.5 h-3.5" />
                사용 가이드
              </Link>
            </div>
          </div>
        ) : (
          /* 2단을 걷어내 가로가 넓어졌다. 2열 그대로 두면 카드가 지나치게 길쭉해진다. */
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5 sm:gap-3">
            {summary.activeCampaigns.map((c) => (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="flex flex-col justify-between gap-2.5 sm:gap-3 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-bg border border-border hover:border-accent-link/40 transition group btn-press stagger-item"
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
  );
}
