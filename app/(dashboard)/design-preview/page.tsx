"use client";

import { useState } from "react";
import StyleAEnterpriseLight from "./Style1OpsConsole";
import StyleBLinearDark from "./Style2EditorialStudio";
import StyleCBentoModular from "./Style3ObsidianGlass";
import { LayoutGrid, Moon, Sun, Layers, Check } from "lucide-react";

export default function DesignPreviewPage() {
  const [activeTab, setActiveTab] = useState<"light" | "dark" | "bento">("dark");

  const styles = [
    {
      id: "light",
      name: "시안 A: Enterprise Clean Light",
      desc: "Stripe / 토스 스타일의 신뢰감 있고 깔끔한 화이트 실무 대시보드",
      icon: Sun,
      color: "text-amber-500",
    },
    {
      id: "dark",
      name: "시안 B: Linear Pro Dark",
      desc: "Linear / Vercel 스타일의 직관적인 다크 테마 & 프로그레스 지표",
      icon: Moon,
      color: "text-blue-400",
    },
    {
      id: "bento",
      name: "시안 C: Bento Grid Modular Hub",
      desc: "타임라인 캘린더 + 실시간 위젯이 결합된 모던 벤토 그리드 허브",
      icon: LayoutGrid,
      color: "text-purple-400",
    },
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
          <Layers className="w-3.5 h-3.5" />
          <span>UI/UX Pro Max • 실무 중심 대시보드 3종</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2">
          실제 실무용 대시보드 UI/UX 시안 3종 비교
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          에이전시 마케터가 매일 보면서 업무를 처리하기에 가장 직관적이고 효율적인 3가지 대시보드 레이아웃입니다.
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
        {activeTab === "light" && <StyleAEnterpriseLight />}
        {activeTab === "dark" && <StyleBLinearDark />}
        {activeTab === "bento" && <StyleCBentoModular />}
      </div>
    </div>
  );
}