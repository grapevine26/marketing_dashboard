"use client";

import {
  Activity,
  Terminal,
  Server,
  Zap,
  Clock,
  ArrowUpRight,
  TrendingUp,
  AlertCircle,
  Database,
  Cpu,
} from "lucide-react";

export default function Style1OpsConsole() {
  return (
    <div className="font-mono text-xs text-emerald-400 bg-black p-6 rounded-2xl border border-emerald-900/60 space-y-5 shadow-2xl">
      {/* Top Terminal Status Header */}
      <div className="flex items-center justify-between pb-3 border-b border-emerald-950 text-[11px]">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bold text-emerald-300">OPS_CONSOLE // SYSTEM_ONLINE</span>
          <span className="text-emerald-700">| LATENCY: 12ms</span>
        </div>
        <div className="flex items-center gap-3 text-emerald-600">
          <span>KST 2026-08-31 12:56</span>
          <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/50 text-[10px]">
            ACTIVE CLUSTER: KR-SEOUL
          </span>
        </div>
      </div>

      {/* Metric Telemetry Grid */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 bg-emerald-950/20 border border-emerald-900/50 space-y-1">
          <div className="text-[10px] text-emerald-600 uppercase">ACTIVE_CAMPAIGNS</div>
          <div className="text-xl font-bold text-emerald-300">08_UNITS</div>
          <div className="text-[10px] text-emerald-500">▲ +12.4% vs LAST_CYCLE</div>
        </div>
        <div className="p-3 bg-emerald-950/20 border border-emerald-900/50 space-y-1">
          <div className="text-[10px] text-emerald-600 uppercase">SEEDING_FULFILLMENT</div>
          <div className="text-xl font-bold text-emerald-300">94.2%</div>
          <div className="text-[10px] text-emerald-500">142/150 DELIVERED</div>
        </div>
        <div className="p-3 bg-emerald-950/20 border border-emerald-900/50 space-y-1">
          <div className="text-[10px] text-emerald-600 uppercase">TOTAL_ENGAGEMENT</div>
          <div className="text-xl font-bold text-emerald-300">842.1K</div>
          <div className="text-[10px] text-emerald-500">RATE: 4.88% HIGH</div>
        </div>
        <div className="p-3 bg-emerald-950/20 border border-emerald-900/50 space-y-1">
          <div className="text-[10px] text-emerald-600 uppercase">PENDING_EVENTS_RSVP</div>
          <div className="text-xl font-bold text-emerald-300">28/30</div>
          <div className="text-[10px] text-amber-500">CAPACITY NEAR LIMIT</div>
        </div>
      </div>

      {/* Main Split Operations Panel */}
      <div className="grid grid-cols-3 gap-4">
        {/* Left: Dense Table */}
        <div className="col-span-2 p-4 bg-emerald-950/10 border border-emerald-900/40 space-y-3">
          <div className="flex items-center justify-between text-[11px] font-bold text-emerald-300">
            <span>[ REALTIME INFLUENCER PIPELINE ]</span>
            <span className="text-[10px] text-emerald-600">AUTO-REFRESH: 5S</span>
          </div>

          <table className="w-full text-left text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-emerald-900/50 text-emerald-600">
                <th className="py-1.5">ID</th>
                <th>INFLUENCER</th>
                <th>CHANNEL</th>
                <th>STATUS</th>
                <th>METRIC</th>
                <th>D-DAY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-950/60">
              <tr>
                <td className="py-1.5 text-emerald-700">#0921</td>
                <td className="text-emerald-200">@jieun_beauty</td>
                <td>IG_REELS</td>
                <td><span className="px-1.5 py-0.5 bg-emerald-900/40 text-emerald-300 text-[10px]">수령완료</span></td>
                <td>124.5K</td>
                <td className="text-emerald-400">D-2</td>
              </tr>
              <tr>
                <td className="py-1.5 text-emerald-700">#0922</td>
                <td className="text-emerald-200">@minseo_daily</td>
                <td>YOUTUBE</td>
                <td><span className="px-1.5 py-0.5 bg-blue-900/40 text-blue-300 text-[10px]">업로드완료</span></td>
                <td>48.2K</td>
                <td className="text-emerald-600">DONE</td>
              </tr>
              <tr>
                <td className="py-1.5 text-emerald-700">#0923</td>
                <td className="text-emerald-200">@haneul_style</td>
                <td>EVENT_VIP</td>
                <td><span className="px-1.5 py-0.5 bg-purple-900/40 text-purple-300 text-[10px]">RSVP_CONFIRMED</span></td>
                <td>PARTY:2</td>
                <td className="text-purple-400">D-15</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Right: Live Event Telemetry Stream */}
        <div className="p-4 bg-emerald-950/10 border border-emerald-900/40 space-y-3">
          <div className="text-[11px] font-bold text-emerald-300">[ SYSTEM LOG STREAM ]</div>
          <div className="space-y-2 text-[10px] text-emerald-500">
            <div className="flex items-start gap-1.5">
              <span className="text-emerald-700">12:54:02</span>
              <span>[RSVP] 김하늘 참석 응답 접수 (동반 1인)</span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="text-emerald-700">12:51:18</span>
              <span>[SNS] 릴스 기획안 광고주 승인 완료</span>
            </div>
            <div className="flex items-start gap-1.5 text-amber-400">
              <span className="text-emerald-700">12:48:50</span>
              <span>[ALERT] 이지은 업로드 D-2 임박 알림 발송</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}