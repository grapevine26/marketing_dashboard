"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderKanban,
  Calendar,
  PartyPopper,
  Camera,
  Menu,
  X,
  ChevronRight,
  Presentation,
  Sliders,
  BookOpen,
} from "lucide-react";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import RefreshOnFocus from "@/components/RefreshOnFocus";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const navItems = [
    {
      group: "통합 일정",
      items: [
        {
          name: "통합 오버뷰 & 캘린더",
          href: "/",
          icon: Calendar,
          color: "text-blue-500",
        },
      ],
    },
    {
      group: "마케팅 프로젝트",
      items: [
        {
          name: "인플루언서 시딩",
          href: "/campaigns",
          icon: FolderKanban,
          color: "text-blue-500",
        },
        {
          name: "인플루언서 행사",
          href: "/events",
          icon: PartyPopper,
          color: "text-indigo-500",
        },
        {
          name: "SNS 채널 운영",
          href: "/sns",
          icon: Camera,
          color: "text-accent2",
        },
      ],
    },
    {
      group: "템플릿 설정",
      items: [
        {
          name: "사전조사 · SNS 사전설문",
          href: "/settings/templates",
          icon: Sliders,
          color: "text-text-sub",
        },
        {
          name: "공유 PPT 보관함",
          href: "/settings/ppt-templates",
          icon: Presentation,
          color: "text-text-sub",
        },
      ],
    },
    {
      group: "가이드",
      items: [
        {
          name: "사용법 & 매뉴얼",
          href: "/guide",
          icon: BookOpen,
          color: "text-text-sub",
        },
      ],
    },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/events") {
      return pathname.startsWith("/events") || pathname.includes("/events");
    }
    if (href === "/campaigns") {
      return pathname.startsWith("/campaigns") && !pathname.includes("/events");
    }
    return pathname.startsWith(href);
  };

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <div className="min-h-screen flex flex-col md:flex-row font-sans antialiased transition-colors duration-200">
      {/* 탭으로 돌아오면 화면을 최신으로 다시 불러온다. 화면에는 아무것도 그리지 않는다. */}
      <RefreshOnFocus />

      {/* Mobile Top Header */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-sidebar/95 backdrop-blur-md border-b border-border">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center font-bold text-accent-on text-xs shadow-sm">
            M
          </div>
          <span className="font-bold text-text text-sm tracking-tight">마케팅 올인원</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="메뉴 열기"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl bg-surface border border-border text-text-sub hover:text-text active:scale-95 transition"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Slide-over Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs md:hidden"
          onClick={closeMenu}
        />
      )}

      {/* Sidebar Drawer */}
      <aside
        className={`fixed md:sticky top-0 bottom-0 left-0 z-50 w-72 md:w-64 border-r border-border bg-sidebar flex flex-col p-4 space-y-5 shrink-0 transition-transform duration-300 ease-in-out md:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0"
        } h-screen overflow-y-auto`}
      >
        {/* Sidebar Brand Header */}
        <div className="px-2 flex items-center justify-between">
          <Link href="/" onClick={closeMenu} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center font-bold text-accent-on shadow-sm">
              M
            </div>
            <div>
              <span className="font-bold text-text text-sm tracking-tight">마케팅 올인원</span>
            </div>
          </Link>

          {/* Close button inside mobile drawer */}
          <button
            type="button"
            onClick={closeMenu}
            className="md:hidden p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 space-y-5">
          {navItems.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1">
              <div className="px-3 pb-1 text-[10px] font-bold text-text-muted uppercase tracking-wider">
                {group.group}
              </div>
              {group.items.map((item, iIdx) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={iIdx}
                    href={item.href}
                    onClick={closeMenu}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                      active
                        ? "bg-accent/15 border border-accent/30 text-accent shadow-sm"
                        : "text-text-sub hover:text-text hover:bg-surface2"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${active ? "text-accent" : item.color}`} />
                      <span>{item.name}</span>
                    </div>
                    {active && <ChevronRight className="w-3.5 h-3.5 text-accent" />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Theme Switcher Toggle at Bottom */}
        <div className="pt-3 border-t border-border">
          <ThemeToggleButton />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-16 md:pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}