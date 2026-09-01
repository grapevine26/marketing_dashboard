"use server";

import { revalidatePath } from "next/cache";
import {
  createSnsAccount,
  updateSnsIntakeTemplate,
  saveSnsIntakeResponse,
  createSnsContent,
  updateSnsContent,
  reviewSnsContent,
  saveSnsPlan,
  getSnsAccountById,
  getSnsIntakeResponse,
  getPptTemplateById,
} from "@/lib/db";
import { SnsAccount, SnsContent, SnsContentStatus, PreSurveyQuestion } from "@/lib/db/types";
import { generateSnsCaptionDraft } from "@/lib/ai/snsCaptionAssist";
import { generateSnsPlanDraft } from "@/lib/ai/snsPlanAssist";

export async function createSnsAccountAction(data: {
  company_name: string;
  platform: SnsAccount["platform"];
  handle: string;
  starts_on: string | null;
  ends_on: string | null;
}) {
  const account = await createSnsAccount(data);
  revalidatePath("/sns");
  revalidatePath("/");
  return { success: true, account };
}

export async function updateSnsIntakeTemplateAction(questions: PreSurveyQuestion[]) {
  const template = await updateSnsIntakeTemplate(questions);
  revalidatePath("/settings/sns-intake");
  return { success: true, template };
}

export async function submitSnsIntakeAction(data: {
  token: string;
  accountId: string;
  answers: Record<string, string>;
}) {
  const resp = await saveSnsIntakeResponse({
    account_id: data.accountId,
    answers: data.answers,
  });
  revalidatePath(`/sns/${data.accountId}`);
  return { success: true, response: resp };
}

export async function createSnsContentAction(data: {
  accountId: string;
  title: string;
  scheduledOn: string | null;
  assignee: string | null;
  caption: string | null;
  hashtags: string | null;
  mediaNote: string | null;
}) {
  const content = await createSnsContent({
    account_id: data.accountId,
    title: data.title,
    scheduled_on: data.scheduledOn,
    assignee: data.assignee,
    caption: data.caption,
    hashtags: data.hashtags,
    media_note: data.mediaNote,
  });
  revalidatePath(`/sns/${data.accountId}`);
  return { success: true, content };
}

export async function updateSnsContentAction(
  contentId: string,
  accountId: string,
  patch: Partial<SnsContent>
) {
  const content = await updateSnsContent(contentId, patch);
  revalidatePath(`/sns/${accountId}`);
  return { success: true, content };
}

export async function reviewSnsContentAction(data: {
  contentId: string;
  decision: "approve" | "request_changes";
  comment?: string;
}) {
  const content = await reviewSnsContent(data);
  return { success: true, content };
}

export async function generateSnsAiCaptionAction(data: {
  brandName: string;
  platform: string;
  handle: string;
  title: string;
  scheduledOn?: string | null;
  mediaNote?: string | null;
}) {
  const draft = await generateSnsCaptionDraft(data);
  return { success: true, ...draft };
}

export async function saveSnsPlanAction(data: {
  accountId: string;
  templateId: string | null;
  fieldValues: Record<string, string>;
}) {
  const plan = await saveSnsPlan({
    account_id: data.accountId,
    template_id: data.templateId,
    field_values: data.fieldValues,
  });
  revalidatePath(`/sns/${data.accountId}/plan`);
  return { success: true, plan };
}

export async function generateSnsAiPlanAction(data: {
  accountId: string;
  templateId?: string | null;
}) {
  const [account, intake, template] = await Promise.all([
    getSnsAccountById(data.accountId),
    getSnsIntakeResponse(data.accountId),
    data.templateId ? getPptTemplateById(data.templateId) : null,
  ]);

  if (!account) throw new Error("계정을 찾을 수 없습니다.");

  const placeholders = template?.placeholders || [
    "브랜드명",
    "채널명",
    "계약기간",
    "운영목표",
    "타겟오디언스",
    "콘텐츠방향성",
    "월별계획",
  ];

  const values = await generateSnsPlanDraft({
    brandName: account.company_name,
    platform: account.platform,
    handle: account.handle,
    startsOn: account.starts_on,
    endsOn: account.ends_on,
    intakeAnswers: intake?.answers || {},
    placeholders,
  });

  return { success: true, values };
}