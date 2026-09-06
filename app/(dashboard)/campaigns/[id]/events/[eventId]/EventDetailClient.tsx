"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Campaign,
  MarketingEvent,
  EventInvitee,
  EventChecklistItem,
  EventPlan,
  Applicant,
  EventRsvpStatus,
  EventStatus,
  EVENT_STATUS_LABELS,
} from "@/lib/db/types";
import {
  updateEventAction,
  deleteEventAction,
  addInviteesFromApplicantsAction,
  addDirectInviteeAction,
  updateInviteeAction,
  deleteInviteeAction,
  addChecklistItemAction,
  updateChecklistItemAction,
  deleteChecklistItemAction,
  saveEventPlanAction,
  generateEventAiDraftAction,
} from "../actions";
import { calculateDDay, ddayToneClass, formatKstDateTime, isoToKstLocalInput } from "@/lib/seeding/dday";
import DownloadFileButton from "@/components/DownloadFileButton";
import {
  Calendar,
  MapPin,
  Users,
  CheckSquare,
  FileText,
  Sparkles,
  Trash2,
  ExternalLink,
  Loader2,
  UserPlus,
  Save,
  Pencil,
  X,
} from "lucide-react";

export interface TemplateOption {
  id: string;
  name: string;
  placeholders: string[];
  builtin: boolean;
}

const LONG_FIELDS = new Set(["행사개요", "프로그램", "운영목표", "타겟오디언스", "콘텐츠방향성", "월별계획"]);

