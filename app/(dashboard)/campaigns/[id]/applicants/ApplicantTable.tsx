"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Campaign, Applicant } from "@/lib/db/types";
import { changeApplicantStatusAction } from "./actions";
import {
  Search,
  ExternalLink,
  Download,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  XCircle,
  Sparkles,
} from "lucide-react";

export default function ApplicantTable({
  campaign,
  initialApplicants,

  isPublicShare = false,
}: {
  campaign: Campaign;
  initialApplicants: Applicant[];
  duplicatesObj?: Record<string, string[]>;
  isPublicShare?: boolean;
}) {
  const router = useRouter();
  const [applicants, setApplicants] = useState<Applicant[]>(initialApplicants);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "selected" | "reserved" | "applied">("all");

  // Duplicate Check logic: Group by contact or sns_link
  const duplicatesObj: Record<string, string[]> = {};
  applicants.forEach((a) => {
    if (a.contact) {
      duplicatesObj[a.contact] = duplicatesObj[a.contact] || [];
      duplicatesObj[a.contact].push(a.id);
    }
    if (a.sns_link) {
      duplicatesObj[a.sns_link] = duplicatesObj[a.sns_link] || [];
      duplicatesObj[a.sns_link].push(a.id);
    }
  });

  const handleStatusChange = async (applicantId: string, nextStatus: Applicant["status"]) => {
    // Optimistic UI update
    setApplicants((prev) =>
      prev.map((a) => (a.id === applicantId ? { ...a, status: nextStatus } : a))
    );

    try {
      await changeApplicantStatusAction({
        applicantId,
        status: nextStatus,
        changedBy: "agency",
        campaignId: campaign.id,
      });
      router.refresh();
    } catch (err) {
      console.error("Status update error:", err);
      // Rollback on error
      setApplicants(initialApplicants);
    }
  };

  const filtered = applicants.filter((a) => {
    const matchesSearch =
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.contact.includes(search) ||
      a.sns_link.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const selectedCount = applicants.filter((a) => a.status === "selected").length;
  const reservedCount = applicants.filter((a) => a.status === "reserved").length;
  const appliedCount = applicants.filter((a) => a.status === "applied").length;

  return (
    <div className="p-5 sm:p-8 rounded-3xl bg-[#131418] border border-[#22242A] space-y-5 sm:space-y-6 shadow-xl font-sans">
      {/* Header Controls & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
          <div className="relative flex-1 sm:max-w-xs">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="지원자명, 연락처, SNS 계정 검색..."
              className="w-full pl-8 pr-3 py-2.5 sm:py-2 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
            />
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-3 sm:top-2.5" />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                statusFilter === "all"
                  ? "bg-zinc-100 text-zinc-900"
                  : "bg-[#090A0C] text-zinc-400 hover:text-zinc-200 border border-[#22242A]"
              }`}
            >
              전체 ({applicants.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("selected")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                statusFilter === "selected"
                  ? "bg-blue-600 text-white"
                  : "bg-[#090A0C] text-blue-400 hover:bg-blue-500/10 border border-blue-500/20"
              }`}
            >
              최종선정 ({selectedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("reserved")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                statusFilter === "reserved"
                  ? "bg-amber-600 text-white"
                  : "bg-[#090A0C] text-amber-400 hover:bg-amber-500/10 border border-amber-500/20"
              }`}
            >
              예비선정 ({reservedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("applied")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                statusFilter === "applied"
                  ? "bg-zinc-700 text-white"
                  : "bg-[#090A0C] text-zinc-400 hover:bg-zinc-800 border border-[#22242A]"
              }`}
            >
              미선정/대기 ({appliedCount})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1 sm:pt-0">
          <a
            href={`/api/applicants/export?campaignId=${campaign.id}`}
            className="w-full sm:w-auto text-center justify-center px-4 py-2.5 sm:py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5 transition border border-[#22242A]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV 다운로드 (UTF-8)</span>
          </a>
        </div>
      </div>

      {/* Mobile Card List (Visible on mobile < sm) */}
      <div className="block sm:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-[#22242A] rounded-2xl bg-[#090A0C]">
            접수된 지원자가 없습니다.
          </div>
        ) : (
          filtered.map((a) => {
            const dups = duplicatesObj[a.contact] || duplicatesObj[a.sns_link] || [];
            const hasDups = dups.length > 1;

            return (
              <div
                key={a.id}
                className="p-4 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-3 shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-zinc-100">{a.name}</span>
                    <span className="text-[10px] text-zinc-500">({a.nationality})</span>
                  </div>
                  {a.status === "selected" && (
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 font-bold text-[10px]">
                      최종선정 ✨
                    </span>
                  )}
                  {a.status === "reserved" && (
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-semibold">
                      예비선정
                    </span>
                  )}
                  {a.status === "applied" && (
                    <span className="px-2 py-0.5 rounded-full bg-[#181A20] text-zinc-400 text-[10px]">
                      미선정/대기
                    </span>
                  )}
                </div>

                <div className="text-xs space-y-1">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span>SNS 채널:</span>
                    <a
                      href={a.sns_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[180px]"
                    >
                      <span>{a.sns_link}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                  <div className="flex items-center justify-between text-zinc-400">
                    <span>연락처:</span>
                    <span className="font-mono text-zinc-200">{a.contact}</span>
                  </div>
                  {hasDups && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-amber-400 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> 중복 지원 감지
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                        {dups.length}회
                      </span>
                    </div>
                  )}
                </div>

                {/* Status Action Buttons for Mobile */}
                <div className="pt-2 border-t border-[#181A20] flex items-center gap-1.5">
                  {a.status === "selected" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(a.id, "applied")}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/30 text-rose-300 transition"
                      >
                        선정 취소
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(a.id, "reserved")}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold bg-amber-600/15 hover:bg-amber-600/25 border border-amber-500/30 text-amber-300 transition"
                      >
                        예비로 변경
                      </button>
                    </>
                  ) : a.status === "reserved" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(a.id, "selected")}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition"
                      >
                        최종선정 승격
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(a.id, "applied")}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/30 text-rose-300 transition"
                      >
                        예비 취소
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(a.id, "selected")}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition"
                      >
                        최종선정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(a.id, "reserved")}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold bg-[#181A20] hover:bg-amber-500/20 text-zinc-300 hover:text-amber-300 border border-[#22242A] transition"
                      >
                        예비선정
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop/Tablet Data Table (Visible on sm+) */}
      <div className="hidden sm:block rounded-2xl border border-[#22242A] overflow-hidden overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#090A0C] text-zinc-400 border-b border-[#22242A]">
            <tr>
              <th className="p-3.5">지원자명</th>
              <th className="p-3.5">SNS 계정</th>
              <th className="p-3.5">연락처 / 국적</th>
              <th className="p-3.5">중복 감지</th>
              <th className="p-3.5">선정 상태</th>
              <th className="p-3.5 text-right">선정 결정 및 취소 액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#22242A] text-zinc-300">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-zinc-500">
                  접수된 지원자가 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((a) => {
                const dups = duplicatesObj[a.contact] || duplicatesObj[a.sns_link] || [];
                const hasDups = dups.length > 1;

                return (
                  <tr key={a.id} className="hover:bg-[#181A20] transition">
                    <td className="p-3.5 font-bold text-zinc-100">{a.name}</td>
                    <td className="p-3.5">
                      <a
                        href={a.sns_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[140px]"
                      >
                        <span>{a.sns_link}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </td>
                    <td className="p-3.5">
                      <div className="font-mono text-zinc-200">{a.contact}</div>
                      <div className="text-[10px] text-zinc-500">{a.nationality}</div>
                    </td>
                    <td className="p-3.5">
                      {hasDups ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-semibold">
                          <AlertTriangle className="w-3 h-3" />
                          <span>중복 {dups.length}회</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-zinc-500">정상</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      {a.status === "selected" && (
                        <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[11px] font-bold inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-blue-400" />
                          <span>최종선정 ✨</span>
                        </span>
                      )}
                      {a.status === "reserved" && (
                        <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] font-semibold inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>예비선정</span>
                        </span>
                      )}
                      {a.status === "applied" && (
                        <span className="px-2.5 py-1 rounded-full bg-[#181A20] text-zinc-400 text-[11px]">
                          미선정 / 대기
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {a.status === "selected" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleStatusChange(a.id, "applied")}
                              title="최종선정을 취소하고 대기 상태로 변경합니다."
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/30 text-rose-300 inline-flex items-center gap-1 transition active:scale-95"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>선정 취소</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatusChange(a.id, "reserved")}
                              title="예비선정 상태로 변경합니다."
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#181A20] hover:bg-amber-500/20 border border-[#22242A] hover:border-amber-500/30 text-zinc-400 hover:text-amber-300 transition"
                            >
                              예비로 변경
                            </button>
                          </>
                        ) : a.status === "reserved" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleStatusChange(a.id, "selected")}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm inline-flex items-center gap-1 transition active:scale-95"
                            >
                              <span>최종선정</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatusChange(a.id, "applied")}
                              title="예비선정을 취소하고 대기 상태로 변경합니다."
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/30 text-rose-300 inline-flex items-center gap-1 transition active:scale-95"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>예비 취소</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleStatusChange(a.id, "selected")}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#181A20] hover:bg-blue-600 text-zinc-300 hover:text-white border border-[#22242A] transition active:scale-95"
                            >
                              최종선정
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatusChange(a.id, "reserved")}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#181A20] hover:bg-amber-600 text-zinc-300 hover:text-white border border-[#22242A] transition active:scale-95"
                            >
                              예비선정
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}