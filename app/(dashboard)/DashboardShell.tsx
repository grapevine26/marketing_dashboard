"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
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
  Users,
  LogOut,
} from "lucide-react";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import RefreshOnFocus from "@/components/RefreshOnFocus";
import MoaLogo from "@/components/MoaLogo";
import InstallAppButton from "@/components/InstallAppButton";
import { isManager, type SessionUser } from "@/lib/auth/roles";
import { logoutAction } from "@/app/login/actions";

/**
 * 대시보드 껍데기(사이드바 + 본문).
 *
 * 인증 확인은 서버(`layout.tsx`)에서 끝내고, 여기는 그 결과를 props 로 받아 그리기만 한다.
 * 모바일 서랍 메뉴처럼 상태가 필요한 UI 가 있어 클라이언트 컴포넌트로 둔다.
 */
export default function DashboardShell({
  user,
  pendingCount,
  children,
}: {
  user: SessionUser;
  pendingCount: number;
  children: React.ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loggingOut, startLogout] = useTransition();
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    {
      group: "통합 일정",
      items: [
        {
          name: "오버뷰",
          href: "/",
          // 오버뷰는 카테고리가 아니라 셋을 모두 덮는 화면이라 색을 주지 않는다.
          // 파랑은 시딩, 남색은 행사, 분홍은 SNS 를 뜻하므로 여기에 쓰면 뜻이 어긋난다.
          // 설정·가이드(text-text-sub)보다는 한 단계 밝게 둬서 보조 메뉴로 보이지 않게 한다.
          icon: Calendar,
          color: "text-text-2",
        },
      ],
    },
    {
      group: "프로젝트",
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
          color: "text-teal-500",
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
          name: "공용 PPT 관리",
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
    // 사용자 관리는 관리자에게만 보인다. 승인 대기자가 있으면 개수를 배지로 알린다.
    ...(isManager(user.role)
      ? [
          {
            group: "관리",
            items: [
              {
                name: "사용자 관리",
                href: "/settings/users",
                icon: Users,
                color: "text-text-sub",
                badge: pendingCount > 0 ? pendingCount : undefined,
              },
              {
                name: "활동 기록",
                href: "/settings/activity",
                icon: Activity,
                color: "text-text-sub",
              },
            ],
          },
        ]
      : []),
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

  const handleLogout = () => {
    startLogout(async () => {
      await logoutAction();
      // 로그아웃 후에는 캐시된 화면이 남지 않도록 주소를 바꾸고 서버에서 다시 받아온다.
      router.replace("/login");
      router.refresh();
    });
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row font-sans antialiased transition-colors duration-200">
      {/* 탭으로 돌아오면 화면을 최신으로 다시 불러온다. 화면에는 아무것도 그리지 않는다. */}
      <RefreshOnFocus />

      {/* Mobile Top Header */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-sidebar/95 backdrop-blur-md border-b border-border">
        <Link href="/" className="flex items-center">
          <MoaLogo size={18} />
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
          <Link href="/" onClick={closeMenu} className="flex items-center">
            <MoaLogo size={20} />
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
                const badge = "badge" in item ? item.badge : undefined;
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
                    <div className="flex items-center gap-1.5">
                      {badge !== undefined && (
                        <span className="px-2 py-0.5 rounded-full bg-accent2/10 text-accent2 border border-accent2/20 text-[10px] font-bold font-mono">
                          {badge}
                        </span>
                      )}
                      {active && <ChevronRight className="w-3.5 h-3.5 text-accent" />}
                    </div>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Current User & App Install & Theme Switcher at Bottom */}
        <div className="pt-3 border-t border-border space-y-2">
          {/* 현재 로그인한 사람. 여러 계정을 쓰는 환경이라 누구로 들어와 있는지 늘 보이게 둔다. */}
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-surface border border-border">
            <div className="min-w-0">
              {/* 이름을 누르면 내 정보로 간다. 등급과 무관하게 누구나 자기 것은 볼 수 있다. */}
              <Link
                href="/settings/profile"
                onClick={closeMenu}
                className="block group/me"
                title="내 정보"
              >
                <div className="text-xs font-bold text-text truncate group-hover/me:text-accent2 transition">
                  {user.display_name}
                </div>
                <div className="text-[10px] font-mono text-text-muted truncate">@{user.username}</div>
              </Link>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              title="로그아웃"
              aria-label="로그아웃"
              className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface2 disabled:opacity-50 transition shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <InstallAppButton />
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
