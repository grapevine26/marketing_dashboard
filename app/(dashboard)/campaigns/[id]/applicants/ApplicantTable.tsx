"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PublicCampaign,
  Applicant,
  ApplicantStatus,
  CustomFormQuestion,
  APPLICANT_STATUS_LABELS,
  CampaignMessageType,
  CAMPAIGN_MESSAGE_TYPE_LABELS,
  DEFAULT_CAMPAIGN_MESSAGE_TEMPLATES,
} from "@/lib/db/types";
import {
  changeApplicantStatusAction,
  updateAgencyMemoAction,
  saveCampaignMessageTemplatesAction,
} from "./actions";
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
  Copy,
  Check,
  MessageSquare,
  ArrowUpDown,
  X,
  FileSpreadsheet,
} from "lucide-react";

type Mode = "agency" | "company";

export interface ApplicantTableProps {
  campaign: PublicCampaign;
  /** 안내문 템플릿 — 대시보드(agency 모드)에서만 넘긴다. 공개 공유 페이지에는 절대 넘기지 않는다. */
  messageTemplates?: Record<string, string>;
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
  reserved: "bg-amber-500/10 text-warn border border-amber-500/20",
  applied: "bg-surface2 text-text-sub border border-border",
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

function formatFollowers(count?: number) {
  if (count == null || count === 0) return "-";
  if (count >= 10000) return `${(count / 10000).toFixed(1).replace(/\.0$/, "")}만`;
  return count.toLocaleString();
}

function populateTemplate(tmpl: string, app: Applicant, camp: PublicCampaign) {
  return tmpl
    .replace(/\{\{이름\}\}/g, app.name)
    .replace(/\{\{SNS\}\}/g, app.sns_link)
    .replace(/\{\{연락처\}\}/g, app.contact)
    .replace(/\{\{국적\}\}/g, app.nationality)
    .replace(/\{\{브랜드명\}\}/g, camp.company_name)
    .replace(/\{\{캠페인명\}\}/g, camp.name)
    .replace(/\{\{배송주소\}\}/g, app.shipping_address || "(등록된 배송지 없음)")
    .replace(/\{\{방문일정\}\}/g, app.visit_schedule || "(등록된 방문일정 없음)")
    .replace(/\{\{마감일\}\}/g, "가이드 전달 후 7일 이내");
}

export default function ApplicantTable({
  campaign,
  initialApplicants,
  duplicates,
  customQuestions = [],
  mode,
  shareToken,
  csvHref,
  messageTemplates,
}: ApplicantTableProps) {
  const router = useRouter();
  const [applicants, setApplicants] = useState<Applicant[]>(initialApplicants);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ApplicantStatus>("all");
  const [sortBy, setSortBy] = useState<"latest" | "followers">("latest");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Agency memo state
  const [memoEditingId, setMemoEditingId] = useState<string | null>(null);
  const [memoDraft, setMemoDraft] = useState("");
  const [savingMemo, setSavingMemo] = useState(false);

  // Message template modal state
  const [msgModalApp, setMsgModalApp] = useState<Applicant | null>(null);
  const [msgType, setMsgType] = useState<CampaignMessageType>("selected");
  const [msgContent, setMsgContent] = useState("");
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [savedTemplate, setSavedTemplate] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templates, setTemplates] = useState<Record<string, string>>(messageTemplates || {});

  const openMessageModal = (app: Applicant) => {
    setMsgModalApp(app);
    const initialType: CampaignMessageType =
      app.status === "selected" ? "selected" : app.status === "reserved" ? "reserved" : "selected";
    setMsgType(initialType);
    const rawTmpl = templates[initialType] || DEFAULT_CAMPAIGN_MESSAGE_TEMPLATES[initialType];
    setMsgContent(populateTemplate(rawTmpl, app, campaign));
    setCopiedMsg(false);
    setSavedTemplate(false);
  };

