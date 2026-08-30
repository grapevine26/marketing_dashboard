"use client";

import { useState } from "react";
import { UnifiedScheduleItem } from "@/lib/db/types";
import Link from "next/link";
import { Calendar, Filter, ArrowRight, Clock, MapPin, Camera, FolderKanban, PartyPopper } from "lucide-react";

export default function UnifiedCalendarWidget({
  scheduleItems,
}: {
  scheduleItems: UnifiedScheduleItem[];
}) {
  const [filterType, setFilterType] = useState<string>("all");

  const filtered = scheduleItems.filter((item) => {
    if (filterType !== "all" && item.type !== filterType) return false;
    return true;
  });

  return (
    <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-400" />
            <span>통합 마케팅 타임라인 & 캘린더 ({filtered.length}건)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            시딩 콘텐츠 업로드 마감일, 행사 일정, SNS 발행 예정일이 통합되어 표시됩니다.
          </p>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs self-start sm:self-auto">
          <button
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 rounded-xl font-semibold transition ${
              filterType === "all" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            전체 ({scheduleItems.length})
          </button>
          <button
            onClick={() => setFilterType("seeding")}
            className={`px-3 py-1.5 rounded-xl font-semibold transition ${
              filterType === "seeding"
                ? "bg-amber-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            시딩 마감
          </button>
          <button
            onClick={() => setFilterType("event")}
            className={`px-3 py-1.5 rounded-xl font-semibold transition ${
              filterType === "event"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            행사
          </button>
          <button
            onClick={() => setFilterType("sns")}
            className={`px-3 py-1.5 rounded-xl font-semibold transition ${
              filterType === "sns"
                ? "bg-pink-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            SNS 발행
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-xs">
          예정된 일정이 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <Link
              key={item.id}
              href={item.link}
              className="p-4 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-950/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
            >
              <div className="flex items-start sm:items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    item.type === "seeding"
                      ? "bg-amber-500/10 text-amber-400"
                      : item.type === "event"
                      ? "bg-purple-500/10 text-purple-400"
                      : "bg-pink-500/10 text-pink-400"
                  }`}
                >
                  {item.type === "seeding" && <FolderKanban className="w-4 h-4" />}
                  {item.type === "event" && <PartyPopper className="w-4 h-4" />}
                  {item.type === "sns" && <Camera className="w-4 h-4" />}
                </div>

                <div className="space-y-0.5">
                  <div className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                    {item.title}
                  </div>
                  <div className="text-xs text-slate-400">{item.subtitle}</div>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 font-mono text-slate-300 font-semibold flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {item.date}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                    item.type === "seeding"
                      ? "bg-amber-500/10 text-amber-400"
                      : item.type === "event"
                      ? "bg-purple-500/10 text-purple-400"
                      : "bg-pink-500/10 text-pink-400"
                  }`}
                >
                  {item.status}
                </span>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}