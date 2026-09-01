"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderKanban,
  Settings,
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
          color: "text-blue-400",
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
          color: "text-blue-400",
        },
        {
          name: "인플루언서 행사",
          href: "/events",
          icon: PartyPopper,
          color: "text-indigo-400",
        },
        {
          name: "SNS 채널 운영",
          href: "/sns",
          icon: Camera,
          color: "text-sky-400",
        },
      ],
    },
    {
      group: "환경설정 & 템플릿",
      items: [
        {
          name: "사전조사 기본 템플릿",
          href: "/settings/pre-survey",
          icon: Settings,
          color: "text-zinc-400",
        },
        {
          name: "SNS 사전설문 기본틀",
          href: "/settings/sns-intake",
          icon: Sliders,
          color: "text-sky-400",
        },
        {
          name: "공유 PPT 템플릿 보관함",
          href: "/settings/ppt-templates",
          icon: Presentation,
          color: "text-amber-400",
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
          color: "text-emerald-400",
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
    <div className="min-h-screen flex flex-col md:flex-row bg-[#121316] text-zinc-100 font-sans antialiased transition-colors duration-200">
      {/* Mobile Top Header */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-[#16171B]/95 backdrop-blur-md border-b border-[#22242A]">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center font-bold text-white text-xs shadow-md shadow-purple-500/20">
            M
          </div>
          <span className="font-bold text-zinc-100 text-sm tracking-tight">마케팅 올인원</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="메뉴 열기"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl bg-[#191B20] border border-[#22242A] text-zinc-300 hover:text-white active:scale-95 transition"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Slide-over Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs md:hidden"
          onClick={closeMenu}
        />
      )}

      {/* Sidebar Drawer */}
      <aside
        className={`fixed md:sticky top-0 bottom-0 left-0 z-50 w-72 md:w-64 border-r border-[#22242A] bg-[#16171B] flex flex-col p-4 space-y-5 shrink-0 transition-transform duration-300 ease-in-out md:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0"
        } h-screen overflow-y-auto`}
      >
        {/* Sidebar Brand Header */}
        <div className="px-2 flex items-center justify-between">
          <Link href="/" onClick={closeMenu} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-md shadow-purple-500/20">
              M
            </div>
            <div>
              <span className="font-bold text-zinc-100 text-sm tracking-tight">마케팅 올인원</span>
            </div>
          </Link>

          {/* Close button inside mobile drawer */}
          <button
            type="button"
            onClick={closeMenu}
            className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#21232B]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 space-y-5">
          {navItems.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1">
              <div className="px-3 pb-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
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
                        ? "bg-purple-600/15 border border-purple-500/30 text-purple-400 shadow-sm"
                        : "text-zinc-300 hover:text-white hover:bg-[#21232B]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${active ? "text-purple-400" : item.color}`} />
                      <span>{item.name}</span>
                    </div>
                    {active && <ChevronRight className="w-3.5 h-3.5 text-purple-400" />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Theme Switcher Toggle at Bottom */}
        <div className="pt-3 border-t border-[#22242A]">
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