"use client";

import { useState } from "react";
import { Campaign, MarketingEvent, SnsPost, SnsChannel } from "@/lib/db/types";
import Link from "next/link";
import {
  Calendar as CalendarIcon,
  FolderKanban,
  PartyPopper,
  Camera,
  ChevronRight,
  Clock,
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
      badgeText: "행사",
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
    <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 sm:space-y-5 shadow-xl font-sans">
      {/* Header & Filter Tabs (Mobile Horizontal Scrollable) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold shrink-0">
            <CalendarIcon className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-zinc-100">통합 마케팅 타임라인</h2>
            <p className="text-[11px] text-zinc-400">모든 시딩, 행사, SNS 콘텐츠 최근 일정</p>
          </div>
        </div>

        {/* Filter Tab Buttons */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-2 px-2 sm:mx-0 sm:px-0">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
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
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition flex items-center gap-1 ${
              filter === "seeding"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-[#090A0C] border border-[#22242A] text-zinc-400 hover:text-white"
            }`}
          >
            <FolderKanban className="w-3 h-3 text-blue-400" />
            <span>시딩</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter("events")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition flex items-center gap-1 ${
              filter === "events"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-[#090A0C] border border-[#22242A] text-zinc-400 hover:text-white"
            }`}
          >
            <PartyPopper className="w-3 h-3 text-indigo-400" />
            <span>행사</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter("sns")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition flex items-center gap-1 ${
              filter === "sns"
                ? "bg-sky-600 text-white shadow-sm"
                : "bg-[#090A0C] border border-[#22242A] text-zinc-400 hover:text-white"
            }`}
          >
            <Camera className="w-3 h-3 text-sky-400" />
            <span>SNS</span>
          </button>
        </div>
      </div>

      {/* Timeline List */}
      <div className="space-y-2">
        {filteredItems.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 text-xs border border-dashed border-[#22242A] rounded-xl bg-[#090A0C]">
            등록된 일정이 없습니다.
          </div>
        ) : (
          filteredItems.map((item) => (
            <Link
              key={item.id}
              href={item.linkUrl}
              className="group p-3 sm:p-3.5 rounded-xl bg-[#090A0C] border border-[#22242A] hover:border-blue-500/40 hover:bg-[#0D0E12] transition flex items-center justify-between gap-2 shadow-sm active:scale-[0.99]"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-[#131418] border border-[#22242A] flex items-center justify-center shrink-0">
                  {item.type === "seeding" && <FolderKanban className="w-3.5 h-3.5 text-blue-400" />}
                  {item.type === "events" && <PartyPopper className="w-3.5 h-3.5 text-indigo-400" />}
                  {item.type === "sns" && <Camera className="w-3.5 h-3.5 text-sky-400" />}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-zinc-100 group-hover:text-blue-400 transition truncate max-w-[140px] sm:max-w-[280px]">
                      {item.title}
                    </span>
                    <span className={`px-1.5 py-0.2 rounded-full border text-[9px] font-semibold shrink-0 ${item.badgeClass}`}>
                      {item.badgeText}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 truncate max-w-[180px] sm:max-w-md">{item.subtitle}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 text-[11px] text-zinc-400 font-mono">
                <span>{item.date}</span>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-blue-400 group-hover:translate-x-0.5 transition" />
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}