"use client";

import React, { createContext, useContext, useSyncExternalStore } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  toggleTheme: () => {},
  setTheme: () => {},
});

const STORAGE_KEY = "marketing_theme";
const CHANGE_EVENT = "marketing-theme-change";

function readSaved(): Theme | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : null;
  } catch {
    return null;
  }
}

/** 테마 결정 순서: 저장된 선택 > 시스템(prefers-color-scheme) > dark. app/layout.tsx의 인라인 스크립트와 같은 로직. */
export function resolveInitialTheme(): Theme {
  const saved = readSaved();
  if (saved) return saved;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  root.setAttribute("data-theme", theme);
}

function subscribe(onChange: () => void) {
  const mq = window.matchMedia?.("(prefers-color-scheme: light)");
  const handleMq = () => {
    if (!readSaved()) {
      applyTheme(resolveInitialTheme());
      onChange();
    }
  };
  mq?.addEventListener?.("change", handleMq);
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    mq?.removeEventListener?.("change", handleMq);
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // 서버 스냅샷은 항상 "dark" (layout.tsx의 인라인 스크립트가 첫 페인트 전에 실제 테마 클래스를 적용한다)
  const theme = useSyncExternalStore(subscribe, resolveInitialTheme, () => "dark" as Theme);

  const setTheme = (newTheme: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      /* ignore */
    }
    applyTheme(newTheme);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
