"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ScheduledSnsItem } from "@/lib/overview/collect";
import {
  Camera,
  X,
  Calendar,
  User,
  Image as ImageIcon,
  ChevronRight,
  ExternalLink,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface ScheduledSnsThisWeekCardProps {
  count: number;
  items: ScheduledSnsItem[];
}

const STATUS_BADGE_STYLE: Record<string, string> = {
  planning: "bg-surface2 text-text-sub border-border",
  producing: "bg-amber-500/10 text-warn border-amber-500/20",
  pending_approval: "bg-accent2/10 text-accent2 border-accent2/20",
  approved: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  posted: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

export default function ScheduledSnsThisWeekCard({
  count,
  items,
}: ScheduledSnsThisWeekCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  // ESC 키로 모달 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleItemClick = (accountId: string, contentId: string) => {
    setIsOpen(false);
    router.push(`/sns/${accountId}?tab=list&contentId=${contentId}`);
  };

  return (
    <>
      {/* KPI 카드 (클릭 시 모달 팝업) */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="p-4 sm:p-5 rounded-3xl bg-surface border border-border hover:border-accent-link/40 hover:bg-surface2/30 transition duration-150 group flex flex-col justify-between space-y-3 shadow-xs text-left w-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-link/30"
        aria-label="이번주 발행 예정 콘텐츠 목록 확인"
      >
        <div className="flex items-center justify-between w-full">
          <span className="text-xs font-semibold text-text transition flex items-center gap-1.5">
            이번주 발행 예정
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent2/10 text-accent2 border border-accent2/20 group-hover:border-accent-link/30">
              상세보기
            </span>
          </span>
          <div className="w-7 h-7 rounded-xl bg-accent2/10 border border-accent2/20 text-accent2 flex items-center justify-center shrink-0">
            <Camera className="w-3.5 h-3.5" />
          </div>
        </div>
        <div>
          <div className="font-mono tabular-nums text-2xl sm:text-3xl font-bold text-text">
            {count}
          </div>
          <p className="text-[11px] text-text-sub mt-0.5">SNS 공식 채널 피드/릴스</p>
        </div>
      </button>

      {/* 이번주 발행 예정 모달 */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-surface border border-border rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col font-sans relative text-left"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="scheduled-sns-modal-title"
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-accent2/15 border border-accent2/30 text-accent2 flex items-center justify-center shrink-0">
                    <Camera className="w-3.5 h-3.5" />
                  </div>
                  <h3 id="scheduled-sns-modal-title" className="text-base font-bold text-text">
                    이번주 발행 예정 콘텐츠
                  </h3>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-accent2/15 text-accent2 border border-accent2/30">
                    {items.length}건
                  </span>
                </div>
                <p className="text-xs text-text-sub pl-8">
                  오늘부터 향후 7일 이내에 발행이 예정된 SNS 콘텐츠입니다. 항목을 클릭하면 해당 계정의 콘텐츠 관리 탭으로 이동합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-text-muted hover:text-text p-1.5 rounded-xl hover:bg-surface2 transition"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 본문 리스트 */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 -mr-1">
              {items.length === 0 ? (
                <div className="py-12 px-4 text-center space-y-3 bg-bg border border-dashed border-border rounded-2xl">
                  <div className="w-10 h-10 rounded-2xl bg-accent2/10 border border-accent2/20 text-accent2 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-text">이번 주 발행 예정인 콘텐츠가 없습니다</p>
                    <p className="text-xs text-text-muted">
                      새로운 콘텐츠 기획 및 일정을 등록하거나 전체 SNS 일정을 확인해 보세요.
                    </p>
                  </div>
                  <div className="pt-2">
                    <Link
                      href="/sns"
                      onClick={() => setIsOpen(false)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-accent-link hover:underline"
                    >
                      <span>SNS 계정 목록 보러가기</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item.accountId, item.id)}
                    className="p-4 rounded-2xl bg-bg border border-border hover:border-accent-link/50 hover:bg-surface2/60 transition duration-150 flex flex-col gap-2.5 group cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-2 py-0.5 rounded-full bg-accent2/10 text-accent2 border border-accent2/20 text-[10px] font-bold uppercase shrink-0">
                          {item.platform}
                        </span>
                        <span className="text-xs font-semibold text-text-sub truncate group-hover:text-text transition">
                          {item.accountCompanyName} {item.accountHandle && `(@${item.accountHandle})`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.daysDiff === 0 ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            오늘 발행 (D-Day)
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-accent-link/15 text-accent-link border border-accent-link/30">
                            D-{item.daysDiff}
                          </span>
                        )}
                        <span className="text-[11px] text-text-muted group-hover:text-accent-link transition flex items-center gap-0.5">
                          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                        </span>
                      </div>
                    </div>

                    <div className="text-sm font-bold text-text group-hover:text-accent-link transition">
                      {item.title}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
                      {/* 상태 뱃지 */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          STATUS_BADGE_STYLE[item.status] || "bg-surface2 text-text-sub border-border"
                        }`}
                      >
                        {item.statusLabel}
                      </span>

                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-text-sub" />
                        <span className="font-mono">예정: {item.scheduledOn}</span>
                      </div>

                      {item.assignee && (
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 text-text-sub" />
                          <span>{item.assignee}</span>
                        </div>
                      )}

                      {item.mediaCount > 0 && (
                        <div className="flex items-center gap-1">
                          <ImageIcon className="w-3 h-3 text-accent2" />
                          <span>미디어 {item.mediaCount}개</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 푸터 */}
            <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
              <Link
                href="/sns"
                onClick={() => setIsOpen(false)}
                className="text-text-sub hover:text-accent-link inline-flex items-center gap-1 font-medium transition"
              >
                <span>SNS 계정 허브 전체 보기</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 rounded-xl bg-surface2 hover:bg-surface3 text-text text-xs font-semibold transition cursor-pointer"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
