"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar as CalendarIcon,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  PartyPopper,
  Camera,
  FolderKanban,
  CheckCircle2,
  Clock,
  X,
} from "lucide-react";

export interface UnifiedCalendarItem {
  id: string;
  source: "seeding" | "event" | "event_checklist" | "sns";
  title: string;
  dateStr: string; // YYYY-MM-DD
  linkUrl: string;
  brandName: string;
  extraInfo?: string;
  daysDiff: number; // 0: today, <0: overdue, >0: upcoming
}

export default function CalendarOverviewClient({
  currentMonthStr,
  urgentItems,
  monthItems,
}: {
  currentMonthStr: string;
  urgentItems: UnifiedCalendarItem[];
  monthItems: UnifiedCalendarItem[];
}) {
  const router = useRouter();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [yearStr, monthStr] = currentMonthStr.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const handlePrevMonth = () => {
    const prevDate = new Date(year, month - 2, 1);
    const prevStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    router.push(`/?month=${prevStr}`);
  };

  const handleNextMonth = () => {
    const nextDate = new Date(year, month, 1);
    const nextStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;
    router.push(`/?month=${nextStr}`);
  };

  // Days in month
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0: Sun, 1: Mon, ...

  const calendarDays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayItems = monthItems.filter((i) => i.dateStr === dStr);
    calendarDays.push({
      dayNum: d,
      dateStr: dStr,
      items: dayItems,
    });
  }

  const getSourceBadge = (source: UnifiedCalendarItem["source"]) => {
    switch (source) {
      case "seeding":
        return (
          <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px] font-bold inline-flex items-center gap-1">
            <FolderKanban className="w-3 h-3" /> 시딩
          </span>
        );
      case "event":
        return (
          <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 text-[10px] font-bold inline-flex items-center gap-1">
            <PartyPopper className="w-3 h-3" /> 행사
          </span>
        );
      case "event_checklist":
        return (
          <span className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30 text-[10px] font-bold inline-flex items-center gap-1">
            <Clock className="w-3 h-3" /> 행사준비
          </span>
        );
      case "sns":
        return (
          <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30 text-[10px] font-bold inline-flex items-center gap-1">
            <Camera className="w-3 h-3" /> SNS
          </span>
        );
    }
  };

  const selectedDayItems = selectedDay
    ? monthItems.filter((i) => i.dateStr === selectedDay)
    : [];

  return (
    <div className="space-y-6 font-sans">
      {/* 1. Urgent & Imminent Alerts Banner (D-3 ~ Overdue) */}
      <div className="p-5 sm:p-6 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-zinc-100">
              임박 및 지연 일정 (D-3 ~ 지연)
            </h2>
          </div>
          <span className="text-xs text-zinc-400 font-medium">총 {urgentItems.length}건</span>
        </div>

        {urgentItems.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-[#22242A] rounded-2xl bg-[#090A0C]">
            🎉 현재 마감 3일 이내 임박하거나 지연된 마케팅 일정이 없습니다.
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
                    : "bg-[#090A0C] border-[#22242A] hover:border-zinc-700"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    {getSourceBadge(item.source)}
                    <span
                      className={`text-xs font-bold font-mono ${
                        item.daysDiff < 0
                          ? "text-red-400"
                          : item.daysDiff === 0
                          ? "text-amber-400 font-extrabold"
                          : "text-amber-300"
                      }`}
                    >
                      {item.daysDiff < 0
                        ? `D+${Math.abs(item.daysDiff)} 지연`
                        : item.daysDiff === 0
                        ? "D-DAY 오늘"
                        : `D-${item.daysDiff}`}
                    </span>
                  </div>
                  <h3 className="text-xs font-bold text-zinc-100 group-hover:text-blue-400 transition truncate">
                    {item.title}
                  </h3>
                  <div className="text-[11px] text-zinc-400 truncate">
                    {item.brandName} {item.extraInfo && `• ${item.extraInfo}`}
                  </div>
                </div>

                <div className="text-[10px] text-zinc-500 font-mono flex items-center justify-between pt-1 border-t border-[#22242A]">
                  <span>{item.dateStr}</span>
                  <span className="text-zinc-400 group-hover:underline">상세보기 &rarr;</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 2. Monthly Server-Rendered Calendar Grid */}
      <div className="p-5 sm:p-6 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-zinc-100">
              {year}년 {month}월 전체 마케팅 통합 일정
            </h2>
          </div>

          <div className="flex items-center gap-1 bg-[#090A0C] p-1 rounded-xl border border-[#22242A]">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#181A20] transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-zinc-200 px-2 font-mono">
              {year}.{String(month).padStart(2, "0")}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#181A20] transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 7-Columns Calendar Grid */}
        <div className="border border-[#22242A] rounded-2xl overflow-hidden bg-[#090A0C]">
          {/* Weekday Header */}
          <div className="grid grid-cols-7 text-center text-xs font-bold text-zinc-400 border-b border-[#22242A] bg-[#131418] py-2.5">
            <div className="text-red-400">일</div>
            <div>월</div>
            <div>화</div>
            <div>수</div>
            <div>목</div>
            <div>금</div>
            <div className="text-blue-400">토</div>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 divide-x divide-y divide-[#22242A]">
            {/* Blank leading days */}
            {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
              <div key={`blank-${idx}`} className="h-24 sm:h-28 bg-[#090A0C]/40" />
            ))}

            {/* Actual Month Days */}
            {calendarDays.map((cell) => {
              const isSelected = selectedDay === cell.dateStr;
              return (
                <div
                  key={cell.dateStr}
                  onClick={() => setSelectedDay(cell.dateStr)}
                  className={`h-24 sm:h-28 p-1.5 sm:p-2 flex flex-col justify-between cursor-pointer transition ${
                    isSelected
                      ? "bg-indigo-950/30 border-2 border-indigo-500/50"
                      : "hover:bg-[#181A20]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-zinc-300">
                      {cell.dayNum}
                    </span>
                    {cell.items.length > 0 && (
                      <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold flex items-center justify-center font-mono">
                        {cell.items.length}
                      </span>
                    )}
                  </div>

                  {/* Badges Preview */}
                  <div className="space-y-1 overflow-hidden">
                    {cell.items.slice(0, 2).map((item) => (
                      <div
                        key={item.id}
                        className="truncate text-[10px] px-1.5 py-0.5 rounded bg-[#131418] border border-[#22242A] text-zinc-300 font-medium"
                      >
                        {item.title}
                      </div>
                    ))}
                    {cell.items.length > 2 && (
                      <div className="text-[9px] text-zinc-500 font-mono pl-1">
                        +{cell.items.length - 2}건 더보기
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected Day Item Detail Modal / Drawer */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#131418] border border-[#22242A] rounded-3xl p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-[#22242A]">
              <div>
                <h3 className="text-base font-bold text-zinc-100">{selectedDay} 전체 일정</h3>
                <p className="text-xs text-zinc-400">해당 날짜에 예정된 마케팅 업무 목록입니다.</p>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                className="text-zinc-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {selectedDayItems.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-xs">
                  이 날짜에 등록된 일정이 없습니다.
                </div>
              ) : (
                selectedDayItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.linkUrl}
                    className="p-3.5 rounded-2xl bg-[#090A0C] border border-[#22242A] hover:border-indigo-500/40 transition flex items-center justify-between gap-3 group block"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {getSourceBadge(item.source)}
                        <span className="text-xs font-bold text-zinc-100 truncate group-hover:text-indigo-400">
                          {item.title}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {item.brandName} {item.extraInfo && `• ${item.extraInfo}`}
                      </div>
                    </div>

                    <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-indigo-400 shrink-0" />
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