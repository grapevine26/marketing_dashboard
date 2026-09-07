"use client";

import { useMemo, useState, useRef } from "react";
import { useOrigin } from "@/components/useOrigin";
import { useRouter } from "next/navigation";
import {
  SnsAccount,
  SnsContent,
  SnsIntakeResponse,
  SnsContentStatus,
  SnsPlatform,
  SnsMediaAttachment,
  PreSurveyQuestion,
  SNS_CONTENT_STATUSES,
  SNS_CONTENT_STATUS_LABELS,
} from "@/lib/db/types";
import {
  createSnsContentAction,
  updateSnsContentAction,
  deleteSnsContentAction,
  uploadSnsMediaAction,
  deleteSnsMediaAction,
  generateSnsAiCaptionAction,
  updateSnsAccountAction,
  regenerateSnsTokenAction,
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
  Image as ImageIcon,
  Video as VideoIcon,
  UploadCloud,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";

const STATUS_TONE: Record<SnsContentStatus, string> = {
  planning: "text-text-sub",
  producing: "text-warn",
  pending_approval: "text-accent2",
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
  const [confirmTokenTarget, setConfirmTokenTarget] = useState<{ key: "intake" | "approval"; title: string } | null>(null);
  const [reissuingToken, setReissuingToken] = useState(false);

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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<SnsMediaAttachment | null>(null);
  const editingContent = useMemo(() => (editingId ? contents.find((c) => c.id === editingId) || null : null), [editingId, contents]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleRegenerateSnsToken = async () => {
    if (!confirmTokenTarget) return;
    setReissuingToken(true);
    setError(null);
    setNotice(null);
    const res = await regenerateSnsTokenAction(account.id, confirmTokenTarget.key);
    setReissuingToken(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setAccount(res.data);
    setNotice(`'${confirmTokenTarget.title}' 링크가 새로 발급되었습니다. 이전 링크는 즉시 차단되었습니다.`);
    setConfirmTokenTarget(null);
    router.refresh();
    setTimeout(() => setNotice(null), 4000);
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
    setSelectedFiles([]);
    setForm({ ...EMPTY_FORM, scheduled_on: dateStr || "" });
    setModalOpen(true);
  };

  const openEdit = (c: SnsContent) => {
    setEditingId(c.id);
    setSelectedFiles([]);
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

  /** 미디어 URL에는 계정 승인 토큰을 붙여야 서버가 응답한다 (/api/media 는 토큰 필수). */
  const mediaSrc = (m: SnsMediaAttachment) => `${m.url}?token=${encodeURIComponent(account.approval_token)}`;

  /**
   * 서버 액션이 413(본문 한도 초과) 등으로 예외를 던지면 클라이언트에서는 throw 로 나타난다.
   * 조용히 실패하지 않도록 사람이 읽을 수 있는 메시지로 바꾼다.
   */
  const safeUpload = async (fd: FormData, file: File): Promise<{ ok: true; data: SnsMediaAttachment } | { ok: false; error: string }> => {
    try {
      return await uploadSnsMediaAction(fd);
    } catch (err) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      const msg = err instanceof Error ? err.message : String(err);
      const tooLarge = /body|limit|413|exceed/i.test(msg);
      return { ok: false, error: tooLarge ? `"${file.name}" (${mb}MB)이(가) 서버 업로드 한도를 넘었습니다. 50MB 이하로 줄여주세요.` : `"${file.name}" 업로드 중 오류가 발생했습니다.` };
    }
  };

  const handleSelectFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!editingId) {
      setSelectedFiles((prev) => [...prev, ...Array.from(files)]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploadingMedia(true);
    setError(null);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("contentId", editingId);
      fd.append("accountId", account.id);
      fd.append("file", file);
      const res = await safeUpload(fd, file);
      if (!res.ok) {
        setError(res.error);
      } else {
        setContents((prev) =>
          prev.map((c) =>
            c.id === editingId
              ? { ...c, media_attachments: [...(c.media_attachments || []), res.data] }
              : c
          )
        );
      }
    }
    setUploadingMedia(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteMedia = async (contentId: string, attachmentId: string) => {
    if (!confirm("이 시안 미디어를 삭제할까요?")) return;
    const res = await deleteSnsMediaAction(contentId, attachmentId, account.id);
    if (!res.ok) return setError(res.error);
    setContents((prev) =>
      prev.map((c) =>
        c.id === contentId
          ? { ...c, media_attachments: (c.media_attachments || []).filter((m) => m.id !== attachmentId) }
          : c
      )
    );
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
      if (!res.ok) {
        setSaving(false);
        return setError(res.error);
      }
      let createdContent = res.data;
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          const fd = new FormData();
          fd.append("contentId", createdContent.id);
          fd.append("accountId", account.id);
          fd.append("file", file);
          const upRes = await safeUpload(fd, file);
          if (!upRes.ok) {
            setError(`"${file.name}" 첨부 실패: ${upRes.error}`);
          } else {
            createdContent = {
              ...createdContent,
              media_attachments: [...(createdContent.media_attachments || []), upRes.data],
            };
          }
        }
      }
      setSaving(false);
      setContents((prev) => [createdContent, ...prev]);
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
  const inputCls = "w-full px-3.5 py-2.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-accent2";

  const tabBtn = (key: typeof activeTab, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setActiveTab(key)}
      className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
        activeTab === key ? "bg-accent2/15 text-accent2 border border-accent2/30" : "text-text-sub hover:text-white"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="p-5 sm:p-7 rounded-3xl bg-surface border border-border space-y-4 shadow-xl">
        {!editingAccount ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-accent2/10 text-accent2 border border-accent2/20 text-xs font-semibold">{platformLabel(account.platform)}</span>
                <button
                  type="button"
                  onClick={handleToggleAccountStatus}
                  title="클릭하여 상태 변경"
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${account.status === "active" ? "bg-emerald-500/15 text-emerald-400" : "bg-surface3 text-text-muted"}`}
                >
                  {account.status === "active" ? "운영중" : "계약종료"}
                </button>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-text">{account.company_name}</h1>
              <p className="text-xs text-accent2 font-mono">
                @{account.handle} <span className="text-text-muted">· 계약 {account.starts_on || "미정"} ~ {account.ends_on || "미정"}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setEditingAccount(true)} className="px-3 py-2 rounded-xl bg-surface2 hover:bg-surface3 border border-border text-text text-xs font-semibold inline-flex items-center gap-1.5">
                <Pencil className="w-3.5 h-3.5" /> 계정 수정
              </button>
              <Link href={`/sns/${account.id}/plan`} className="px-4 py-2 rounded-xl bg-surface2 hover:bg-surface3 border border-border text-text text-xs font-semibold inline-flex items-center gap-1.5 transition active:scale-95">
                <FileText className="w-3.5 h-3.5 text-accent2" />
                <span>SNS 운영안 (웹/PPT)</span>
              </Link>
              <button type="button" onClick={() => openCreate()} className="px-4 py-2 rounded-xl bg-accent2 hover:bg-accent2/90 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-md transition active:scale-95">
                <Plus className="w-3.5 h-3.5" />
                <span>새 콘텐츠 기획</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSaveAccount} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-text">계정 정보 수정</h2>
              <button type="button" onClick={() => setEditingAccount(false)} className="text-text-sub hover:text-text"><X className="w-4 h-4" /></button>
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
              <button type="button" onClick={() => setEditingAccount(false)} className="px-4 py-2 rounded-xl bg-surface2 text-text-2 text-xs">취소</button>
              <button type="submit" disabled={savingAccount} className="px-4 py-2 rounded-xl bg-accent2 hover:bg-accent2/90 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
                {savingAccount ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} 저장
              </button>
            </div>
          </form>
        )}

        {/* Public links */}
        <div className="pt-3 border-t border-border grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { key: "intake" as const, title: "1. 광고주 자료요청 / 사전설문 링크", path: `/sns-intake/${account.intake_token}`, desc: "브랜드 톤앤매너 및 중점 프로모션을 수집하는 무로그인 공개 링크" },
            { key: "approval" as const, title: "2. 광고주 시안 승인(컨펌) 링크", path: `/sns-approval/${account.approval_token}`, desc: "승인대기 콘텐츠만 확인하고 승인/수정요청을 처리하는 전용 링크" },
          ].map((l) => (
            <div key={l.key} className="p-3.5 rounded-2xl bg-bg border border-border space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text">{l.title}</span>
                  <a href={l.path} target="_blank" rel="noopener noreferrer" className="text-text-sub hover:text-accent2 p-0.5" title="새 창으로 링크 열기"><ExternalLink className="w-3.5 h-3.5" /></a>
                </div>
                <p className="text-[11px] text-text-muted mt-0.5">{l.desc}</p>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <button type="button" onClick={() => handleCopy(l.key, `${origin}${l.path}`)} className="flex-1 py-1.5 rounded-lg bg-surface hover:bg-surface2 border border-border text-xs font-medium text-text-2 inline-flex items-center justify-center gap-1.5 transition">
                  {copiedKey === l.key ? <Check className="w-3.5 h-3.5 text-accent2" /> : <Copy className="w-3.5 h-3.5 text-text-sub" />}
                  <span>{copiedKey === l.key ? "복사완료!" : "링크 복사"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmTokenTarget({ key: l.key, title: l.title })}
                  title="보안 링크 재발급 (이전 링크 즉시 무효화)"
                  className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-amber-500/10 hover:border-amber-500/30 border border-border text-text-sub hover:text-warn text-xs font-medium inline-flex items-center justify-center gap-1 transition active:scale-95"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span className="text-[11px]">재발급</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 보안 토큰 재발급 확인 모달 */}
      {confirmTokenTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-surface border border-amber-500/30 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-warn">
                <ShieldAlert className="w-5 h-5" />
                <h3 className="text-sm font-bold text-text">SNS 전용 링크 재발급 (보안 회수)</h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmTokenTarget(null)}
                className="text-text-sub hover:text-text p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-bg border border-border space-y-1.5">
              <div className="text-xs font-bold text-text">{confirmTokenTarget.title}</div>
              <p className="text-xs text-text-sub leading-relaxed">
                전용 접속 토큰을 즉시 새로운 난수로 교체합니다.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-warn-soft leading-relaxed space-y-1">
              <p className="font-semibold text-warn">⚠️ 이전 링크 즉시 404 차단 안내</p>
              <p className="text-text-2">
                재발급 즉시 이전에 공유되었던 기존 링크는 유효하지 않은 주소가 되어 외부 접근이 차단됩니다. 광고주에게 새로운 링크를 다시 전달해야 합니다.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setConfirmTokenTarget(null)}
                disabled={reissuingToken}
                className="px-4 py-2 rounded-xl bg-surface2 hover:bg-surface3 text-text-2 text-xs font-medium transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleRegenerateSnsToken}
                disabled={reissuingToken}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition inline-flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
              >
                {reissuingToken ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                <span>새 링크로 재발급 진행</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}
      {notice && <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">{notice}</div>}

      {/* Monthly performance */}
      <div className="p-5 rounded-3xl bg-surface border border-border space-y-3 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-accent2" />
            <h2 className="text-sm font-bold text-text">월별 게시 성과 (게시완료 전환 월 기준)</h2>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <select value={perfMonth} onChange={(e) => setPerfMonth(e.target.value)} className="px-2.5 py-1.5 rounded-lg bg-bg border border-border text-text text-xs font-mono focus:outline-none focus:border-accent2">
              {availableMonths.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <span className="text-text-muted">전체 누적 {postedContents.length}건 · 조회 {sum(postedContents, "view_count").toLocaleString()}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums">
          {[
            { label: "게시 건수", value: `${monthPosted.length}건`, cls: "text-text" },
            { label: "조회수", value: `${sum(monthPosted, "view_count").toLocaleString()}회`, cls: "text-accent2" },
            { label: "좋아요", value: `${sum(monthPosted, "like_count").toLocaleString()}개`, cls: "text-blue-400" },
            { label: "댓글수", value: `${sum(monthPosted, "comment_count").toLocaleString()}개`, cls: "text-indigo-400" },
          ].map((k) => (
            <div key={k.label} className="p-3.5 rounded-2xl bg-bg border border-border">
              <div className="text-[11px] text-text-muted font-sans">{perfMonth} {k.label}</div>
              <div className={`text-lg font-bold ${k.cls}`}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-1 overflow-x-auto">
        {tabBtn("calendar", <Calendar className="w-3.5 h-3.5" />, "콘텐츠 캘린더 (월별 뷰)")}
        {tabBtn("list", <List className="w-3.5 h-3.5" />, `콘텐츠 목록 및 성과 관리 (${contents.length})`)}
        {tabBtn("intake", <FileText className="w-3.5 h-3.5" />, "광고주 사전설문 답변")}
      </div>

      {/* Calendar */}
      {activeTab === "calendar" && (
        <div className="p-5 sm:p-6 rounded-3xl bg-surface border border-border space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-text flex items-center gap-2">
              <Calendar className="w-5 h-5 text-accent2" /> {calYear}년 {calMonth}월 SNS 콘텐츠 발행 스케줄
            </h2>
            <div className="flex items-center gap-1 bg-bg p-1 rounded-xl border border-border">
              <button type="button" onClick={() => setCalendarMonth(shiftMonth(calendarMonth, -1))} className="p-1.5 rounded-lg text-text-sub hover:text-text hover:bg-surface2 transition"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-xs font-bold text-text px-2 font-mono">{calendarMonth}</span>
              <button type="button" onClick={() => setCalendarMonth(shiftMonth(calendarMonth, 1))} className="p-1.5 rounded-lg text-text-sub hover:text-text hover:bg-surface2 transition"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="border border-border rounded-2xl overflow-hidden bg-bg">
            <div className="grid grid-cols-7 text-center text-xs font-bold text-text-sub border-b border-border bg-surface py-2.5">
              <div className="text-red-400">일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div className="text-blue-400">토</div>
            </div>
            <div className="grid grid-cols-7 divide-x divide-y divide-border">
              {Array.from({ length: grid.leadingBlanks }).map((_, idx) => <div key={`blank-${idx}`} className="h-28 sm:h-32 bg-bg/40" />)}
              {grid.cells.map((cell) => {
                const items = contents.filter((c) => c.scheduled_on === cell.dateStr);
                return (
                  <div
                    key={cell.dateStr}
                    onClick={() => openCreate(cell.dateStr)}
                    className={`h-28 sm:h-32 p-1.5 sm:p-2 flex flex-col justify-between hover:bg-surface2 cursor-pointer transition group ${cell.isToday ? "bg-accent2/10" : ""}`}
                    title="클릭하여 이 날짜에 새 콘텐츠 기획"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-mono font-bold ${cell.isToday ? "text-accent2 underline" : "text-text-2"} group-hover:text-accent2`}>{cell.dayNum}</span>
                      {items.length > 0 && <span className="w-4 h-4 rounded-full bg-accent2/20 text-accent2 text-[10px] font-bold flex items-center justify-center font-mono">{items.length}</span>}
                    </div>
                    <div className="space-y-1 overflow-y-auto max-h-20">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          onClick={(e) => { e.stopPropagation(); openEdit(item); }}
                          className="p-1 rounded-md bg-surface border border-border text-[10px] space-y-0.5 truncate hover:border-accent2/40"
                        >
                          <span className={`text-[9px] font-bold ${STATUS_TONE[item.status]}`}>{SNS_CONTENT_STATUS_LABELS[item.status]}</span>
                          <div className="font-bold text-text truncate">{item.title}</div>
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
            <div className="p-8 text-center text-text-muted text-xs border border-dashed border-border rounded-2xl bg-surface">
              등록된 콘텐츠가 없습니다. 상단의 [새 콘텐츠 기획]을 눌러 첫 콘텐츠를 등록하세요.
            </div>
          ) : (
            contents.map((c) => {
              const perf = perfOf(c);
              return (
                <div key={c.id} className="p-5 rounded-3xl bg-surface border border-border space-y-4 shadow-md">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={c.status}
                          onChange={(e) => handleStatusChange(c, e.target.value as SnsContentStatus)}
                          className={`px-2.5 py-1 rounded-lg bg-bg border border-border text-xs font-bold focus:outline-none focus:border-accent2 ${STATUS_TONE[c.status]}`}
                        >
                          {SNS_CONTENT_STATUSES.map((s, i) => <option key={s} value={s}>{i + 1}. {SNS_CONTENT_STATUS_LABELS[s]}</option>)}
                        </select>
                        <span className="text-xs text-text-sub font-mono">예정: {c.scheduled_on || "미정"}</span>
                        {c.assignee && <span className="text-[11px] px-2 py-0.5 rounded bg-bg text-text-sub">담당: {c.assignee}</span>}
                      </div>
                      <h3 className="text-base font-bold text-text">{c.title}</h3>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button type="button" onClick={() => openEdit(c)} className="px-3 py-1.5 rounded-lg bg-surface2 hover:bg-surface3 border border-border text-text text-xs font-semibold inline-flex items-center gap-1"><Pencil className="w-3 h-3" /> 수정</button>
                      <button type="button" onClick={() => handleDeleteContent(c)} className="p-1.5 rounded-lg text-text-muted hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>

                  {c.client_comment && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-warn-soft text-xs">
                      <strong>광고주 수정요청:</strong> {c.client_comment}
                      <span className="text-warn-soft/80 ml-2">→ 수정 후 상태를 &quot;승인대기&quot;로 바꾸면 광고주 화면에 다시 표시됩니다.</span>
                    </div>
                  )}

                  <div className="p-4 rounded-2xl bg-bg border border-border space-y-2 text-xs">
                    <span className="text-[11px] font-bold text-text-sub block">캡션 본문:</span>
                    <p className="text-text leading-relaxed whitespace-pre-line">{c.caption || "작성된 캡션이 없습니다."}</p>
                    {c.hashtags && <p className="text-accent2 font-medium">{c.hashtags}</p>}
                    {c.media_note && <div className="pt-2 border-t border-surface2 text-text-muted"><strong>내부 제작 메모 (광고주 비노출):</strong> {c.media_note}</div>}
                  </div>

                  {c.media_attachments && c.media_attachments.length > 0 && (
                    <div className="p-3.5 rounded-2xl bg-bg border border-border space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-text-2">
                          <ImageIcon className="w-3.5 h-3.5 text-accent2" />
                          <span>시안 첨부 미디어 ({c.media_attachments.length}개)</span>
                        </div>
                        <span className="text-[10px] text-text-muted">클릭하여 원본 미리보기</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
                        {c.media_attachments.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setPreviewMedia(m)}
                            className="group relative flex flex-col items-start p-2 rounded-xl bg-surface border border-border hover:border-accent2/50 text-left transition overflow-hidden cursor-pointer"
                          >
                            {m.mime_type.startsWith("image/") ? (
                              <div className="w-full h-20 rounded-lg overflow-hidden bg-bg relative">
                                <img src={mediaSrc(m)} alt={m.name} className="w-full h-full object-cover group-hover:scale-105 transition" />
                              </div>
                            ) : (
                              <div className="w-full h-20 rounded-lg bg-bg flex flex-col items-center justify-center gap-1 text-accent2">
                                <VideoIcon className="w-6 h-6" />
                                <span className="text-[10px] text-text-sub font-mono">동영상</span>
                              </div>
                            )}
                            <span className="mt-1.5 text-[11px] font-medium text-text truncate w-full" title={m.name}>{m.name}</span>
                            <span className="text-[10px] text-text-muted font-mono">{(m.size / (1024 * 1024)).toFixed(1)} MB</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {c.status === "posted" && (
                    <div className="pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <input type="url" placeholder="게시 링크 (https://...)" value={perf.postUrl} onChange={(e) => setPerf(c, { postUrl: e.target.value })} className="w-48 px-2.5 py-1.5 rounded-lg bg-bg border border-border text-text" />
                        <input type="number" min={0} step={1} placeholder="조회수" value={perf.views} onChange={(e) => setPerf(c, { views: e.target.value })} className="w-24 px-2.5 py-1.5 rounded-lg bg-bg border border-border text-text font-mono" />
                        <input type="number" min={0} step={1} placeholder="좋아요" value={perf.likes} onChange={(e) => setPerf(c, { likes: e.target.value })} className="w-24 px-2.5 py-1.5 rounded-lg bg-bg border border-border text-text font-mono" />
                        <input type="number" min={0} step={1} placeholder="댓글수" value={perf.comments} onChange={(e) => setPerf(c, { comments: e.target.value })} className="w-24 px-2.5 py-1.5 rounded-lg bg-bg border border-border text-text font-mono" />
                        <button type="button" disabled={savingPerfId === c.id} onClick={() => handleSavePerformance(c)} className="px-3 py-1.5 rounded-lg bg-surface2 hover:bg-surface3 text-text text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                          {savingPerfId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          <span>성과 저장</span>
                        </button>
                      </div>
                      {c.post_url && (
                        <a href={c.post_url} target="_blank" rel="noopener noreferrer" className="text-accent2 hover:underline inline-flex items-center gap-1 shrink-0">
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
        <div className="p-5 sm:p-7 rounded-3xl bg-surface border border-border space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold text-text">광고주 사전설문(자료요청) 응답 결과</h2>
            {intakeResponse && (
              <span className="text-xs text-text-muted font-mono">제출일: {new Date(intakeResponse.submitted_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</span>
            )}
          </div>

          {!intakeResponse ? (
            <div className="p-8 text-center text-text-muted text-xs border border-dashed border-border rounded-2xl bg-bg">
              아직 광고주가 설문을 제출하지 않았습니다. 상단의 [링크 복사]를 통해 광고주에게 사전설문 링크를 전달하세요.
            </div>
          ) : (
            <div className="space-y-4 divide-y divide-border">
              {intakeQuestions.map((q, idx) => (
                <div key={q.id} className={idx > 0 ? "pt-4 space-y-1.5" : "space-y-1.5"}>
                  <div className="text-xs font-bold text-accent2">{idx + 1}. {q.question}</div>
                  <div className="p-3.5 rounded-xl bg-bg border border-border text-xs text-text leading-relaxed whitespace-pre-line">
                    {intakeResponse.answers[q.id] || <span className="text-text-faint">(답변 없음)</span>}
                  </div>
                </div>
              ))}
              {Object.keys(intakeResponse.answers).filter((k) => !intakeQuestions.some((q) => q.id === k)).map((k) => (
                <div key={k} className="pt-4 space-y-1.5">
                  <div className="text-xs font-bold text-text-muted">(삭제된 질문 {k})</div>
                  <div className="p-3.5 rounded-xl bg-bg border border-border text-xs text-text-sub whitespace-pre-line">{intakeResponse.answers[k]}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-surface border-t sm:border border-border rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h2 className="text-base font-bold text-text">{editingId ? "콘텐츠 수정" : "신규 SNS 콘텐츠 기획안 등록"}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="text-text-sub hover:text-text"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={handleSubmitContent} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-text-2">콘텐츠 제목 / 주제 *</label>
                <input type="text" required placeholder="예: 3초 속건조 탈출! 하이드라 세럼 제형 릴스" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-2">발행 예정 일자</label>
                  <input type="date" value={form.scheduled_on} onChange={(e) => setForm({ ...form, scheduled_on: e.target.value })} className={inputCls} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-2">담당자</label>
                  <input type="text" placeholder="김콘텐츠 매니저" value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} className={inputCls} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-text-2">내부 제작 메모 (광고주 화면에는 보이지 않음)</label>
                <textarea rows={2} placeholder="유리볼 롤링 클로즈업 촬영본 준비" value={form.media_note} onChange={(e) => setForm({ ...form, media_note: e.target.value })} className={inputCls} />
              </div>

              <div className="space-y-1.5 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-text-2">캡션 본문 (카피)</label>
                  <button type="button" disabled={loadingAi} onClick={handleAiCaption} className="px-2.5 py-1 rounded-lg bg-accent2/10 text-accent2 border border-accent2/20 text-[11px] font-semibold inline-flex items-center gap-1 active:scale-95 disabled:opacity-50">
                    {loadingAi ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    <span>Gemini AI 문안 작성</span>
                  </button>
                </div>
                <textarea rows={4} value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} placeholder="캡션 본문..." className={`${inputCls} leading-relaxed`} />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-text-2">해시태그</label>
                <input type="text" value={form.hashtags} onChange={(e) => setForm({ ...form, hashtags: e.target.value })} placeholder="#글로우랩 #하이드라앰플" className={inputCls} />
              </div>

              {/* Media Attachments Section */}
              <div className="space-y-2.5 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-text-2 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-accent2" />
                    <span>시안 미디어 (이미지 / 영상)</span>
                  </label>
                  <span className="text-[10px] text-text-muted">최대 50MB (JPG, PNG, WebP, GIF, MP4, WebM)</span>
                </div>

                {/* Existing attachments when editing */}
                {editingId && editingContent?.media_attachments && editingContent.media_attachments.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {editingContent.media_attachments.map((m) => (
                      <div key={m.id} className="relative p-2 rounded-xl bg-bg border border-border group">
                        {m.mime_type.startsWith("image/") ? (
                          <div className="w-full h-16 rounded-lg overflow-hidden bg-surface2">
                            <img src={mediaSrc(m)} alt={m.name} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-full h-16 rounded-lg bg-surface2 flex items-center justify-center text-accent2">
                            <VideoIcon className="w-6 h-6" />
                          </div>
                        )}
                        <p className="mt-1 text-[11px] text-text-2 truncate" title={m.name}>{m.name}</p>
                        <div className="flex items-center justify-between mt-1 text-[10px] text-text-muted font-mono">
                          <span>{(m.size / (1024 * 1024)).toFixed(1)} MB</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteMedia(editingId, m.id)}
                            className="text-red-400 hover:text-red-300 p-0.5 rounded hover:bg-red-500/10"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Staged files when creating */}
                {!editingId && selectedFiles.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] text-accent2 font-medium">등록 시 자동 업로드될 파일 ({selectedFiles.length}개):</span>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-bg border border-border text-xs">
                          <span className="text-text truncate text-[11px] max-w-[120px]">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-text-muted hover:text-red-400"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upload Button */}
                <label className="flex flex-col items-center justify-center p-3.5 rounded-2xl border border-dashed border-border hover:border-accent2/50 bg-bg hover:bg-accent2/5 cursor-pointer transition">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                    onChange={handleSelectFiles}
                    disabled={uploadingMedia}
                    className="hidden"
                  />
                  <div className="flex items-center gap-2 text-xs text-text-sub">
                    {uploadingMedia ? (
                      <Loader2 className="w-4 h-4 animate-spin text-accent2" />
                    ) : (
                      <UploadCloud className="w-4 h-4 text-accent2" />
                    )}
                    <span>{uploadingMedia ? "미디어 업로드 중..." : "+ 이미지 또는 영상 추가"}</span>
                  </div>
                </label>
              </div>

              <div className="pt-3 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <button type="button" onClick={() => setModalOpen(false)} className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-surface2 hover:bg-surface3 text-text-2 text-xs">취소</button>
                <button type="submit" disabled={saving} className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-accent2 hover:bg-accent2/90 text-white text-xs font-semibold shadow-md disabled:opacity-50">
                  {saving ? "저장 중..." : editingId ? "수정 저장" : "기획안 등록"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox / Media Preview Modal */}
      {previewMedia && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-4xl w-full bg-surface border border-border rounded-3xl p-5 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="space-y-0.5 min-w-0">
                <h3 className="text-sm font-bold text-text truncate">{previewMedia.name}</h3>
                <p className="text-[11px] text-text-sub font-mono">
                  {(previewMedia.size / (1024 * 1024)).toFixed(2)} MB · {previewMedia.mime_type}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewMedia(null)}
                className="p-1.5 rounded-lg bg-surface2 hover:bg-surface3 text-text-sub hover:text-text transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-center bg-black/60 rounded-2xl overflow-hidden max-h-[70vh] p-2">
              {previewMedia.mime_type.startsWith("image/") ? (
                <img src={mediaSrc(previewMedia)} alt={previewMedia.name} className="max-h-[65vh] max-w-full object-contain rounded-xl" />
              ) : (
                <video controls autoPlay playsInline src={mediaSrc(previewMedia)} className="max-h-[65vh] max-w-full rounded-xl bg-black" />
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <a
                href={mediaSrc(previewMedia)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-surface2 hover:bg-surface3 text-text text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>새 탭에서 원본 열기</span>
              </a>
              <button
                type="button"
                onClick={() => setPreviewMedia(null)}
                className="px-4 py-2 rounded-xl bg-accent2 hover:bg-accent2/90 text-white text-xs font-semibold"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
