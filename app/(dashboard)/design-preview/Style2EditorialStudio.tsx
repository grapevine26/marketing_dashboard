"use client";

import {
  TrendingUp,
  CheckCircle2,
  Calendar,
  Eye,
  Users,
  Search,
  Filter,
  ArrowRight,
  Clock,
  Sparkles,
  ChevronDown,
} from "lucide-react";

export default function StyleBLinearDark() {
  return (
    <div className="bg-[#0D1117] text-slate-100 p-8 rounded-3xl border border-slate-800 space-y-6 shadow-2xl font-sans">
      {/* Top Bar with Filter & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              실무 마케팅 오퍼레이션 대시보드
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold">
              Live Ops
            </span>
          </div>
          <p className="text-xs text-slate-400">
            캠페인 파이프라인, 실시간 인플루언서 이행률 및 성과 지표
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <input
              type="text"
              placeholder="인플루언서 또는 캠페인 검색..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
          <button className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition">
            + 새 작업
          </button>
        </div>
      </div>

      {/* 4-KPI Metric Cards with Progress Bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>활성 시딩 캠페인</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">08개</div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>목표 달성률</span>
              <span className="text-blue-400 font-semibold">92%</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-blue-500 h-full w-[92%]" />
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>인플루언서 업로드율</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">96.4%</div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>150건 중 145건 완료</span>
              <span className="text-emerald-400 font-semibold">+4.2%</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full w-[96%]" />
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>총 누적 조회수 (Reach)</span>
            <Eye className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">4.12M</div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>전월 2.9M 대비</span>
              <span className="text-purple-400 font-semibold">▲ 42%</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-purple-500 h-full w-[85%]" />
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>오프라인 행사 RSVP</span>
            <Calendar className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">28 / 30명</div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>정원 마감률</span>
              <span className="text-amber-400 font-semibold">93.3%</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-amber-500 h-full w-[93%]" />
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline Funnel & Action Table */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">실시간 시딩 파이프라인 단계별 현황</h3>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>필터:</span>
            <button className="px-2 py-1 rounded bg-slate-800 text-white font-medium">전체</button>
            <button className="px-2 py-1 rounded hover:bg-slate-800 transition">D-Day 임박만</button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-3">캠페인 / 브랜드</th>
                <th className="p-3">구분</th>
                <th className="p-3">진행 단계</th>
                <th className="p-3">현황</th>
                <th className="p-3">마감 D-Day</th>
                <th className="p-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              <tr className="hover:bg-slate-800/40 transition">
                <td className="p-3 font-semibold text-white">
                  글로우랩 하이드라 세럼
                  <span className="block text-[11px] text-slate-400 font-normal">글로우랩 코스메틱</span>
                </td>
                <td className="p-3">
                  <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[11px]">배송형</span>
                </td>
                <td className="p-3">
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold text-[11px]">
                    가이드전달완료 ✓
                  </span>
                </td>
                <td className="p-3 text-slate-400">선정 24명 / 지원 128명</td>
                <td className="p-3 font-mono text-emerald-400 font-semibold">D-3 (09/10)</td>
                <td className="p-3 text-right">
                  <button className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[11px]">
                    시딩시트 열기
                  </button>
                </td>
              </tr>

              <tr className="hover:bg-slate-800/40 transition">
                <td className="p-3 font-semibold text-white">
                  성수 VIP 런칭 파티
                  <span className="block text-[11px] text-slate-400 font-normal">글로우랩 코스메틱</span>
                </td>
                <td className="p-3">
                  <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[11px]">오프라인</span>
                </td>
                <td className="p-3">
                  <span className="px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 font-semibold text-[11px]">
                    참석확정 28명
                  </span>
                </td>
                <td className="p-3 text-slate-400">정원 30명 (잔여 2석)</td>
                <td className="p-3 font-mono text-purple-400 font-semibold">09/15 (D-15)</td>
                <td className="p-3 text-right">
                  <button className="px-2.5 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 text-[11px]">
                    체크인 화면
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}