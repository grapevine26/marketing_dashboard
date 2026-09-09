"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatKstDateTime } from "@/lib/seeding/dday";
import { EVENT_STATUS_LABELS, type EventStatus } from "@/lib/db/types";
import {
  Calendar,
  MapPin,
  ArrowRight,
  PartyPopper,
  Search,
  Filter,
  X,
  Building2,
} from "lucide-react";

export interface EventOverviewCardItem {
  id: string;
  campaignId: string;
  campaignName: string;
  companyName: string;
  name: string;
  status: EventStatus;
  eventAt: string | null;
  venue: string | null;
  inviteeCount: number;
  attendingCount: number;
  attendedCount: number;
}

export interface CampaignFilterOption {
  id: string;
  name: string;
  companyName: string;
  eventCount: number;
}

interface AllEventsListClientProps {
  initialCards: EventOverviewCardItem[];
  campaigns: CampaignFilterOption[];
}

export default function AllEventsListClient({
  initialCards,
  campaigns,
}: AllEventsListClientProps) {
  const [search, setSearch] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // 행사 보유 캠페인을 상단에 정렬
  const sortedCampaigns = useMemo(() => {
    return [...campaigns].sort((a, b) => b.eventCount - a.eventCount || a.name.localeCompare(b.name));
  }, [campaigns]);

  // 필터링 계산
  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialCards.filter((c) => {
      // 1. 캠페인 필터
      if (selectedCampaignId !== "all" && c.campaignId !== selectedCampaignId) {
        return false;
      }
      // 2. 상태 필터
      if (selectedStatus !== "all" && c.status !== selectedStatus) {
        return false;
      }
      // 3. 검색어 필터 (행사명, 브랜드명, 캠페인명, 장소)
      if (q) {
        const matchName = c.name.toLowerCase().includes(q);
        const matchCamp = c.campaignName.toLowerCase().includes(q);
        const matchComp = c.companyName.toLowerCase().includes(q);
        const matchVenue = (c.venue || "").toLowerCase().includes(q);
        if (!matchName && !matchCamp && !matchComp && !matchVenue) return false;
      }
      return true;
    });
  }, [initialCards, search, selectedCampaignId, selectedStatus]);

  const hasActiveFilters = search.trim() !== "" || selectedCampaignId !== "all" || selectedStatus !== "all";

  const handleResetFilters = () => {
    setSearch("");
    setSelectedCampaignId("all");
    setSelectedStatus("all");
  };

  const statusCounts = useMemo(() => {
    const base = selectedCampaignId === "all"
      ? initialCards
      : initialCards.filter((c) => c.campaignId === selectedCampaignId);
    return {
      all: base.length,
      preparing: base.filter((c) => c.status === "preparing").length,
      done: base.filter((c) => c.status === "done").length,
    };
  }, [initialCards, selectedCampaignId]);

  return (
    <div className="space-y-4">
      {/* 검색 & 필터 바 */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-border shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* 검색 입력 */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-text-sub absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="행사명, 브랜드명, 장소 검색..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-bg border border-border text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-teal-500 transition"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-sub hover:text-text p-0.5 rounded transition"
                aria-label="검색어 지우기"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 캠페인 선택 드롭다운 */}
          <div className="relative shrink-0 sm:w-64">
            <select
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="w-full pl-8 pr-7 py-2 rounded-xl bg-bg border border-border text-xs text-text focus:outline-none focus:border-teal-500 transition font-medium appearance-none cursor-pointer"
            >
              <option value="all">전체 캠페인 ({initialCards.length}건)</option>
              {sortedCampaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName} · {c.name} ({c.eventCount}건)
                </option>
              ))}
            </select>
            <Building2 className="w-3.5 h-3.5 text-teal-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Filter className="w-3 h-3 text-text-sub absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* 상태 필터 탭 & 건수 요약 */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setSelectedStatus("all")}
              className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                selectedStatus === "all"
                  ? "bg-teal-500/15 text-teal-400 border border-teal-500/30"
                  : "bg-surface2/60 text-text-sub hover:text-text"
              }`}
            >
              전체 <span className="font-mono ml-0.5 opacity-80">{statusCounts.all}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatus("preparing")}
              className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                selectedStatus === "preparing"
                  ? "bg-teal-500/15 text-teal-400 border border-teal-500/30"
                  : "bg-surface2/60 text-text-sub hover:text-text"
              }`}
            >
              준비중 <span className="font-mono ml-0.5 opacity-80">{statusCounts.preparing}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatus("done")}
              className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                selectedStatus === "done"
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-surface2/60 text-text-sub hover:text-text"
              }`}
            >
              행사완료 <span className="font-mono ml-0.5 opacity-80">{statusCounts.done}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-text-muted text-xs">
            <span>
              검색 결과 <strong className="text-text font-mono">{filteredCards.length}</strong>건
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-teal-400 hover:underline text-[11px] font-medium transition cursor-pointer"
              >
                필터 초기화
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 행사 카드 그리드 */}
      {filteredCards.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-border rounded-2xl bg-surface space-y-3">
          <PartyPopper className="w-8 h-8 text-text-faint mx-auto" />
          <p className="text-text-sub text-xs sm:text-sm font-semibold">
            {initialCards.length === 0
              ? "등록된 인플루언서 행사가 없습니다."
              : "선택한 조건에 해당하는 행사가 없습니다."}
          </p>
          <p className="text-text-muted text-xs">
            {initialCards.length === 0
              ? "상단의 [새 행사 개설] 버튼을 눌러 새 이벤트를 시작하세요."
              : "검색어나 캠페인 필터를 변경해 보세요."}
          </p>
          {hasActiveFilters && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3 py-1.5 rounded-xl bg-surface2 hover:bg-surface3 text-xs text-text font-semibold transition cursor-pointer"
              >
                전체 행사 보기
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCards.map((card) => (
            <Link
              key={card.id}
              href={`/campaigns/${card.campaignId}/events/${card.id}`}
              className="group p-5 rounded-2xl bg-surface border border-border hover:border-teal-500/40 hover:bg-surface2 transition flex flex-col justify-between space-y-4 shadow-md active:scale-[0.99]"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                      card.status === "preparing"
                        ? "bg-teal-500/10 text-teal-400 border-teal-500/20"
                        : card.status === "done"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-surface3 text-text-sub border-border"
                    }`}
                  >
                    {EVENT_STATUS_LABELS[card.status]}
                  </span>
                  <span className="text-xs text-text-sub flex items-center gap-1 font-mono">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatKstDateTime(card.eventAt) || "일시 미정"}
                  </span>
                </div>

                <div>
                  <div className="flex items-center gap-1 text-[11px] text-text-muted font-medium mb-0.5">
                    <span className="text-text-sub font-semibold">{card.companyName}</span>
                    <span>·</span>
                    <span className="truncate">{card.campaignName}</span>
                  </div>
                  <h2 className="text-base font-bold text-text group-hover:text-teal-400 transition leading-snug">
                    {card.name}
                  </h2>
                  <p className="text-xs text-text-sub mt-1 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    <span className="truncate">{card.venue || "장소 미정"}</span>
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-text-sub">
                <div className="flex items-center gap-3 font-mono tabular-nums">
                  <span>
                    초청 <strong className="text-text">{card.inviteeCount}</strong>
                  </span>
                  <span>
                    참석확정 <strong className="text-blue-400">{card.attendingCount}</strong>
                  </span>
                  <span>
                    입장 <strong className="text-emerald-400">{card.attendedCount}</strong>
                  </span>
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-teal-400 group-hover:translate-x-0.5 transition" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
