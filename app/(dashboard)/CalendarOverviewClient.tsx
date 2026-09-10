"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { UnifiedCalendarItem } from "@/lib/overview/collect";
import type { MonthGridCell } from "@/lib/seeding/dday";
import {
  Calendar as CalendarIcon,
  LayoutList,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  PartyPopper,
  Camera,
  FolderKanban,
  Clock,
  X,
  CheckCircle2,
} from "lucide-react";

export type { UnifiedCalendarItem };

/**
 * 소스별 색과 모양 (시맨틱 토큰 기반).
 */
const SOURCE_BADGE: Record<
  UnifiedCalendarItem["source"],
  { label: string; badge: string; cell: string; Icon: typeof FolderKanban }
> = {
  seeding: {
    label: "시딩",
    badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    cell: "bg-blue-500/20 border-blue-500/40",
    Icon: FolderKanban,
  },
  event: {
    label: "행사",
    badge: "bg-teal-500/15 text-teal-400 border-teal-500/40",
    cell: "bg-teal-500/25 border-teal-500/50",
    Icon: PartyPopper,
  },
  event_checklist: {
    label: "행사준비",
    badge: "bg-transparent text-teal-400 border-teal-500/50 border-dashed",
    cell: "bg-transparent border-dashed border-teal-500/60",
    Icon: Clock,
  },
  sns: {
    label: "SNS",
    badge: "bg-accent2/15 text-accent2 border-accent2/30",
    cell: "bg-accent2/20 border-accent2/40",
    Icon: Camera,
  },
};

