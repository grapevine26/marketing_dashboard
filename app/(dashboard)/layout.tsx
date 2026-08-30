import Link from "next/link";
import { FolderKanban, PlusCircle, Settings, Home, Sparkles, PartyPopper, Camera, Calendar } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/60 flex flex-col p-4 space-y-6 shrink-0">
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
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition"
          >
            <Calendar className="w-4 h-4 text-blue-400" />
            <span>오버뷰 / 통합 캘린더</span>
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
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}