export default function EventDetailClient({
  campaign,
  event: initialEvent,
  initialInvitees,
  initialChecklists,
  initialPlan,
  templates,
  applicants,
  todayKst,
}: {
  campaign: Campaign;
  event: MarketingEvent;
  initialInvitees: EventInvitee[];
  initialChecklists: EventChecklistItem[];
  initialPlan: EventPlan | null;
  templates: TemplateOption[];
  applicants: Applicant[];
  todayKst: string;
}) {
  const router = useRouter();
  const [event, setEvent] = useState<MarketingEvent>(initialEvent);
  const [activeTab, setActiveTab] = useState<"invitees" | "plan" | "checklist">("invitees");
  const [invitees, setInvitees] = useState<EventInvitee[]>(initialInvitees);
  const [checklists, setChecklists] = useState<EventChecklistItem[]>(initialChecklists);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Header edit
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({
    name: initialEvent.name,
    event_at: isoToKstLocalInput(initialEvent.event_at),
    venue: initialEvent.venue || "",
    memo: initialEvent.memo || "",
  });
  const [savingInfo, setSavingInfo] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  // Invite
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedApplicantIds, setSelectedApplicantIds] = useState<string[]>([]);
  const [directName, setDirectName] = useState("");
  const [directSns, setDirectSns] = useState("");
  const [directContact, setDirectContact] = useState("");
  const [directMemo, setDirectMemo] = useState("");
  const [importing, setImporting] = useState(false);
  const [addingDirect, setAddingDirect] = useState(false);

  // Checklist
  const [newChecklistLabel, setNewChecklistLabel] = useState("");
  const [newChecklistDueDate, setNewChecklistDueDate] = useState("");
  const [newChecklistAssignee, setNewChecklistAssignee] = useState("");
  const [addingChecklist, setAddingChecklist] = useState(false);

  // Plan
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(initialPlan?.template_id || templates[0]?.id || "");
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    initialPlan?.field_values || {
      브랜드명: campaign.company_name,
      행사명: initialEvent.name,
      행사일시: formatKstDateTime(initialEvent.event_at) || "",
      행사장소: initialEvent.venue || "",
    }
  );
  const [loadingAiField, setLoadingAiField] = useState<string | null>(null);
  const [loadingAiAll, setLoadingAiAll] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planSaved, setPlanSaved] = useState<boolean>(Boolean(initialPlan));
  const [planDirty, setPlanDirty] = useState(false);

  const exportHref = `/campaigns/${campaign.id}/events/${event.id}/plan/export`;

  // ---------- Header ----------
  const handleStatusChange = async (status: EventStatus) => {
    setStatusSaving(true);
    setError(null);
    const res = await updateEventAction({ eventId: event.id, campaignId: campaign.id, patch: { status } });
    setStatusSaving(false);
    if (!res.ok) return setError(res.error);
    setEvent(res.data);
    router.refresh();
  };

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingInfo(true);
    setError(null);
    const res = await updateEventAction({
      eventId: event.id,
      campaignId: campaign.id,
      patch: {
        name: infoForm.name,
        eventAtLocal: infoForm.event_at || null,
        venue: infoForm.venue || null,
        memo: infoForm.memo || null,
      },
    });
    setSavingInfo(false);
    if (!res.ok) return setError(res.error);
    setEvent(res.data);
    setEditingInfo(false);
    router.refresh();
  };

  const handleDeleteEvent = async () => {
    if (!confirm(`"${event.name}" 행사를 삭제할까요? 초대 명단, 체크리스트, 운영안도 함께 삭제됩니다.`)) return;
    const res = await deleteEventAction(event.id, campaign.id);
    if (!res.ok) return setError(res.error);
    router.push(`/campaigns/${campaign.id}/events`);
  };

  // ---------- Invitees ----------
  const handleToggleCheckin = async (inv: EventInvitee) => {
    const res = await updateInviteeAction(inv.id, campaign.id, event.id, { attended: !inv.attended });
    if (!res.ok) return setError(res.error);
    setInvitees((prev) => prev.map((i) => (i.id === inv.id ? res.data : i)));
  };

  const handleRsvpChange = async (inv: EventInvitee, rsvp_status: EventRsvpStatus) => {
    const res = await updateInviteeAction(inv.id, campaign.id, event.id, { rsvp_status });
    if (!res.ok) return setError(res.error);
    setInvitees((prev) => prev.map((i) => (i.id === inv.id ? res.data : i)));
  };

  const handleMemoBlur = async (inv: EventInvitee, memo: string) => {
    const next = memo.trim() || null;
    if (next === inv.memo) return;
    const res = await updateInviteeAction(inv.id, campaign.id, event.id, { memo: next });
    if (!res.ok) return setError(res.error);
    setInvitees((prev) => prev.map((i) => (i.id === inv.id ? res.data : i)));
  };

  const handleDeleteInvitee = async (inviteeId: string) => {
    if (!confirm("초대 명단에서 삭제하시겠습니까?")) return;
    const res = await deleteInviteeAction(inviteeId, campaign.id, event.id);
    if (!res.ok) return setError(res.error);
    setInvitees((prev) => prev.filter((i) => i.id !== inviteeId));
  };

  const handleImportApplicants = async () => {
    if (selectedApplicantIds.length === 0) return;
    setImporting(true);
    setError(null);
    const res = await addInviteesFromApplicantsAction(event.id, campaign.id, selectedApplicantIds);
    setImporting(false);
    if (!res.ok) return setError(res.error);
    setInvitees((prev) => [...prev, ...res.data]);
    setSelectedApplicantIds([]);
    setImportModalOpen(false);
  };

  const handleAddDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingDirect(true);
    setError(null);
    const res = await addDirectInviteeAction({
      eventId: event.id,
      campaignId: campaign.id,
      name: directName,
      snsUrl: directSns || null,
      contact: directContact || null,
      memo: directMemo || null,
    });
    setAddingDirect(false);
    if (!res.ok) return setError(res.error);
    setInvitees((prev) => [...prev, res.data]);
    setDirectName("");
    setDirectSns("");
    setDirectContact("");
    setDirectMemo("");
  };

  // ---------- Checklist ----------
  const handleAddChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingChecklist(true);
    setError(null);
    const res = await addChecklistItemAction({
      eventId: event.id,
      campaignId: campaign.id,
      label: newChecklistLabel,
      dueDate: newChecklistDueDate || null,
      assignee: newChecklistAssignee || null,
    });
    setAddingChecklist(false);
    if (!res.ok) return setError(res.error);
    setChecklists((prev) => [...prev, res.data]);
    setNewChecklistLabel("");
    setNewChecklistDueDate("");
    setNewChecklistAssignee("");
  };

  const handleToggleChecklistDone = async (c: EventChecklistItem) => {
    const res = await updateChecklistItemAction(c.id, campaign.id, event.id, { done: !c.done });
    if (!res.ok) return setError(res.error);
    setChecklists((prev) => prev.map((x) => (x.id === c.id ? res.data : x)));
  };

  const handleDeleteChecklist = async (itemId: string) => {
    const res = await deleteChecklistItemAction(itemId, campaign.id, event.id);
    if (!res.ok) return setError(res.error);
    setChecklists((prev) => prev.filter((c) => c.id !== itemId));
  };

  // ---------- Plan ----------
  const setField = (ph: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [ph]: value }));
    setPlanDirty(true);
  };

  const runAi = async (placeholders: string[]) => {
    if (!selectedTemplate) return;
    setError(null);
    setNotice(null);
    const res = await generateEventAiDraftAction({
      eventId: event.id,
      templateId: selectedTemplate.id,
      placeholders,
      currentValues: fieldValues,
    });
    if (!res.ok) return setError(res.error);
    if (res.data.fallback) {
      setNotice("AI 제안 실패 — 직접 입력해주세요.");
      return;
    }
    setFieldValues((prev) => ({ ...prev, ...res.data.values }));
    setPlanDirty(true);
  };

  const handleAiField = async (ph: string) => {
    setLoadingAiField(ph);
    await runAi([ph]);
    setLoadingAiField(null);
  };

  const handleAiEmptyFields = async () => {
    if (!selectedTemplate) return;
    const empty = selectedTemplate.placeholders.filter((ph) => !(fieldValues[ph] || "").trim());
    if (empty.length === 0) {
      setNotice("비어 있는 항목이 없습니다. 개별 항목의 AI 버튼으로 다시 생성할 수 있습니다.");
      return;
    }
    setLoadingAiAll(true);
    await runAi(empty);
    setLoadingAiAll(false);
  };

  const handleSavePlan = async () => {
    if (!selectedTemplate) return;
    setSavingPlan(true);
    setError(null);
    const res = await saveEventPlanAction({
      eventId: event.id,
      campaignId: campaign.id,
      templateId: selectedTemplate.id,
      fieldValues,
    });
    setSavingPlan(false);
    if (!res.ok) return setError(res.error);
    setPlanSaved(true);
    setPlanDirty(false);
    setNotice("운영안이 저장되었습니다. 이제 PPT를 다운로드할 수 있습니다.");
  };

  const attendingCount = invitees.filter((i) => i.rsvp_status === "attending").length;
  const attendedCount = invitees.filter((i) => i.attended).length;
  const alreadyInvitedApplicantIds = new Set(invitees.map((i) => i.applicant_id).filter(Boolean));

  const tabBtn = (key: typeof activeTab, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setActiveTab(key)}
      className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
        activeTab === key ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/30" : "text-zinc-400 hover:text-white"
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
        {!editingInfo ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">{campaign.company_name}</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-zinc-100">{event.name}</h1>
                {event.memo && <p className="text-xs text-zinc-400 whitespace-pre-line">{event.memo}</p>}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={event.status}
                  disabled={statusSaving}
                  onChange={(e) => handleStatusChange(e.target.value as EventStatus)}
                  className="px-3 py-2 rounded-xl bg-[#090A0C] border border-[#22242A] text-indigo-400 text-xs font-bold focus:outline-none focus:border-indigo-500"
                >
                  {(Object.keys(EVENT_STATUS_LABELS) as EventStatus[]).map((s) => (
                    <option key={s} value={s}>{EVENT_STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setEditingInfo(true)} className="px-3 py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] border border-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5">
                  <Pencil className="w-3.5 h-3.5" /> 정보 수정
                </button>
                <button type="button" onClick={handleDeleteEvent} className="px-3 py-2 rounded-xl bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/30 text-rose-300 text-xs font-semibold inline-flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" /> 삭제
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#22242A] text-xs text-zinc-300">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="text-zinc-400">일시(KST):</span>
                <span className="font-semibold font-mono">{formatKstDateTime(event.event_at) || "일시 미정"}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="text-zinc-400">장소:</span>
                <span className="font-semibold">{event.venue || "장소 미정"}</span>
              </div>
            </div>
          </>
        ) : (
          <form onSubmit={handleSaveInfo} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-zinc-100">행사 기본 정보 수정</h2>
              <button type="button" onClick={() => setEditingInfo(false)} className="text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <input
              type="text"
              required
              value={infoForm.name}
              onChange={(e) => setInfoForm({ ...infoForm, name: e.target.value })}
              placeholder="행사명 *"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="datetime-local"
                value={infoForm.event_at}
                onChange={(e) => setInfoForm({ ...infoForm, event_at: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500"
              />
              <input
                type="text"
                value={infoForm.venue}
                onChange={(e) => setInfoForm({ ...infoForm, venue: e.target.value })}
                placeholder="행사 장소"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
            <textarea
              rows={3}
              value={infoForm.memo}
              onChange={(e) => setInfoForm({ ...infoForm, memo: e.target.value })}
              placeholder="행사 메모 / 기획 의도"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingInfo(false)} className="px-4 py-2 rounded-xl bg-[#181A20] text-zinc-300 text-xs">취소</button>
              <button type="submit" disabled={savingInfo} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
                {savingInfo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} 저장
              </button>
            </div>
          </form>
        )}
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}
      {notice && <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">{notice}</div>}

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "총 초청 인원", value: invitees.length, cls: "text-zinc-100" },
          { label: "참석 확정 (RSVP)", value: attendingCount, cls: "text-blue-400" },
          { label: "현장 참석 체크인", value: attendedCount, cls: "text-emerald-400" },
        ].map((k) => (
          <div key={k.label} className="p-4 rounded-2xl bg-[#131418] border border-[#22242A] text-center sm:text-left">
            <div className="text-[11px] text-zinc-500 font-medium">{k.label}</div>
            <div className={`text-lg sm:text-2xl font-bold mt-0.5 font-mono tabular-nums ${k.cls}`}>{k.value}명</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#22242A] pb-1 overflow-x-auto">
        {tabBtn("invitees", <Users className="w-3.5 h-3.5" />, `초대 및 참석 관리 (${invitees.length})`)}
        {tabBtn("plan", <FileText className="w-3.5 h-3.5" />, "운영안 작성 & PPT")}
        {tabBtn("checklist", <CheckSquare className="w-3.5 h-3.5" />, `체크리스트 (${checklists.filter((c) => c.done).length}/${checklists.length})`)}
      </div>

      {/* TAB 1: Invitees */}
      {activeTab === "invitees" && (
        <div className="p-5 sm:p-7 rounded-3xl bg-[#131418] border border-[#22242A] space-y-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-zinc-100">초청 인플루언서 명단</h2>
              <p className="text-xs text-zinc-400">캠페인 지원자 목록에서 가져오거나 직접 추가하여 RSVP 상태를 기록합니다.</p>
            </div>
            <button type="button" onClick={() => setImportModalOpen(true)} className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition active:scale-95">
              <UserPlus className="w-3.5 h-3.5" />
              <span>캠페인 지원자에서 가져오기</span>
            </button>
          </div>

          <form onSubmit={handleAddDirect} className="p-4 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-3">
            <span className="text-xs font-bold text-zinc-300 block">초대자 직접 추가</span>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input type="text" required placeholder="이름 *" value={directName} onChange={(e) => setDirectName(e.target.value)} className="px-3 py-2 rounded-xl bg-[#131418] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500" />
              <input type="url" placeholder="SNS URL" value={directSns} onChange={(e) => setDirectSns(e.target.value)} className="px-3 py-2 rounded-xl bg-[#131418] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500" />
              <input type="text" placeholder="연락처" value={directContact} onChange={(e) => setDirectContact(e.target.value)} className="px-3 py-2 rounded-xl bg-[#131418] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500" />
              <div className="flex gap-2">
                <input type="text" placeholder="메모" value={directMemo} onChange={(e) => setDirectMemo(e.target.value)} className="flex-1 px-3 py-2 rounded-xl bg-[#131418] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500" />
                <button type="submit" disabled={addingDirect} className="px-4 py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-200 text-xs font-semibold shrink-0 disabled:opacity-50">
                  {addingDirect ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "추가"}
                </button>
              </div>
            </div>
          </form>

          <div className="rounded-2xl border border-[#22242A] overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#090A0C] text-zinc-400 border-b border-[#22242A]">
                <tr>
                  <th className="p-3.5">이름</th>
                  <th className="p-3.5">SNS 채널</th>
                  <th className="p-3.5">연락처</th>
                  <th className="p-3.5">RSVP 상태 (수동 기록)</th>
                  <th className="p-3.5 text-center">당일 현장 참석</th>
                  <th className="p-3.5">메모</th>
                  <th className="p-3.5 text-right">삭제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#22242A] text-zinc-300">
                {invitees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-zinc-500">초청된 인플루언서가 없습니다. 상단의 버튼을 통해 지원자를 불러오거나 직접 추가해보세요.</td>
                  </tr>
                ) : (
                  invitees.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#181A20] transition">
                      <td className="p-3.5 font-bold text-zinc-100">{inv.name}</td>
                      <td className="p-3.5">
                        {inv.sns_url ? (
                          <a href={inv.sns_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[130px]">
                            <span>{inv.sns_url}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-zinc-600">-</span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono text-zinc-300">{inv.contact || "-"}</td>
                      <td className="p-3.5">
                        <select
                          value={inv.rsvp_status}
                          onChange={(e) => handleRsvpChange(inv, e.target.value as EventRsvpStatus)}
                          className="px-2.5 py-1 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-200 text-xs focus:outline-none focus:border-indigo-500 font-semibold"
                        >
                          <option value="pending">미응답 (대기)</option>
                          <option value="attending">참석 확정 ✓</option>
                          <option value="not_attending">불참</option>
                        </select>
                      </td>
                      <td className="p-3.5 text-center">
                        <input type="checkbox" checked={inv.attended} onChange={() => handleToggleCheckin(inv)} className="w-4 h-4 accent-emerald-500 rounded cursor-pointer" />
                      </td>
                      <td className="p-3.5">
                        <input
                          type="text"
                          defaultValue={inv.memo || ""}
                          placeholder="메모"
                          onBlur={(e) => handleMemoBlur(inv, e.target.value)}
                          className="w-36 px-2 py-1 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-300 text-xs focus:outline-none focus:border-indigo-500"
                        />
                      </td>
                      <td className="p-3.5 text-right">
                        <button type="button" onClick={() => handleDeleteInvitee(inv.id)} className="p-1 rounded text-zinc-500 hover:text-red-400 transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {importModalOpen && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="w-full max-w-lg bg-[#131418] border border-[#22242A] rounded-3xl p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col font-sans">
                <div className="flex items-center justify-between pb-2 border-b border-[#22242A]">
                  <div>
                    <h3 className="text-base font-bold text-zinc-100">캠페인 지원자 목록에서 초청자 불러오기</h3>
                    <p className="text-xs text-zinc-400">초대할 지원자를 선택하면 이름/SNS/연락처가 스냅샷 복사됩니다.</p>
                  </div>
                  <button type="button" onClick={() => setImportModalOpen(false)} className="text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 divide-y divide-[#22242A] pr-1">
                  {applicants.length === 0 ? (
                    <div className="p-6 text-center text-zinc-500 text-xs">캠페인에 접수된 지원자가 없습니다.</div>
                  ) : (
                    applicants.map((app) => {
                      const alreadyInvited = alreadyInvitedApplicantIds.has(app.id);
                      const isChecked = selectedApplicantIds.includes(app.id);
                      return (
                        <label key={app.id} className={`flex items-center justify-between p-3 rounded-xl transition ${alreadyInvited ? "opacity-40 cursor-not-allowed bg-[#090A0C]" : "cursor-pointer hover:bg-[#181A20]"}`}>
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              disabled={alreadyInvited}
                              checked={isChecked}
                              onChange={(e) => {
                                if (alreadyInvited) return;
                                setSelectedApplicantIds((prev) => (e.target.checked ? [...prev, app.id] : prev.filter((id) => id !== app.id)));
                              }}
                              className="w-4 h-4 accent-indigo-600 rounded"
                            />
                            <div>
                              <div className="font-bold text-xs text-zinc-100">
                                {app.name}
                                <span className="ml-1.5 text-[10px] text-zinc-500 font-normal">
                                  {app.status === "selected" ? "최종선정" : app.status === "reserved" ? "예비선정" : app.status === "rejected" ? "미선정" : "대기"}
                                </span>
                              </div>
                              <div className="text-[11px] text-zinc-400">{app.sns_link} ({app.contact})</div>
                            </div>
                          </div>
                          {alreadyInvited && <span className="text-[10px] px-2 py-0.5 rounded bg-[#181A20] text-zinc-500 font-medium">이미 초청됨</span>}
                        </label>
                      );
                    })
                  )}
                </div>

                <div className="pt-3 border-t border-[#22242A] flex justify-end gap-2">
                  <button type="button" onClick={() => setImportModalOpen(false)} className="px-4 py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-300 text-xs">취소</button>
                  <button type="button" disabled={importing || selectedApplicantIds.length === 0} onClick={handleImportApplicants} className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md disabled:opacity-50">
                    {importing ? "불러오는 중..." : `${selectedApplicantIds.length}명 초청 명단에 추가`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Plan */}
      {activeTab === "plan" && (
        <div className="p-5 sm:p-7 rounded-3xl bg-[#131418] border border-[#22242A] space-y-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-zinc-100">행사 운영안 기획 & 파워포인트 생성</h2>
              <p className="text-xs text-zinc-400">항목별 AI 버튼은 그 항목만 다시 씁니다. 저장 후 PPT를 다운로드하세요.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={loadingAiAll || !selectedTemplate} onClick={handleAiEmptyFields} className="px-3.5 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-xs font-semibold inline-flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50">
                {loadingAiAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>빈 항목만 AI로 채우기</span>
              </button>
              <button type="button" disabled={savingPlan || !selectedTemplate} onClick={handleSavePlan} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-md transition active:scale-95 disabled:opacity-50">
                {savingPlan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>운영안 저장{planDirty ? " *" : ""}</span>
              </button>
              {planSaved && !planDirty ? (
                <DownloadFileButton href={exportHref} label="운영안 PPT 다운로드" fallbackFilename="운영안.pptx" className="px-4 py-2 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50" />
              ) : (
                <span className="text-[11px] text-zinc-500">{planDirty ? "변경 사항을 저장하면 다운로드할 수 있습니다." : "운영안을 저장하면 PPT를 다운로드할 수 있습니다."}</span>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-300">적용할 PPT 템플릿</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => { setSelectedTemplateId(e.target.value); setPlanDirty(true); }}
              className="w-full sm:w-96 px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500 font-semibold"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.builtin ? "[기본] " : ""}{t.name} (치환 항목 {t.placeholders.length}개)</option>
              ))}
            </select>
            {templates.length === 0 && <p className="text-[11px] text-amber-400">행사용 PPT 템플릿이 없습니다. 설정 → 공유 PPT 템플릿 보관함에서 업로드하세요.</p>}
          </div>

          <div className="space-y-4 pt-3 border-t border-[#22242A]">
            <h3 className="text-xs font-bold text-zinc-300">템플릿 슬라이드 치환 항목</h3>
            {selectedTemplate?.placeholders.map((ph) => (
              <div key={ph} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-400 font-mono">{`{{${ph}}}`}</label>
                  <button type="button" disabled={loadingAiField === ph} onClick={() => handleAiField(ph)} className="px-2 py-0.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 text-[10px] font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                    {loadingAiField === ph ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} AI 초안
                  </button>
                </div>
                <textarea
                  rows={LONG_FIELDS.has(ph) ? 4 : 2}
                  value={fieldValues[ph] || ""}
                  onChange={(e) => setField(ph, e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500 leading-relaxed font-sans"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Checklist */}
      {activeTab === "checklist" && (
        <div className="p-5 sm:p-7 rounded-3xl bg-[#131418] border border-[#22242A] space-y-5 shadow-xl">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-zinc-100">행사 준비 체크리스트 & 할 일</h2>
            <p className="text-xs text-zinc-400">마감일(D-day)과 담당자를 지정하여 행사 준비 진행 상황을 누락 없이 관리합니다.</p>
          </div>

          <form onSubmit={handleAddChecklist} className="p-4 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-3">
            <span className="text-xs font-bold text-zinc-300 block">새 준비 항목 추가</span>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input type="text" required placeholder="할 일 항목 내용 *" value={newChecklistLabel} onChange={(e) => setNewChecklistLabel(e.target.value)} className="col-span-1 sm:col-span-2 px-3 py-2 rounded-xl bg-[#131418] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500" />
              <input type="date" value={newChecklistDueDate} onChange={(e) => setNewChecklistDueDate(e.target.value)} className="px-3 py-2 rounded-xl bg-[#131418] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500" />
              <div className="flex gap-2">
                <input type="text" placeholder="담당자" value={newChecklistAssignee} onChange={(e) => setNewChecklistAssignee(e.target.value)} className="flex-1 px-3 py-2 rounded-xl bg-[#131418] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500" />
                <button type="submit" disabled={addingChecklist} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shrink-0 disabled:opacity-50">
                  {addingChecklist ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "등록"}
                </button>
              </div>
            </div>
          </form>

          <div className="space-y-2">
            {checklists.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-[#22242A] rounded-2xl bg-[#090A0C]">등록된 체크리스트 항목이 없습니다.</div>
            ) : (
              checklists.map((c) => {
                const ddayInfo = calculateDDay(c.due_date, todayKst);
                return (
                  <div key={c.id} className={`p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 ${c.done ? "bg-[#090A0C]/50 border-[#181A20] opacity-60" : "bg-[#090A0C] border-[#22242A]"}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <input type="checkbox" checked={c.done} onChange={() => handleToggleChecklistDone(c)} className="w-4 h-4 accent-indigo-600 rounded cursor-pointer shrink-0" />
                      <span className={`text-xs font-medium text-zinc-100 truncate ${c.done ? "line-through text-zinc-500" : ""}`}>{c.label}</span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-xs">
                      {c.due_date && (
                        <div className="flex items-center gap-1.5 font-mono tabular-nums">
                          <span className="text-zinc-500">{c.due_date}</span>
                          {!c.done && <span className={ddayToneClass(ddayInfo.dday ?? 99)}>({ddayInfo.label})</span>}
                        </div>
                      )}
                      {c.assignee && <span className="px-2 py-0.5 rounded bg-[#131418] border border-[#22242A] text-zinc-400 text-[10px]">{c.assignee}</span>}
                      <button type="button" onClick={() => handleDeleteChecklist(c.id)} className="p-1 rounded text-zinc-500 hover:text-red-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

    </div>
  );
}
