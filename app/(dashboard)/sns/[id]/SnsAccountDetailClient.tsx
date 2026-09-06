"use client";

import { useMemo, useState } from "react";
import { useOrigin } from "@/components/useOrigin";
import { useRouter } from "next/navigation";
import {
  SnsAccount,
  SnsContent,
  SnsIntakeResponse,
  SnsContentStatus,
  SnsPlatform,
  PreSurveyQuestion,
  SNS_CONTENT_STATUSES,
  SNS_CONTENT_STATUS_LABELS,
} from "@/lib/db/types";
import {
  createSnsContentAction,
  updateSnsContentAction,
  deleteSnsContentAction,
  generateSnsAiCaptionAction,
  updateSnsAccountAction,
} from "../actions";
import { isoToKstDateString, buildMonthGrid, shiftMonth } from "@/lib/seeding/dday";
import Link from "next/link";
import {
  Calendar,
  List,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  Plus,
  FileText,
  BarChart3,
  Loader2,
  Save,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

const STATUS_TONE: Record<SnsContentStatus, string> = {
  planning: "text-zinc-400",
  producing: "text-amber-400",
  pending_approval: "text-sky-400",
  approved: "text-blue-400",
  posted: "text-emerald-400",
};

interface ContentForm {
  title: string;
  scheduled_on: string;
  assignee: string;
  caption: string;
  hashtags: string;
  media_note: string;
}

const EMPTY_FORM: ContentForm = { title: "", scheduled_on: "", assignee: "", caption: "", hashtags: "", media_note: "" };

export default function SnsAccountDetailClient({
  account: initialAccount,
  initialContents,
  intakeResponse,
  intakeQuestions,
  todayKst,
}: {
  account: SnsAccount;
  initialContents: SnsContent[];
  intakeResponse: SnsIntakeResponse | null;
  intakeQuestions: PreSurveyQuestion[];
  /** 서버에서 KST로 계산한 오늘 (YYYY-MM-DD) */
  todayKst: string;
}) {
  const router = useRouter();
  const [account, setAccount] = useState<SnsAccount>(initialAccount);
  const [activeTab, setActiveTab] = useState<"calendar" | "list" | "intake">("calendar");
  const [contents, setContents] = useState<SnsContent[]>(initialContents);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const origin = useOrigin();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Calendar (initial month from server KST today)
  const [calendarMonth, setCalendarMonth] = useState(todayKst.slice(0, 7));
  const grid = useMemo(() => buildMonthGrid(calendarMonth, todayKst), [calendarMonth, todayKst]);
  const [calYear, calMonth] = calendarMonth.split("-").map((v) => parseInt(v, 10));

  // Account edit
  const [editingAccount, setEditingAccount] = useState(false);
  const [accountForm, setAccountForm] = useState({
    company_name: initialAccount.company_name,
    platform: initialAccount.platform,
    handle: initialAccount.handle,
    starts_on: initialAccount.starts_on || "",
    ends_on: initialAccount.ends_on || "",
  });
  const [savingAccount, setSavingAccount] = useState(false);

  // Content modal (create / edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContentForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);

  // Performance inputs
  const [perfInputs, setPerfInputs] = useState<Record<string, { views: string; likes: string; comments: string; postUrl: string }>>({});
  const [savingPerfId, setSavingPerfId] = useState<string | null>(null);

  // Monthly aggregation
  const postedContents = contents.filter((c) => c.status === "posted");
  const postedMonthOf = (c: SnsContent) => (isoToKstDateString(c.status_changed_at) || c.scheduled_on || "").slice(0, 7);
  const availableMonths = useMemo(() => {
    const set = new Set<string>([todayKst.slice(0, 7)]);
    postedContents.forEach((c) => {
      const m = postedMonthOf(c);
      if (m) set.add(m);
    });
    return Array.from(set).sort().reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contents, todayKst]);
  const [perfMonth, setPerfMonth] = useState(todayKst.slice(0, 7));
  const monthPosted = postedContents.filter((c) => postedMonthOf(c) === perfMonth);
  const sum = (list: SnsContent[], key: "view_count" | "like_count" | "comment_count") => list.reduce((acc, c) => acc + (c[key] || 0), 0);

  const handleCopy = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      window.prompt("아래 링크를 복사하세요", url);
    }
  };

  // ---------- Account ----------
  const handleToggleAccountStatus = async () => {
    const next = account.status === "active" ? "ended" : "active";
    if (!confirm(next === "ended" ? "계약을 종료 상태로 바꿀까요?" : "계정을 다시 운영중으로 바꿀까요?")) return;
    const res = await updateSnsAccountAction(account.id, { status: next });
    if (!res.ok) return setError(res.error);
    setAccount(res.data);
    router.refresh();
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAccount(true);
    setError(null);
    const res = await updateSnsAccountAction(account.id, {
      company_name: accountForm.company_name,
      platform: accountForm.platform,
      handle: accountForm.handle,
      starts_on: accountForm.starts_on || null,
      ends_on: accountForm.ends_on || null,
    });
    setSavingAccount(false);
    if (!res.ok) return setError(res.error);
    setAccount(res.data);
    setEditingAccount(false);
    router.refresh();
  };

  // ---------- Content modal ----------
  const openCreate = (dateStr?: string) => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, scheduled_on: dateStr || "" });
    setModalOpen(true);
  };

  const openEdit = (c: SnsContent) => {
    setEditingId(c.id);
    setForm({
      title: c.title,
      scheduled_on: c.scheduled_on || "",
      assignee: c.assignee || "",
      caption: c.caption || "",
      hashtags: c.hashtags || "",
      media_note: c.media_note || "",
    });
    setModalOpen(true);
  };

  const handleAiCaption = async () => {
    if (!form.title.trim()) {
      setError("콘텐츠 제목/주제를 먼저 입력해주세요.");
      return;
    }
    setLoadingAi(true);
    setError(null);
    setNotice(null);
    const res = await generateSnsAiCaptionAction({
      accountId: account.id,
      title: form.title,
      scheduledOn: form.scheduled_on || null,
      mediaNote: form.media_note || null,
    });
    setLoadingAi(false);
    if (!res.ok) return setError(res.error);
    if (res.data.fallback) {
      setNotice("AI 제안 실패 — 직접 입력해주세요.");
      return;
    }
    setForm((prev) => ({ ...prev, caption: res.data.caption, hashtags: res.data.hashtags }));
  };

  const handleSubmitContent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    if (editingId) {
      const res = await updateSnsContentAction(editingId, account.id, {
        title: form.title,
        scheduled_on: form.scheduled_on || null,
        assignee: form.assignee || null,
        caption: form.caption || null,
        hashtags: form.hashtags || null,
        media_note: form.media_note || null,
      });
      setSaving(false);
      if (!res.ok) return setError(res.error);
      setContents((prev) => prev.map((c) => (c.id === editingId ? res.data : c)));
    } else {
      const res = await createSnsContentAction({
        accountId: account.id,
        title: form.title,
        scheduledOn: form.scheduled_on || null,
        assignee: form.assignee || null,
        caption: form.caption || null,
        hashtags: form.hashtags || null,
        mediaNote: form.media_note || null,
      });
      setSaving(false);
      if (!res.ok) return setError(res.error);
      setContents((prev) => [res.data, ...prev]);
    }
    setModalOpen(false);
    router.refresh();
  };

  const handleDeleteContent = async (c: SnsContent) => {
    if (!confirm(`"${c.title}" 콘텐츠를 삭제할까요?`)) return;
    const res = await deleteSnsContentAction(c.id, account.id);
    if (!res.ok) return setError(res.error);
    setContents((prev) => prev.filter((x) => x.id !== c.id));
    router.refresh();
  };

  const handleStatusChange = async (c: SnsContent, status: SnsContentStatus) => {
    setError(null);
    const res = await updateSnsContentAction(c.id, account.id, { status });
    if (!res.ok) return setError(res.error);
    setContents((prev) => prev.map((x) => (x.id === c.id ? res.data : x)));
    router.refresh();
  };

  const perfOf = (c: SnsContent) =>
    perfInputs[c.id] || {
      views: String(c.view_count ?? ""),
      likes: String(c.like_count ?? ""),
      comments: String(c.comment_count ?? ""),
      postUrl: c.post_url || "",
    };

  const setPerf = (c: SnsContent, patch: Partial<{ views: string; likes: string; comments: string; postUrl: string }>) =>
    setPerfInputs((prev) => ({ ...prev, [c.id]: { ...perfOf(c), ...patch } }));

  const handleSavePerformance = async (c: SnsContent) => {
    const input = perfOf(c);
    const toInt = (v: string, label: string): number | null => {
      if (v.trim() === "") return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) throw new Error(`${label}은(는) 0 이상의 정수여야 합니다.`);
      return n;
    };
    setError(null);
    let patch;
    try {
      patch = {
        view_count: toInt(input.views, "조회수"),
        like_count: toInt(input.likes, "좋아요"),
        comment_count: toInt(input.comments, "댓글수"),
        post_url: input.postUrl.trim() || null,
      };
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    setSavingPerfId(c.id);
    const res = await updateSnsContentAction(c.id, account.id, patch);
    setSavingPerfId(null);
    if (!res.ok) return setError(res.error);
    setContents((prev) => prev.map((x) => (x.id === c.id ? res.data : x)));
    setPerfInputs((prev) => {
      const next = { ...prev };
      delete next[c.id];
      return next;
    });
    setNotice("성과 수치가 저장되었습니다.");
  };

  const platformLabel = (p: SnsPlatform) => p.toUpperCase();
  const inputCls = "w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-sky-500";

  const tabBtn = (key: typeof activeTab, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setActiveTab(key)}
      className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
        activeTab === key ? "bg-sky-600/15 text-sky-400 border border-sky-500/30" : "text-zinc-400 hover:text-white"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="p-5 sm:p-7 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 shadow-xl">
        {!editingAccount ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs font-semibold">{platformLabel(account.platform)}</span>
                <button
                  type="button"
                  onClick={handleToggleAccountStatus}
                  title="클릭하여 상태 변경"
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${account.status === "active" ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-800 text-zinc-500"}`}
                >
                  {account.status === "active" ? "운영중" : "계약종료"}
                </button>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-zinc-100">{account.company_name}</h1>
              <p className="text-xs text-sky-400 font-mono">
                @{account.handle} <span className="text-zinc-500">· 계약 {account.starts_on || "미정"} ~ {account.ends_on || "미정"}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setEditingAccount(true)} className="px-3 py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] border border-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5">
                <Pencil className="w-3.5 h-3.5" /> 계정 수정
              </button>
              <Link href={`/sns/${account.id}/plan`} className="px-4 py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] border border-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5 transition active:scale-95">
                <FileText className="w-3.5 h-3.5 text-sky-400" />
                <span>SNS 운영안 (웹/PPT)</span>
              </Link>
              <button type="button" onClick={() => openCreate()} className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-md transition active:scale-95">
                <Plus className="w-3.5 h-3.5" />
                <span>새 콘텐츠 기획</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSaveAccount} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-zinc-100">계정 정보 수정</h2>
              <button type="button" onClick={() => setEditingAccount(false)} className="text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="text" required value={accountForm.company_name} onChange={(e) => setAccountForm({ ...accountForm, company_name: e.target.value })} placeholder="브랜드명 *" className={inputCls} />
              <input type="text" required value={accountForm.handle} onChange={(e) => setAccountForm({ ...accountForm, handle: e.target.value })} placeholder="핸들 *" className={`${inputCls} font-mono`} />
              <select value={accountForm.platform} onChange={(e) => setAccountForm({ ...accountForm, platform: e.target.value as SnsPlatform })} className={inputCls}>
                <option value="instagram">인스타그램</option>
                <option value="youtube">유튜브</option>
                <option value="tiktok">틱톡</option>
                <option value="other">기타</option>
              </select>
              <div className="flex gap-2">
                <input type="date" value={accountForm.starts_on} onChange={(e) => setAccountForm({ ...accountForm, starts_on: e.target.value })} className={inputCls} />
                <input type="date" value={accountForm.ends_on} onChange={(e) => setAccountForm({ ...accountForm, ends_on: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingAccount(false)} className="px-4 py-2 rounded-xl bg-[#181A20] text-zinc-300 text-xs">취소</button>
              <button type="submit" disabled={savingAccount} className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
                {savingAccount ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} 저장
              </button>
            </div>
          </form>
        )}

        {/* Public links */}
        <div className="pt-3 border-t border-[#22242A] grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { key: "intake", title: "1. 광고주 자료요청 / 사전설문 링크", path: `/sns-intake/${account.intake_token}`, desc: "브랜드 톤앤매너 및 중점 프로모션을 수집하는 무로그인 공개 링크" },
            { key: "approval", title: "2. 광고주 시안 승인(컨펌) 링크", path: `/sns-approval/${account.approval_token}`, desc: "승인대기 콘텐츠만 확인하고 승인/수정요청을 처리하는 전용 링크" },
          ].map((l) => (
            <div key={l.key} className="p-3.5 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-200">{l.title}</span>
                <a href={l.path} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-sky-400 p-0.5"><ExternalLink className="w-3.5 h-3.5" /></a>
              </div>
              <p className="text-[11px] text-zinc-500">{l.desc}</p>
              <button type="button" onClick={() => handleCopy(l.key, `${origin}${l.path}`)} className="w-full py-1.5 rounded-lg bg-[#131418] hover:bg-[#181A20] border border-[#22242A] text-xs font-medium text-zinc-300 inline-flex items-center justify-center gap-1.5 transition">
                {copiedKey === l.key ? <Check className="w-3.5 h-3.5 text-sky-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                <span>{copiedKey === l.key ? "복사완료!" : "링크 복사"}</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}
      {notice && <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">{notice}</div>}

      {/* Monthly performance */}
      <div className="p-5 rounded-3xl bg-[#131418] border border-[#22242A] space-y-3 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-bold text-zinc-100">월별 게시 성과 (게시완료 전환 월 기준)</h2>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <select value={perfMonth} onChange={(e) => setPerfMonth(e.target.value)} className="px-2.5 py-1.5 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-200 text-xs font-mono focus:outline-none focus:border-sky-500">
              {availableMonths.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <span className="text-zinc-500">전체 누적 {postedContents.length}건 · 조회 {sum(postedContents, "view_count").toLocaleString()}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums">
          {[
            { label: "게시 건수", value: `${monthPosted.length}건`, cls: "text-zinc-200" },
            { label: "조회수", value: `${sum(monthPosted, "view_count").toLocaleString()}회`, cls: "text-sky-400" },
            { label: "좋아요", value: `${sum(monthPosted, "like_count").toLocaleString()}개`, cls: "text-blue-400" },
            { label: "댓글수", value: `${sum(monthPosted, "comment_count").toLocaleString()}개`, cls: "text-indigo-400" },
          ].map((k) => (
            <div key={k.label} className="p-3.5 rounded-2xl bg-[#090A0C] border border-[#22242A]">
              <div className="text-[11px] text-zinc-500 font-sans">{perfMonth} {k.label}</div>
              <div className={`text-lg font-bold ${k.cls}`}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#22242A] pb-1 overflow-x-auto">
        {tabBtn("calendar", <Calendar className="w-3.5 h-3.5" />, "콘텐츠 캘린더 (월별 뷰)")}
        {tabBtn("list", <List className="w-3.5 h-3.5" />, `콘텐츠 목록 및 성과 관리 (${contents.length})`)}
        {tabBtn("intake", <FileText className="w-3.5 h-3.5" />, "광고주 사전설문 답변")}
      </div>

      {/* Calendar */}
      {activeTab === "calendar" && (
        <div className="p-5 sm:p-6 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-sky-400" /> {calYear}년 {calMonth}월 SNS 콘텐츠 발행 스케줄
            </h2>
            <div className="flex items-center gap-1 bg-[#090A0C] p-1 rounded-xl border border-[#22242A]">
              <button type="button" onClick={() => setCalendarMonth(shiftMonth(calendarMonth, -1))} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#181A20] transition"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-xs font-bold text-zinc-200 px-2 font-mono">{calendarMonth}</span>
              <button type="button" onClick={() => setCalendarMonth(shiftMonth(calendarMonth, 1))} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#181A20] transition"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="border border-[#22242A] rounded-2xl overflow-hidden bg-[#090A0C]">
            <div className="grid grid-cols-7 text-center text-xs font-bold text-zinc-400 border-b border-[#22242A] bg-[#131418] py-2.5">
              <div className="text-red-400">일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div className="text-blue-400">토</div>
            </div>
            <div className="grid grid-cols-7 divide-x divide-y divide-[#22242A]">
              {Array.from({ length: grid.leadingBlanks }).map((_, idx) => <div key={`blank-${idx}`} className="h-28 sm:h-32 bg-[#090A0C]/40" />)}
              {grid.cells.map((cell) => {
                const items = contents.filter((c) => c.scheduled_on === cell.dateStr);
                return (
                  <div
                    key={cell.dateStr}
                    onClick={() => openCreate(cell.dateStr)}
                    className={`h-28 sm:h-32 p-1.5 sm:p-2 flex flex-col justify-between hover:bg-[#181A20] cursor-pointer transition group ${cell.isToday ? "bg-sky-950/20" : ""}`}
                    title="클릭하여 이 날짜에 새 콘텐츠 기획"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-mono font-bold ${cell.isToday ? "text-sky-400 underline" : "text-zinc-300"} group-hover:text-sky-400`}>{cell.dayNum}</span>
                      {items.length > 0 && <span className="w-4 h-4 rounded-full bg-sky-500/20 text-sky-300 text-[10px] font-bold flex items-center justify-center font-mono">{items.length}</span>}
                    </div>
                    <div className="space-y-1 overflow-y-auto max-h-20">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          onClick={(e) => { e.stopPropagation(); openEdit(item); }}
                          className="p-1 rounded-md bg-[#131418] border border-[#22242A] text-[10px] space-y-0.5 truncate hover:border-sky-500/40"
                        >
                          <span className={`text-[9px] font-bold ${STATUS_TONE[item.status]}`}>{SNS_CONTENT_STATUS_LABELS[item.status]}</span>
                          <div className="font-bold text-zinc-200 truncate">{item.title}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {activeTab === "list" && (
        <div className="space-y-3">
          {contents.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-[#22242A] rounded-2xl bg-[#131418]">
              등록된 콘텐츠가 없습니다. 상단의 [새 콘텐츠 기획]을 눌러 첫 콘텐츠를 등록하세요.
            </div>
          ) : (
            contents.map((c) => {
              const perf = perfOf(c);
              return (
                <div key={c.id} className="p-5 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 shadow-md">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={c.status}
                          onChange={(e) => handleStatusChange(c, e.target.value as SnsContentStatus)}
                          className={`px-2.5 py-1 rounded-lg bg-[#090A0C] border border-[#22242A] text-xs font-bold focus:outline-none focus:border-sky-500 ${STATUS_TONE[c.status]}`}
                        >
                          {SNS_CONTENT_STATUSES.map((s, i) => <option key={s} value={s}>{i + 1}. {SNS_CONTENT_STATUS_LABELS[s]}</option>)}
                        </select>
                        <span className="text-xs text-zinc-400 font-mono">예정: {c.scheduled_on || "미정"}</span>
                        {c.assignee && <span className="text-[11px] px-2 py-0.5 rounded bg-[#090A0C] text-zinc-400">담당: {c.assignee}</span>}
                      </div>
                      <h3 className="text-base font-bold text-zinc-100">{c.title}</h3>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button type="button" onClick={() => openEdit(c)} className="px-3 py-1.5 rounded-lg bg-[#181A20] hover:bg-[#22242A] border border-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1"><Pencil className="w-3 h-3" /> 수정</button>
                      <button type="button" onClick={() => handleDeleteContent(c)} className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>

                  {c.client_comment && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                      <strong>광고주 수정요청:</strong> {c.client_comment}
                      <span className="text-amber-500/70 ml-2">→ 수정 후 상태를 &quot;승인대기&quot;로 바꾸면 광고주 화면에 다시 표시됩니다.</span>
                    </div>
                  )}

                  <div className="p-4 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-2 text-xs">
                    <span className="text-[11px] font-bold text-zinc-400 block">캡션 본문:</span>
                    <p className="text-zinc-200 leading-relaxed whitespace-pre-line">{c.caption || "작성된 캡션이 없습니다."}</p>
                    {c.hashtags && <p className="text-sky-400 font-medium">{c.hashtags}</p>}
                    {c.media_note && <div className="pt-2 border-t border-[#181A20] text-zinc-500"><strong>내부 제작 메모 (광고주 비노출):</strong> {c.media_note}</div>}
                  </div>

                  {c.status === "posted" && (
                    <div className="pt-3 border-t border-[#22242A] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <input type="url" placeholder="게시 링크 (https://...)" value={perf.postUrl} onChange={(e) => setPerf(c, { postUrl: e.target.value })} className="w-48 px-2.5 py-1.5 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-100" />
                        <input type="number" min={0} step={1} placeholder="조회수" value={perf.views} onChange={(e) => setPerf(c, { views: e.target.value })} className="w-24 px-2.5 py-1.5 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-100 font-mono" />
                        <input type="number" min={0} step={1} placeholder="좋아요" value={perf.likes} onChange={(e) => setPerf(c, { likes: e.target.value })} className="w-24 px-2.5 py-1.5 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-100 font-mono" />
                        <input type="number" min={0} step={1} placeholder="댓글수" value={perf.comments} onChange={(e) => setPerf(c, { comments: e.target.value })} className="w-24 px-2.5 py-1.5 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-100 font-mono" />
                        <button type="button" disabled={savingPerfId === c.id} onClick={() => handleSavePerformance(c)} className="px-3 py-1.5 rounded-lg bg-[#181A20] hover:bg-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                          {savingPerfId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          <span>성과 저장</span>
                        </button>
                      </div>
                      {c.post_url && (
                        <a href={c.post_url} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline inline-flex items-center gap-1 shrink-0">
                          <span>게시물 바로가기</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Intake */}
      {activeTab === "intake" && (
        <div className="p-5 sm:p-7 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold text-zinc-100">광고주 사전설문(자료요청) 응답 결과</h2>
            {intakeResponse && (
              <span className="text-xs text-zinc-500 font-mono">제출일: {new Date(intakeResponse.submitted_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</span>
            )}
          </div>

          {!intakeResponse ? (
            <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-[#22242A] rounded-2xl bg-[#090A0C]">
              아직 광고주가 설문을 제출하지 않았습니다. 상단의 [링크 복사]를 통해 광고주에게 사전설문 링크를 전달하세요.
            </div>
          ) : (
            <div className="space-y-4 divide-y divide-[#22242A]">
              {intakeQuestions.map((q, idx) => (
                <div key={q.id} className={idx > 0 ? "pt-4 space-y-1.5" : "space-y-1.5"}>
                  <div className="text-xs font-bold text-sky-400">{idx + 1}. {q.question}</div>
                  <div className="p-3.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-xs text-zinc-200 leading-relaxed whitespace-pre-line">
                    {intakeResponse.answers[q.id] || <span className="text-zinc-600">(답변 없음)</span>}
                  </div>
                </div>
              ))}
              {Object.keys(intakeResponse.answers).filter((k) => !intakeQuestions.some((q) => q.id === k)).map((k) => (
                <div key={k} className="pt-4 space-y-1.5">
                  <div className="text-xs font-bold text-zinc-500">(삭제된 질문 {k})</div>
                  <div className="p-3.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-xs text-zinc-400 whitespace-pre-line">{intakeResponse.answers[k]}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-[#131418] border-t sm:border border-[#22242A] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-[#22242A]">
              <h2 className="text-base font-bold text-zinc-100">{editingId ? "콘텐츠 수정" : "신규 SNS 콘텐츠 기획안 등록"}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={handleSubmitContent} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">콘텐츠 제목 / 주제 *</label>
                <input type="text" required placeholder="예: 3초 속건조 탈출! 하이드라 세럼 제형 릴스" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">발행 예정 일자</label>
                  <input type="date" value={form.scheduled_on} onChange={(e) => setForm({ ...form, scheduled_on: e.target.value })} className={inputCls} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-300">담당자</label>
                  <input type="text" placeholder="김콘텐츠 매니저" value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} className={inputCls} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">내부 제작 메모 (광고주 화면에는 보이지 않음)</label>
                <textarea rows={2} placeholder="유리볼 롤링 클로즈업 촬영본 준비" value={form.media_note} onChange={(e) => setForm({ ...form, media_note: e.target.value })} className={inputCls} />
              </div>

              <div className="space-y-1.5 pt-2 border-t border-[#22242A]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-300">캡션 본문 (카피)</label>
                  <button type="button" disabled={loadingAi} onClick={handleAiCaption} className="px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[11px] font-semibold inline-flex items-center gap-1 active:scale-95 disabled:opacity-50">
                    {loadingAi ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    <span>Gemini AI 문안 작성</span>
                  </button>
                </div>
                <textarea rows={4} value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} placeholder="캡션 본문..." className={`${inputCls} leading-relaxed`} />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">해시태그</label>
                <input type="text" value={form.hashtags} onChange={(e) => setForm({ ...form, hashtags: e.target.value })} placeholder="#글로우랩 #하이드라앰플" className={inputCls} />
              </div>

              <div className="pt-3 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button type="button" onClick={() => setModalOpen(false)} className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-300 text-xs">취소</button>
                <button type="submit" disabled={saving} className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md disabled:opacity-50">
                  {saving ? "저장 중..." : editingId ? "수정 저장" : "기획안 등록"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
