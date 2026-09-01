"use client";

import { useState } from "react";
import {
  Palette,
  Check,
  Sparkles,
  Calendar,
  FolderKanban,
  PartyPopper,
  Camera,
  Users,
  CheckCircle2,
  Clock,
  ArrowRight,
  Download,
  Building2,
  Sliders,
  ShieldCheck,
  Eye,
  Sun,
  Moon,
  Coffee,
} from "lucide-react";

export default function DesignPreviewPage() {
  const [selectedTheme, setSelectedTheme] = useState<"slate" | "warm" | "light">("slate");

  const themes = [
    {
      id: "slate",
      name: "시안 1. 딥 슬레이트 & 소프트 인디고 (Deep Slate)",
      subtitle: "Linear & Supabase 스타일 • 추천 1순위",
      desc: "칠흑 같은 블랙 대신 눈이 안정되는 딥 슬레이트 차콜과 톤다운된 인디고 액센트로 대비 피로도를 대폭 낮춘 모던 다크 테마입니다.",
      icon: Moon,
      tag: "강력 추천",
      colors: {
        bg: "#0B0F19",
        card: "#131B2B",
        border: "#1E293B",
        primary: "#6366F1",
        accent: "#38BDF8",
        text: "#F1F5F9",
        subText: "#94A3B8",
      },
    },
    {
      id: "warm",
      name: "시안 2. 웜 차콜 & 매트 징크 (Warm Charcoal)",
      subtitle: "Notion & Raycast 스타일 • 눈 피로도 최소화",
      desc: "블루라이트 자극을 차단하는 따뜻한 웜 그레이/차콜 톤과 무광(Matte) 텍스처로 장시간 작업 시 눈의 긴장과 잔상을 방지합니다.",
      icon: Coffee,
      tag: "블루라이트 최소화",
      colors: {
        bg: "#121316",
        card: "#191B20",
        border: "#262830",
        primary: "#A78BFA",
        accent: "#F59E0B",
        text: "#ECECF1",
        subText: "#9CA3AF",
      },
    },
    {
      id: "light",
      name: "시안 3. 클린 오프화이트 (Modern Off-White)",
      subtitle: "Apple & Vercel 스타일 • 고가독성 라이트 모드",
      desc: "눈부신 쨍한 흰색이 아닌 부드러운 미색 오프화이트(#F8FAFC)와 깊이 있는 코발트 블루로 주간 사무 환경에서 최상의 시인성을 제공합니다.",
      icon: Sun,
      tag: "밝은 환경 최적",
      colors: {
        bg: "#F8FAFC",
        card: "#FFFFFF",
        border: "#E2E8F0",
        primary: "#2563EB",
        accent: "#0D9488",
        text: "#0F172A",
        subText: "#64748B",
      },
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 font-sans pb-16">
      {/* Header */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold">
          <Palette className="w-3.5 h-3.5" />
          <span>눈 피로도 완화 UI/UX 디자인 시안 비교</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-100 tracking-tight">
          대시보드 눈 피로도 개선 디자인 시안 (3종)
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400">
          실제 대시보드 컴포넌트(통합 캘린더, 시딩 카드, 인플루언서 명단, 상태 배지)가 어떻게 렌더링되는지 아래 탭을 눌러 직접 체험해보세요.
        </p>
      </div>

      {/* 3 Theme Switcher Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {themes.map((t) => {
          const isSelected = selectedTheme === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTheme(t.id as any)}
              className={`p-5 rounded-3xl text-left border transition-all space-y-3 relative overflow-hidden ${
                isSelected
                  ? "bg-[#181A20] border-indigo-500 shadow-xl shadow-indigo-500/15 ring-2 ring-indigo-500/30 scale-[1.02]"
                  : "bg-[#131418] border-[#22242A] hover:border-zinc-700 opacity-80 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isSelected ? "bg-indigo-600 text-white" : "bg-[#090A0C] text-zinc-400"}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300">
                    {t.tag}
                  </span>
                </div>
                {isSelected && <Check className="w-5 h-5 text-indigo-400" />}
              </div>

              <div>
                <h3 className="text-sm font-bold text-zinc-100 leading-snug">{t.name}</h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">{t.subtitle}</p>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed">{t.desc}</p>

              {/* Color Palette Preview Strip */}
              <div className="pt-2 border-t border-[#22242A] flex items-center gap-2">
                <div className="w-5 h-5 rounded-full border border-black/20 shadow-xs" style={{ backgroundColor: t.colors.bg }} title="배경색" />
                <div className="w-5 h-5 rounded-full border border-black/20 shadow-xs" style={{ backgroundColor: t.colors.card }} title="카드색" />
                <div className="w-5 h-5 rounded-full border border-black/20 shadow-xs" style={{ backgroundColor: t.colors.primary }} title="포인트색" />
                <div className="w-5 h-5 rounded-full border border-black/20 shadow-xs" style={{ backgroundColor: t.colors.accent }} title="보조색" />
                <span className="text-[10px] text-zinc-500 font-mono ml-auto">클릭하여 미리보기</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Live Interactive Preview Container */}
      <div className="space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-300">
            <Eye className="w-4 h-4 text-indigo-400" />
            <span>선택된 시안 실시간 렌더링 미리보기 ({selectedTheme.toUpperCase()})</span>
          </div>
          <span className="text-xs text-zinc-500">실제 UI 컴포넌트 및 배지 색감</span>
        </div>

        {/* Dynamic Styled Simulation Canvas */}
        <div
          className="p-6 sm:p-8 rounded-3xl border transition-all duration-300 space-y-6 shadow-2xl"
          style={{
            backgroundColor: themes.find((t) => t.id === selectedTheme)!.colors.bg,
            borderColor: themes.find((t) => t.id === selectedTheme)!.colors.border,
            color: themes.find((t) => t.id === selectedTheme)!.colors.text,
          }}
        >
          {/* Simulation Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b" style={{ borderColor: themes.find((t) => t.id === selectedTheme)!.colors.border }}>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className="px-2.5 py-0.5 rounded-full text-xs font-bold border"
                  style={{
                    backgroundColor: `${themes.find((t) => t.id === selectedTheme)!.colors.primary}15`,
                    color: themes.find((t) => t.id === selectedTheme)!.colors.primary,
                    borderColor: `${themes.find((t) => t.id === selectedTheme)!.colors.primary}30`,
                  }}
                >
                  배송형 시딩
                </span>
                <span className="text-xs font-medium" style={{ color: themes.find((t) => t.id === selectedTheme)!.colors.subText }}>
                  글로우랩 코스메틱
                </span>
              </div>
              <h2 className="text-xl font-bold tracking-tight">2026 하이드라 앰플 인플루언서 체험단 시딩</h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md transition"
                style={{ backgroundColor: themes.find((t) => t.id === selectedTheme)!.colors.primary }}
              >
                + 새 지원자 추가
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-xs font-semibold border transition"
                style={{
                  backgroundColor: themes.find((t) => t.id === selectedTheme)!.colors.card,
                  borderColor: themes.find((t) => t.id === selectedTheme)!.colors.border,
                  color: themes.find((t) => t.id === selectedTheme)!.colors.text,
                }}
              >
                관리시트 CSV
              </button>
            </div>
          </div>

          {/* 4 Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "총 지원자", val: "48명", sub: "+12명 오늘 접수" },
              { label: "최종선정 완료", val: "15명", sub: "목표 인원 100% 달성" },
              { label: "리뷰 업로드 완주", val: "13건", sub: "완주율 86.7%" },
              { label: "누적 조회수", val: "184,200회", sub: "평균 인게이지먼트 4.2%" },
            ].map((m, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl border transition"
                style={{
                  backgroundColor: themes.find((t) => t.id === selectedTheme)!.colors.card,
                  borderColor: themes.find((t) => t.id === selectedTheme)!.colors.border,
                }}
              >
                <span className="text-[11px] font-medium block" style={{ color: themes.find((t) => t.id === selectedTheme)!.colors.subText }}>
                  {m.label}
                </span>
                <span className="text-xl font-bold mt-1 block">{m.val}</span>
                <span className="text-[10px] mt-0.5 block" style={{ color: themes.find((t) => t.id === selectedTheme)!.colors.primary }}>
                  {m.sub}
                </span>
              </div>
            ))}
          </div>

          {/* Simulation Table: Applicants & Status Badges */}
          <div
            className="rounded-2xl border overflow-hidden"
            style={{
              backgroundColor: themes.find((t) => t.id === selectedTheme)!.colors.card,
              borderColor: themes.find((t) => t.id === selectedTheme)!.colors.border,
            }}
          >
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: themes.find((t) => t.id === selectedTheme)!.colors.border }}>
              <span className="text-xs font-bold">실시간 인플루언서 심사 명단</span>
              <span className="text-xs" style={{ color: themes.find((t) => t.id === selectedTheme)!.colors.subText }}>3명 선정중</span>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="border-b" style={{ borderColor: themes.find((t) => t.id === selectedTheme)!.colors.border }}>
                <tr style={{ color: themes.find((t) => t.id === selectedTheme)!.colors.subText }}>
                  <th className="p-3.5">인플루언서</th>
                  <th className="p-3.5">SNS 계정</th>
                  <th className="p-3.5">진행 상태</th>
                  <th className="p-3.5">마감일 (D-Day)</th>
                  <th className="p-3.5 text-right">선정 관리</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: themes.find((t) => t.id === selectedTheme)!.colors.border }}>
                {[
                  { name: "이지은 (뷰티제이)", handle: "@beauty_jieun", status: "selected", dday: "D-2 (9/12)", badge: "최종선정 ✨" },
                  { name: "김수현 (글로우픽)", handle: "@suhyun_glow", status: "reserved", dday: "D-5 (9/15)", badge: "예비선정" },
                  { name: "박민서", handle: "@minseo_daily", status: "applied", dday: "접수대기", badge: "대기중" },
                ].map((row, rIdx) => (
                  <tr key={rIdx} className="transition hover:opacity-90">
                    <td className="p-3.5 font-bold">{row.name}</td>
                    <td className="p-3.5 font-mono" style={{ color: themes.find((t) => t.id === selectedTheme)!.colors.primary }}>{row.handle}</td>
                    <td className="p-3.5">
                      <span
                        className="px-2 py-0.5 rounded-full text-[11px] font-bold border"
                        style={{
                          backgroundColor:
                            row.status === "selected"
                              ? `${themes.find((t) => t.id === selectedTheme)!.colors.primary}15`
                              : `${themes.find((t) => t.id === selectedTheme)!.colors.accent}15`,
                          color:
                            row.status === "selected"
                              ? themes.find((t) => t.id === selectedTheme)!.colors.primary
                              : themes.find((t) => t.id === selectedTheme)!.colors.accent,
                          borderColor:
                            row.status === "selected"
                              ? `${themes.find((t) => t.id === selectedTheme)!.colors.primary}30`
                              : `${themes.find((t) => t.id === selectedTheme)!.colors.accent}30`,
                        }}
                      >
                        {row.badge}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-[11px]">{row.dday}</td>
                    <td className="p-3.5 text-right">
                      {row.status === "selected" ? (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20">
                          선정 취소
                        </span>
                      ) : (
                        <span
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white shadow-xs"
                          style={{ backgroundColor: themes.find((t) => t.id === selectedTheme)!.colors.primary }}
                        >
                          최종선정
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}