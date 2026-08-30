"use client";

import { useState } from "react";
import { Campaign, MarketingEvent, SnsPost, SnsChannel } from "@/lib/db/types";
import Link from "next/link";
import {
  Calendar as CalendarIcon,
  FolderKanban,
  PartyPopper,
  Camera,
  ExternalLink,
  ChevronRight,
  Clock,
  Filter,
} from "lucide-react";

export default function UnifiedCalendarWidget({
  campaigns,
  events,
  posts,
  channels,
}: {
  campaigns: Campaign[];
  events: MarketingEvent[];
  posts: SnsPost[];
  channels: SnsChannel[];
}) {
  const [filter, setFilter] = useState<"all" | "seeding" | "events" | "sns">("all");

  const channelMap = Object.fromEntries(channels.map((c) => [c.id, c]));

  // Combine unified schedule timeline items
  const timelineItems: Array<{
    id: string;
    type: "seeding" | "events" | "sns";
    title: string;
    subtitle: string;
    date: string;
    time?: string;
    badgeText: string;
    linkUrl: string;
    colorClass: string;
    badgeClass: string;
  }> = [];

  // 1. Seeding items
  campaigns.forEach((c) => {
    timelineItems.push({
      id: `camp_${c.id}`,
      type: "seeding",
      title: c.name,
      subtitle: `${c.company_name} • ${c.campaign_type === "shipping" ? "배송형" : "방문형"} 시딩`,
      date: c.created_at.split("T")[0],
      badgeText: c.status,
      linkUrl: `/campaigns/${c.id}`,
      colorClass: "text-blue-400",
      badgeClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    });
  });

  // 2. Events items
  events.forEach((ev) => {
    timelineItems.push({
      id: `ev_${ev.id}`,
      type: "events",
      title: ev.title,
      subtitle: `${ev.company_name} • ${ev.location}`,
      date: ev.event_date,
      time: ev.event_time,
      badgeText: "오프라인 행사",
      linkUrl: `/events/${ev.id}`,
      colorClass: "text-indigo-400",
      badgeClass: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    });
  });

  // 3. SNS items
  posts.forEach((p) => {
    const ch = channelMap[p.channel_id];
    timelineItems.push({
      id: `post_${p.id}`,
      type: "sns",
      title: p.title,
      subtitle: `${ch?.name || "채널"} (@${ch?.handle || ""}) • ${p.content_type.toUpperCase()}`,
      date: p.scheduled_date,
      time: p.scheduled_time,
      badgeText: p.status === "approved" ? "승인완료" : p.status === "review" ? "검수중" : p.status,
      linkUrl: `/sns`,
      colorClass: "text-sky-400",
      badgeClass: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    });
  });

  // Sort by date descending
  timelineItems.sort((a, b) => b.date.localeCompare(a.date));

  const filteredItems = timelineItems.filter((item) => {
    if (filter === "all") return true;
    return item.type === filter;
  });

  return (
    <div className="p-5 sm:p-7 rounded-3xl bg-[#131418] border border-[#22242A] space-y-5 sm:space-y-6 shadow-2xl font-sans">
      {/* Header & Filter Tabs (Mobile Horizontal Scrollable) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold shrink-0">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-zinc-100">통합 마케팅 캘린더 타임라인</h2>
            <p className="text-xs text-zinc-400">모든 시딩, 행사, SNS 콘텐츠의 최근 일정을 한눈에 확인합니다.</p>
          </div>
        </div>

        {/* Filter Tab Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-2 px-2 sm:mx-0 sm:px-0">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              filter === "all"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-[#090A0C] border border-[#22242A] text-zinc-400 hover:text-white"
            }`}
          >
            전체 ({timelineItems.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("seeding")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-1 ${
              filter === "seeding"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-[#090A0C] border border-[#22242A] text-zinc-400 hover:text-white"
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5" />
            <span>시딩 ({campaigns.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter("events")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-1 ${
              filter === "events"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-[#090A0C] border border-[#22242A] text-zinc-400 hover:text-white"
            }`}
          >
            <PartyPopper className="w-3.5 h-3.5" />
            <span>행사 ({events.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter("sns")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-1 ${
              filter === "sns"
                ? "bg-sky-600 text-white shadow-sm"
                : "bg-[#090A0C] border border-[#22242A] text-zinc-400 hover:text-white"
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>SNS ({posts.length})</span>
          </button>
        </div>
      </div>

      {/* Timeline List (Mobile Friendly Card/Rows) */}
      <div className="space-y-2.5">
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-[#22242A] rounded-2xl bg-[#090A0C]">
            등록된 일정이 없습니다.
          </div>
        ) : (
          filteredItems.map((item) => (
            <Link
              key={item.id}
              href={item.linkUrl}
              className="group p-4 rounded-2xl bg-[#090A0C] border border-[#22242A] hover:border-blue-500/40 hover:bg-[#0D0E12] transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm active:scale-[0.99]"
            >
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#131418] border border-[#22242A] flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                  {item.type === "seeding" && <FolderKanban className="w-4 h-4 text-blue-400" />}
                  {item.type === "events" && <PartyPopper className="w-4 h-4 text-indigo-400" />}
                  {item.type === "sns" && <Camera className="w-4 h-4 text-sky-400" />}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-xs sm:text-sm text-zinc-100 group-hover:text-blue-400 transition truncate max-w-full">
                      {item.title}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${item.badgeClass}`}>
                      {item.badgeText}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 truncate mt-0.5">{item.subtitle}</p>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#181A20] text-xs shrink-0">
                <span className="text-zinc-400 font-mono text-[11px] flex items-center gap-1">
                  <Clock className="w-3 h-3 text-zinc-500" />
                  {item.date} {item.time && `(${item.time})`}
                </span>
                <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition" />
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}