"use client";

import { useState, useEffect } from "react";
import { useMounted } from "@/components/useMounted";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { HomePreparingEventSummary } from "@/lib/overview/collect";
import { formatKstDateTime } from "@/lib/seeding/dday";
import { PartyPopper, X, ChevronRight, ExternalLink, Calendar, MapPin, Plus, BookOpen } from "lucide-react";

/** D-day 라벨. 지난 것은 D+n 으로 보여 준다(준비중인데 날짜가 지났다는 뜻이라 눈에 띄어야 한다). */
function ddayLabel(days: number): string {
  if (days === 0) return "D-DAY";
  return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
}

/**
 * "준비중인 행사" KPI 카드. 누르면 목록이 모달로 뜬다.
 *
 * 진행중 캠페인·승인 대기 콘텐츠·이번주 발행 예정과 같은 방식이다. 네 카드가 전부
 * 같게 동작해야 "숫자를 누르면 내역이 보인다" 를 한 번만 배우면 된다.
 */
export default function PreparingEventsCard({
  count,
  items,
}: {
  count: number;
  items: HomePreparingEventSummary[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const mounted = useMounted();
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

  const goTo = (campaignId: string, eventId: string) => {
    setIsOpen(false);
    router.push(`/campaigns/${campaignId}/events/${eventId}`);
  };

  return (
    <>
      {/* KPI 카드 (클릭 시 모달 팝업) */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl bg-surface border border-border hover:border-accent-link/40 hover:bg-surface2/30 transition duration-150 group flex flex-col justify-between space-y-2.5 sm:space-y-3 shadow-xs text-left w-full h-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-link/30 min-h-[100px] sm:min-h-[116px] btn-press"
        aria-label="준비중인 행사 목록 확인"
      >
        <div className="flex items-center justify-between w-full">
          <span className="text-[11px] sm:text-xs font-semibold text-text-muted group-hover:text-text transition truncate">
            준비중인 행사
          </span>
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg sm:rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
            <PartyPopper className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </div>
        </div>
        <div>
          <div className="font-mono tabular-nums text-xl sm:text-3xl font-bold text-text">{count}</div>
          <p className="text-[10px] sm:text-[11px] text-text-sub mt-0.5 truncate">오프라인 초청 및 팝업</p>
        </div>
      </button>

      {/* 준비중인 행사 목록 모달 — document.body 포탈로 화면 정중앙에 띄운다 */}
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
                aria-labelledby="preparing-events-modal-title"
              >
                {/* 헤더 */}
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-border">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-400 flex items-center justify-center shrink-0">
                        <PartyPopper className="w-3.5 h-3.5" />
                      </div>
                      <h3
                        id="preparing-events-modal-title"
                        className="text-sm sm:text-base font-bold text-text truncate"
                      >
                        준비중인 행사
                      </h3>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-400 border border-teal-500/30 shrink-0">
                        {items.length}건
                      </span>
                    </div>
                    <p className="text-xs text-text-sub leading-relaxed">
                      아직 열리지 않은 오프라인 행사입니다. 가까운 일시부터 보이며, 항목을 클릭하면 초대 명단·체크리스트·운영안으로
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
                    <div className="py-10 px-4 text-center space-y-3 bg-bg border border-dashed border-border rounded-2xl">
                      <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mx-auto">
                        <PartyPopper className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-text">준비중인 행사가 없습니다</p>
                        <p className="text-xs text-text-muted">
                          행사는 캠페인에 딸려 만듭니다. 초대 명단·체크리스트·운영안이 함께 열립니다.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        <Link
                          href="/events"
                          onClick={() => setIsOpen(false)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-accent text-accent-on text-xs font-bold hover:opacity-90 transition btn-press"
                        >
                          <Plus className="w-3.5 h-3.5" />새 행사 개설
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
                    items.map((e) => (
                      <div
                        key={e.id}
                        onClick={() => goTo(e.campaignId, e.id)}
                        className="p-4 rounded-2xl bg-bg border border-border hover:border-accent-link/50 hover:bg-surface2/60 transition duration-150 flex flex-col gap-2.5 group cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 text-[11px] text-text-muted font-medium min-w-0">
                            <span className="text-text-sub font-semibold truncate">{e.companyName}</span>
                            <span className="shrink-0">·</span>
                            <span className="truncate">{e.campaignName}</span>
                          </div>
                          {e.daysDiff !== null && (
                            <span
                              className={`text-xs font-mono font-bold shrink-0 ${
                                e.daysDiff < 0
                                  ? "text-red-400"
                                  : e.daysDiff === 0
                                  ? "text-warn"
                                  : e.daysDiff <= 3
                                  ? "text-amber-400"
                                  : "text-text-muted"
                              }`}
                            >
                              {ddayLabel(e.daysDiff)}
                            </span>
                          )}
                        </div>

                        <div className="text-sm font-bold text-text group-hover:text-accent-link transition">
                          {e.name}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-text-sub shrink-0" />
                            <span className="font-mono">{formatKstDateTime(e.eventAt) || "일시 미정"}</span>
                          </div>
                          <div className="flex items-center gap-1 min-w-0">
                            <MapPin className="w-3 h-3 text-text-sub shrink-0" />
                            <span className="truncate">{e.venue || "장소 미정"}</span>
                          </div>
                        </div>

                        <div className="text-[11px] text-text-sub tabular-nums pt-2 border-t border-border/70 flex items-center justify-between">
                          <span>초청 {e.inviteeCount}명</span>
                          <span className="flex items-center gap-2">
                            <span className="text-blue-400 font-semibold">참석확정 {e.attendingCount}명</span>
                            <ChevronRight className="w-3.5 h-3.5 text-text-muted group-hover:text-accent-link group-hover:translate-x-0.5 transition" />
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* 푸터 */}
                <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
                  <Link
                    href="/events"
                    onClick={() => setIsOpen(false)}
                    className="text-text-sub hover:text-accent-link inline-flex items-center gap-1 font-medium transition"
                  >
                    <span>행사 전체 보기 (완료·취소 포함)</span>
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
