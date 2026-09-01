"use client";

import { useState } from "react";
import {
  Campaign,
  MarketingEvent,
  EventInvitee,
  EventChecklistItem,
  EventPlan,
  PptTemplate,
  Applicant,
  EventRsvpStatus,
} from "@/lib/db/types";
import {
  updateEventAction,
  addInviteesFromApplicantsAction,
  addDirectInviteeAction,
  updateInviteeRsvpAction,
  deleteInviteeAction,
  addChecklistItemAction,
  updateChecklistItemAction,
  deleteChecklistItemAction,
  saveEventPlanAction,
  generateEventAiDraftAction,
} from "../actions";
import { calculateDDay, ddayToneClass } from "@/lib/seeding/dday";
import {
  Calendar,
  MapPin,
  PartyPopper,
  Users,
  CheckSquare,
  FileText,
  Sparkles,
  Download,
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  UserPlus,
  Save,
} from "lucide-react";

export default function EventDetailClient({
  campaign,
  event,
  initialInvitees,
  initialChecklists,
  initialPlan,
  templates,
  applicants,
}: {
  campaign: Campaign;
  event: MarketingEvent;
  initialInvitees: EventInvitee[];
  initialChecklists: EventChecklistItem[];
  initialPlan: EventPlan | null;
  templates: PptTemplate[];
  applicants: Applicant[];
}) {
  const [activeTab, setActiveTab] = useState<"invitees" | "plan" | "checklist">("invitees");
  const [invitees, setInvitees] = useState<EventInvitee[]>(initialInvitees);
  const [checklists, setChecklists] = useState<EventChecklistItem[]>(initialChecklists);

  // Invite Modal
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [selectedApplicantIds, setSelectedApplicantIds] = useState<string[]>([]);
  const [directName, setDirectName] = useState("");
  const [directSns, setDirectSns] = useState("");
  const [directContact, setDirectContact] = useState("");
  const [directMemo, setDirectMemo] = useState("");
  const [importing, setImporting] = useState(false);

  // Checklist New Item
  const [newChecklistLabel, setNewChecklistLabel] = useState("");
  const [newChecklistDueDate, setNewChecklistDueDate] = useState("");
  const [newChecklistAssignee, setNewChecklistAssignee] = useState("");

  // Plan State
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    initialPlan?.template_id || templates[0]?.id || ""
  );
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    initialPlan?.field_values || {
      브랜드명: campaign.company_name,
      행사명: event.name,
      행사일시: event.event_at ? new Date(event.event_at).toLocaleString() : "",
      행사장소: event.venue || "",
    }
  );
  const [loadingAi, setLoadingAi] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planSavedNotice, setPlanSavedNotice] = useState(false);

  // Status Handlers
  const handleToggleCheckin = async (inviteeId: string, currentAttended: boolean) => {
    await updateInviteeRsvpAction(inviteeId, campaign.id, event.id, {
      attended: !currentAttended,
    });
    setInvitees((prev) =>
      prev.map((i) => (i.id === inviteeId ? { ...i, attended: !currentAttended } : i))
    );
  };

  const handleRsvpChange = async (inviteeId: string, rsvp_status: EventRsvpStatus) => {
    await updateInviteeRsvpAction(inviteeId, campaign.id, event.id, { rsvp_status });
    setInvitees((prev) =>
      prev.map((i) => (i.id === inviteeId ? { ...i, rsvp_status } : i))
    );
  };

  const handleDeleteInvitee = async (inviteeId: string) => {
    if (!confirm("초대 명단에서 삭제하시겠습니까?")) return;
    await deleteInviteeAction(inviteeId, campaign.id, event.id);
    setInvitees((prev) => prev.filter((i) => i.id !== inviteeId));
  };

  const handleImportApplicants = async () => {
    if (selectedApplicantIds.length === 0) return;
    setImporting(true);
    try {
      await addInviteesFromApplicantsAction(event.id, campaign.id, selectedApplicantIds);
      window.location.reload();
    } finally {
      setImporting(false);
    }
  };

  const handleAddDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directName) return;
    const res = await addDirectInviteeAction({
      eventId: event.id,
      campaignId: campaign.id,
      name: directName,
      snsUrl: directSns || null,
      contact: directContact || null,
      memo: directMemo || null,
    });
    setInvitees((prev) => [...prev, res.invitee]);
    setDirectName("");
    setDirectSns("");
    setDirectContact("");
    setDirectMemo("");
  };

  // Checklist Handlers
  const handleAddChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChecklistLabel) return;
    const res = await addChecklistItemAction({
      eventId: event.id,
      campaignId: campaign.id,
      label: newChecklistLabel,
      dueDate: newChecklistDueDate || null,
      assignee: newChecklistAssignee || null,
    });
    setChecklists((prev) => [...prev, res.item]);
    setNewChecklistLabel("");
    setNewChecklistDueDate("");
    setNewChecklistAssignee("");
  };

  const handleToggleChecklistDone = async (itemId: string, currentDone: boolean) => {
    await updateChecklistItemAction(itemId, campaign.id, event.id, { done: !currentDone });
    setChecklists((prev) =>
      prev.map((c) => (c.id === itemId ? { ...c, done: !currentDone } : c))
    );
  };

  const handleDeleteChecklist = async (itemId: string) => {
    await deleteChecklistItemAction(itemId, campaign.id, event.id);
    setChecklists((prev) => prev.filter((c) => c.id !== itemId));
  };

  // Plan Handlers
  const handleAiPlanAssist = async () => {
    if (!selectedTemplate) return;
    setLoadingAi(true);
    try {
      const res = await generateEventAiDraftAction({
        campaignId: campaign.id,
        eventName: event.name,
        eventAt: event.event_at,
        venue: event.venue,
        templateId: selectedTemplate.id,
      });
      setFieldValues(res.values);
    } finally {
      setLoadingAi(false);
    }
  };

  const handleSavePlan = async () => {
    if (!selectedTemplate) return;
    setSavingPlan(true);
    try {
      await saveEventPlanAction({
        eventId: event.id,
        campaignId: campaign.id,
        templateId: selectedTemplate.id,
        fieldValues,
      });
      setPlanSavedNotice(true);
      setTimeout(() => setPlanSavedNotice(false), 2500);
    } finally {
      setSavingPlan(false);
    }
  };

  const attendingCount = invitees.filter((i) => i.rsvp_status === "attending").length;
  const attendedCount = invitees.filter((i) => i.attended).length;
  const alreadyInvitedApplicantIds = new Set(
    invitees.map((i) => i.applicant_id).filter(Boolean)
  );
  return (
    <div className="space-y-6 font-sans">
      {/* Event Header Card */}
      <div className="p-5 sm:p-7 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-semibold">
                {event.status === "preparing" ? "준비중" : event.status === "done" ? "행사완료" : "취소"}
              </span>
              <span className="text-xs text-zinc-400">{campaign.company_name}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-zinc-100">{event.name}</h1>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`/campaigns/${campaign.id}/events/${event.id}/plan/export`}
              className="px-4 py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] border border-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5 transition active:scale-95"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span>운영안 PPT 다운로드</span>
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#22242A] text-xs text-zinc-300">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-zinc-400">일시:</span>
            <span className="font-semibold">{event.event_at ? new Date(event.event_at).toLocaleString() : "일시 미정"}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-zinc-400">장소:</span>
            <span className="font-semibold">{event.venue || "장소 미정"}</span>
          </div>
        </div>
      </div>

      {/* Summary KPI 3 Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-[#131418] border border-[#22242A] text-center sm:text-left">
          <div className="text-[11px] text-zinc-500 font-medium">총 초청 인원</div>
          <div className="text-lg sm:text-2xl font-bold text-zinc-100 mt-0.5">{invitees.length}명</div>
        </div>
        <div className="p-4 rounded-2xl bg-[#131418] border border-[#22242A] text-center sm:text-left">
          <div className="text-[11px] text-zinc-500 font-medium">참석 확정 (RSVP)</div>
          <div className="text-lg sm:text-2xl font-bold text-blue-400 mt-0.5">{attendingCount}명</div>
        </div>
        <div className="p-4 rounded-2xl bg-[#131418] border border-[#22242A] text-center sm:text-left">
          <div className="text-[11px] text-zinc-500 font-medium">현장 참석 체크인</div>
          <div className="text-lg sm:text-2xl font-bold text-emerald-400 mt-0.5">{attendedCount}명</div>
        </div>
      </div>

      {/* 3 Main Tabs */}
      <div className="flex items-center gap-1 border-b border-[#22242A] pb-1">
        <button
          type="button"
          onClick={() => setActiveTab("invitees")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === "invitees"
              ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/30"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>초대 및 참석 관리 ({invitees.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("plan")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === "plan"
              ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/30"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>운영안 작성 & PPT</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("checklist")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === "checklist"
              ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/30"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5" />
          <span>체크리스트 ({checklists.filter((c) => c.done).length}/{checklists.length})</span>
        </button>
      </div>

      {/* TAB 1: Invitees */}
      {activeTab === "invitees" && (
        <div className="p-5 sm:p-7 rounded-3xl bg-[#131418] border border-[#22242A] space-y-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-zinc-100">초청 인플루언서 명단</h2>
              <p className="text-xs text-zinc-400">캠페인 지원자 목록에서 가져오거나 직접 추가하여 RSVP 상태를 기록합니다.</p>
            </div>

            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition active:scale-95"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>캠페인 지원자에서 가져오기</span>
            </button>
          </div>

          <form onSubmit={handleAddDirect} className="p-4 rounded-2xl bg-[#090A0C] border border-[#22242A] space-y-3">
            <span className="text-xs font-bold text-zinc-300 block">초대자 직접 추가</span>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="text"
                required
                placeholder="이름 *"
                value={directName}
                onChange={(e) => setDirectName(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#131418] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500"
              />
              <input
                type="url"
                placeholder="SNS URL"
                value={directSns}
                onChange={(e) => setDirectSns(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#131418] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500"
              />
              <input
                type="text"
                placeholder="연락처"
                value={directContact}
                onChange={(e) => setDirectContact(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#131418] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="메모"
                  value={directMemo}
                  onChange={(e) => setDirectMemo(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-[#131418] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-200 text-xs font-semibold shrink-0"
                >
                  추가
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
                    <td colSpan={7} className="p-8 text-center text-zinc-500">
                      초청된 인플루언서가 없습니다. 상단의 버튼을 통해 지원자를 불러오거나 직접 추가해보세요.
                    </td>
                  </tr>
                ) : (
                  invitees.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#181A20] transition">
                      <td className="p-3.5 font-bold text-zinc-100">{inv.name}</td>
                      <td className="p-3.5">
                        {inv.sns_url ? (
                          <a
                            href={inv.sns_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[130px]"
                          >
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
                          onChange={(e) =>
                            handleRsvpChange(inv.id, e.target.value as EventRsvpStatus)
                          }
                          className="px-2.5 py-1 rounded-lg bg-[#090A0C] border border-[#22242A] text-zinc-200 text-xs focus:outline-none focus:border-indigo-500 font-semibold"
                        >
                          <option value="pending">미응답 (대기)</option>
                          <option value="attending">참석 확정 ✓</option>
                          <option value="not_attending">불참</option>
                        </select>
                      </td>
                      <td className="p-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={inv.attended}
                          onChange={() => handleToggleCheckin(inv.id, inv.attended)}
                          className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                        />
                      </td>
                      <td className="p-3.5 text-zinc-400 truncate max-w-[140px]">{inv.memo || "-"}</td>
                      <td className="p-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteInvitee(inv.id)}
                          className="p-1 rounded text-zinc-500 hover:text-red-400 transition"
                        >
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
                  <button onClick={() => setImportModalOpen(false)} className="text-zinc-400 hover:text-white">
                    ✕
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 divide-y divide-[#22242A] pr-1">
                  {applicants.length === 0 ? (
                    <div className="p-6 text-center text-zinc-500 text-xs">캠페인에 접수된 지원자가 없습니다.</div>
                  ) : (
                    applicants.map((app) => {
                      const alreadyInvited = alreadyInvitedApplicantIds.has(app.id);
                      const isChecked = selectedApplicantIds.includes(app.id);

                      return (
                        <label
                          key={app.id}
                          className={`flex items-center justify-between p-3 rounded-xl transition ${
                            alreadyInvited
                              ? "opacity-40 cursor-not-allowed bg-[#090A0C]"
                              : "cursor-pointer hover:bg-[#181A20]"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              disabled={alreadyInvited}
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedApplicantIds((prev) => [...prev, app.id]);
                                } else {
                                  setSelectedApplicantIds((prev) => prev.filter((id) => id !== app.id));
                                }
                              }}
                              className="w-4 h-4 accent-indigo-600 rounded"
                            />
                            <div>
                              <div className="font-bold text-xs text-zinc-100">{app.name}</div>
                              <div className="text-[11px] text-zinc-400">{app.sns_link} ({app.contact})</div>
                            </div>
                          </div>
                          {alreadyInvited && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-[#181A20] text-zinc-500 font-medium">
                              이미 초청됨
                            </span>
                          )}
                        </label>
                      );
                    })
                  )}
                </div>

                <div className="pt-3 border-t border-[#22242A] flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setImportModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-[#181A20] hover:bg-[#22242A] text-zinc-300 text-xs"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    disabled={importing || selectedApplicantIds.length === 0}
                    onClick={handleImportApplicants}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md disabled:opacity-50"
                  >
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
              <p className="text-xs text-zinc-400">사전조사 및 행사 정보를 바탕으로 AI가 초안을 완성하고, 템플릿에 맞춰 .pptx를 출력합니다.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={loadingAi}
                onClick={handleAiPlanAssist}
                className="px-3.5 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-xs font-semibold inline-flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
              >
                {loadingAi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>Gemini AI 초안 자동완성</span>
              </button>
              <button
                type="button"
                disabled={savingPlan}
                onClick={handleSavePlan}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-md transition active:scale-95 disabled:opacity-50"
              >
                {savingPlan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>운영안 저장</span>
              </button>
            </div>
          </div>

          {planSavedNotice && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              운영안이 성공적으로 저장되었습니다! 상단의 [운영안 PPT 다운로드]로 언제든 다운로드할 수 있습니다.
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-300">적용할 PPT 템플릿</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full sm:w-80 px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500 font-semibold"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (플레이스홀더 {t.placeholders.length}개)
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-4 pt-3 border-t border-[#22242A]">
            <h3 className="text-xs font-bold text-zinc-300">템플릿 슬라이드 치환 항목</h3>
            {selectedTemplate?.placeholders.map((ph) => (
              <div key={ph} className="space-y-1.5">
                <label className="text-xs font-bold text-indigo-400 font-mono">
                  {`{{${ph}}}`}
                </label>
                {ph === "행사개요" || ph === "프로그램" ? (
                  <textarea
                    rows={4}
                    value={fieldValues[ph] || ""}
                    onChange={(e) => setFieldValues({ ...fieldValues, [ph]: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500 leading-relaxed font-sans"
                  />
                ) : (
                  <input
                    type="text"
                    value={fieldValues[ph] || ""}
                    onChange={(e) => setFieldValues({ ...fieldValues, [ph]: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500 font-sans"
                  />
                )}
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
              <input
                type="text"
                required
                placeholder="할 일 항목 내용 *"
                value={newChecklistLabel}
                onChange={(e) => setNewChecklistLabel(e.target.value)}
                className="col-span-1 sm:col-span-2 px-3 py-2 rounded-xl bg-[#131418] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500"
              />
              <input
                type="date"
                value={newChecklistDueDate}
                onChange={(e) => setNewChecklistDueDate(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#131418] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="담당자"
                  value={newChecklistAssignee}
                  onChange={(e) => setNewChecklistAssignee(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-[#131418] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shrink-0"
                >
                  등록
                </button>
              </div>
            </div>
          </form>

          <div className="space-y-2">
            {checklists.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs border border-dashed border-[#22242A] rounded-2xl bg-[#090A0C]">
                등록된 체크리스트 항목이 없습니다.
              </div>
            ) : (
              checklists.map((c) => {
                const ddayInfo = calculateDDay(c.due_date);
                return (
                  <div
                    key={c.id}
                    className={`p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 ${
                      c.done
                        ? "bg-[#090A0C]/50 border-[#181A20] opacity-60"
                        : "bg-[#090A0C] border-[#22242A]"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={c.done}
                        onChange={() => handleToggleChecklistDone(c.id, c.done)}
                        className="w-4 h-4 accent-indigo-600 rounded cursor-pointer shrink-0"
                      />
                      <span className={`text-xs font-medium text-zinc-100 truncate ${c.done ? "line-through text-zinc-500" : ""}`}>
                        {c.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-xs">
                      {c.due_date && (
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="text-zinc-500">{c.due_date}</span>
                          <span className={ddayToneClass(ddayInfo.dday ?? 99)}>
                            ({ddayInfo.label})
                          </span>
                        </div>
                      )}
                      {c.assignee && (
                        <span className="px-2 py-0.5 rounded bg-[#131418] border border-[#22242A] text-zinc-400 text-[10px]">
                          {c.assignee}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteChecklist(c.id)}
                        className="p-1 rounded text-zinc-500 hover:text-red-400"
                      >
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