"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Campaign, CampaignType, CampaignStatus, CAMPAIGN_STATUS_LABELS } from "@/lib/db/types";
import { deleteCampaignAction } from "./[id]/actions";
import {
  FolderKanban,
  Plus,
  ArrowRight,
  Building2,
  Trash2,
  AlertTriangle,
  Loader2,
  X,
  Search,
  Archive,
  RotateCcw,
} from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";
import { josa } from "@/lib/ui/josa";

interface CampaignsListClientProps {
  initialCampaigns: Campaign[];
  /**
   * 이 사람이 캠페인을 지울 수 있는가(관리자 이상).
   * **화면 편의일 뿐 방어가 아니다.** 진짜 방어는 deleteCampaignAction 안에 그대로 있다.
   * 없으면 직원이 캠페인 이름을 다 옮겨 적고 버튼을 누른 뒤에야 거부당한다.
   */
  canDelete: boolean;
  /**
   * 캠페인 id -> 지원자 수. 목록에 없는 캠페인은 0 으로 본다.
   *
   * 전에는 이 수가 오버뷰 맨 아래 박스에만 있었다. 그 박스는 캘린더 아래라 스크롤해야
   * 보였고 최근 3건만 나왔다. 박스를 없애면서 이리로 옮겼다 — 캠페인을 훑는 자리가 여기다.
   */
  applicantCounts: Record<string, { total: number; selected: number }>;
}

