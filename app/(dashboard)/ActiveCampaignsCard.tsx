"use client";

import { useState, useEffect, useRef } from "react";
import { useFocusTrap } from "@/components/useFocusTrap";
import { useMounted } from "@/components/useMounted";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { HomeCampaignSummary } from "@/lib/overview/collect";
import {
  FolderKanban,
  X,
  ChevronRight,
  ExternalLink,
  Building2,
  Plus,
  BookOpen,
} from "lucide-react";

/**
 * "진행중 캠페인" KPI 카드. 누르면 목록이 모달로 뜬다.
 *
 * 전에는 오버뷰 **맨 아래**에 진행중인 캠페인 카드 박스가 따로 있었다. 그런데 그 자리가
 * 캘린더 아래라 스크롤해야 보였다. 첫 화면에 안 들어오면 "한눈에 본다" 는 이 화면의 목적에
 * 기여하지 못한다. 그래서 박스를 없애고, 이미 위에 있는 KPI 카드를 누르면 열리게 했다.
 * 승인 대기 콘텐츠·이번주 발행 예정 카드가 쓰는 방식과 같다.
 *
 * 카드에 적힌 수와 모달에 뜨는 줄 수는 **반드시 같아야 한다.** 다르면 사람이 "빠진 게 있나" 를
 * 의심하게 된다. 그래서 `collectHomeSummary` 에서 목록을 자르지 않는다.
 */
export default function ActiveCampaignsCard({
  count,
  items,
}: {
  count: number;
  items: HomeCampaignSummary[];
}) {
  /** 모달 상자. 열려 있는 동안 탭 포커스를 이 안에 가둔다. */
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const mounted = useMounted();
  useFocusTrap(isOpen, dialogRef);
  const router = useRouter();

  // ESC 키로 모달 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const goTo = (campaignId: string) => {
    setIsOpen(false);
    router.push(`/campaigns/${campaignId}`);
  };

  return (
    <>
      {/* KPI 카드 (클릭 시 모달 팝업) */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl bg-surface border border-border hover:border-accent-link/40 hover:bg-surface2/30 transition duration-150 group flex flex-col justify-between space-y-2.5 sm:space-y-3 shadow-xs text-left w-full h-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-link/30 min-h-[100px] sm:min-h-[116px] btn-press"
        aria-label="진행중 캠페인 목록 확인"
      >
        <div className="flex items-center justify-between w-full">
          <span className="text-[11px] sm:text-xs font-semibold text-text-muted group-hover:text-text transition truncate">
            진행중 캠페인
          </span>
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg sm:rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
            <FolderKanban className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </div>
        </div>
        <div>
          <div className="font-mono tabular-nums text-xl sm:text-3xl font-bold text-text">{count}</div>
          <p className="text-[10px] sm:text-[11px] text-text-sub mt-0.5 truncate">시딩 및 초청 행사 관리</p>
        </div>
      </button>

      {/* 진행중인 캠페인 목록 모달 — document.body 포탈로 화면 정중앙에 띄운다 */}
      {isOpen && mounted && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
              onClick={() => setIsOpen(false)}
            >
              <div
                className="w-full max-w-xl bg-surface border border-border rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-4 shadow-2xl max-h-[88vh] sm:max-h-[85vh] flex flex-col font-sans relative text-left"
                onClick={(e) => e.stopPropagation()}
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="active-campaigns-modal-title"
              >
                {/* 헤더 */}
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-border">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
                        <FolderKanban className="w-3.5 h-3.5" />
                      </div>
                      <h3
                        id="active-campaigns-modal-title"
                        className="text-sm sm:text-base font-bold text-text truncate"
                      >
                        진행중인 캠페인
                      </h3>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 shrink-0">
                        {items.length}건
                      </span>
                    </div>
                    <p className="text-xs text-text-sub leading-relaxed">
                      기획 단계와 완료 보관함을 뺀, 지금 돌아가고 있는 캠페인입니다. 항목을 클릭하면 관리 허브로
                      이동합니다.
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
                    /* 처음 쓰는 사람이 보는 화면이다. "없다" 로 끝내지 말고 다음에 할 일을 준다. */
                    <div className="py-10 px-4 text-center space-y-3 bg-bg border border-dashed border-border rounded-2xl">
                      <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
                        <FolderKanban className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-text">진행 중인 캠페인이 없습니다</p>
                        <p className="text-xs text-text-muted">
                          캠페인을 만들면 신청폼·지원자 심사·관리시트·결과보고서가 함께 열립니다.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        <Link
                          href="/campaigns/new"
                          onClick={() => setIsOpen(false)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-accent text-accent-on text-xs font-bold hover:opacity-90 transition btn-press"
                        >
                          <Plus className="w-3.5 h-3.5" />첫 캠페인 만들기
                        </Link>
                        <Link
                          href="/guide"
                          onClick={() => setIsOpen(false)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface2 border border-border text-xs font-semibold text-text-sub hover:text-text transition btn-press"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          사용 가이드
                        </Link>
                      </div>
                    </div>
                  ) : (
                    items.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => goTo(c.id)}
                        className="p-4 rounded-2xl bg-bg border border-border hover:border-accent-link/50 hover:bg-surface2/60 transition duration-150 flex flex-col gap-2.5 group cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold shrink-0">
                            {c.campaignType === "shipping" ? "배송형" : "방문형"} · {c.statusLabel}
                          </span>
                          <span className="text-[11px] text-text-muted group-hover:text-accent-link transition flex items-center gap-0.5 shrink-0">
                            관리 허브
                            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                          </span>
                        </div>

                        <div className="min-w-0">
                          <div className="text-sm font-bold text-text group-hover:text-accent-link transition truncate">
                            {c.name}
                          </div>
                          <p className="text-xs text-text-sub mt-0.5 flex items-center gap-1 truncate">
                            <Building2 className="w-3.5 h-3.5 text-text-muted shrink-0" />
                            <span className="truncate">{c.companyName}</span>
                          </p>
                        </div>

                        <div className="text-[11px] text-text-sub tabular-nums pt-2 border-t border-border/70 flex items-center justify-between">
                          <span>지원자 {c.applicantCount}명</span>
                          <span className="text-text font-semibold">최종선정 {c.selectedCount}명</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* 푸터 */}
                <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
                  <Link
                    href="/campaigns"
                    onClick={() => setIsOpen(false)}
                    className="text-text-sub hover:text-accent-link inline-flex items-center gap-1 font-medium transition"
                  >
                    <span>캠페인 전체 보기 (완료 보관함 포함)</span>
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
          )
        : null}
    </>
  );
}
