"use client";

import { useState } from "react";
import { Campaign, Applicant, ApplicantStatus } from "@/lib/db/types";
import { changeApplicantStatusAction } from "./actions";
import { Download, ExternalLink, AlertTriangle, Check, Clock, XCircle, Search, Filter } from "lucide-react";

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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleStatusChange = async (applicantId: string, newStatus: ApplicantStatus) => {
    setLoadingId(applicantId);
    try {
      await changeApplicantStatusAction({
        applicantId,
        status: newStatus,
        changedBy: isPublicShare ? "company" : "agency",
        campaignId: campaign.id,
      });

      setApplicants((prev) =>
        prev.map((a) =>
          a.id === applicantId
            ? {
                ...a,
                status: newStatus,
                status_changed_by: isPublicShare ? "company" : "agency",
                status_changed_at: new Date().toISOString(),
              }
            : a
        )
      );
    } finally {
      setLoadingId(null);
    }
  };

  const filtered = applicants.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.sns_link.toLowerCase().includes(q) ||
        a.contact.includes(q)
      );
    }
    return true;
  });

  const selectedCount = applicants.filter((a) => a.status === "selected").length;
  const reservedCount = applicants.filter((a) => a.status === "reserved").length;

  return (
    <div className="space-y-4">
      {/* Top Filter and Actions Bar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름, SNS, 연락처 검색..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                statusFilter === "all" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              전체 ({applicants.length})
            </button>
            <button
              onClick={() => setStatusFilter("selected")}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                statusFilter === "selected"
                  ? "bg-emerald-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              최종선정 ({selectedCount})
            </button>
            <button
              onClick={() => setStatusFilter("reserved")}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                statusFilter === "reserved"
                  ? "bg-amber-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              예비선정 ({reservedCount})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <a
            href={`/api/applicants/export?campaignId=${campaign.id}`}
            download
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV 내보내기</span>
          </a>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold">
            <tr>
              <th className="p-3.5">인플루언서</th>
              <th className="p-3.5">SNS 채널</th>
              <th className="p-3.5">연락처 / 국적</th>
              <th className="p-3.5">
                {campaign.campaign_type === "shipping" ? "배송지 주소" : "방문일정 / 인원"}
              </th>
              <th className="p-3.5">추가 답변</th>
              <th className="p-3.5">현재 상태</th>
              <th className="p-3.5 text-center">선정 액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500">
                  조건에 맞는 지원자가 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((app) => {
                const dups = duplicatesObj[app.id];
                return (
                  <tr key={app.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3.5 font-medium text-white">
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold">{app.name}</span>
                        {dups && dups.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-[10px] text-red-400">
                            <AlertTriangle className="w-3 h-3" />
                            <span>{dups.join(", ")}</span>
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-3.5">
                      <a
                        href={app.sns_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline inline-flex items-center gap-1 max-w-[180px] truncate"
                      >
                        <span className="truncate">{app.sns_link}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </td>

                    <td className="p-3.5 space-y-0.5">
                      <div className="font-mono text-slate-200">{app.contact}</div>
                      <div className="text-[11px] text-slate-400">{app.nationality}</div>
                    </td>

                    <td className="p-3.5 max-w-[200px]">
                      {campaign.campaign_type === "shipping" ? (
                        <span className="text-slate-300 line-clamp-2">
                          {app.shipping_address || "-"}
                        </span>
                      ) : (
                        <div className="space-y-0.5">
                          <span className="text-slate-200">{app.visit_schedule || "-"}</span>
                          <div className="text-[11px] text-slate-400">
                            {app.visit_party_size ? `${app.visit_party_size}명` : ""}
                          </div>
                        </div>
                      )}
                    </td>

                    <td className="p-3.5 max-w-[180px]">
                      {Object.keys(app.custom_answers || {}).length > 0 ? (
                        <div className="space-y-1 text-[11px] text-slate-400">
                          {Object.entries(app.custom_answers).map(([k, v]) => (
                            <div key={k} className="truncate">
                              • {String(v)}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>

                    <td className="p-3.5">
                      {app.status === "selected" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
                          <Check className="w-3 h-3" /> 최종선정
                        </span>
                      )}
                      {app.status === "reserved" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold">
                          <Clock className="w-3 h-3" /> 예비선정
                        </span>
                      )}
                      {app.status === "rejected" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 text-xs">
                          <XCircle className="w-3 h-3" /> 미선정
                        </span>
                      )}
                      {app.status === "applied" && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-xs">
                          접수됨
                        </span>
                      )}
                    </td>

                    <td className="p-3.5 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={loadingId === app.id || app.status === "selected"}
                          onClick={() => handleStatusChange(app.id, "selected")}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition disabled:opacity-40"
                        >
                          최종선정
                        </button>
                        <button
                          type="button"
                          disabled={loadingId === app.id || app.status === "reserved"}
                          onClick={() => handleStatusChange(app.id, "reserved")}
                          className="px-2.5 py-1 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white text-xs font-semibold transition disabled:opacity-40"
                        >
                          예비선정
                        </button>
                        <button
                          type="button"
                          disabled={loadingId === app.id || app.status === "rejected"}
                          onClick={() => handleStatusChange(app.id, "rejected")}
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-red-400 text-xs transition disabled:opacity-40"
                        >
                          제외
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