export function SourceBadge({ source }: { source: UnifiedCalendarItem["source"] }) {
  const { label, badge, Icon } = SOURCE_BADGE[source];
  return (
    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold inline-flex items-center gap-1 ${badge}`}>
      <Icon className="w-3 h-3 shrink-0" /> {label}
    </span>
  );
}

export function ddayLabel(diff: number) {
  if (diff < 0) return `D+${Math.abs(diff)} 지연`;
  if (diff === 0) return "D-DAY 오늘";
  return `D-${diff}`;
}

const MAX_PER_CELL = 2;

/**
 * 긴급 조치 일정 피드 (오른쪽 사이드바 또는 단독 렌더링).
 */
export function UrgentItemsWidget({
  urgentItems,
  failedSources = [],
}: {
  urgentItems: UnifiedCalendarItem[];
  failedSources?: string[];
}) {
  return (
    <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-surface border border-border space-y-3.5 sm:space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-warn shrink-0" />
          <h2 className="text-sm sm:text-base font-bold text-text">임박 및 지연 일정 (D-3 ~ 지연)</h2>
        </div>
        <span className="text-xs text-text-muted font-medium font-mono tabular-nums">
          총 {urgentItems.length}건
        </span>
      </div>

      {failedSources.length > 0 && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>일부 데이터를 불러오지 못했습니다: {failedSources.join(", ")}</span>
        </div>
      )}

      {urgentItems.length === 0 ? (
        <div className="p-6 sm:p-7 text-center text-xs text-text-muted border border-dashed border-border rounded-2xl bg-bg space-y-1.5">
          <div className="inline-flex p-2 rounded-full bg-surface2 text-text-muted mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="font-semibold text-text">모든 일정이 정상 진행 중입니다</p>
          <p className="text-[11px] text-text-sub">마감 3일 이내의 임박이나 지연된 항목이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[340px] sm:max-h-[540px] overflow-y-auto pr-0.5">
          {urgentItems.map((item) => (
            <Link
              key={item.id}
              href={item.linkUrl}
              className={`p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border transition flex flex-col justify-between space-y-2 group ${
                item.daysDiff < 0
                  ? "bg-red-500/10 border-red-500/30 hover:border-red-500/60"
                  : item.daysDiff === 0
                  ? "bg-amber-500/10 border-amber-500/40 hover:border-amber-500/70"
                  : "bg-bg border-border hover:border-accent-link/40"
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <SourceBadge source={item.source} />
                  <span
                    className={`text-xs font-bold font-mono tabular-nums ${
                      item.daysDiff < 0
                        ? "text-red-400"
                        : item.daysDiff === 0
                        ? "text-warn font-extrabold"
                        : "text-warn-soft"
                    }`}
                  >
                    {ddayLabel(item.daysDiff)}
                  </span>
                </div>
                <h3 className="text-xs font-bold text-text group-hover:text-accent-link transition truncate">
                  {item.title}
                </h3>
                <div className="text-[11px] text-text-sub truncate">
                  {item.brandName} {item.extraInfo && `• ${item.extraInfo}`}
                </div>
              </div>
              <div className="text-[10px] text-text-muted font-mono flex items-center justify-between pt-1.5 border-t border-border/80">
                <span>{item.dateStr}</span>
                <span className="text-text-sub group-hover:text-accent-link group-hover:underline">
                  상세보기 →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 캘린더 메인 위젯 (달력 그리드 뷰 및 아젠다 리스트 뷰 토글 지원).
 */
export default function CalendarOverviewClient({
  currentMonth,
  prevMonth,
  nextMonth,
  todayMonth,
  leadingBlanks,
  cells,
  urgentItems,
  monthItems,
  failedSources,
  renderUrgent = false,
}: {
  currentMonth: string;
  prevMonth: string;
  nextMonth: string;
  todayMonth: string;
  leadingBlanks: number;
  cells: MonthGridCell[];
  urgentItems: UnifiedCalendarItem[];
  monthItems: UnifiedCalendarItem[];
  failedSources: string[];
  renderUrgent?: boolean;
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"calendar" | "agenda">("calendar");
  const [mounted, setMounted] = useState(false);
  const [year, month] = currentMonth.split("-").map(Number);
  const selectedDayItems = selectedDay ? monthItems.filter((i) => i.dateStr === selectedDay) : [];

  useEffect(() => {
    setMounted(true);
  }, []);

  // 아젠다 목록 뷰를 위해 날짜별 정렬 및 그룹핑
  const sortedMonthItems = [...monthItems].sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  const groupedByDate = sortedMonthItems.reduce<Record<string, UnifiedCalendarItem[]>>((acc, item) => {
    if (!acc[item.dateStr]) acc[item.dateStr] = [];
    acc[item.dateStr].push(item);
    return acc;
  }, {});

  const datesWithItems = Object.keys(groupedByDate).sort();

  return (
    <div className="space-y-4 sm:space-y-6 font-sans">
      {/* 긴급 일정 통합 렌더링 옵션 (단일 컬럼 모드 지원) */}
      {renderUrgent && (
        <UrgentItemsWidget urgentItems={urgentItems} failedSources={failedSources} />
      )}

      {/* 캘린더 카드 */}
      <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-surface border border-border space-y-4 shadow-sm">
        {/* 상단 컨트롤 바 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5 text-accent-link shrink-0" />
            <h2 className="text-sm sm:text-base font-bold text-text">
              <span className="sm:hidden">{month}월 마케팅 일정</span>
              <span className="hidden sm:inline">{year}년 {month}월 전체 마케팅 통합 일정</span>
            </h2>
            <span className="text-[11px] sm:text-xs text-text-muted font-mono tabular-nums">
              ({monthItems.length}건)
            </span>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
            {/* 달력 / 목록 뷰 모드 토글 */}
            <div className="flex items-center bg-bg p-1 rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setViewMode("calendar")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  viewMode === "calendar"
                    ? "bg-surface text-text shadow-xs border border-border"
                    : "text-text-muted hover:text-text"
                }`}
                aria-label="달력 뷰"
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                <span>달력</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("agenda")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  viewMode === "agenda"
                    ? "bg-surface text-text shadow-xs border border-border"
                    : "text-text-muted hover:text-text"
                }`}
                aria-label="목록 뷰"
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span>목록</span>
              </button>
            </div>

            {/* 월간 내비게이션 */}
            <div className="flex items-center gap-1 bg-bg p-1 rounded-xl border border-border">
              <Link
                href={`/?month=${prevMonth}`}
                className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface2 transition"
                aria-label="이전 달"
              >
                <ChevronLeft className="w-4 h-4" />
              </Link>
              <span className="text-xs font-bold text-text px-1.5 sm:px-2 font-mono">{currentMonth}</span>
              <Link
                href={`/?month=${nextMonth}`}
                className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface2 transition"
                aria-label="다음 달"
              >
                <ChevronRight className="w-4 h-4" />
              </Link>
              {currentMonth !== todayMonth && (
                <Link
                  href="/"
                  className="ml-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-accent-link hover:bg-surface2 transition"
                >
                  오늘
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* 1) 바둑판 달력 뷰 */}
        {viewMode === "calendar" ? (
          <div className="border border-border rounded-xl sm:rounded-2xl overflow-hidden bg-bg">
            <div className="grid grid-cols-7 text-center text-xs font-bold text-text-muted border-b border-border bg-surface py-2 sm:py-2.5">
              <div className="text-red-400">일</div>
              <div>월</div>
              <div>화</div>
              <div>수</div>
              <div>목</div>
              <div>금</div>
              <div className="text-blue-400">토</div>
            </div>

            <div className="grid grid-cols-7 divide-x divide-y divide-border">
              {Array.from({ length: leadingBlanks }).map((_, idx) => (
                <div key={`blank-${idx}`} className="h-16 sm:h-28 bg-bg/40" />
              ))}

              {cells.map((cell) => {
                const items = monthItems.filter((i) => i.dateStr === cell.dateStr);
                const isSelected = selectedDay === cell.dateStr;
                return (
                  <div
                    key={cell.dateStr}
                    onClick={() => setSelectedDay(cell.dateStr)}
                    className={`h-16 sm:h-28 p-1 sm:p-2 flex flex-col justify-between cursor-pointer transition ${
                      isSelected
                        ? "bg-accent-link/15 ring-2 ring-inset ring-accent-link/60"
                        : cell.isToday
                        ? "bg-accent-link/10"
                        : "hover:bg-surface2"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-mono font-bold ${
                          cell.isToday
                            ? "text-accent-link underline underline-offset-2"
                            : "text-text-sub"
                        }`}
                      >
                        {cell.dayNum}
                      </span>
                      {items.length > 0 && (
                        <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-accent-link/20 text-accent-link text-[9px] sm:text-[10px] font-bold flex items-center justify-center font-mono">
                          {items.length}
                        </span>
                      )}
                    </div>

                    {/* 모바일 뷰: 깔끔한 색상 도트 표시 (sm:hidden) */}
                    <div className="flex sm:hidden items-center justify-center gap-1 py-1 flex-wrap min-h-[14px]">
                      {items.slice(0, 3).map((item) => {
                        const dotColor =
                          item.source === "seeding"
                            ? "bg-blue-400"
                            : item.source === "event" || item.source === "event_checklist"
                            ? "bg-teal-400"
                            : "bg-accent2";
                        return (
                          <span
                            key={item.id}
                            className={`w-1.5 h-1.5 rounded-full ${dotColor}`}
                          />
                        );
                      })}
                      {items.length > 3 && (
                        <span className="text-[8px] font-mono text-text-muted">
                          +{items.length - 3}
                        </span>
                      )}
                    </div>

                    {/* 데스크톱 뷰: 텍스트 배지 표시 (hidden sm:block) */}
                    <div className="hidden sm:block space-y-1 overflow-hidden">
                      {items.slice(0, MAX_PER_CELL).map((item) => {
                        const tone = SOURCE_BADGE[item.source].cell;
                        return (
                          <Link
                            key={item.id}
                            href={item.linkUrl}
                            onClick={(e) => e.stopPropagation()}
                            className={`block truncate text-[10px] px-1.5 py-0.5 rounded border text-text font-medium hover:brightness-125 ${tone}`}
                            title={item.title}
                          >
                            {item.title}
                          </Link>
                        );
                      })}
                      {items.length > MAX_PER_CELL && (
                        <div className="text-[9px] text-text-muted font-mono pl-1">
                          +{items.length - MAX_PER_CELL}건 더보기
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* 2) 목록(아젠다) 뷰 */
          <div className="space-y-3">
            {datesWithItems.length === 0 ? (
              <div className="p-8 text-center text-text-muted text-xs border border-dashed border-border rounded-2xl bg-bg">
                이번 달에 등록된 마케팅 일정이 없습니다.
              </div>
            ) : (
              <div className="divide-y divide-border border border-border rounded-2xl bg-bg overflow-hidden">
                {datesWithItems.map((dateStr) => {
                  const dayItems = groupedByDate[dateStr];
                  const [, mStr, dStr] = dateStr.split("-");
                  const diff = dayItems[0]?.daysDiff;
                  return (
                    <div key={dateStr} className="p-3 sm:p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs sm:text-sm text-text">
                            {Number(mStr)}월 {Number(dStr)}일
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface2 border border-border text-text-muted">
                            {dayItems.length}건
                          </span>
                        </div>
                        {diff !== undefined && (
                          <span
                            className={`text-xs font-mono font-bold ${
                              diff < 0
                                ? "text-red-400"
                                : diff === 0
                                ? "text-warn font-extrabold"
                                : "text-text-muted"
                            }`}
                          >
                            {ddayLabel(diff)}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {dayItems.map((item) => (
                          <Link
                            key={item.id}
                            href={item.linkUrl}
                            className="p-3 rounded-xl bg-surface border border-border hover:border-accent-link/40 transition flex items-center justify-between gap-3 group"
                          >
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <SourceBadge source={item.source} />
                                <span className="text-xs font-bold text-text truncate group-hover:text-accent-link">
                                  {item.title}
                                </span>
                              </div>
                              <div className="text-[11px] text-text-sub truncate">
                                {item.brandName} {item.extraInfo && `• ${item.extraInfo}`}
                              </div>
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 text-text-muted group-hover:text-accent-link shrink-0" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 하단 범례 */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-text-muted pt-1">
          <span>범례:</span>
          {(Object.keys(SOURCE_BADGE) as UnifiedCalendarItem["source"][]).map((s) => (
            <SourceBadge key={s} source={s} />
          ))}
        </div>
      </div>

      {/* 날짜 클릭 모달 — document.body 포탈로 화면 정중앙에 띄운다 */}
      {selectedDay && mounted && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
              onClick={() => setSelectedDay(null)}
            >
          <div
            className="w-full max-w-lg bg-surface border border-border rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4 shadow-2xl max-h-[88vh] sm:max-h-[85vh] flex flex-col font-sans"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-3 pb-2 border-b border-border">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-text font-mono truncate">{selectedDay} 전체 일정</h3>
                <p className="text-xs text-text-muted mt-0.5">해당 날짜에 예정된 마케팅 업무 목록입니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="text-text-muted hover:text-text p-2 rounded-xl hover:bg-surface2 transition shrink-0 touch-manipulation"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {selectedDayItems.length === 0 ? (
                <div className="p-8 text-center text-text-muted text-xs">
                  이 날짜에 등록된 일정이 없습니다.
                </div>
              ) : (
                selectedDayItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.linkUrl}
                    className="p-3.5 rounded-2xl bg-bg border border-border hover:border-accent-link/40 transition flex items-center justify-between gap-3 group block"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <SourceBadge source={item.source} />
                        <span className="text-xs font-bold text-text truncate group-hover:text-accent-link">
                          {item.title}
                        </span>
                      </div>
                      <div className="text-[11px] text-text-muted">
                        {item.brandName} {item.extraInfo && `• ${item.extraInfo}`} ·{" "}
                        <span className="font-mono">{ddayLabel(item.daysDiff)}</span>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-text-muted group-hover:text-accent-link shrink-0" />
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
