import { getCampaigns, getEvents, getSnsPosts, getSnsChannels } from "@/lib/db";
import Link from "next/link";
import UnifiedCalendarWidget from "./UnifiedCalendarWidget";
import {
  FolderKanban,
  PartyPopper,
  Camera,
  ArrowRight,
  TrendingUp,
  Clock,
  Sparkles,
  Users,
  CheckCircle2,
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
    <div className="space-y-6 sm:space-y-8 font-sans">
      {/* Top Banner / Welcome */}
      <div className="p-5 sm:p-7 rounded-3xl bg-gradient-to-r from-[#131418] via-[#161820] to-[#131418] border border-[#22242A] flex flex-col md:flex-row md:items-center justify-between gap-5 shadow-xl">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>2026 에이전시 통합 관제 콘솔</span>
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-zinc-100 tracking-tight">
            마케팅 캠페인 및 콘텐츠 통합 현황
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
            인플루언서 시딩, 오프라인 VIP 행사 초청 및 공식 SNS 채널 운영 일정을 한곳에서 실시간으로 모니터링합니다.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0 pt-2 md:pt-0">
          <Link
            href="/campaigns/new"
            className="flex-1 sm:flex-none text-center px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition active:scale-95"
          >
            + 새 시딩 등록
          </Link>
          <Link
            href="/events"
            className="flex-1 sm:flex-none text-center px-4 py-2.5 rounded-xl bg-[#181A20] hover:bg-[#22242A] border border-[#22242A] text-zinc-200 text-xs font-bold transition active:scale-95"
          >
            행사 관리
          </Link>
        </div>
      </div>

      {/* 3 Core Metric / Quick-Access Cards (Mobile 1 col -> MD 3 cols) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Module A: Seeding */}
        <Link
          href="/campaigns"
          className="group p-5 sm:p-6 rounded-3xl bg-[#131418] border border-[#22242A] hover:border-blue-500/40 hover:bg-[#181A20] transition flex flex-col justify-between space-y-4 shadow-xl active:scale-[0.99]"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                <FolderKanban className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-zinc-400 group-hover:text-blue-400 transition flex items-center gap-1">
                관리 <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
              </span>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">MODULE A</span>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 mt-0.5">인플루언서 시딩</h2>
              <p className="text-xs text-zinc-400 mt-1">사전조사 • 신청폼 • 선정 • 송장추적 • PDF보고서</p>
            </div>
          </div>

          <div className="pt-3 border-t border-[#22242A] flex items-center justify-between">
            <span className="text-xs text-zinc-400">진행 중인 캠페인</span>
            <span className="text-lg font-bold text-blue-400">{totalCampaigns}건</span>
          </div>
        </Link>

        {/* Module B: Events */}
        <Link
          href="/events"
          className="group p-5 sm:p-6 rounded-3xl bg-[#131418] border border-[#22242A] hover:border-indigo-500/40 hover:bg-[#181A20] transition flex flex-col justify-between space-y-4 shadow-xl active:scale-[0.99]"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                <PartyPopper className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-zinc-400 group-hover:text-indigo-400 transition flex items-center gap-1">
                관리 <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
              </span>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">MODULE B</span>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 mt-0.5">인플루언서 행사</h2>
              <p className="text-xs text-zinc-400 mt-1">VIP 모바일 초청장 • RSVP 응답 • 현장 체크인</p>
            </div>
          </div>

          <div className="pt-3 border-t border-[#22242A] flex items-center justify-between">
            <span className="text-xs text-zinc-400">등록된 오프라인 행사</span>
            <span className="text-lg font-bold text-indigo-400">{totalEvents}건</span>
          </div>
        </Link>

        {/* Module C: SNS */}
        <Link
          href="/sns"
          className="group p-5 sm:p-6 rounded-3xl bg-[#131418] border border-[#22242A] hover:border-sky-500/40 hover:bg-[#181A20] transition flex flex-col justify-between space-y-4 shadow-xl sm:col-span-2 lg:col-span-1 active:scale-[0.99]"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
                <Camera className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-zinc-400 group-hover:text-sky-400 transition flex items-center gap-1">
                관리 <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
              </span>
            </div>
            <div>
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">MODULE C</span>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 mt-0.5">SNS 채널 운영</h2>
              <p className="text-xs text-zinc-400 mt-1">콘텐츠 기획 • Gemini AI 캡션 • 광고주 시안 검수</p>
            </div>
          </div>

          <div className="pt-3 border-t border-[#22242A] flex items-center justify-between">
            <span className="text-xs text-zinc-400">기획 및 발행 콘텐츠</span>
            <span className="text-lg font-bold text-sky-400">{totalPosts}건</span>
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