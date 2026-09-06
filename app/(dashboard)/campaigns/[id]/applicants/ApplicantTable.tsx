"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { PublicCampaign, Applicant, ApplicantStatus, CustomFormQuestion, APPLICANT_STATUS_LABELS } from "@/lib/db/types";
import { changeApplicantStatusAction } from "./actions";
import { changeApplicantStatusByTokenAction } from "@/app/applicants/[token]/actions";
import {
  Search,
  ExternalLink,
  Download,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  Loader2,
} from "lucide-react";

type Mode = "agency" | "company";

export interface ApplicantTableProps {
  campaign: PublicCampaign;
  initialApplicants: Applicant[];
  /** 서버(lib/applicants/duplicates.ts)에서 정규화 비교로 계산한 중복 사유. applicant.id → 사유[] */
  duplicates: Record<string, string[]>;
  customQuestions?: CustomFormQuestion[];
  /** agency: 대시보드(연락처·주소 노출). company: 광고주 공유 링크(개인정보 숨김, 토큰으로 액션) */
  mode: Mode;
  shareToken?: string;
  csvHref: string;
}

const STATUS_BADGE: Record<ApplicantStatus, string> = {
  selected: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  reserved: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  applied: "bg-[#181A20] text-zinc-400 border border-[#22242A]",
  rejected: "bg-rose-500/10 text-rose-300 border border-rose-500/20",
};

