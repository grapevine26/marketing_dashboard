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
  getPreSurveyResponse,
  getPptTemplateById,
} from "@/lib/db";
import { MarketingEvent, EventInvitee, EventChecklistItem, EventRsvpStatus } from "@/lib/db/types";
import { generateEventPlanDraft } from "@/lib/ai/eventPlanAssist";

export async function createEventAction(data: {
  campaignId: string;
  name: string;
  eventAt: string | null;
  venue: string | null;
  memo: string | null;
}) {
  const ev = await createEvent({
    campaign_id: data.campaignId,
    name: data.name,
    event_at: data.eventAt,
    venue: data.venue,
    memo: data.memo,
  });
  revalidatePath(`/campaigns/${data.campaignId}`);
  revalidatePath(`/campaigns/${data.campaignId}/events`);
  return { success: true, event: ev };
}

export async function updateEventAction(
  eventId: string,
  campaignId: string,
  patch: Partial<MarketingEvent>
) {
  const ev = await updateEvent(eventId, patch);
  revalidatePath(`/campaigns/${campaignId}/events/${eventId}`);
  return { success: true, event: ev };
}

export async function addInviteesFromApplicantsAction(
  eventId: string,
  campaignId: string,
  applicantIds: string[]
) {
  const invitees = await addEventInviteesFromApplicants(eventId, applicantIds);
  revalidatePath(`/campaigns/${campaignId}/events/${eventId}`);
  return { success: true, count: invitees.length };
}

export async function addDirectInviteeAction(data: {
  eventId: string;
  campaignId: string;
  name: string;
  snsUrl: string | null;
  contact: string | null;
  memo: string | null;
}) {
  const inv = await addDirectEventInvitee({
    event_id: data.eventId,
    name: data.name,
    sns_url: data.snsUrl,
    contact: data.contact,
    memo: data.memo,
  });
  revalidatePath(`/campaigns/${data.campaignId}/events/${data.eventId}`);
  return { success: true, invitee: inv };
}

export async function updateInviteeRsvpAction(
  inviteeId: string,
  campaignId: string,
  eventId: string,
  patch: {
    rsvp_status?: EventRsvpStatus;
    attended?: boolean;
    memo?: string | null;
  }
) {
  const inv = await updateEventInvitee(inviteeId, patch);
  revalidatePath(`/campaigns/${campaignId}/events/${eventId}`);
  return { success: true, invitee: inv };
}

export async function deleteInviteeAction(
  inviteeId: string,
  campaignId: string,
  eventId: string
) {
  await deleteEventInvitee(inviteeId);
  revalidatePath(`/campaigns/${campaignId}/events/${eventId}`);
  return { success: true };
}

export async function addChecklistItemAction(data: {
  eventId: string;
  campaignId: string;
  label: string;
  dueDate: string | null;
  assignee: string | null;
}) {
  const item = await addEventChecklistItem({
    event_id: data.eventId,
    label: data.label,
    due_date: data.dueDate,
    assignee: data.assignee,
  });
  revalidatePath(`/campaigns/${data.campaignId}/events/${data.eventId}`);
  return { success: true, item };
}

export async function updateChecklistItemAction(
  itemId: string,
  campaignId: string,
  eventId: string,
  patch: Partial<EventChecklistItem>
) {
  const item = await updateEventChecklistItem(itemId, patch);
  revalidatePath(`/campaigns/${campaignId}/events/${eventId}`);
  return { success: true, item };
}

export async function deleteChecklistItemAction(
  itemId: string,
  campaignId: string,
  eventId: string
) {
  await deleteEventChecklistItem(itemId);
  revalidatePath(`/campaigns/${campaignId}/events/${eventId}`);
  return { success: true };
}

export async function saveEventPlanAction(data: {
  eventId: string;
  campaignId: string;
  templateId: string;
  fieldValues: Record<string, string>;
}) {
  const plan = await saveEventPlan({
    event_id: data.eventId,
    template_id: data.templateId,
    field_values: data.fieldValues,
  });
  revalidatePath(`/campaigns/${data.campaignId}/events/${data.eventId}`);
  return { success: true, plan };
}

export async function generateEventAiDraftAction(data: {
  campaignId: string;
  eventName: string;
  eventAt: string | null;
  venue: string | null;
  templateId: string;
}) {
  const [campaign, preSurvey, template] = await Promise.all([
    getCampaignById(data.campaignId),
    getPreSurveyResponse(data.campaignId),
    getPptTemplateById(data.templateId),
  ]);

  if (!template) {
    throw new Error("템플릿을 찾을 수 없습니다.");
  }

  const values = await generateEventPlanDraft({
    eventName: data.eventName,
    brandName: campaign?.company_name || "브랜드",
    eventAt: data.eventAt,
    venue: data.venue,
    preSurveyAnswers: preSurvey?.answers || {},
    placeholders: template.placeholders,
  });

  return { success: true, values };
}