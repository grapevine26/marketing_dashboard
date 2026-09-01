"use client";

import { useTheme } from "./ThemeProvider";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === "dark" ? "화이트(라이트) 모드로 전환" : "웜 차콜 다크 모드로 전환"}
      className="flex items-center justify-between w-full p-2.5 rounded-xl bg-[#181A20] hover:bg-[#22242A] border border-[#22242A] text-xs font-semibold transition active:scale-95 text-zinc-300 hover:text-white"
    >
      <div className="flex items-center gap-2">
        {theme === "dark" ? (
          <Moon className="w-3.5 h-3.5 text-amber-400" />
        ) : (
          <Sun className="w-3.5 h-3.5 text-blue-500" />
        )}
        <span>{theme === "dark" ? "웜 차콜 다크" : "클린 화이트"}</span>
      </div>
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#131418] border border-[#22242A] text-zinc-400">
        {theme === "dark" ? "Dark" : "Light"}
      </span>
    </button>
  );
}