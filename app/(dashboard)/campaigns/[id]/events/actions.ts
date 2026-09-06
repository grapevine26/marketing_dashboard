"use server";

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
} from "@/lib/db";
import { MarketingEvent, EventInvitee, EventChecklistItem, EventRsvpStatus, EventStatus, EventPlan } from "@/lib/db/types";
import { generateEventPlanDraft } from "@/lib/ai/eventPlanAssist";
import { labelAnswers } from "@/lib/ai/config";
import { kstLocalInputToIso, formatKstDateTime } from "@/lib/seeding/dday";
import { ActionResult, runAction, fail } from "@/lib/actions/result";

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
  const res = await runAction(async () => {
    const ev = await createEvent({
      campaign_id: data.campaignId,
      name: data.name,
      event_at: kstLocalInputToIso(data.eventAtLocal),
      venue: data.venue,
      memo: data.memo,
    });
    return { id: ev.id };
  });
  if (res.ok) revalidateEvent(data.campaignId);
  return res;
}

export async function updateEventAction(data: {
  eventId: string;
  campaignId: string;
  patch: { name?: string; eventAtLocal?: string | null; venue?: string | null; memo?: string | null; status?: EventStatus };
}): Promise<ActionResult<MarketingEvent>> {
  const res = await runAction(async () => {
    const ev = await updateEvent(data.eventId, {
      name: data.patch.name,
      event_at: data.patch.eventAtLocal === undefined ? undefined : kstLocalInputToIso(data.patch.eventAtLocal),
      venue: data.patch.venue,
      memo: data.patch.memo,
      status: data.patch.status,
    });
    if (!ev) throw new Error("not found");
    return ev;
  });
  if (res.ok) revalidateEvent(data.campaignId, data.eventId);
  return res;
}

export async function deleteEventAction(eventId: string, campaignId: string): Promise<ActionResult<null>> {
  const res = await runAction(async () => {
    const okDel = await deleteEvent(eventId);
    if (!okDel) throw new Error("not found");
    return null;
  });
  if (res.ok) revalidateEvent(campaignId);
  return res;
}

export async function addInviteesFromApplicantsAction(
  eventId: string,
  campaignId: string,
  applicantIds: string[]
): Promise<ActionResult<EventInvitee[]>> {
  if (!Array.isArray(applicantIds) || applicantIds.length === 0) return fail("초청할 지원자를 선택해주세요.");
  const res = await runAction(() => addEventInviteesFromApplicants(eventId, applicantIds));
  if (res.ok) revalidateEvent(campaignId, eventId);
  return res;
}

export async function addDirectInviteeAction(data: {
  eventId: string;
  campaignId: string;
  name: string;
  snsUrl: string | null;
  contact: string | null;
  memo: string | null;
}): Promise<ActionResult<EventInvitee>> {
  const res = await runAction(() =>
    addDirectEventInvitee({
      event_id: data.eventId,
      name: data.name,
      sns_url: data.snsUrl,
      contact: data.contact,
      memo: data.memo,
    })
  );
  if (res.ok) revalidateEvent(data.campaignId, data.eventId);
  return res;
}

export async function updateInviteeAction(
  inviteeId: string,
  campaignId: string,
  eventId: string,
  patch: { rsvp_status?: EventRsvpStatus; attended?: boolean; memo?: string | null }
): Promise<ActionResult<EventInvitee>> {
  const res = await runAction(async () => {
    const inv = await updateEventInvitee(inviteeId, patch);
    if (!inv) throw new Error("not found");
    return inv;
  });
  if (res.ok) revalidateEvent(campaignId, eventId);
  return res;
}

export async function deleteInviteeAction(inviteeId: string, campaignId: string, eventId: string): Promise<ActionResult<null>> {
  const res = await runAction(async () => {
    await deleteEventInvitee(inviteeId);
    return null;
  });
  if (res.ok) revalidateEvent(campaignId, eventId);
  return res;
}

export async function addChecklistItemAction(data: {
  eventId: string;
  campaignId: string;
  label: string;
  dueDate: string | null;
  assignee: string | null;
}): Promise<ActionResult<EventChecklistItem>> {
  const res = await runAction(() =>
    addEventChecklistItem({
      event_id: data.eventId,
      label: data.label,
      due_date: data.dueDate,
      assignee: data.assignee,
    })
  );
  if (res.ok) revalidateEvent(data.campaignId, data.eventId);
  return res;
}

export async function updateChecklistItemAction(
  itemId: string,
  campaignId: string,
  eventId: string,
  patch: { label?: string; due_date?: string | null; assignee?: string | null; done?: boolean }
): Promise<ActionResult<EventChecklistItem>> {
  const res = await runAction(async () => {
    const item = await updateEventChecklistItem(itemId, patch);
    if (!item) throw new Error("not found");
    return item;
  });
  if (res.ok) revalidateEvent(campaignId, eventId);
  return res;
}

export async function deleteChecklistItemAction(itemId: string, campaignId: string, eventId: string): Promise<ActionResult<null>> {
  const res = await runAction(async () => {
    await deleteEventChecklistItem(itemId);
    return null;
  });
  if (res.ok) revalidateEvent(campaignId, eventId);
  return res;
}

export async function saveEventPlanAction(data: {
  eventId: string;
  campaignId: string;
  templateId: string;
  fieldValues: Record<string, string>;
}): Promise<ActionResult<EventPlan>> {
  const res = await runAction(() =>
    saveEventPlan({
      event_id: data.eventId,
      template_id: data.templateId,
      field_values: data.fieldValues,
    })
  );
  if (res.ok) revalidateEvent(data.campaignId, data.eventId);
  return res;
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
  const event = await getEventById(data.eventId);
  if (!event) return fail("행사를 찾을 수 없습니다.");
  const [campaign, preSurvey, template, surveyTemplate] = await Promise.all([
    getCampaignById(event.campaign_id),
    getPreSurveyResponse(event.campaign_id),
    getPptTemplateById(data.templateId),
    getPreSurveyTemplate(),
  ]);
  if (!template) return fail("템플릿을 찾을 수 없습니다.");
  const placeholders = data.placeholders.filter((p) => template.placeholders.includes(p));
  if (placeholders.length === 0) return fail("생성할 항목이 없습니다.");

  return runAction(async () => {
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