export default function CampaignsListClient({
  initialCampaigns,
  canDelete,
  applicantCounts,
}: CampaignsListClientProps) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [filter, setFilter] = useState<"active" | "all" | "completed">("active");
  const [selectedType, setSelectedType] = useState<"all" | CampaignType>("all");
  const [selectedStatus, setSelectedStatus] = useState<"all" | CampaignStatus>("all");
  const [search, setSearch] = useState("");
  const [targetCampaign, setTargetCampaign] = useState<Campaign | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // 삭제 확인 입력칸. 캠페인 이름을 그대로 옮겨 적어야 삭제 버튼이 열린다.
  const [confirmName, setConfirmName] = useState("");

  // 대화상자를 닫거나 다른 캠페인을 고르면 입력칸을 비운다.
  //
  // effect 가 아니라 렌더 중에 맞춘다. React 문서가 "props(여기서는 상위 state) 가 바뀔 때
  // state 를 되돌리는" 경우에 권하는 방식이다. effect 로 하면 이전 캠페인 이름이 남은 채로
  // 한 번 그린 뒤 다시 그리게 되는데, 그 찰나에 다른 캠페인의 삭제 버튼이 열려 있게 된다.
  const [confirmSyncedFrom, setConfirmSyncedFrom] = useState<Campaign | null>(targetCampaign);
  if (confirmSyncedFrom !== targetCampaign) {
    setConfirmSyncedFrom(targetCampaign);
    setConfirmName("");
  }

  // 탭에 돌아오면 DashboardShell 의 RefreshOnFocus 가 router.refresh() 를 부른다.
  // 그런데 router.refresh() 는 useState 를 그대로 두기 때문에, 서버가 새 목록을 내려줘도
  // 여기 campaigns 는 자리를 비우기 전 값에 머문다. 그래서 새 initialCampaigns 가 오면 다시 맞춘다.
  //
  // 목록만 갈아끼우고 targetCampaign(삭제 확인 대상)은 건드리지 않는다. 그래야 위의
  // confirmSyncedFrom 비교가 유지되어, 옮겨 적던 캠페인 이름이 지워지지 않는다.
  // 필터·검색어도 사용자가 고른 값이므로 그대로 둔다.
  const [syncedFrom, setSyncedFrom] = useState(initialCampaigns);
  if (syncedFrom !== initialCampaigns) {
    setSyncedFrom(initialCampaigns);
    setCampaigns(initialCampaigns);
  }

  // 대소문자 무시는 하지 않는다. 한글 이름에는 의미가 없고, 정확히 옮겨 적게 하는 것이 목적이다.
  const isNameConfirmed =
    targetCampaign !== null && confirmName.trim() === targetCampaign.name.trim();

  const activeCount = campaigns.filter((c) => c.status !== "completed").length;
  const completedCount = campaigns.filter((c) => c.status === "completed").length;

  const isFiltered = search !== "" || selectedType !== "all" || selectedStatus !== "all" || filter !== "active";

  const handleResetFilters = () => {
    setSearch("");
    setSelectedType("all");
    setSelectedStatus("all");
    setFilter("active");
  };

  const q = search.trim().toLowerCase();
  const filteredCampaigns = campaigns.filter((c) => {
    if (selectedStatus !== "all") {
      if (c.status !== selectedStatus) return false;
    } else {
      if (filter === "active" && c.status === "completed") return false;
      if (filter === "completed" && c.status !== "completed") return false;
    }

    if (selectedType !== "all" && c.campaign_type !== selectedType) return false;

    if (q) {
      return (
        c.name.toLowerCase().includes(q) ||
        c.company_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleDeleteConfirm = async () => {
    // 버튼 disabled 와 별개로 한 번 더 막는다. 키보드·확장프로그램으로 disabled 를 우회할 수 있다.
    if (!targetCampaign || !isNameConfirmed) return;
    setIsDeleting(true);
    setDeleteError(null);
    const res = await safeCall(deleteCampaignAction(targetCampaign.id));
    setIsDeleting(false);

    if (res.ok) {
      setCampaigns((prev) => prev.filter((c) => c.id !== targetCampaign.id));
      setTargetCampaign(null);
      router.refresh();
    } else {
      setDeleteError(res.error || "캠페인 삭제에 실패했습니다.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-blue-400" />
            <span>인플루언서 시딩 캠페인</span>
          </h1>
          <p className="text-sm text-text-sub">
            사전조사부터 신청폼, 인플루언서 선정, 배송/방문 관리시트 및 결과보고서까지 원스톱으로 관리합니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>새 캠페인 등록</span>
          </Link>
        </div>
      </div>

      {/* Filter Tabs and Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-surface/50 p-2.5 sm:p-3 rounded-2xl border border-border">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setFilter("active");
              setSelectedStatus("all");
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              filter === "active" && selectedStatus === "all"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-surface text-text-sub hover:text-text border border-border"
            }`}
          >
            진행중 ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setFilter("all");
              setSelectedStatus("all");
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              filter === "all" && selectedStatus === "all"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-surface text-text-sub hover:text-text border border-border"
            }`}
          >
            전체 ({campaigns.length})
          </button>
          {completedCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setFilter("completed");
                setSelectedStatus("all");
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                filter === "completed" && selectedStatus === "all"
                  ? "bg-zinc-700 text-white shadow-sm"
                  : "bg-surface text-text-muted hover:text-text border border-border"
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>완료/보관 ({completedCount})</span>
            </button>
          )}

          <div className="h-4 w-px bg-border mx-1 hidden sm:block" />

          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as "all" | CampaignType)}
            className="px-2.5 py-1.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-blue-500 font-medium"
            title="캠페인 유형 필터"
          >
            <option value="all">전체 유형</option>
            <option value="shipping">배송형</option>
            <option value="visit">방문형</option>
          </select>

          {/* Detailed Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => {
              const val = e.target.value as "all" | CampaignStatus;
              setSelectedStatus(val);
              if (val === "completed") {
                setFilter("completed");
              } else if (val !== "all") {
                setFilter("all");
              }
            }}
            className="px-2.5 py-1.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-blue-500 font-medium"
            title="캠페인 세부 단계 필터"
          >
            <option value="all">전체 세부단계</option>
            <option value="draft">준비중</option>
            <option value="recruiting">모집중</option>
            <option value="selecting">선정중</option>
            <option value="seeding">시딩 진행중</option>
            <option value="reporting">보고서 작성</option>
            <option value="completed">종료</option>
          </select>

          {isFiltered && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-2.5 py-1.5 rounded-xl bg-surface2 hover:bg-surface3 text-text-muted hover:text-text text-xs transition inline-flex items-center gap-1 border border-border"
              title="필터 초기화"
            >
              <RotateCcw className="w-3 h-3" />
              <span>초기화</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="캠페인명, 브랜드 검색..."
              className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-blue-500"
            />
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-2.5" />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-2 text-text-muted hover:text-text p-0.5"
                title="검색어 지우기"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <span className="text-[11px] text-text-muted whitespace-nowrap tabular-nums shrink-0 hidden lg:inline">
            총 {filteredCampaigns.length}건
          </span>
        </div>
      </div>

      {filteredCampaigns.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-border rounded-2xl bg-surface space-y-3">
          <p className="text-text-sub">
            {filter === "completed"
              ? "완료되어 보관된 캠페인이 없습니다."
              : isFiltered
              ? "검색 및 필터 조건에 일치하는 캠페인이 없습니다."
              : "진행 중인 캠페인이 없습니다."}
          </p>
          {isFiltered ? (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface2 hover:bg-surface3 border border-border text-xs text-text font-medium transition"
            >
              <RotateCcw className="w-3.5 h-3.5 text-text-sub" />
              <span>필터 초기화</span>
            </button>
          ) : filter === "active" && (
            <Link
              href="/campaigns/new"
              className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:underline font-semibold"
            >
              <span>첫 번째 캠페인 만들기</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCampaigns.map((camp) => (
            <div
              key={camp.id}
              className="group relative p-5 rounded-2xl bg-surface border border-border hover:border-blue-500/40 hover:bg-surface2 transition flex flex-col justify-between space-y-4 shadow-sm"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold">
                    {camp.campaign_type === "shipping" ? "배송형" : "방문형"}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted font-mono">
                      {new Date(camp.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
                    </span>
                    {canDelete && (
                      <button
                        type="button"
                        title="캠페인 삭제"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTargetCampaign(camp);
                          setDeleteError(null);
                        }}
                        className="p-1.5 rounded-lg text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition opacity-80 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <Link href={`/campaigns/${camp.id}`} className="block focus:outline-none">
                  <h2 className="text-base font-bold text-text group-hover:text-blue-400 transition leading-snug">
                    {camp.name}
                  </h2>
                  <p className="text-xs text-text-sub mt-1 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-text-muted" />
                    <span>{camp.company_name}</span>
                  </p>
                </Link>
              </div>

              <div className="pt-3 border-t border-border space-y-2">
                <div className="flex items-center justify-between text-[11px] text-text-sub tabular-nums">
                  <span>지원자 {applicantCounts[camp.id]?.total ?? 0}명</span>
                  <span className="text-text font-semibold">
                    최종선정 {applicantCounts[camp.id]?.selected ?? 0}명
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-text-sub">
                <span>
                  상태:{" "}
                  <strong className={camp.status === "completed" ? "text-text-muted font-semibold" : "text-blue-400 font-semibold"}>
                    {CAMPAIGN_STATUS_LABELS[camp.status] ?? camp.status}
                  </strong>
                </span>
                <Link
                  href={`/campaigns/${camp.id}`}
                  className="flex items-center gap-1 group-hover:text-blue-400 font-semibold transition"
                >
                  <span>관리 허브</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {targetCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-surface border border-rose-500/30 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 text-rose-400">
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-text">캠페인 영구 삭제</h3>
                  <p className="text-xs text-text-sub mt-0.5">이 작업은 취소할 수 없습니다.</p>
                </div>
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setTargetCampaign(null)}
                className="p-1 rounded-lg text-text-muted hover:text-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-bg border border-border space-y-2 text-xs leading-relaxed text-text-sub">
              <p>
                <strong className="text-text font-semibold">[{targetCampaign.name}]</strong> 캠페인을 삭제하시겠습니까?
              </p>
              {/* lib/db/campaigns.ts 의 deleteCampaign 은 campaigns 행만 지우고, 아래 목록은
                  0001_init.sql 의 fk on delete cascade 로 함께 지워지는 것들이다. */}
              <p className="text-text-muted">
                사전조사 응답, 신청 폼 설정, 지원자 명단, 배송/방문 관리시트, 결과보고서, 행사(초대 명단·체크리스트·운영안)가 모두 함께 영구 삭제됩니다.
              </p>
              <p className="text-text-muted">
                되돌리는 방법은 DB 백업 복원뿐입니다. (감사 로그 기록만 남습니다.)
              </p>
            </div>

            {/* 버튼 한 번으로 지워지지 않도록, 캠페인 이름을 그대로 옮겨 적게 한다. */}
            <div className="space-y-1.5">
              <label htmlFor="delete-confirm-name" className="block text-xs text-text-sub">
                삭제하려면 아래에 캠페인 이름{" "}
                <strong className="text-text font-semibold break-all">{targetCampaign.name}</strong>
                {josa(targetCampaign.name, "을")}
                그대로 입력하세요.
              </label>
              <input
                id="delete-confirm-name"
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                disabled={isDeleting}
                autoComplete="off"
                spellCheck={false}
                placeholder={targetCampaign.name}
                className="w-full px-3 py-2 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-rose-500 disabled:opacity-60"
              />
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setTargetCampaign(null)}
                className="px-4 py-2 rounded-xl bg-surface2 hover:bg-surface text-text-sub text-xs font-semibold border border-border transition"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isDeleting || !isNameConfirmed}
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition inline-flex items-center gap-1.5 shadow-md shadow-rose-900/30 disabled:bg-rose-600/40 disabled:shadow-none disabled:cursor-not-allowed"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isDeleting ? "삭제 진행 중..." : "영구 삭제"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
