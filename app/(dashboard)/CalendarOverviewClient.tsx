"use client";

import { useState } from "react";
import Link from "next/link";
import type { UnifiedCalendarItem } from "@/lib/overview/collect";
import type { MonthGridCell } from "@/lib/seeding/dday";
import {
  Calendar as CalendarIcon,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  PartyPopper,
  Camera,
  FolderKanban,
  Clock,
  X,
} from "lucide-react";

export type { UnifiedCalendarItem };

const SOURCE_BADGE: Record<UnifiedCalendarItem["source"], { label: string; cls: string; Icon: typeof FolderKanban }> = {
  seeding: { label: "시딩", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30", Icon: FolderKanban },
  event: { label: "행사", cls: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30", Icon: PartyPopper },
  event_checklist: { label: "행사준비", cls: "bg-purple-500/15 text-purple-400 border-purple-500/30", Icon: Clock },
  sns: { label: "SNS", cls: "bg-sky-500/15 text-sky-400 border-sky-500/30", Icon: Camera },
};

function SourceBadge({ source }: { source: UnifiedCalendarItem["source"] }) {
  const { label, cls, Icon } = SOURCE_BADGE[source];
  return (
    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold inline-flex items-center gap-1 ${cls}`}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
}

function ddayLabel(diff: number) {
  if (diff < 0) return `D+${Math.abs(diff)} 지연`;
  if (diff === 0) return "D-DAY 오늘";
  return `D-${diff}`;
}

const MAX_PER_CELL = 2;

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
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [year, month] = currentMonth.split("-").map(Number);
  const selectedDayItems = selectedDay ? monthItems.filter((i) => i.dateStr === selectedDay) : [];

  return (
    <div className="space-y-6 font-sans">
      {failedSources.length > 0 && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>일부 데이터를 불러오지 못했습니다: {failedSources.join(", ")}. 나머지 데이터만 표시합니다.</span>
        </div>
      )}

      {/* 1. Urgent */}
      <div className="p-5 sm:p-6 rounded-3xl bg-surface border border-border space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-text">임박 및 지연 일정 (D-3 ~ 지연)</h2>
          </div>
          <span className="text-xs text-text-muted font-medium font-mono tabular-nums">총 {urgentItems.length}건</span>
        </div>

        {urgentItems.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-xs border border-dashed border-border rounded-2xl bg-bg">
            임박하거나 지연된 항목이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {urgentItems.map((item) => (
              <Link
                key={item.id}
                href={item.linkUrl}
                className={`p-4 rounded-2xl border transition flex flex-col justify-between space-y-3 group ${
                  item.daysDiff < 0
                    ? "bg-red-500/10 border-red-500/30 hover:border-red-500/60"
                    : item.daysDiff === 0
                    ? "bg-amber-500/10 border-amber-500/40 hover:border-amber-500/70"
                    : "bg-bg border-border hover:border-border"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <SourceBadge source={item.source} />
                    <span className={`text-xs font-bold font-mono tabular-nums ${item.daysDiff < 0 ? "text-red-400" : item.daysDiff === 0 ? "text-amber-400 font-extrabold" : "text-amber-300"}`}>
                      {ddayLabel(item.daysDiff)}
                    </span>
                  </div>
                  <h3 className="text-xs font-bold text-text group-hover:text-blue-400 transition truncate">{item.title}</h3>
                  <div className="text-[11px] text-text-sub truncate">
                    {item.brandName} {item.extraInfo && `• ${item.extraInfo}`}
                  </div>
                </div>
                <div className="text-[10px] text-text-muted font-mono flex items-center justify-between pt-1 border-t border-border">
                  <span>{item.dateStr}</span>
                  <span className="text-text-sub group-hover:underline">상세보기 →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 2. Month calendar */}
      <div className="p-5 sm:p-6 rounded-3xl bg-surface border border-border space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-text">{year}년 {month}월 전체 마케팅 통합 일정</h2>
            <span className="text-xs text-text-muted font-mono tabular-nums">({monthItems.length}건)</span>
          </div>

          <div className="flex items-center gap-1 bg-bg p-1 rounded-xl border border-border">
            <Link href={`/?month=${prevMonth}`} className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface2 transition" aria-label="이전 달">
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <span className="text-xs font-bold text-text px-2 font-mono">{currentMonth}</span>
            <Link href={`/?month=${nextMonth}`} className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface2 transition" aria-label="다음 달">
              <ChevronRight className="w-4 h-4" />
            </Link>
            {currentMonth !== todayMonth && (
              <Link href="/" className="ml-1 px-2 py-1 rounded-lg text-[11px] text-indigo-300 hover:bg-surface2">오늘</Link>
            )}
          </div>
        </div>

        <div className="border border-border rounded-2xl overflow-hidden bg-bg">
          <div className="grid grid-cols-7 text-center text-xs font-bold text-text-muted border-b border-border bg-surface py-2.5">
            <div className="text-red-400">일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div className="text-blue-400">토</div>
          </div>

          <div className="grid grid-cols-7 divide-x divide-y divide-border">
            {Array.from({ length: leadingBlanks }).map((_, idx) => (
              <div key={`blank-${idx}`} className="h-24 sm:h-28 bg-bg/40" />
            ))}

            {cells.map((cell) => {
              const items = monthItems.filter((i) => i.dateStr === cell.dateStr);
              const isSelected = selectedDay === cell.dateStr;
              return (
                <div
                  key={cell.dateStr}
                  onClick={() => setSelectedDay(cell.dateStr)}
                  className={`h-24 sm:h-28 p-1.5 sm:p-2 flex flex-col justify-between cursor-pointer transition ${
                    isSelected ? "bg-indigo-950/30 ring-2 ring-inset ring-indigo-500/50" : cell.isToday ? "bg-indigo-950/15" : "hover:bg-surface2"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-mono font-bold ${cell.isToday ? "text-indigo-300 underline underline-offset-2" : "text-text-sub"}`}>
                      {cell.dayNum}
                    </span>
                    {items.length > 0 && (
                      <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold flex items-center justify-center font-mono">{items.length}</span>
                    )}
                  </div>

                  <div className="space-y-1 overflow-hidden">
                    {items.slice(0, MAX_PER_CELL).map((item) => {
                      const tone = SOURCE_BADGE[item.source].cls.split(" ")[0];
                      return (
                        <Link
                          key={item.id}
                          href={item.linkUrl}
                          onClick={(e) => e.stopPropagation()}
                          className={`block truncate text-[10px] px-1.5 py-0.5 rounded border border-border text-text font-medium hover:border-indigo-500/50 ${tone}`}
                          title={item.title}
                        >
                          {item.title}
                        </Link>
                      );
                    })}
                    {items.length > MAX_PER_CELL && (
                      <div className="text-[9px] text-text-muted font-mono pl-1">+{items.length - MAX_PER_CELL}건 더보기</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[10px] text-text-muted">
          <span>범례:</span>
          {(Object.keys(SOURCE_BADGE) as UnifiedCalendarItem["source"][]).map((s) => <SourceBadge key={s} source={s} />)}
        </div>
      </div>

      {/* Day modal */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => setSelectedDay(null)}>
          <div className="w-full max-w-lg bg-surface border border-border rounded-3xl p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col font-sans" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-text font-mono">{selectedDay} 전체 일정</h3>
                <p className="text-xs text-text-muted">해당 날짜에 예정된 마케팅 업무 목록입니다.</p>
              </div>
              <button type="button" onClick={() => setSelectedDay(null)} className="text-text-muted hover:text-text p-1" aria-label="닫기">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {selectedDayItems.length === 0 ? (
                <div className="p-8 text-center text-text-muted text-xs">이 날짜에 등록된 일정이 없습니다.</div>
              ) : (
                selectedDayItems.map((item) => (
                  <Link key={item.id} href={item.linkUrl} className="p-3.5 rounded-2xl bg-bg border border-border hover:border-indigo-500/40 transition flex items-center justify-between gap-3 group block">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <SourceBadge source={item.source} />
                        <span className="text-xs font-bold text-text truncate group-hover:text-indigo-400">{item.title}</span>
                      </div>
                      <div className="text-[11px] text-text-muted">
                        {item.brandName} {item.extraInfo && `• ${item.extraInfo}`} · <span className="font-mono">{ddayLabel(item.daysDiff)}</span>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-text-muted group-hover:text-indigo-400 shrink-0" />
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
