import {
  getCampaigns,
  getEvents,
  getSnsPosts,
  getSnsChannels,
  getUnifiedSchedule,
} from "@/lib/db";
import Link from "next/link";
import {
  Calendar,
  FolderKanban,
  PartyPopper,
  Camera,
  Sparkles,
  ArrowRight,
  Clock,
  CheckCircle2,
  TrendingUp,
  Settings,
  Palette,
  Building2,
} from "lucide-react";
import UnifiedCalendarWidget from "./UnifiedCalendarWidget";

export const revalidate = 0;

export default async function HomePage() {
  const [campaigns, events, posts, channels, scheduleItems] = await Promise.all([
    getCampaigns(),
    getEvents(),
    getSnsPosts(),
    getSnsChannels(),
    getUnifiedSchedule(),
  ]);

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/60 flex flex-col p-4 space-y-6 shrink-0 hidden md:flex">
        <div className="px-2 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20">
              M
            </div>
            <div>
              <span className="font-bold text-white text-sm">마케팅 올인원</span>
              <span className="ml-1.5 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                PRO
              </span>
            </div>
          </Link>
        </div>

        <nav className="flex-1 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            통합 관제
          </div>
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white shadow-sm transition"
          >
            <Calendar className="w-4 h-4" />
            <span>오버뷰 / 통합 캘린더</span>
          </Link>
          <Link
            href="/design-preview"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-indigo-300 bg-indigo-950/40 border border-indigo-900/50 hover:text-white hover:bg-indigo-900/50 transition"
          >
            <Palette className="w-4 h-4 text-indigo-400" />
            <span>🎨 대시보드 시안 3종 비교</span>
          </Link>

          <div className="pt-5 px-3 pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            마케팅 실행 모듈
          </div>
          <Link
            href="/campaigns"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition"
          >
            <FolderKanban className="w-4 h-4 text-amber-400" />
            <span>A. 인플루언서 시딩</span>
          </Link>
          <Link
            href="/events"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition"
          >
            <PartyPopper className="w-4 h-4 text-purple-400" />
            <span>B. 인플루언서 행사 (RSVP)</span>
          </Link>
          <Link
            href="/sns"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition"
          >
            <Camera className="w-4 h-4 text-pink-400" />
            <span>C. SNS 채널 운영</span>
          </Link>

          <div className="pt-5 px-3 pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            에이전시 설정
          </div>
          <Link
            href="/settings/pre-survey"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition"
          >
            <Settings className="w-4 h-4 text-indigo-400" />
            <span>사전조사 템플릿 관리</span>
          </Link>
        </nav>

        <div className="pt-4 border-t border-slate-800 space-y-3">
          <div className="p-3 rounded-2xl bg-indigo-950/30 border border-indigo-900/40 text-[11px] space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-indigo-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Gemini AI 활성화</span>
            </div>
            <p className="text-slate-400 leading-relaxed text-[10px]">
              사전조사 추천 • 모집글 작성 • SNS 캡션 생성을 지원합니다.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto space-y-8">
          {/* Top Banner */}
          <div className="p-8 rounded-3xl bg-gradient-to-r from-blue-950/70 via-slate-900 to-indigo-950/60 border border-indigo-800/30 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-2xl">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Marketing Agency All-In-One Hub</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                통합 마케팅 오버뷰 & 전체 일정
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">
                인플루언서 시딩(A), 오프라인 행사(B), 브랜드 SNS 운영(C)의 모든 일정과 성과를 한곳에서 관제하세요.
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Link
                href="/design-preview"
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-md transition flex items-center gap-1.5"
              >
                <Palette className="w-4 h-4" />
                <span>🎨 시안 3종 비교</span>
              </Link>
              <Link
                href="/campaigns/new"
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition"
              >
                + 새 시딩
              </Link>
              <Link
                href="/events"
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md transition"
              >
                + 새 행사
              </Link>
              <Link
                href="/sns"
                className="px-4 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold shadow-md transition"
              >
                + 새 SNS
              </Link>
            </div>
          </div>

          {/* KPI Metrics 3-Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Card 1: Seeding */}
            <Link
              href="/campaigns"
              className="p-5 rounded-3xl bg-slate-900 border border-slate-800 hover:border-blue-500/40 transition space-y-3 group"
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <FolderKanban className="w-5 h-5" />
                </div>
                <span className="text-xs text-blue-400 font-semibold group-hover:translate-x-0.5 transition flex items-center gap-0.5">
                  관리 <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 font-medium">A. 인플루언서 시딩</span>
                <div className="text-2xl font-extrabold text-white mt-0.5">
                  {campaigns.length}개 캠페인
                </div>
              </div>
              <p className="text-[11px] text-slate-500">사전조사, 신청폼, 시딩시트, 결과보고서</p>
            </Link>

            {/* Card 2: Events */}
            <Link
              href="/events"
              className="p-5 rounded-3xl bg-slate-900 border border-slate-800 hover:border-purple-500/40 transition space-y-3 group"
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                  <PartyPopper className="w-5 h-5" />
                </div>
                <span className="text-xs text-purple-400 font-semibold group-hover:translate-x-0.5 transition flex items-center gap-0.5">
                  관리 <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 font-medium">B. 오프라인 행사</span>
                <div className="text-2xl font-extrabold text-white mt-0.5">
                  {events.length}개 행사 등록
                </div>
              </div>
              <p className="text-[11px] text-slate-500">모바일 RSVP, 명단 관리, 현장 체크인</p>
            </Link>

            {/* Card 3: SNS */}
            <Link
              href="/sns"
              className="p-5 rounded-3xl bg-slate-900 border border-slate-800 hover:border-pink-500/40 transition space-y-3 group"
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-pink-500/10 text-pink-400 flex items-center justify-center">
                  <Camera className="w-5 h-5" />
                </div>
                <span className="text-xs text-pink-400 font-semibold group-hover:translate-x-0.5 transition flex items-center gap-0.5">
                  관리 <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 font-medium">C. SNS 채널 운영</span>
                <div className="text-2xl font-extrabold text-white mt-0.5">
                  {posts.length}개 콘텐츠 기획
                </div>
              </div>
              <p className="text-[11px] text-slate-500">AI 캡션 작성, 캘린더, 광고주 컨펌 링크</p>
            </Link>
          </div>

          {/* Unified Calendar Widget */}
          <UnifiedCalendarWidget scheduleItems={scheduleItems} />
        </main>
      </div>
    </div>
  );
}