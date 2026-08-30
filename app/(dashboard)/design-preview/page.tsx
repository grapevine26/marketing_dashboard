"use client";

import { useState } from "react";
import Theme1GraphiteBlue from "./Style1OpsConsole";
import Theme2GraphiteViolet from "./Style2EditorialStudio";
import Theme3GraphiteAmber from "./Style3ObsidianGlass";
import { Palette, Sparkles, Check } from "lucide-react";

export default function DesignPreviewPage() {
  const [activeTab, setActiveTab] = useState<"blue" | "violet" | "amber">("blue");

  const themes = [
    {
      id: "blue",
      name: "1. 흑연 + 일렉트릭 블루",
      desc: "Vercel / Linear 스타일: 가장 정갈하고 신뢰감이 높으며 눈이 편안한 모던 블루",
      badgeColor: "text-blue-400",
      dotBg: "bg-blue-500",
    },
    {
      id: "violet",
      name: "2. 흑연 + 소프트 바이올렛",
      desc: "Figma / Arc 스타일: 트렌디하고 감각적인 라벤더/로즈 톤의 크리에이티브 에이전시 무드",
      badgeColor: "text-violet-400",
      dotBg: "bg-violet-500",
    },
    {
      id: "amber",
      name: "3. 흑연 + 웜 앰버 골드",
      desc: "Supabase / 따뜻한 골드톤: 눈부심이 전혀 없고 가독성이 가장 안정적인 웜 차콜",
      badgeColor: "text-amber-400",
      dotBg: "bg-amber-500",
    },
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#131418] border border-[#22242A] text-zinc-300 text-xs font-semibold">
          <Palette className="w-3.5 h-3.5 text-zinc-400" />
          <span>옵시디언 흑연 베이스 • 액센트 컬러 3종 비교</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-100 mt-2">
          옵시디언 흑연 다크 베이스 + 포인트 컬러 3종
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-1">
          마음에 들어하신 <strong>옵시디언 흑연 블랙(#090A0C)</strong>을 바탕으로, 눈이 가장 편안한 3가지 액센트 컬러를 비교해보세요.
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
                  ? "bg-[#131418] border-[#3B82F6] shadow-lg shadow-blue-500/10"
                  : "bg-[#090A0C] border-[#22242A] hover:border-[#353942] opacity-75 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${t.dotBg}`} />
                  <span className={`font-bold text-xs ${t.badgeColor}`}>{t.name}</span>
                </div>
                {isActive && <Check className="w-4 h-4 text-blue-400" />}
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">{t.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Render Active Style Preview */}
      <div className="pt-2">
        {activeTab === "blue" && <Theme1GraphiteBlue />}
        {activeTab === "violet" && <Theme2GraphiteViolet />}
        {activeTab === "amber" && <Theme3GraphiteAmber />}
      </div>
    </div>
  );
}