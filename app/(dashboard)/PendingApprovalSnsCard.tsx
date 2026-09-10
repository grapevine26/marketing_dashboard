"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PendingApprovalSnsItem } from "@/lib/overview/collect";
import {
  Clock,
  X,
  Calendar,
  User,
  Image as ImageIcon,
  MessageSquare,
  ChevronRight,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";

interface PendingApprovalSnsCardProps {
  count: number;
  items: PendingApprovalSnsItem[];
}

export default function PendingApprovalSnsCard({
  count,
  items,
}: PendingApprovalSnsCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

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
        className="p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl bg-surface border border-border hover:border-accent-link/40 hover:bg-surface2/30 transition duration-150 group flex flex-col justify-between space-y-2.5 sm:space-y-3 shadow-xs text-left w-full h-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-link/30 min-h-[100px] sm:min-h-[116px] btn-press"
        aria-label="승인 대기 콘텐츠 목록 확인"
      >
        <div className="flex items-center justify-between w-full">
          <span className="text-[11px] sm:text-xs font-semibold text-text-muted group-hover:text-text transition truncate">
            승인 대기 콘텐츠
          </span>
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg sm:rounded-xl bg-amber-500/10 border border-amber-500/20 text-warn flex items-center justify-center shrink-0">
            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </div>
        </div>
        <div>
          <div className="font-mono tabular-nums text-xl sm:text-3xl font-bold text-text">
            {count}
          </div>
          <p className="text-[10px] sm:text-[11px] text-text-sub mt-0.5 truncate">광고주 시안 컨펌 대기</p>
        </div>
      </button>

      {/* 승인 대기 콘텐츠 목록 모달 — document.body 포탈로 화면 정중앙에 띄운다 */}
      {isOpen && mounted && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
              onClick={() => setIsOpen(false)}
            >
          <div
            className="w-full max-w-xl bg-surface border border-border rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4 shadow-2xl max-h-[88vh] sm:max-h-[85vh] flex flex-col font-sans relative text-left"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pending-sns-modal-title"
          >
            {/* 헤더 */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-border">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/30 text-warn flex items-center justify-center shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <h3 id="pending-sns-modal-title" className="text-sm sm:text-base font-bold text-text truncate">
                    승인 대기 콘텐츠 목록
                  </h3>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-warn border border-amber-500/30 shrink-0">
                    {items.length}건
                  </span>
                </div>
                <p className="text-xs text-text-sub leading-relaxed">
                  광고주의 컨펌을 기다리고 있는 SNS 기획/시안 목록입니다. 항목을 클릭하면 해당 계정의 콘텐츠 관리 탭으로 이동합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-text-muted hover:text-text p-2 rounded-xl hover:bg-surface2 transition shrink-0 touch-manipulation"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 본문 리스트 */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 -mr-1">
              {items.length === 0 ? (
                <div className="py-12 px-4 text-center space-y-3 bg-bg border border-dashed border-border rounded-2xl">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-text">승인 대기 중인 콘텐츠가 없습니다</p>
                    <p className="text-xs text-text-muted">
                      모든 콘텐츠 시안이 승인되었거나 기획/제작 단계에 있습니다.
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
                      <span className="text-[11px] text-text-muted group-hover:text-accent-link transition flex items-center gap-0.5 shrink-0">
                        관리탭 이동
                        <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                      </span>
                    </div>

                    <div className="text-sm font-bold text-text group-hover:text-accent-link transition">
                      {item.title}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-text-sub" />
                        <span className="font-mono">
                          {item.scheduledOn ? `예정: ${item.scheduledOn}` : "발행일 미정"}
                        </span>
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

                    {item.clientComment && (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-warn-soft text-xs flex items-start gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-semibold">광고주 코멘트:</strong> {item.clientComment}
                        </div>
                      </div>
                    )}
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
        </div>,
        document.body
      ) : null}
    </>
  );
}
