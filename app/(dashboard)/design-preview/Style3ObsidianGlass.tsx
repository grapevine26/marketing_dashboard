"use client";

import {
  Calendar,
  FolderKanban,
  PartyPopper,
  Camera,
  ArrowRight,
  TrendingUp,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

export default function StyleCBentoModular() {
  return (
    <div className="bg-slate-950 text-slate-100 p-6 sm:p-8 rounded-3xl border border-slate-800 space-y-6 shadow-2xl font-sans">
      {/* Top Banner with Quick Actions */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-purple-900/40 border border-blue-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">에이전시 올인원 마케팅 관제 허브</h2>
          <p className="text-xs text-slate-300 mt-1">
            출근 후 오늘 해야 할 시딩 마감 체크, 행사 RSVP 관리, SNS 발행 일정을 한눈에 처리하세요.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition">
            + 캠페인 생성
          </button>
        </div>
      </div>

      {/* 4-Bento Modular Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* Bento 1: Large Timeline & Calendar Widget (Spans 2 cols) */}
        <div className="md:col-span-2 lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              <span>이번 주 주요 마케팅 일정</span>
            </h3>
            <span className="text-xs text-blue-400 hover:underline cursor-pointer">전체 일정 →</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-pink-400" />
                <div>
                  <div className="font-semibold text-white">[SNS] 3초 속건조 탈출 릴스 발행</div>
                  <div className="text-[11px] text-slate-400">글로우랩 공식 인스타그램 (@glowlab_official)</div>
                </div>
              </div>
              <span className="font-mono text-pink-400 font-semibold">09/02 18:00</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <div>
                  <div className="font-semibold text-white">[시딩] 이지은 외 3명 콘텐츠 업로드 마감</div>
                  <div className="text-[11px] text-slate-400">하이드라 세럼 런칭 시딩</div>
                </div>
              </div>
              <span className="font-mono text-amber-400 font-semibold">D-3 (09/10)</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-purple-400" />
                <div>
                  <div className="font-semibold text-white">[행사] 2026 F/W 런칭 VIP 프라이빗 파티</div>
                  <div className="text-[11px] text-slate-400">성수 보테가 2F (참석 28명 확정)</div>
                </div>
              </div>
              <span className="font-mono text-purple-400 font-semibold">09/15 18:00</span>
            </div>
          </div>
        </div>

        {/* Bento 2: Quick Metrics Card */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 flex flex-col justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-medium">실시간 업로드 완주율</span>
            <div className="text-3xl font-extrabold text-white">96.8%</div>
            <p className="text-[11px] text-emerald-400 font-medium">▲ 전월 대비 +4.8% 상승</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
            총 150건 중 145건 완료 • 지연 5건
          </div>
        </div>

        {/* Bento 3: Urgent Checklist */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>오늘의 업무</span>
              </span>
              <span className="text-amber-400 font-semibold">2건</span>
            </div>
            <div className="mt-3 space-y-2 text-xs">
              <div className="p-2 rounded-lg bg-slate-950 text-slate-300 text-[11px]">
                • 시딩 D-3 리마인드 카톡 발송
              </div>
              <div className="p-2 rounded-lg bg-slate-950 text-slate-300 text-[11px]">
                • 행사 VIP 게스트 추가 2명 배정
              </div>
            </div>
          </div>
          <button className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition">
            전체 체크리스트 열기
          </button>
        </div>
      </div>
    </div>
  );
}