function StatusBadge({ status }: { status: ApplicantStatus }) {
  const Icon = status === "selected" ? CheckCircle2 : status === "reserved" ? Clock : status === "rejected" ? XCircle : null;
  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1 ${STATUS_BADGE[status]}`}>
      {Icon && <Icon className="w-3 h-3" />}
      <span>{APPLICANT_STATUS_LABELS[status]}</span>
    </span>
  );
}

export default function ApplicantTable({
  campaign,
  initialApplicants,
  duplicates,
  customQuestions = [],
  mode,
  shareToken,
  csvHref,
}: ApplicantTableProps) {
  const router = useRouter();
  const [applicants, setApplicants] = useState<Applicant[]>(initialApplicants);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ApplicantStatus>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleStatusChange = async (applicantId: string, nextStatus: ApplicantStatus) => {
    const before = applicants;
    setError(null);
    setPendingId(applicantId);
    setApplicants((prev) => prev.map((a) => (a.id === applicantId ? { ...a, status: nextStatus } : a)));

    const res =
      mode === "company"
        ? await changeApplicantStatusByTokenAction({ token: shareToken || "", applicantId, status: nextStatus })
        : await changeApplicantStatusAction({ applicantId, status: nextStatus });

    setPendingId(null);
    if (!res.ok) {
      setApplicants(before);
      setError(res.error);
      return;
    }
    setApplicants((prev) => prev.map((a) => (a.id === applicantId ? res.data : a)));
    router.refresh();
  };

  const q = search.trim().toLowerCase();
  const filtered = applicants.filter((a) => {
    const matchesSearch =
      !q ||
      a.name.toLowerCase().includes(q) ||
      a.sns_link.toLowerCase().includes(q) ||
      (mode === "agency" && a.contact.includes(q));
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const count = (s: ApplicantStatus) => applicants.filter((a) => a.status === s).length;

  const filterButtons: { key: "all" | ApplicantStatus; label: string; active: string; idle: string }[] = [
    { key: "all", label: `전체 (${applicants.length})`, active: "bg-zinc-100 text-zinc-900", idle: "bg-[#090A0C] text-zinc-400 hover:text-zinc-200 border border-[#22242A]" },
    { key: "selected", label: `최종선정 (${count("selected")})`, active: "bg-blue-600 text-white", idle: "bg-[#090A0C] text-blue-400 hover:bg-blue-500/10 border border-blue-500/20" },
    { key: "reserved", label: `예비선정 (${count("reserved")})`, active: "bg-amber-600 text-white", idle: "bg-[#090A0C] text-amber-400 hover:bg-amber-500/10 border border-amber-500/20" },
    { key: "applied", label: `대기 (${count("applied")})`, active: "bg-zinc-700 text-white", idle: "bg-[#090A0C] text-zinc-400 hover:bg-zinc-800 border border-[#22242A]" },
    { key: "rejected", label: `미선정 (${count("rejected")})`, active: "bg-rose-700 text-white", idle: "bg-[#090A0C] text-rose-300 hover:bg-rose-500/10 border border-rose-500/20" },
  ];

  const renderActions = (a: Applicant, compact: boolean) => {
    const busy = pendingId === a.id;
    const base = compact
      ? "flex-1 py-2 rounded-xl text-xs font-semibold transition disabled:opacity-50"
      : "px-2.5 py-1 rounded-lg text-xs font-semibold transition active:scale-95 disabled:opacity-50 inline-flex items-center gap-1";
    const primary = `${base} bg-blue-600 hover:bg-blue-500 text-white shadow-sm`;
    const secondary = `${base} bg-[#181A20] hover:bg-amber-500/20 text-zinc-300 hover:text-amber-300 border border-[#22242A]`;
    const danger = `${base} bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/30 text-rose-300`;
    const neutral = `${base} bg-[#181A20] hover:bg-[#22242A] text-zinc-300 border border-[#22242A]`;

    const btn = (label: string, next: ApplicantStatus, cls: string, title?: string) => (
      <button key={next + label} type="button" disabled={busy} title={title} onClick={() => handleStatusChange(a.id, next)} className={cls}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        <span>{label}</span>
      </button>
    );

    switch (a.status) {
      case "selected":
        return [btn("선정 취소", "applied", danger, "최종선정을 취소하고 대기 상태로 변경합니다."), btn("예비로 변경", "reserved", secondary)];
      case "reserved":
        return [btn("최종선정 승격", "selected", primary), btn("예비 취소", "applied", danger)];
      case "rejected":
        return [btn("대기로 복구", "applied", neutral)];
      default:
        return [btn("최종선정", "selected", primary), btn("예비선정", "reserved", secondary), btn("미선정", "rejected", danger)];
    }
  };

  const renderDetails = (a: Applicant) => (
    <div className="text-[11px] text-zinc-400 space-y-1">
      {mode === "agency" && (
        <div>
          <span className="text-zinc-500">{campaign.campaign_type === "shipping" ? "배송지: " : "방문 일정: "}</span>
          <span className="text-zinc-300">
            {campaign.campaign_type === "shipping"
              ? a.shipping_address || "-"
              : `${a.visit_schedule || "-"} (${a.visit_party_size || 1}명)`}
          </span>
        </div>
      )}
      {customQuestions.map((cq) => {
        const v = a.custom_answers?.[cq.id];
        const text = v === undefined || v === null || v === "" ? "-" : typeof v === "boolean" ? (v ? "예" : "아니오") : String(v);
        return (
          <div key={cq.id}>
            <span className="text-zinc-500">{cq.label}: </span>
            <span className="text-zinc-300">{text}</span>
          </div>
        );
      })}
      <div>
        <span className="text-zinc-500">2차활용 동의: </span>
        <span className="text-zinc-300">{a.secondary_use_agreed ? "예" : "아니오"}</span>
      </div>
      {a.status_changed_at && (
        <div>
          <span className="text-zinc-500">선정 변경: </span>
          <span className="text-zinc-300">
            {a.status_changed_by === "company" ? "광고주" : "에이전시"} ·{" "}
            {new Date(a.status_changed_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-5 sm:p-8 rounded-3xl bg-[#131418] border border-[#22242A] space-y-5 sm:space-y-6 shadow-xl font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
          <div className="relative flex-1 sm:max-w-xs">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={mode === "agency" ? "지원자명, 연락처, SNS 계정 검색..." : "지원자명, SNS 계정 검색..."}
              className="w-full pl-8 pr-3 py-2.5 sm:py-2 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
            />
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-3 sm:top-2.5" />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {filterButtons.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${statusFilter === f.key ? f.active : f.idle}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <a
          href={csvHref}
          className="w-full sm:w-auto text-center justify-center px-4 py-2.5 sm:py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5 transition border border-[#22242A]"
        >
          <Download className="w-3.5 h-3.5" />
          <span>CSV 다운로드</span>
        </a>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>
      )}

      {/* Mobile Cards */}
      <div className="block sm:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-[#22242A] rounded-2xl bg-[#090A0C]">
            표시할 지원자가 없습니다.
          </div>
        ) : (
          filtered.map((a) => {
            const dups = duplicates[a.id] || [];
            return (
              <div key={a.id} className="p-4 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-zinc-100">{a.name}</span>
                    <span className="text-[10px] text-zinc-500">({a.nationality})</span>
                  </div>
                  <StatusBadge status={a.status} />
                </div>

                <div className="text-xs space-y-1">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span>SNS 채널:</span>
                    <a href={a.sns_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[180px]">
                      <span>{a.sns_link}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                  {mode === "agency" && (
                    <div className="flex items-center justify-between text-zinc-400">
                      <span>연락처:</span>
                      <span className="font-mono text-zinc-200">{a.contact}</span>
                    </div>
                  )}
                  {dups.length > 0 && (
                    <div className="text-[11px] text-amber-400 font-semibold flex items-center gap-1 pt-1">
                      <AlertTriangle className="w-3 h-3" /> {dups.join(", ")}
                    </div>
                  )}
                  {renderDetails(a)}
                </div>

                <div className="pt-2 border-t border-[#181A20] flex items-center gap-1.5">{renderActions(a, true)}</div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block rounded-2xl border border-[#22242A] overflow-hidden overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#090A0C] text-zinc-400 border-b border-[#22242A]">
            <tr>
              <th className="p-3.5">지원자명</th>
              <th className="p-3.5">SNS 계정</th>
              <th className="p-3.5">{mode === "agency" ? "연락처 / 국적" : "국적"}</th>
              <th className="p-3.5">중복 감지</th>
              <th className="p-3.5">선정 상태</th>
              <th className="p-3.5 text-right">선정 결정 및 취소</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#22242A] text-zinc-300">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-zinc-500">표시할 지원자가 없습니다.</td>
              </tr>
            ) : (
              filtered.map((a) => {
                const dups = duplicates[a.id] || [];
                const expanded = expandedId === a.id;
                return (
                  <Fragment key={a.id}>
                    <tr className="hover:bg-[#181A20] transition">
                      <td className="p-3.5 font-bold text-zinc-100">
                        <button type="button" onClick={() => setExpandedId(expanded ? null : a.id)} className="hover:text-blue-400 text-left" title="상세 보기">
                          {a.name}
                        </button>
                      </td>
                      <td className="p-3.5">
                        <a href={a.sns_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[160px]">
                          <span>{a.sns_link}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </td>
                      <td className="p-3.5">
                        {mode === "agency" && <div className="font-mono text-zinc-200">{a.contact}</div>}
                        <div className="text-[10px] text-zinc-500">{a.nationality}</div>
                      </td>
                      <td className="p-3.5">
                        {dups.length > 0 ? (
                          <span title={dups.join("\n")} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-semibold cursor-help">
                            <AlertTriangle className="w-3 h-3" />
                            <span>중복 의심 {dups.length}건</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-zinc-500">정상</span>
                        )}
                      </td>
                      <td className="p-3.5"><StatusBadge status={a.status} /></td>
                      <td className="p-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">{renderActions(a, false)}</div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-[#0D0E12]">
                        <td colSpan={6} className="p-3.5">
                          <div className="flex items-start justify-between gap-3">
                            {renderDetails(a)}
                            {dups.length > 0 && (
                              <div className="text-[11px] text-amber-400 space-y-0.5 shrink-0">
                                {dups.map((d) => <div key={d}>· {d}</div>)}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-zinc-500 flex items-center gap-1">
        <RotateCcw className="w-3 h-3" /> 이름을 클릭하면 상세 답변을 볼 수 있습니다. 선정 취소 시에도 관리시트 기록은 보존됩니다.
      </p>
    </div>
  );
}
