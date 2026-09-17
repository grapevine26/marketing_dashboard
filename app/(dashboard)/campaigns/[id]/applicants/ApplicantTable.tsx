"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PublicCampaign,
  Applicant,
  ApplicantStatus,
  CustomFormQuestion,
  APPLICANT_STATUS_LABELS,
  CampaignMessageType,
  CAMPAIGN_MESSAGE_TYPE_LABELS,
  CAMPAIGN_MESSAGE_TYPES,
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
  Download,
} from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";
import { guardedSave, useSaveGuard } from "@/components/PendingSaveGuard";
import DownloadFileButton from "@/components/DownloadFileButton";
import { toast } from "@/components/Toast";

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

/** `custom_answers` 값 하나를 화면 글자로. 체크박스 문항은 boolean 으로 들어온다. */
function formatAnswerValue(v: string | number | boolean | undefined): string {
  if (v === undefined || v === null || v === "") return "-";
  if (typeof v === "boolean") return v ? "예" : "아니오";
  return String(v);
}

function formatFollowers(count?: number) {
  if (count == null || count === 0) return "-";
  if (count >= 10000) return `${(count / 10000).toFixed(1).replace(/\.0$/, "")}만`;
  return count.toLocaleString();
}

/**
 * 치환된 글을 **다시 템플릿으로 되돌린다.**
 *
 * 안내문 모달의 textarea 에는 `{{이름}}` 이 홍길동으로 바뀐 **완성된 메시지**가 들어 있다
 * (그대로 복사해 보내라고 그렇게 만든다). 그런데 [이 캠페인의 기본 템플릿으로 저장] 이
 * 그 글을 **그대로** 템플릿으로 저장했다. 그래서 한 번 저장하면 홍길동의 이름·SNS·
 * **연락처·배송주소**가 캠페인 템플릿에 박제되고, 그 다음부터 **모든 지원자가 홍길동의
 * 주소와 전화번호가 적힌 안내문을 받았다.** `{{이름}}` 은 영영 돌아오지 않았고, 이 모달이
 * 템플릿을 고칠 수 있는 유일한 화면이라 DB 를 직접 만지지 않으면 되돌릴 수도 없었다.
 *
 * 그래서 저장 직전에 치환을 거꾸로 돌린다. 무엇을 무엇으로 바꿨는지 우리가 알고 있으므로
 * 정확히 되돌릴 수 있다. 긴 값부터 바꾼다 — 짧은 값이 긴 값의 일부일 때 먼저 먹어버리면
 * 엉뚱하게 잘린다. 한 글자짜리 값은 건너뛴다(성이 한 글자면 본문의 모든 같은 글자가
 * `{{이름}}` 으로 바뀐다).
 */
