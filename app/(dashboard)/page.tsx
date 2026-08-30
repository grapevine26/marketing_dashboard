import { getCampaigns, getEvents, getSnsPosts, getSnsChannels } from "@/lib/db";
import Link from "next/link";
import UnifiedCalendarWidget from "./UnifiedCalendarWidget";
import {
  FolderKanban,
  PartyPopper,
  Camera,
  ArrowRight,
  Sparkles,
  Plus,
} from "lucide-react";

export const revalidate = 0;

export default async function DashboardOverviewPage() {
  const [campaigns, events, posts, channels] = await Promise.all([
    getCampaigns(),
    getEvents(),
    getSnsPosts(),
    getSnsChannels(),
  ]);

  const totalCampaigns = campaigns.length;
  const totalEvents = events.length;
  const totalPosts = posts.length;

  return (
    <div className="space-y-4 sm:space-y-6 font-sans">
      {/* Top Banner */}
      <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-[#131418] border border-[#22242A] flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-blue-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>2026 에이전시 통합 관제</span>
          </div>
          <h1 className="text-lg sm:text-2xl font-extrabold text-zinc-100 tracking-tight">
            마케팅 캠페인 & 콘텐츠 통합 현황
          </h1>
          <p className="text-xs text-zinc-400">
            시딩, 행사 초청(RSVP) 및 공식 SNS 운영 일정을 실시간으로 관리합니다.
          </p>
        </div>

        <div className="flex items-center gap-2 pt-1 sm:pt-0">
          <Link
            href="/campaigns/new"
            className="flex-1 sm:flex-none text-center px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition active:scale-95 inline-flex items-center justify-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>새 시딩 등록</span>
          </Link>
          <Link
            href="/events"
            className="flex-1 sm:flex-none text-center px-3.5 py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] border border-[#22242A] text-zinc-200 text-xs font-semibold transition active:scale-95"
          >
            행사 관리
          </Link>
        </div>
      </div>

      {/* 3 Core Modules without A/B/C prefixes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
        {/* Seeding */}
        <Link
          href="/campaigns"
          className="group p-3.5 sm:p-5 rounded-2xl bg-[#131418] border border-[#22242A] hover:border-blue-500/40 hover:bg-[#181A20] transition flex items-center justify-between sm:flex-col sm:items-stretch sm:justify-between gap-3 shadow-md active:scale-[0.99]"
        >
          <div className="flex items-center gap-3 sm:block sm:space-y-2">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <FolderKanban className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-zinc-100 group-hover:text-blue-400 transition">
                인플루언서 시딩
              </h2>
              <p className="text-[11px] text-zinc-400 hidden sm:block mt-0.5">
                사전조사 • 신청폼 • 선정 • 송장추적
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:pt-3 sm:border-t sm:border-[#22242A] sm:justify-between shrink-0">
            <span className="text-xs text-zinc-500 hidden sm:inline">진행 캠페인</span>
            <span className="text-sm sm:text-base font-bold text-blue-400">
              {totalCampaigns}건
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition sm:hidden" />
          </div>
        </Link>

        {/* Events */}
        <Link
          href="/events"
          className="group p-3.5 sm:p-5 rounded-2xl bg-[#131418] border border-[#22242A] hover:border-indigo-500/40 hover:bg-[#181A20] transition flex items-center justify-between sm:flex-col sm:items-stretch sm:justify-between gap-3 shadow-md active:scale-[0.99]"
        >
          <div className="flex items-center gap-3 sm:block sm:space-y-2">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
              <PartyPopper className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-zinc-100 group-hover:text-indigo-400 transition">
                인플루언서 행사
              </h2>
              <p className="text-[11px] text-zinc-400 hidden sm:block mt-0.5">
                VIP 초청장 • RSVP • 현장 체크인
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:pt-3 sm:border-t sm:border-[#22242A] sm:justify-between shrink-0">
            <span className="text-xs text-zinc-500 hidden sm:inline">등록 행사</span>
            <span className="text-sm sm:text-base font-bold text-indigo-400">
              {totalEvents}건
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition sm:hidden" />
          </div>
        </Link>

        {/* SNS */}
        <Link
          href="/sns"
          className="group p-3.5 sm:p-5 rounded-2xl bg-[#131418] border border-[#22242A] hover:border-sky-500/40 hover:bg-[#181A20] transition flex items-center justify-between sm:flex-col sm:items-stretch sm:justify-between gap-3 shadow-md active:scale-[0.99]"
        >
          <div className="flex items-center gap-3 sm:block sm:space-y-2">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
              <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-zinc-100 group-hover:text-sky-400 transition">
                SNS 채널 운영
              </h2>
              <p className="text-[11px] text-zinc-400 hidden sm:block mt-0.5">
                콘텐츠 기획 • Gemini AI • 시안 검수
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:pt-3 sm:border-t sm:border-[#22242A] sm:justify-between shrink-0">
            <span className="text-xs text-zinc-500 hidden sm:inline">발행 콘텐츠</span>
            <span className="text-sm sm:text-base font-bold text-sky-400">
              {totalPosts}건
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-sky-400 group-hover:translate-x-0.5 transition sm:hidden" />
          </div>
        </Link>
      </div>

      {/* Unified Timeline / Calendar Hub Widget */}
      <UnifiedCalendarWidget
        campaigns={campaigns}
        events={events}
        posts={posts}
        channels={channels}
      />
    </div>
  );
}