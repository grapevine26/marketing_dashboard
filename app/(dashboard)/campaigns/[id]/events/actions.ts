"use server";

// 규칙: 액션 본문 첫 문장은 `return runAuthedAction(...)`. 존재 확인·DB 조회를 그 앞에서 하면 인증 전에 실행된다.

import { revalidatePath } from "next/cache";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  addEventInviteesFromApplicants,
  addDirectEventInvitee,
  updateEventInvitee,
  deleteEventInvitee,
  addEventChecklistItem,
  updateEventChecklistItem,
  deleteEventChecklistItem,
  saveEventPlan,
  getCampaignById,
  getEventById,
  getPreSurveyResponse,
  getPreSurveyTemplate,
  getPptTemplateById,
  ValidationError,
} from "@/lib/db";
import { MarketingEvent, EventInvitee, EventChecklistItem, EventRsvpStatus, EventStatus, EventPlan } from "@/lib/db/types";
import { generateEventPlanDraft } from "@/lib/ai/eventPlanAssist";
import { labelAnswers } from "@/lib/ai/config";
import { kstLocalInputToIso, formatKstDateTime } from "@/lib/seeding/dday";
import { ActionResult, runAuthedAction } from "@/lib/actions/result";
import { isManager } from "@/lib/auth/roles";

const EVENT_NOT_FOUND = "행사가 이미 삭제되었거나 찾을 수 없습니다. 화면을 새로고침해주세요.";
const INVITEE_NOT_FOUND = "초대 명단 항목이 이미 삭제되었거나 찾을 수 없습니다. 화면을 새로고침해주세요.";
const CHECKLIST_NOT_FOUND = "체크리스트 항목이 이미 삭제되었거나 찾을 수 없습니다. 화면을 새로고침해주세요.";

/**
 * 저장돼 있던 행사 일시를 지우려 할 때 확인 없이는 통과시키지 않는다.
 *
 * `<input type="datetime-local">` 은 "2026-03-14" 처럼 **덜 채운 입력**도 `value === ""` 로 준다.
 * 폼은 언제나 값을 보내므로 `""` → `null` → `changes.event_at = null` 이 되어, 장소만 고치려다
 * 시간 칸을 지운 것만으로 저장돼 있던 일시가 조용히 사라졌다.
 *
 * 화면(EventDetailClient)이 먼저 물어보지만 서버에도 빗장을 둔다. 화면 쪽 검사는 브라우저나
 * 옛 탭에 따라 건너뛰어질 수 있는데, 지워진 일시는 되돌릴 방법이 없다.
 * **일부러 비우는 것은 계속 가능하다** — 확인을 거쳐 `confirmClearEventAt` 이 붙어 오면 그대로 지운다.
 */
const EVENT_AT_CLEAR_CONFIRM =
  "저장된 행사 일시를 지우려는 것으로 보입니다. 날짜와 시간을 모두 입력하거나, 일시를 비우려면 화면을 새로고침한 뒤 다시 저장해 확인창에서 동의해주세요.";

