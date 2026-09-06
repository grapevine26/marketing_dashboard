"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SnsAccount } from "@/lib/db/types";
import { deleteSnsAccountAction } from "./actions";
import NewSnsAccountModal from "./NewSnsAccountModal";
import {
  Camera,
  ArrowRight,
  Trash2,
  AlertTriangle,
  Loader2,
  X,
  Search,
  Archive,
} from "lucide-react";

interface SnsAccountsListClientProps {
  initialAccounts: SnsAccount[];
}

export default function SnsAccountsListClient({ initialAccounts }: SnsAccountsListClientProps) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<SnsAccount[]>(initialAccounts);
  const [filter, setFilter] = useState<"active" | "all" | "ended">("active");
  const [search, setSearch] = useState("");
  const [targetAccount, setTargetAccount] = useState<SnsAccount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const activeCount = accounts.filter((a) => a.status === "active").length;
  const endedCount = accounts.filter((a) => a.status === "ended").length;

  const q = search.trim().toLowerCase();
  const filteredAccounts = accounts.filter((a) => {
    if (filter === "active" && a.status !== "active") return false;
    if (filter === "ended" && a.status !== "ended") return false;
    if (q) {
      return (
        a.company_name.toLowerCase().includes(q) ||
        a.handle.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleDeleteConfirm = async () => {
    if (!targetAccount) return;
    setIsDeleting(true);
    setDeleteError(null);
    const res = await deleteSnsAccountAction(targetAccount.id);
    setIsDeleting(false);

    if (res.ok) {
      setAccounts((prev) => prev.filter((a) => a.id !== targetAccount.id));
      setTargetAccount(null);
      router.refresh();
    } else {
      setDeleteError(res.error || "계정 삭제에 실패했습니다.");
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-text tracking-tight flex items-center gap-2">
            <Camera className="w-6 h-6 text-sky-400" />
            <span>SNS 공식 채널 대행 운영</span>
          </h1>
          <p className="text-xs sm:text-sm text-text-sub">
            브랜드 공식 계정의 사전설문 자료수집, 운영안(PPT), 월간 콘텐츠 캘린더 및 광고주 시안 승인을 관리합니다.
          </p>
        </div>

        <NewSnsAccountModal />
      </div>

      {/* Filter Tabs and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("active")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              filter === "active"
                ? "bg-sky-600 text-white shadow-sm"
                : "bg-surface text-text-sub hover:text-text border border-border"
            }`}
          >
            운영중 ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              filter === "all"
                ? "bg-sky-600 text-white shadow-sm"
                : "bg-surface text-text-sub hover:text-text border border-border"
            }`}
          >
            전체 ({accounts.length})
          </button>
          {endedCount > 0 && (
            <button
              type="button"
              onClick={() => setFilter("ended")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                filter === "ended"
                  ? "bg-zinc-700 text-white shadow-sm"
                  : "bg-surface text-text-muted hover:text-text border border-border"
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>계약종료/보관 ({endedCount})</span>
            </button>
          )}
        </div>

        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="브랜드명, 핸들(@...) 검색..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-sky-500"
          />
          <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-2.5" />
        </div>
      </div>

      {filteredAccounts.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-border rounded-2xl bg-surface space-y-3">
          <Camera className="w-8 h-8 text-text-muted mx-auto" />
          <p className="text-text-sub text-xs sm:text-sm">
            {filter === "ended"
              ? "계약 종료되어 보관된 SNS 계정이 없습니다."
              : "등록된 SNS 대행 계정이 없습니다."}
          </p>
          {filter === "active" && (
            <p className="text-text-muted text-xs">상단의 [새 계정 등록] 버튼을 눌러 인스타그램/유튜브 대행 계정을 등록하세요.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAccounts.map((acc) => (
            <div
              key={acc.id}
              className="group relative p-5 rounded-2xl bg-surface border border-border hover:border-sky-500/40 hover:bg-surface2 transition flex flex-col justify-between space-y-4 shadow-md"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs font-semibold uppercase">
                    {acc.platform}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        acc.status === "active" ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {acc.status === "active" ? "운영중" : "계약종료"}
                    </span>
                    <button
                      type="button"
                      title="계정 삭제"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTargetAccount(acc);
                        setDeleteError(null);
                      }}
                      className="p-1.5 rounded-lg text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition opacity-0 group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <Link href={`/sns/${acc.id}`} className="block focus:outline-none">
                  <h2 className="text-base font-bold text-text group-hover:text-sky-400 transition leading-snug">
                    {acc.company_name}
                  </h2>
                  <p className="text-xs text-sky-400/90 font-mono mt-0.5">
                    @{acc.handle}
                  </p>
                </Link>

                <div className="text-[11px] text-text-muted font-mono">
                  계약: {acc.starts_on || "시작일 미정"} ~ {acc.ends_on || "종료일 미정"}
                </div>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-text-sub">
                <span>계정 관리 허브</span>
                <Link
                  href={`/sns/${acc.id}`}
                  className="flex items-center gap-1 group-hover:text-sky-400 font-semibold transition"
                >
                  <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-sky-400 group-hover:translate-x-0.5 transition" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {targetAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-surface border border-rose-500/30 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 text-rose-400">
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-text">SNS 대행 계정 영구 삭제</h3>
                  <p className="text-xs text-text-sub mt-0.5">이 작업은 취소할 수 없습니다.</p>
                </div>
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setTargetAccount(null)}
                className="p-1 rounded-lg text-text-muted hover:text-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-bg border border-border space-y-2 text-xs leading-relaxed text-text-sub">
              <p>
                <strong className="text-text font-semibold">[{targetAccount.company_name}]</strong> (@{targetAccount.handle}) 계정을 삭제하시겠습니까?
              </p>
              <p className="text-text-muted">
                연동된 사전설문 답변, SNS 채널 운영 제안서(PPT), 월간 콘텐츠 캘린더 등 모든 데이터가 영구 삭제됩니다.
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
                onClick={() => setTargetAccount(null)}
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
