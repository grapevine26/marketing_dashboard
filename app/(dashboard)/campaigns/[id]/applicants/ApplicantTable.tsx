"use client";

import { useState } from "react";
import { Campaign, Applicant, ApplicantStatus } from "@/lib/db/types";
import { changeApplicantStatusAction } from "./actions";
import {
  Search,
  ExternalLink,
  Download,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Users,
  Smartphone,
} from "lucide-react";

export default function ApplicantTable({
  campaign,
  initialApplicants,
  duplicatesObj,
  isPublicShare = false,
}: {
  campaign: Campaign;
  initialApplicants: Applicant[];
  duplicatesObj: Record<string, string[]>;
  isPublicShare?: boolean;
}) {
  const [applicants, setApplicants] = useState<Applicant[]>(initialApplicants);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const handleStatusChange = async (applicantId: string, status: ApplicantStatus) => {
    await changeApplicantStatusAction({
      applicantId,
      status,
      changedBy: isPublicShare ? "company" : "agency",
      campaignId: campaign.id,
    });

    setApplicants((prev) =>
      prev.map((a) =>
        a.id === applicantId ? { ...a, status, status_changed_by: isPublicShare ? "company" : "agency" } : a
      )
    );
  };

  const filtered = applicants.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      a.contact.includes(q) ||
      a.sns_link.toLowerCase().includes(q)
    );
  });

  const selectedCount = applicants.filter((a) => a.status === "selected").length;
  const reservedCount = applicants.filter((a) => a.status === "reserved").length;

  return (
    <div className="p-5 sm:p-8 rounded-3xl bg-[#131418] border border-[#22242A] space-y-5 sm:space-y-6 shadow-xl font-sans">
      {/* Top Filter & Download Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름, 연락처, SNS 검색..."
              className="w-full pl-8 pr-3 py-2.5 sm:py-2 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
            />
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-3.5 sm:top-3" />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2.5 sm:py-2 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500 font-semibold"
          >
            <option value="all">전체 ({applicants.length})</option>
            <option value="applied">미선정 ({applicants.filter((a) => a.status === "applied").length})</option>
            <option value="selected">최종선정 ({selectedCount})</option>
            <option value="reserved">예비선정 ({reservedCount})</option>
          </select>
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
                className="p-4 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-zinc-100">{a.name}</span>
                    <span className="text-[10px] text-zinc-500">({a.nationality})</span>
                  </div>
                  {a.status === "selected" && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 font-bold text-[10px]">
                      최종선정 ✓
                    </span>
                  )}
                  {a.status === "reserved" && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-semibold">
                      예비선정
                    </span>
                  )}
                  {a.status === "applied" && (
                    <span className="px-2 py-0.5 rounded-full bg-[#181A20] text-zinc-400 text-[10px]">
                      미선정
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
                        {dups.length}건
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-[#181A20] grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleStatusChange(a.id, "selected")}
                    className={`py-2 rounded-xl text-xs font-semibold transition ${
                      a.status === "selected"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-[#181A20] text-zinc-300"
                    }`}
                  >
                    최종선정
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange(a.id, "reserved")}
                    className={`py-2 rounded-xl text-xs font-semibold transition ${
                      a.status === "reserved"
                        ? "bg-amber-600 text-white shadow-sm"
                        : "bg-[#181A20] text-zinc-300"
                    }`}
                  >
                    예비선정
                  </button>
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
              <th className="p-3.5 text-right">선정 결정 액션</th>
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
                        <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[11px] font-bold">
                          최종선정 ✓
                        </span>
                      )}
                      {a.status === "reserved" && (
                        <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] font-semibold">
                          예비선정
                        </span>
                      )}
                      {a.status === "applied" && (
                        <span className="px-2 py-0.5 rounded-full bg-[#181A20] text-zinc-400 text-[11px]">
                          미선정
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleStatusChange(a.id, "selected")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                            a.status === "selected"
                              ? "bg-blue-600 text-white shadow-sm"
                              : "bg-[#181A20] hover:bg-[#22242A] text-zinc-300"
                          }`}
                        >
                          최종선정
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(a.id, "reserved")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                            a.status === "reserved"
                              ? "bg-amber-600 text-white shadow-sm"
                              : "bg-[#181A20] hover:bg-[#22242A] text-zinc-300"
                          }`}
                        >
                          예비
                        </button>
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