function revalidateEvent(campaignId: string, eventId?: string) {
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/events`);
  if (eventId) revalidatePath(`/campaigns/${campaignId}/events/${eventId}`);
  revalidatePath("/events");
  revalidatePath("/");
}

export async function createEventAction(data: {
  campaignId: string;
  name: string;
  /** <input type="datetime-local"> 값. KST로 해석한다. */
  eventAtLocal: string | null;
  venue: string | null;
  memo: string | null;
}): Promise<ActionResult<{ id: string }>> {
  return runAuthedAction(async () => {
    const ev = await createEvent({
      campaign_id: data.campaignId,
      name: data.name,
      event_at: kstLocalInputToIso(data.eventAtLocal),
      venue: data.venue,
      memo: data.memo,
    });
    revalidateEvent(data.campaignId);
    return { id: ev.id };
  });
}

export async function updateEventAction(data: {
  eventId: string;
  campaignId: string;
  patch: { name?: string; eventAtLocal?: string | null; venue?: string | null; memo?: string | null; status?: EventStatus };
  /** 저장돼 있던 일시를 **일부러** 비운다고 사용자가 확인했을 때만 true. */
  confirmClearEventAt?: boolean;
}): Promise<ActionResult<MarketingEvent>> {
  return runAuthedAction(async () => {
    // 일시를 건드리지 않는 저장(상태 변경 등)은 eventAtLocal 이 undefined 라 여기 걸리지 않는다.
    const clearingEventAt =
      data.patch.eventAtLocal !== undefined && kstLocalInputToIso(data.patch.eventAtLocal) === null;
    if (clearingEventAt && !data.confirmClearEventAt) {
      const before = await getEventById(data.eventId);
      if (!before) throw new ValidationError(EVENT_NOT_FOUND);
      // 원래 비어 있던 일시를 비운 채로 저장하는 것은 아무것도 잃지 않으므로 그냥 통과시킨다.
      if (before.event_at) throw new ValidationError(EVENT_AT_CLEAR_CONFIRM);
    }

    const ev = await updateEvent(data.eventId, {
      name: data.patch.name,
      event_at: data.patch.eventAtLocal === undefined ? undefined : kstLocalInputToIso(data.patch.eventAtLocal),
      venue: data.patch.venue,
      memo: data.patch.memo,
      status: data.patch.status,
    });
    if (!ev) throw new ValidationError(EVENT_NOT_FOUND);
    revalidateEvent(data.campaignId, data.eventId);
    return ev;
  });
}

export async function deleteEventAction(eventId: string, campaignId: string): Promise<ActionResult<null>> {
  return runAuthedAction(async (user) => {
    // 행사를 지우면 초대 명단·체크리스트·운영안이 함께 사라진다. 범위가 넓어 관리자 이상으로 좁힌다.
    if (!isManager(user.role)) throw new ValidationError("행사 삭제는 관리자만 할 수 있습니다.");
    const okDel = await deleteEvent(eventId);
    if (!okDel) throw new ValidationError(EVENT_NOT_FOUND);
    revalidateEvent(campaignId);
    return null;
  });
}

export async function addInviteesFromApplicantsAction(
  eventId: string,
  campaignId: string,
  applicantIds: string[]
): Promise<ActionResult<EventInvitee[]>> {
  return runAuthedAction(async () => {
    if (!Array.isArray(applicantIds) || applicantIds.length === 0) {
      throw new ValidationError("초청할 지원자를 선택해주세요.");
    }
    const added = await addEventInviteesFromApplicants(eventId, applicantIds);
    revalidateEvent(campaignId, eventId);
    return added;
  });
}

export async function addDirectInviteeAction(data: {
  eventId: string;
  campaignId: string;
  name: string;
  snsUrl: string | null;
  contact: string | null;
  memo: string | null;
}): Promise<ActionResult<EventInvitee>> {
  return runAuthedAction(async () => {
    const added = await addDirectEventInvitee({
      event_id: data.eventId,
      name: data.name,
      sns_url: data.snsUrl,
      contact: data.contact,
      memo: data.memo,
    });
    revalidateEvent(data.campaignId, data.eventId);
    return added;
  });
}

export async function updateInviteeAction(
  inviteeId: string,
  campaignId: string,
  eventId: string,
  patch: { rsvp_status?: EventRsvpStatus; attended?: boolean; memo?: string | null }
): Promise<ActionResult<EventInvitee>> {
  return runAuthedAction(async () => {
    const inv = await updateEventInvitee(inviteeId, patch);
    if (!inv) throw new ValidationError(INVITEE_NOT_FOUND);
    revalidateEvent(campaignId, eventId);
    return inv;
  });
}

export async function deleteInviteeAction(inviteeId: string, campaignId: string, eventId: string): Promise<ActionResult<null>> {
  return runAuthedAction(async () => {
    await deleteEventInvitee(inviteeId);
    revalidateEvent(campaignId, eventId);
    return null;
  });
}

export async function addChecklistItemAction(data: {
  eventId: string;
  campaignId: string;
  label: string;
  dueDate: string | null;
  assignee: string | null;
}): Promise<ActionResult<EventChecklistItem>> {
  return runAuthedAction(async () => {
    const item = await addEventChecklistItem({
      event_id: data.eventId,
      label: data.label,
      due_date: data.dueDate,
      assignee: data.assignee,
    });
    revalidateEvent(data.campaignId, data.eventId);
    return item;
  });
}

export async function updateChecklistItemAction(
  itemId: string,
  campaignId: string,
  eventId: string,
  patch: { label?: string; due_date?: string | null; assignee?: string | null; done?: boolean }
): Promise<ActionResult<EventChecklistItem>> {
  return runAuthedAction(async () => {
    const item = await updateEventChecklistItem(itemId, patch);
    if (!item) throw new ValidationError(CHECKLIST_NOT_FOUND);
    revalidateEvent(campaignId, eventId);
    return item;
  });
}

export async function deleteChecklistItemAction(itemId: string, campaignId: string, eventId: string): Promise<ActionResult<null>> {
  return runAuthedAction(async () => {
    await deleteEventChecklistItem(itemId);
    revalidateEvent(campaignId, eventId);
    return null;
  });
}

/**
 * 운영안 저장. `expectedUpdatedAt` 은 화면이 불러올 때 받은 plan.updated_at 이다.
 * 그 사이 다른 사람이 저장했으면 덮어쓰지 않고 오류를 돌려준다(낙관적 잠금).
 * 안 보내면(옛 화면) 잠금 없이 저장한다. 성공하면 새 updated_at 이 담긴 운영안을 돌려준다.
 */
export async function saveEventPlanAction(data: {
  eventId: string;
  campaignId: string;
  templateId: string;
  fieldValues: Record<string, string>;
  expectedUpdatedAt?: string | null;
}): Promise<ActionResult<EventPlan>> {
  return runAuthedAction(async () => {
    const plan = await saveEventPlan({
      event_id: data.eventId,
      template_id: data.templateId,
      field_values: data.fieldValues,
      expected_updated_at: data.expectedUpdatedAt,
    });
    revalidateEvent(data.campaignId, data.eventId);
    return plan;
  });
}

/**
 * 운영안 AI 초안. `placeholders`에 넘긴 항목만 생성하므로 필드별 버튼에서 1개씩 호출하면
 * 담당자가 손으로 고친 다른 필드가 덮어써지지 않는다.
 */
export async function generateEventAiDraftAction(data: {
  eventId: string;
  templateId: string;
  placeholders: string[];
  currentValues: Record<string, string>;
}): Promise<ActionResult<{ values: Record<string, string>; fallback: boolean }>> {
  return runAuthedAction(async () => {
    const event = await getEventById(data.eventId);
    if (!event) throw new ValidationError(EVENT_NOT_FOUND);
    const [campaign, preSurvey, template, surveyTemplate] = await Promise.all([
      getCampaignById(event.campaign_id),
      getPreSurveyResponse(event.campaign_id),
      getPptTemplateById(data.templateId),
      getPreSurveyTemplate(),
    ]);
    if (!template) throw new ValidationError("템플릿이 삭제되었거나 찾을 수 없습니다. 화면을 새로고침해주세요.");
    const placeholders = data.placeholders.filter((p) => template.placeholders.includes(p));
    if (placeholders.length === 0) throw new ValidationError("생성할 항목이 없습니다.");

    const values = await generateEventPlanDraft({
      eventName: event.name,
      brandName: campaign?.company_name || "브랜드",
      eventAt: formatKstDateTime(event.event_at),
      venue: event.venue,
      preSurveyAnswers: labelAnswers(preSurvey?.answers, surveyTemplate.questions),
      placeholders,
      currentValues: data.currentValues,
    });
    const fallback = Object.values(values).every((v) => v.startsWith("AI 제안 실패"));
    return { values, fallback };
  });
}
