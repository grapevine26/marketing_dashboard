import Link from "next/link";
import { FolderKanban, PlusCircle, Settings, Home, Sparkles, PartyPopper, Camera, Calendar, Palette } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-[#090A0C] text-zinc-100 font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-[#22242A] bg-[#0D0E12] flex flex-col p-4 space-y-6 shrink-0">
        <div className="px-2 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center font-bold text-white shadow-md shadow-emerald-500/20">
              M
            </div>
            <div>
              <span className="font-bold text-zinc-100 text-sm tracking-tight">마케팅 올인원</span>
              <span className="ml-1.5 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                PRO
              </span>
            </div>
          </Link>
        </div>

        <nav className="flex-1 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            통합 관제
          </div>
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white hover:bg-[#181A20] transition"
          >
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span>오버뷰 / 통합 캘린더</span>
          </Link>
          <Link
            href="/design-preview"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-emerald-400 bg-emerald-950/20 border border-emerald-900/30 hover:bg-emerald-900/30 transition"
          >
            <Palette className="w-4 h-4 text-emerald-400" />
            <span>🎨 색감 테마 비교</span>
          </Link>

          <div className="pt-5 px-3 pb-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            마케팅 실행 모듈
          </div>
          <Link
            href="/campaigns"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white hover:bg-[#181A20] transition"
          >
            <FolderKanban className="w-4 h-4 text-emerald-400" />
            <span>A. 인플루언서 시딩</span>
          </Link>
          <Link
            href="/events"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white hover:bg-[#181A20] transition"
          >
            <PartyPopper className="w-4 h-4 text-amber-400" />
            <span>B. 인플루언서 행사 (RSVP)</span>
          </Link>
          <Link
            href="/sns"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white hover:bg-[#181A20] transition"
          >
            <Camera className="w-4 h-4 text-teal-400" />
            <span>C. SNS 채널 운영</span>
          </Link>

          <div className="pt-5 px-3 pb-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            에이전시 설정
          </div>
          <Link
            href="/settings/pre-survey"
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white hover:bg-[#181A20] transition"
          >
            <Settings className="w-4 h-4 text-zinc-400" />
            <span>사전조사 템플릿 관리</span>
          </Link>
        </nav>

        <div className="pt-4 border-t border-[#22242A] space-y-3">
          <div className="p-3 rounded-2xl bg-[#131418] border border-[#22242A] text-[11px] space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-emerald-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Gemini AI 활성화</span>
            </div>
            <p className="text-zinc-400 leading-relaxed text-[10px]">
              사전조사 추천 • 모집글 작성 • SNS 캡션 생성을 지원합니다.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}