"use client";

import { useState } from "react";
import Theme1MidnightNavy from "./Style1OpsConsole";
import Theme2GraphiteEmerald from "./Style2EditorialStudio";
import Theme3VelvetViolet from "./Style3ObsidianGlass";
import { Palette, Moon, Sparkles, Check } from "lucide-react";

export default function DesignPreviewPage() {
  const [activeTab, setActiveTab] = useState<"navy" | "graphite" | "violet">("navy");

  const themes = [
    {
      id: "navy",
      name: "1. 미드나잇 네이비 & 인디고",
      desc: "Linear / GitHub Dark 스타일: 차분하고 눈이 가장 편안한 블루-슬레이트 톤",
      badgeColor: "text-blue-400",
    },
    {
      id: "graphite",
      name: "2. 옵시디언 흑연 & 에메랄드",
      desc: "Raycast / Supabase 스타일: 깊은 흑연 블랙과 산뜻한 그린 포인트의 높은 시인성",
      badgeColor: "text-emerald-400",
    },
    {
      id: "violet",
      name: "3. 벨벳 차콜 & 소프트 바이올렛",
      desc: "Arc / Figma Dark 스타일: 트렌디하고 감각적인 웜 차콜과 라벤더/로즈 톤",
      badgeColor: "text-violet-400",
    },
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
          <Palette className="w-3.5 h-3.5" />
          <span>다크모드 색감 3종 비교 갤러리</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-2">
          현재 대시보드 구조 그대로! 눈이 편안한 다크모드 색감 3종
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          현재 구현된 대시보드 레이아웃을 100% 유지하면서, <strong>배경 깊이감, 카드 명암비, 포인트 컬러</strong>만 최적화한 3가지 테마입니다.
        </p>
      </div>

      {/* Theme Switcher Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {themes.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`p-4 rounded-2xl text-left border transition flex flex-col justify-between space-y-2 ${
                isActive
                  ? "bg-slate-900 border-blue-500 shadow-lg shadow-blue-500/10"
                  : "bg-slate-950 border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-bold text-xs ${t.badgeColor}`}>{t.name}</span>
                {isActive && <Check className="w-4 h-4 text-blue-400" />}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">{t.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Render Active Style Preview */}
      <div className="pt-2">
        {activeTab === "navy" && <Theme1MidnightNavy />}
        {activeTab === "graphite" && <Theme2GraphiteEmerald />}
        {activeTab === "violet" && <Theme3VelvetViolet />}
      </div>
    </div>
  );
}