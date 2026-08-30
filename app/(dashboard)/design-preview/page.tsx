"use client";

import { useState } from "react";
import Style1OpsConsole from "./Style1OpsConsole";
import Style2EditorialStudio from "./Style2EditorialStudio";
import Style3ObsidianGlass from "./Style3ObsidianGlass";
import { Layers, Terminal, Sparkles, Zap, Check } from "lucide-react";

export default function DesignPreviewPage() {
  const [activeTab, setActiveTab] = useState<"style1" | "style2" | "style3">("style3");

  const styles = [
    {
      id: "style1",
      name: "시안 1: Cyber-Dense Ops Terminal",
      desc: "고밀도 모노스페이스 트레이딩/운영 터미널 (시스템 관제 최적화)",
      icon: Terminal,
      color: "border-emerald-500 text-emerald-400",
    },
    {
      id: "style2",
      name: "시안 2: Editorial Agency Studio",
      desc: "크리에이티브 에이전시 매거진 (우아한 세리프 & 넉넉한 여백)",
      icon: Sparkles,
      color: "border-amber-500 text-amber-400",
    },
    {
      id: "style3",
      name: "시안 3: Obsidian Linear Glass",
      desc: "모던 다크 글래스모피즘 SaaS (네온 글로우 & 뎁스 레이어)",
      icon: Zap,
      color: "border-blue-500 text-blue-400",
    },
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
          <Layers className="w-3.5 h-3.5" />
          <span>UI/UX Pro Max • 3 Distinct Design Personas</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2">
          대시보드 디자인 시안 3종 비교 갤러리
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          단순한 색상 변경이 아닌, <strong>타이포그래피, 정보 밀도, 인터랙션 구조</strong>가 완전히 다른 3가지 디자인 철학을 확인해보세요.
        </p>
      </div>

      {/* Style Switcher Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {styles.map((s) => {
          const Icon = s.icon;
          const isActive = activeTab === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveTab(s.id as any)}
              className={`p-4 rounded-2xl text-left border transition flex flex-col justify-between space-y-2 ${
                isActive
                  ? "bg-slate-900 border-blue-500 shadow-lg shadow-blue-500/10"
                  : "bg-slate-950 border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${s.color}`} />
                  <span className="font-bold text-white text-xs">{s.name}</span>
                </div>
                {isActive && <Check className="w-4 h-4 text-blue-400" />}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">{s.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Render Active Style Preview */}
      <div className="pt-2">
        {activeTab === "style1" && <Style1OpsConsole />}
        {activeTab === "style2" && <Style2EditorialStudio />}
        {activeTab === "style3" && <Style3ObsidianGlass />}
      </div>
    </div>
  );
}