function depopulateTemplate(text: string, app: Applicant, camp: PublicCampaign): string {
  const pairs: [string, string][] = [
    [app.name, "{{이름}}"],
    [app.sns_link, "{{SNS}}"],
    [app.contact, "{{연락처}}"],
    [app.nationality, "{{국적}}"],
    [camp.company_name, "{{브랜드명}}"],
    [camp.name, "{{캠페인명}}"],
    [app.shipping_address || "", "{{배송주소}}"],
    [app.visit_schedule || "", "{{방문일정}}"],
  ];
  return pairs
    .filter(([v]) => v && v.length > 1)
    .sort((a, b) => b[0].length - a[0].length)
    .reduce((acc, [value, token]) => acc.split(value).join(token), text);
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
  const saveGuard = useSaveGuard();
  const router = useRouter();
  const [applicants, setApplicants] = useState<Applicant[]>(initialApplicants);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ApplicantStatus>("all");
  const [sortBy, setSortBy] = useState<"latest" | "followers">("latest");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  // 저장 중인 지원자 id 들. 다른 행의 버튼은 잠그지 않아 A 를 저장하는 동안 B 도 누를 수 있는데,
  // 진행 중인 id 를 하나만 들고 있으면 A 가 끝나는 순간 B 의 스피너까지 같이 꺼졌다.
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // router.refresh() 로 서버가 새 목록을 내려주면 화면 상태를 다시 맞춘다.
  // refresh 는 서버 데이터만 새로 받고 useState 는 그대로 두므로(Next 문서의 useRouter 설명),
  // initialApplicants 를 useState 초기값으로만 쓰면 탭 복귀 후에도 옛 목록이 그대로 보인다.
  //
  // useEffect 가 아니라 렌더 중에 맞춘다. props 가 바뀔 때 state 를 되돌리는 경우에 React 가
  // 권하는 방식이고, effect 로 하면 옛 목록을 한 번 그린 뒤 다시 그리게 되어 깜빡인다.
  //
  // duplicates 는 state 로 받지 않고 props 를 그대로 읽으므로 따로 맞출 것이 없다. 중복 판정은
  // SNS·연락처만 보는데(lib/applicants/duplicates.ts) 이 화면이 낙관적으로 바꾸는 값은 상태·메모뿐이라
  // 목록과 배지가 어긋날 일이 없고, 같은 서버 렌더에서 함께 내려온 짝이라 항상 같은 시점을 가리킨다.
  const [syncedFrom, setSyncedFrom] = useState(initialApplicants);
  if (syncedFrom !== initialApplicants) {
    setSyncedFrom(initialApplicants);
    setApplicants(initialApplicants);
  }

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

  // ESC 키로 모달 닫기 — PendingApprovalSnsCard / ScheduledSnsThisWeekCard 와 같은 방식이다.
  //
  // 그 두 모달은 **배경 클릭으로도** 닫히지만 여기서는 일부러 넣지 않았다. 이 모달의 textarea 는
  // 사용자가 직접 고쳐 쓰는 칸이라, 글을 드래그해 고르다가 손을 모달 밖에서 떼기만 해도
  // 배경 클릭으로 잡혀 편집 중이던 안내문이 통째로 날아간다(저장 전 내용은 어디에도 남지 않는다).
  // ESC 는 일부러 눌러야 하는 키라 실수로 닫힐 일이 없어 ESC 만 받는다.
  useEffect(() => {
    if (!msgModalApp) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMsgModalApp(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [msgModalApp]);

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
      // alert 은 화면을 멈추고 이 화면의 다른 알림과도 생김새가 다르다. 토스트로 통일한다.
      // 복사 **성공** 쪽은 버튼 글자가 "클립보드에 복사됨!" 으로 바뀌므로(copiedMsg) 따로 띄우지 않는다.
      toast.error("클립보드 복사에 실패했습니다.");
    }
  };

  const handleSaveTemplate = async () => {
    if (!msgModalApp) return;
    setSavingTemplate(true);
    // **치환을 되돌려 저장한다.** 화면의 글은 이 지원자용으로 완성된 메시지라,
    // 그대로 저장하면 그 사람의 연락처·배송주소가 캠페인 템플릿에 박혀 다음 사람에게 간다.
    const updated = { ...templates, [msgType]: depopulateTemplate(msgContent, msgModalApp, campaign) };
    const res = await safeCall(saveCampaignMessageTemplatesAction({
      campaignId: campaign.id,
      templates: updated,
    }));
    setSavingTemplate(false);
    if (res.ok) {
      setTemplates(updated);
      // 저장한 것은 치환을 되돌린 **템플릿**이다. 화면은 다시 이 지원자용으로 채워 보여준다.
      // 이렇게 해야 사용자가 "내가 고친 문구가 템플릿으로 들어갔다" 를 눈으로 확인할 수 있다.
      setMsgContent(populateTemplate(updated[msgType] ?? msgContent, msgModalApp, campaign));
      setSavedTemplate(true);
      toast.success("안내 메시지 템플릿이 저장되었습니다. (이름·연락처 자리는 다시 채워집니다)");
      setTimeout(() => setSavedTemplate(false), 2000);
    } else {
      toast.error(res.error || "템플릿 저장에 실패했습니다.");
    }
  };

  /** 목록에서 **한 건만** 고친다. 배열을 통째로 갈아끼우면 그 사이 저장된 다른 변경이 함께 날아간다. */
  const patchApplicant = (applicantId: string, patch: Partial<Applicant>) => {
    setApplicants((prev) => prev.map((a) => (a.id === applicantId ? { ...a, ...patch } : a)));
  };

  /** 저장 중 표시를 지원자 단위로 켜고 끈다. 동시에 여러 건이 저장될 수 있다. */
  const markPending = (applicantId: string, pending: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(applicantId);
      else next.delete(applicantId);
      return next;
    });
  };

  const handleSaveMemo = async (applicantId: string) => {
    setSavingMemo(true);
    const res = await safeCall(updateAgencyMemoAction({ applicantId, memo: memoDraft }));
    setSavingMemo(false);
    if (res.ok) {
      patchApplicant(applicantId, { agency_memo: memoDraft });
      setMemoEditingId(null);
      toast.success("인플루언서 관리 메모가 저장되었습니다.");
    } else {
      setError(res.error);
      toast.error(res.error || "메모 저장에 실패했습니다.");
    }
  };

  // 화면을 먼저 바꾸고 저장은 뒤에서 한다. 그 사이에 다른 메뉴로 넘어가면 요청이 끊겨
  // 화면만 바뀌고 DB 에는 남지 않는다. 가드가 저장이 끝날 때까지 이동을 미뤄 준다.
  const handleStatusChange = async (applicantId: string, nextStatus: ApplicantStatus) => {
    // 되돌릴 때를 대비해 **이 한 건의 이전 상태만** 기억한다. 예전에는 배열 전체를 스냅샷 떠 두고
    // 실패하면 통째로 되돌렸는데, A·B 를 연달아 바꾸고 A 만 실패하면 이미 저장된 B 까지 화면에서
    // 옛 상태로 돌아갔다(DB 에는 B 가 남아 있어 새로고침하면 다시 나타났다).
    const previousStatus = applicants.find((a) => a.id === applicantId)?.status;
    setError(null);
    markPending(applicantId, true);
    patchApplicant(applicantId, { status: nextStatus });

    const res = await guardedSave(saveGuard, () =>
      mode === "company"
        ? safeCall(changeApplicantStatusByTokenAction({ token: shareToken || "", applicantId, status: nextStatus }))
        : safeCall(changeApplicantStatusAction({ applicantId, status: nextStatus }))
    );

    markPending(applicantId, false);
    if (!res.ok) {
      if (previousStatus) patchApplicant(applicantId, { status: previousStatus });
      // 배너는 카드 맨 위에 붙어 있어서, 목록이 길면 아래쪽에서 버튼을 누른 사람 눈에는 안 들어온다.
      // 화면은 원래 상태로 되돌아가는데 이유는 어디에도 안 보이는 셈이라 토스트를 같이 띄운다.
      setError(res.error);
      toast.error(res.error || "선정 상태 변경에 실패했습니다.");
      return;
    }
    patchApplicant(applicantId, res.data);
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
  // 목록이 줄어 지금 페이지가 사라질 수 있다. 검색·정렬·필터는 setPage(1) 을 하지만
  // **상태 변경(선정/예비 등)에는 그 자리가 없다.** 21명 중 2페이지의 1명을 최종선정하면
  // totalPages 가 1 이 되는데 page 는 2 로 남아, 빈 표가 되고 페이지 버튼까지 사라져
  // (`totalPages > 1` 조건) 필터를 다시 누르기 전에는 빠져나올 수 없었다.
  const safePage = Math.min(page, totalPages);
  const paginatedApplicants = displayedApplicants.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const count = (s: ApplicantStatus) => applicants.filter((a) => a.status === s).length;

  /* 필터는 상태를 고르는 도구일 뿐이라 색으로 구분하지 않는다. 선택된 것만 진하게. */
  const activeChip = "bg-text text-bg border border-text";
  const idleChip = "bg-bg text-text-sub hover:text-text hover:bg-surface2 border border-border";

  const filterButtons: { key: "all" | ApplicantStatus; label: string; active: string; idle: string }[] = [
    { key: "all", label: `전체 (${applicants.length})`, active: activeChip, idle: idleChip },
    { key: "selected", label: `최종선정 (${count("selected")})`, active: activeChip, idle: idleChip },
    { key: "reserved", label: `예비선정 (${count("reserved")})`, active: activeChip, idle: idleChip },
    { key: "applied", label: `대기 (${count("applied")})`, active: activeChip, idle: idleChip },
    { key: "rejected", label: `미선정 (${count("rejected")})`, active: activeChip, idle: idleChip },
  ];

  const renderActions = (a: Applicant, compact: boolean) => {
    const busy = pendingIds.has(a.id);
    const base = compact
      ? "flex-1 py-2 rounded-xl text-xs font-semibold btn-press transition disabled:opacity-50"
      : "px-2.5 py-1 rounded-lg text-xs font-semibold btn-press transition disabled:opacity-50 inline-flex items-center gap-1";
    const primary = `${base} bg-blue-600 hover:bg-blue-500 text-white shadow-sm`;
    /* 선정 상태 변경은 전부 되돌릴 수 있다. 빨강(위험)은 실제 삭제에만 쓰고 여기서는 무채색으로 둔다. */
    const secondary = `${base} bg-surface2 hover:bg-surface3 text-text-2 border border-border`;
    const danger = `${base} bg-surface2 hover:bg-surface3 text-text-sub border border-border`;
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
        className={`${compact ? "py-2 px-3 rounded-xl text-xs font-semibold" : "px-2.5 py-1 rounded-lg text-xs font-semibold"} btn-press bg-surface2 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 inline-flex items-center justify-center gap-1 transition`}
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

  const renderDetails = (a: Applicant) => {
    /**
     * 지금 지원폼에 **없는** 질문의 옛 답변 키들.
     *
     * 대행사가 신청폼 편집기에서 질문을 지워도 지원자 행의 `custom_answers` 에는 답이 그대로
     * 남는다(지우는 코드가 없다). 그런데 답을 읽는 곳은 전부 현재 질문 목록 기준이라
     * (여기 · `lib/applicants/csv.ts` · `lib/applicants/xlsx.ts`) 화면에도 내보내기에도 안 나온다.
     * 여기가 그 답을 볼 수 있는 유일한 자리다.
     *
     * **광고주에게는 절대 그리지 않는다.** 지워진 질문에는 연락처·주소 같은 것을 물어본 뒤
     * 지운 경우가 섞여 있고, `share_with_company` 판정 자체가 남아 있지 않아 무엇이 공개 대상이었는지
     * 알 방법이 없다. 그래서 목록을 만들기 전에 `mode` 로 먼저 끊는다 — company 모드에서는
     * 애초에 빈 배열이라 아래 JSX 가 어떤 실수를 하더라도 그릴 것이 없다.
     * (서버도 `sanitizeApplicantForCompany(a, allowedQuestionIds)` 로 지워진 질문의 답을 빼고
     *  내려보내지만, 화면에서 안 그리는 것과 서버에서 안 보내는 것은 각각 따로 지켜야 한다.)
     *
     * 질문 문구는 어디에도 남지 않으므로 키를 그대로 보여준다. 광고주 사전설문 응답 화면
     * (`SnsAccountDetailClient.tsx`)이 쓰는 `(삭제된 질문 …)` 표기를 그대로 따른다.
     */
    const orphanAnswerKeys =
      mode === "agency"
        ? Object.keys(a.custom_answers ?? {}).filter((k) => !customQuestions.some((cq) => cq.id === k))
        : [];

    return (
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
        {customQuestions.map((cq) => (
          <div key={cq.id}>
            <span className="text-text-muted">{cq.label}: </span>
            <span className="text-text-2">{formatAnswerValue(a.custom_answers?.[cq.id])}</span>
          </div>
        ))}
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
        {mode === "agency" && orphanAnswerKeys.length > 0 && (
          // 평소에는 접어 둔다. 지금 쓰는 질문의 답 사이에 섞이면 어느 것이 현재 문항인지 흐려진다.
          // 여는 상태를 따로 기억하지 않으려고 브라우저 기본 <details> 를 쓴다 — 지원자마다 state 를
          // 두면 목록이 다시 그려질 때(상태 변경·router.refresh) 열어 둔 것이 어긋난다.
          <details className="pt-1.5 border-t border-border">
            <summary className="cursor-pointer select-none text-text-muted hover:text-text-sub">
              지금 없는 질문의 옛 답변 {orphanAnswerKeys.length}건 (대행사 전용)
            </summary>
            <div className="mt-1.5 space-y-1 pl-2 border-l-2 border-border">
              {orphanAnswerKeys.map((k) => (
                <div key={k}>
                  <span className="text-text-muted">(삭제된 질문 {k}): </span>
                  <span className="text-text-2">{formatAnswerValue(a.custom_answers?.[k])}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-8 rounded-2xl sm:rounded-3xl bg-surface border border-border space-y-5 sm:space-y-6 shadow-xl font-sans">
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

        {/*
          생 <a href> 로 내려받으면 서버가 4xx 를 줄 때 브라우저가 그 본문을 문서로 그려서
          {"error":"로그인이 필요합니다."} 같은 JSON 이 흰 화면에 그대로 떴다. DownloadFileButton 은
          fetch 로 받아 실패하면 그 메시지를 버튼 아래에 한국어로 보여주고, 받는 동안 스피너도 돈다.
          생김새가 달라지면 안 되므로 기존 <a> 의 클래스를 그대로 넘긴다.
        */}
        <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
          <DownloadFileButton
            href={`${csvHref}&format=xlsx`}
            label="Excel 다운로드"
            fallbackFilename="지원자목록.xlsx"
            // 생 <a> 였을 때의 아이콘·툴팁을 그대로 옮긴다. 버튼 모양이 달라지면
            // 쓰던 사람이 "뭐가 바뀌었지?" 하고 멈칫한다.
            icon={<FileSpreadsheet className="w-3.5 h-3.5 text-text-sub" />}
            title="마이크로소프트 엑셀 서식 적용 파일 다운로드"
            className="w-full sm:w-auto text-center justify-center px-3.5 py-2.5 sm:py-2 rounded-xl bg-surface2 hover:bg-surface3 text-text-2 text-xs font-medium inline-flex items-center gap-1.5 transition border border-border btn-press disabled:opacity-50"
          />
          <DownloadFileButton
            href={csvHref}
            label="CSV"
            fallbackFilename="지원자목록.csv"
            icon={<Download className="w-3.5 h-3.5 text-text-sub" />}
            title="표준 CSV 파일 다운로드"
            className="w-full sm:w-auto text-center justify-center px-3 py-2.5 sm:py-2 rounded-xl bg-surface2 hover:bg-surface3 text-text-2 text-xs font-medium inline-flex items-center gap-1.5 transition border border-border btn-press disabled:opacity-50"
          />
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
                            <span className="px-1.5 py-0.5 rounded bg-surface2 border border-border text-text-2 tabular-nums">
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
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          {/* 데스크톱 메모 저장과 같은 스피너. 모바일은 회선이 느린 자리라 저장 중인지가 더 안 보였다. */}
                          {savingMemo ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          <span>저장</span>
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
                              <span className="px-1.5 py-0.5 rounded bg-surface2 border border-border text-text-2 tabular-nums text-[10px]">
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
                                {a.agency_memo ? a.agency_memo : <span className="text-text-muted italic">메모 없음</span>}
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
                          <div
                            className="overflow-hidden animate-in fade-in slide-in-from-top-1.5 duration-200 flex items-start justify-between gap-3"
                            style={{ animationTimingFunction: "var(--ease-out)" }}
                          >
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
            총 {displayedApplicants.length}명 중 {(safePage - 1) * PAGE_SIZE + 1} ~{" "}
            {Math.min(safePage * PAGE_SIZE, displayedApplicants.length)}명 표시
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(Math.max(1, safePage - 1))}
              className="px-3 py-1.5 rounded-xl bg-surface2 hover:bg-surface3 text-text-2 disabled:opacity-40 border border-border font-medium transition btn-press"
            >
              이전
            </button>
            <span className="px-3 py-1.5 rounded-xl bg-bg border border-border font-mono text-text">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
              className="px-3 py-1.5 rounded-xl bg-surface2 hover:bg-surface3 text-text-2 disabled:opacity-40 border border-border font-medium transition btn-press"
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
          <div className="bg-surface border border-border rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border shrink-0">
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

            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              {/* Template Type Selector Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {CAMPAIGN_MESSAGE_TYPES.map((t) => (
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
