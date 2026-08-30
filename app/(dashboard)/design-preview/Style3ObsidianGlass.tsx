"use client";

import { Sparkles, Zap, ArrowRight, Radio, Shield, Globe, Layers, BarChart3 } from "lucide-react";

export default function Style3ObsidianGlass() {
  return (
    <div className="bg-[#0B0F19] text-slate-100 p-8 rounded-3xl border border-slate-800/80 space-y-6 shadow-2xl relative overflow-hidden">
      {/* Background Neon Glow Orbs */}
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header with Glass Pill */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 backdrop-blur-md text-blue-400 text-xs font-semibold">
            <Zap className="w-3.5 h-3.5 text-blue-400" />
            <span>Next-Gen Marketing Command</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Linear Obsidian Hub
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-400 backdrop-blur-md">
            Live Stream Connected
          </div>
        </div>
      </div>

      {/* Glassmorphism Metric Cards */}
      <div className="grid grid-cols-4 gap-4 relative z-10">
        <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl space-y-2 hover:border-blue-500/40 transition">
          <span className="text-xs text-slate-400 font-medium">캠페인 ROI</span>
          <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">
            384%
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-blue-500 h-full w-4/5 rounded-full" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl space-y-2 hover:border-purple-500/40 transition">
          <span className="text-xs text-slate-400 font-medium">인플루언서 풀</span>
          <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-300">
            1,420명
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-purple-500 h-full w-3/4 rounded-full" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl space-y-2 hover:border-emerald-500/40 transition">
          <span className="text-xs text-slate-400 font-medium">콘텐츠 완주율</span>
          <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
            96.8%
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full w-11/12 rounded-full" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-xl space-y-2 hover:border-amber-500/40 transition">
          <span className="text-xs text-slate-400 font-medium">검수 승인 속도</span>
          <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-300">
            1.4시간
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-amber-500 h-full w-2/3 rounded-full" />
          </div>
        </div>
      </div>

      {/* Floating Action & Interactive Pipeline */}
      <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800/80 backdrop-blur-xl relative z-10 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Active Campaign Pipeline
          </span>
          <span className="text-xs text-blue-400 hover:underline cursor-pointer">
            전체 매트릭스 보기 →
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white font-bold">글로우랩 세럼</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px]">시딩 진행중</span>
            </div>
            <p className="text-xs text-slate-400">D-Day 임박 3건 • 송장 발송 100%</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white font-bold">성수 런칭 파티</span>
              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px]">RSVP 마감</span>
            </div>
            <p className="text-xs text-slate-400">정원 30명 중 28명 확정</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white font-bold">인스타 릴스 2차</span>
              <span className="px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 text-[10px]">광고주 컨펌</span>
            </div>
            <p className="text-xs text-slate-400">9월 2일 18:00 자동 발행 대기</p>
          </div>
        </div>
      </div>
    </div>
  );
}