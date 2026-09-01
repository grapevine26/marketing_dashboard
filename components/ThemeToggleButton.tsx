"use client";

import { useTheme } from "./ThemeProvider";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="p-3 rounded-2xl bg-[#191B20] border border-[#22242A] space-y-2 font-sans">
      <div className="flex items-center justify-between text-[11px] text-zinc-400 font-medium">
        <span>화면 테마 모드</span>
        <span className="font-bold text-zinc-300">
          {theme === "dark" ? "다크 (웜 차콜)" : "화이트 (클린)"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#121316] border border-[#22242A]">
        <button
          type="button"
          onClick={() => theme !== "dark" && toggleTheme()}
          className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            theme === "dark"
              ? "bg-[#21232B] text-amber-300 shadow-sm border border-[#292B34]"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Moon className="w-3.5 h-3.5" />
          <span>다크</span>
        </button>

        <button
          type="button"
          onClick={() => theme !== "light" && toggleTheme()}
          className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            theme === "light"
              ? "bg-white text-blue-600 shadow-sm border border-slate-200"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Sun className="w-3.5 h-3.5" />
          <span>화이트</span>
        </button>
      </div>
    </div>
  );
}