  const handleTypeChange = (type: CampaignMessageType) => {
    setMsgType(type);
    if (!msgModalApp) return;
    const rawTmpl = templates[type] || DEFAULT_CAMPAIGN_MESSAGE_TEMPLATES[type];
    setMsgContent(populateTemplate(rawTmpl, msgModalApp, campaign));
    setCopiedMsg(false);
    setSavedTemplate(false);
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(msgContent);
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2000);
    } catch {
      alert("클립보드 복사에 실패했습니다.");
    }
  };

  const handleSaveTemplate = async () => {
    setSavingTemplate(true);
    const updated = { ...templates, [msgType]: msgContent };
    const res = await saveCampaignMessageTemplatesAction({
      campaignId: campaign.id,
      templates: updated,
    });
    setSavingTemplate(false);
    if (res.ok) {
      setTemplates(updated);
      setSavedTemplate(true);
      setTimeout(() => setSavedTemplate(false), 2000);
    } else {
      alert(res.error || "템플릿 저장 실패");
    }
  };

  const handleSaveMemo = async (applicantId: string) => {
    setSavingMemo(true);
    const res = await updateAgencyMemoAction({ applicantId, memo: memoDraft });
    setSavingMemo(false);
    if (res.ok) {
      setApplicants((prev) =>
        prev.map((a) => (a.id === applicantId ? { ...a, agency_memo: memoDraft } : a))
      );
      setMemoEditingId(null);
    } else {
      setError(res.error);
    }
  };

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
      (a.category && a.category.toLowerCase().includes(q)) ||
      (mode === "agency" && (a.contact.includes(q) || (a.agency_memo && a.agency_memo.toLowerCase().includes(q))));
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const displayedApplicants = [...filtered].sort((a, b) => {
    if (sortBy === "followers") {
      return (b.follower_count || 0) - (a.follower_count || 0);
    }
    return new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime();
  });

  const totalPages = Math.max(1, Math.ceil(displayedApplicants.length / PAGE_SIZE));
  const paginatedApplicants = displayedApplicants.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const count = (s: ApplicantStatus) => applicants.filter((a) => a.status === s).length;

  const filterButtons: { key: "all" | ApplicantStatus; label: string; active: string; idle: string }[] = [
    { key: "all", label: `전체 (${applicants.length})`, active: "bg-zinc-100 text-zinc-900", idle: "bg-bg text-text-sub hover:text-text border border-border" },
    { key: "selected", label: `최종선정 (${count("selected")})`, active: "bg-blue-600 text-white", idle: "bg-bg text-blue-400 hover:bg-blue-500/10 border border-blue-500/20" },
    { key: "reserved", label: `예비선정 (${count("reserved")})`, active: "bg-amber-600 text-white", idle: "bg-bg text-warn hover:bg-amber-500/10 border border-amber-500/20" },
    { key: "applied", label: `대기 (${count("applied")})`, active: "bg-zinc-700 text-white", idle: "bg-bg text-text-sub hover:bg-surface3 border border-border" },
    { key: "rejected", label: `미선정 (${count("rejected")})`, active: "bg-rose-700 text-white", idle: "bg-bg text-rose-300 hover:bg-rose-500/10 border border-rose-500/20" },
  ];

  const renderActions = (a: Applicant, compact: boolean) => {
    const busy = pendingId === a.id;
    const base = compact
      ? "flex-1 py-2 rounded-xl text-xs font-semibold transition disabled:opacity-50"
      : "px-2.5 py-1 rounded-lg text-xs font-semibold transition active:scale-95 disabled:opacity-50 inline-flex items-center gap-1";
    const primary = `${base} bg-blue-600 hover:bg-blue-500 text-white shadow-sm`;
    const secondary = `${base} bg-surface2 hover:bg-amber-500/20 text-text-2 hover:text-warn-soft border border-border`;
    const danger = `${base} bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/30 text-rose-300`;
    const neutral = `${base} bg-surface2 hover:bg-surface3 text-text-2 border border-border`;

    const btn = (label: string, next: ApplicantStatus, cls: string, title?: string) => (
      <button key={next + label} type="button" disabled={busy} title={title} onClick={() => handleStatusChange(a.id, next)} className={cls}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        <span>{label}</span>
      </button>
    );

    const msgBtn = mode === "agency" && (
      <button
        key="msg-btn"
        type="button"
        title="안내문 템플릿 복사"
        onClick={() => openMessageModal(a)}
        className={`${compact ? "py-2 px-3 rounded-xl text-xs font-semibold" : "px-2.5 py-1 rounded-lg text-xs font-semibold"} bg-surface2 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 inline-flex items-center justify-center gap-1 transition`}
      >
        <MessageSquare className="w-3.5 h-3.5" />
        <span>안내문</span>
      </button>
    );

    const statusBtns = (() => {
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
    })();

    return msgBtn ? [...statusBtns, msgBtn] : statusBtns;
  };

  const renderDetails = (a: Applicant) => (
    <div className="text-[11px] text-text-sub space-y-1">
      {mode === "agency" && (
        <div>
          <span className="text-text-muted">{campaign.campaign_type === "shipping" ? "배송지: " : "방문 일정: "}</span>
          <span className="text-text-2">
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
            <span className="text-text-muted">{cq.label}: </span>
            <span className="text-text-2">{text}</span>
          </div>
        );
      })}
      <div>
        <span className="text-text-muted">2차활용 동의: </span>
        <span className="text-text-2">{a.secondary_use_agreed ? "예" : "아니오"}</span>
      </div>
      {a.status_changed_at && (
        <div>
          <span className="text-text-muted">선정 변경: </span>
          <span className="text-text-2">
            {a.status_changed_by === "company" ? "광고주" : "에이전시"} ·{" "}
            {new Date(a.status_changed_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-5 sm:p-8 rounded-3xl bg-surface border border-border space-y-5 sm:space-y-6 shadow-xl font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
          <div className="relative flex-1 sm:max-w-xs">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={mode === "agency" ? "지원자명, 연락처, SNS, 메모 검색..." : "지원자명, SNS 계정 검색..."}
              className="w-full pl-8 pr-3 py-2.5 sm:py-2 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-blue-500"
            />
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-3 sm:top-2.5" />
          </div>

          <div className="flex items-center gap-1 bg-bg border border-border p-1 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => {
                setSortBy("latest");
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                sortBy === "latest" ? "bg-blue-600 text-white" : "text-text-sub hover:text-text"
              }`}
            >
              최신순
            </button>
            <button
              type="button"
              onClick={() => {
                setSortBy("followers");
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                sortBy === "followers" ? "bg-blue-600 text-white" : "text-text-sub hover:text-text"
              }`}
            >
              <ArrowUpDown className="w-3 h-3" />
              <span>팔로워순</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {filterButtons.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setStatusFilter(f.key);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${statusFilter === f.key ? f.active : f.idle}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`${csvHref}&format=xlsx`}
            className="w-full sm:w-auto text-center justify-center px-3.5 py-2.5 sm:py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 transition border border-emerald-500/30 active:scale-95"
            title="마이크로소프트 엑셀 서식 적용 파일 다운로드"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Excel 다운로드</span>
          </a>
          <a
            href={csvHref}
            className="w-full sm:w-auto text-center justify-center px-3 py-2.5 sm:py-2 rounded-xl bg-surface2 hover:bg-surface3 text-text-2 text-xs font-medium inline-flex items-center gap-1.5 transition border border-border"
            title="표준 CSV 파일 다운로드"
          >
            <Download className="w-3.5 h-3.5 text-text-sub" />
            <span>CSV</span>
          </a>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>
      )}

      {/* Mobile Cards */}
      <div className="block sm:hidden space-y-3">
        {displayedApplicants.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-xs border border-dashed border-border rounded-2xl bg-bg">
            표시할 지원자가 없습니다.
          </div>
        ) : (
          paginatedApplicants.map((a) => {
            const dups = duplicates[a.id] || [];
            return (
              <div key={a.id} className="p-4 rounded-2xl bg-bg border border-border space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-text">{a.name}</span>
                    <span className="text-[10px] text-text-muted">({a.nationality})</span>
                  </div>
                  <StatusBadge status={a.status} />
                </div>

                <div className="text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-text-sub">
                    <span>SNS 채널:</span>
                    <div className="text-right">
                      <a href={a.sns_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[180px]">
                        <span>{a.sns_link}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                      {(a.follower_count !== undefined || a.category) && (
                        <div className="flex items-center justify-end gap-1.5 mt-0.5 text-[10px]">
                          {a.follower_count !== undefined && (
                            <span className="px-1.5 py-0.5 rounded bg-surface2 border border-border text-text-2 font-mono">
                              {formatFollowers(a.follower_count)}
                            </span>
                          )}
                          {a.category && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300">
                              {a.category}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {mode === "agency" && (
                    <div className="flex items-center justify-between text-text-sub">
                      <span>연락처:</span>
                      <span className="font-mono text-text">{a.contact}</span>
                    </div>
                  )}
                  {dups.length > 0 && (
                    <div className="text-[11px] text-warn font-semibold flex items-center gap-1 pt-1">
                      <AlertTriangle className="w-3 h-3" /> {dups.join(", ")}
                    </div>
                  )}
                  {renderDetails(a)}
                </div>

                {mode === "agency" && (
                  <div className="pt-2 border-t border-surface2 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-text-muted font-medium">관리자 메모:</span>
                      {memoEditingId !== a.id && (
                        <button
                          type="button"
                          onClick={() => {
                            setMemoEditingId(a.id);
                            setMemoDraft(a.agency_memo || "");
                          }}
                          className="text-[11px] text-blue-400 hover:underline"
                        >
                          {a.agency_memo ? "수정" : "추가"}
                        </button>
                      )}
                    </div>
                    {memoEditingId === a.id ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <input
                          type="text"
                          value={memoDraft}
                          onChange={(e) => setMemoDraft(e.target.value)}
                          placeholder="메모 입력"
                          className="flex-1 px-2.5 py-1.5 rounded-lg bg-surface2 border border-blue-500 text-text text-xs focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          disabled={savingMemo}
                          onClick={() => handleSaveMemo(a.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          onClick={() => setMemoEditingId(null)}
                          className="px-2.5 py-1.5 rounded-lg bg-surface3 text-text-sub text-xs"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <p className="text-text-2 text-xs italic bg-surface2/50 p-2 rounded-lg border border-border">
                        {a.agency_memo || "메모가 없습니다."}
                      </p>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-surface2 flex items-center gap-1.5">{renderActions(a, true)}</div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block rounded-2xl border border-border overflow-hidden overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-bg text-text-sub border-b border-border">
            <tr>
              <th className="p-3.5">지원자명</th>
              <th className="p-3.5">SNS 계정</th>
              <th className="p-3.5">{mode === "agency" ? "연락처 / 국적" : "국적"}</th>
              <th className="p-3.5">중복 감지</th>
              {mode === "agency" && <th className="p-3.5">에이전시 메모</th>}
              <th className="p-3.5">선정 상태</th>
              <th className="p-3.5 text-right">선정 결정 및 발송</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-text-2">
            {displayedApplicants.length === 0 ? (
              <tr>
                <td colSpan={mode === "agency" ? 7 : 6} className="p-8 text-center text-text-muted">
                  표시할 지원자가 없습니다.
                </td>
              </tr>
            ) : (
              paginatedApplicants.map((a) => {
                const dups = duplicates[a.id] || [];
                const expanded = expandedId === a.id;
                return (
                  <Fragment key={a.id}>
                    <tr className="hover:bg-surface2 transition">
                      <td className="p-3.5 font-bold text-text">
                        <button type="button" onClick={() => setExpandedId(expanded ? null : a.id)} className="hover:text-blue-400 text-left" title="상세 보기">
                          {a.name}
                        </button>
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <a href={a.sns_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[160px]">
                            <span>{a.sns_link}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        </div>
                        {(a.follower_count !== undefined || a.category) && (
                          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-text-sub flex-wrap">
                            {a.follower_count !== undefined && (
                              <span className="px-1.5 py-0.5 rounded bg-surface2 border border-border text-text-2 font-mono text-[10px]">
                                {formatFollowers(a.follower_count)}
                              </span>
                            )}
                            {a.category && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[10px]">
                                {a.category}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3.5">
                        {mode === "agency" && <div className="font-mono text-text">{a.contact}</div>}
                        <div className="text-[10px] text-text-muted">{a.nationality}</div>
                      </td>
                      <td className="p-3.5">
                        {dups.length > 0 ? (
                          <span title={dups.join("\n")} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-warn border border-amber-500/20 text-[10px] font-semibold cursor-help">
                            <AlertTriangle className="w-3 h-3" />
                            <span>중복 의심 {dups.length}건</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-text-muted">정상</span>
                        )}
                      </td>
                      {mode === "agency" && (
                        <td className="p-3.5 max-w-[180px]">
                          {memoEditingId === a.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={memoDraft}
                                onChange={(e) => setMemoDraft(e.target.value)}
                                placeholder="메모 입력"
                                className="w-full px-2 py-1 rounded bg-bg border border-blue-500 text-text text-xs focus:outline-none"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveMemo(a.id);
                                  if (e.key === "Escape") setMemoEditingId(null);
                                }}
                              />
                              <button
                                type="button"
                                disabled={savingMemo}
                                onClick={() => handleSaveMemo(a.id)}
                                className="p-1 rounded bg-blue-600 hover:bg-blue-500 text-white shrink-0"
                              >
                                {savingMemo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => setMemoEditingId(null)}
                                className="p-1 rounded bg-surface3 hover:bg-zinc-700 text-text-2 shrink-0"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setMemoEditingId(a.id);
                                setMemoDraft(a.agency_memo || "");
                              }}
                              className="w-full text-left group flex items-center justify-between gap-1 text-text-sub hover:text-text"
                              title="클릭하여 메모 수정"
                            >
                              <span className="truncate text-xs">
                                {a.agency_memo ? a.agency_memo : <span className="text-text-faint italic">메모 없음</span>}
                              </span>
                            </button>
                          )}
                        </td>
                      )}
                      <td className="p-3.5"><StatusBadge status={a.status} /></td>
                      <td className="p-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">{renderActions(a, false)}</div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-sidebar">
                        <td colSpan={mode === "agency" ? 7 : 6} className="p-3.5">
                          <div className="flex items-start justify-between gap-3">
                            {renderDetails(a)}
                            {dups.length > 0 && (
                              <div className="text-[11px] text-warn space-y-0.5 shrink-0">
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

      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-text-sub">
          <span>
            총 {displayedApplicants.length}명 중 {(page - 1) * PAGE_SIZE + 1} ~{" "}
            {Math.min(page * PAGE_SIZE, displayedApplicants.length)}명 표시
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-xl bg-surface2 hover:bg-surface3 text-text-2 disabled:opacity-40 border border-border font-medium transition"
            >
              이전
            </button>
            <span className="px-3 py-1.5 rounded-xl bg-bg border border-border font-mono text-text">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-xl bg-surface2 hover:bg-surface3 text-text-2 disabled:opacity-40 border border-border font-medium transition"
            >
              다음
            </button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-text-muted flex items-center gap-1">
        <RotateCcw className="w-3 h-3" /> 이름을 클릭하면 상세 답변을 볼 수 있습니다. 선정 취소 시에도 관리시트 기록은 보존됩니다.
      </p>

      {/* Message Template Modal */}
      {msgModalApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border">
              <div>
                <h3 className="text-sm font-bold text-text flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-400" />
                  <span>안내 메시지 템플릿</span>
                </h3>
                <p className="text-xs text-text-sub mt-0.5">
                  {msgModalApp.name}님 ({msgModalApp.contact}) 대상 안내문
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMsgModalApp(null)}
                className="p-1 rounded-lg text-text-sub hover:text-text hover:bg-surface2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              {/* Template Type Selector Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {(
                  [
                    "selected",
                    "reserved",
                    "shipping_or_visit",
                    "guideline",
                    "reminder",
                  ] as CampaignMessageType[]
                ).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTypeChange(t)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                      msgType === t
                        ? "bg-blue-600 text-white"
                        : "bg-bg text-text-sub hover:text-text border border-border"
                    }`}
                  >
                    {CAMPAIGN_MESSAGE_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-sub mb-1.5">
                  치환된 메시지 내용 (클릭하여 직접 수정 가능)
                </label>
                <textarea
                  rows={8}
                  value={msgContent}
                  onChange={(e) => setMsgContent(e.target.value)}
                  className="w-full p-3 rounded-xl bg-bg border border-border text-text text-xs font-mono leading-relaxed focus:outline-none focus:border-blue-500"
                />
                <p className="text-[11px] text-text-muted mt-1">
                  지원자 정보(`{`{이름}`}`, `{`{SNS}`}`, `{`{마감일}`}` 등)가 자동으로 치환되었습니다.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={savingTemplate}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-surface2 hover:bg-surface3 text-text-2 text-xs font-semibold border border-border transition inline-flex items-center justify-center gap-1.5"
                >
                  {savingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>{savedTemplate ? "템플릿 저장 완료!" : "이 캠페인의 기본 템플릿으로 저장"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyMessage}
                  className="w-full sm:w-auto px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition inline-flex items-center justify-center gap-1.5 shadow-md"
                >
                  {copiedMsg ? <Check className="w-3.5 h-3.5 text-text" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedMsg ? "클립보드에 복사됨!" : "클립보드 복사"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
