"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Campaign, CAMPAIGN_STATUS_LABELS } from "@/lib/db/types";
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
} from "lucide-react";

interface CampaignsListClientProps {
  initialCampaigns: Campaign[];
}

export default function CampaignsListClient({ initialCampaigns }: CampaignsListClientProps) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [filter, setFilter] = useState<"active" | "all" | "completed">("active");
  const [search, setSearch] = useState("");
  const [targetCampaign, setTargetCampaign] = useState<Campaign | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const activeCount = campaigns.filter((c) => c.status !== "completed").length;
  const completedCount = campaigns.filter((c) => c.status === "completed").length;

  const q = search.trim().toLowerCase();
  const filteredCampaigns = campaigns.filter((c) => {
    if (filter === "active" && c.status === "completed") return false;
    if (filter === "completed" && c.status !== "completed") return false;
    if (q) {
      return (
        c.name.toLowerCase().includes(q) ||
        c.company_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleDeleteConfirm = async () => {
    if (!targetCampaign) return;
    setIsDeleting(true);
    setDeleteError(null);
    const res = await deleteCampaignAction(targetCampaign.id);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("active")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              filter === "active"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-surface text-text-sub hover:text-text border border-border"
            }`}
          >
            진행중 ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              filter === "all"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-surface text-text-sub hover:text-text border border-border"
            }`}
          >
            전체 ({campaigns.length})
          </button>
          {completedCount > 0 && (
            <button
              type="button"
              onClick={() => setFilter("completed")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                filter === "completed"
                  ? "bg-zinc-700 text-white shadow-sm"
                  : "bg-surface text-text-muted hover:text-text border border-border"
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>완료/보관 ({completedCount})</span>
            </button>
          )}
        </div>

        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="캠페인명, 브랜드 검색..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-blue-500"
          />
          <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-2.5" />
        </div>
      </div>

      {filteredCampaigns.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-border rounded-2xl bg-surface space-y-3">
          <p className="text-text-sub">
            {filter === "completed"
              ? "완료되어 보관된 캠페인이 없습니다."
              : "진행 중인 캠페인이 없습니다."}
          </p>
          {filter === "active" && (
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
                    <button
                      type="button"
                      title="캠페인 삭제"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTargetCampaign(camp);
                        setDeleteError(null);
                      }}
                      className="p-1.5 rounded-lg text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition opacity-0 group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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

              <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-text-sub">
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
              <p className="text-text-muted">
                연동된 사전설문, 신청 폼, 지원자 명단, 배송/방문 관리시트, 결과보고서 및 행사 계획서가 모두 영구 삭제됩니다.
              </p>
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
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition inline-flex items-center gap-1.5 shadow-md shadow-rose-900/30"
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
