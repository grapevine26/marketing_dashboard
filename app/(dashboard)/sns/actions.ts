"use server";

import { revalidatePath } from "next/cache";
import {
  createSnsAccount,
  updateSnsAccount,
  updateSnsIntakeTemplate,
  createSnsContent,
  updateSnsContent,
  deleteSnsContent,
  deleteSnsAccount,
  saveSnsMediaAttachment,
  deleteSnsMediaAttachment,
  saveSnsPlan,
  getSnsAccountById,
  getSnsIntakeResponse,
  getSnsIntakeTemplate,
  getPptTemplateById,
  SnsContentPatch,
  regenerateSnsToken,
} from "@/lib/db";
import { SnsAccount, SnsContent, SnsPlan, PreSurveyQuestion, SnsMediaAttachment, SnsTokenType } from "@/lib/db/types";
import { generateSnsCaptionDraft } from "@/lib/ai/snsCaptionAssist";
import { generateSnsPlanDraft } from "@/lib/ai/snsPlanAssist";
import { labelAnswers } from "@/lib/ai/config";
import { BUILTIN_SNS_PLACEHOLDERS } from "@/lib/db";
import { ActionResult, runAction, fail } from "@/lib/actions/result";

function revalidateAccount(accountId?: string) {
  revalidatePath("/sns");
  revalidatePath("/");
  if (accountId) {
    revalidatePath(`/sns/${accountId}`);
    revalidatePath(`/sns/${accountId}/plan`);
  }
}

export async function createSnsAccountAction(data: {
  company_name: string;
  platform: SnsAccount["platform"];
  handle: string;
  starts_on: string | null;
  ends_on: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const res = await runAction(async () => {
    const account = await createSnsAccount(data);
    return { id: account.id };
  });
  if (res.ok) revalidateAccount(res.data.id);
  return res;
}

export async function updateSnsAccountAction(
  accountId: string,
  patch: {
    company_name?: string;
    platform?: SnsAccount["platform"];
    handle?: string;
    starts_on?: string | null;
    ends_on?: string | null;
    status?: SnsAccount["status"];
  }
): Promise<ActionResult<SnsAccount>> {
  const res = await runAction(async () => {
    const acc = await updateSnsAccount(accountId, patch);
    if (!acc) throw new Error("not found");
    return acc;
  });
  if (res.ok) revalidateAccount(accountId);
  return res;
}

export async function deleteSnsAccountAction(accountId: string): Promise<ActionResult<boolean>> {
  const existing = await getSnsAccountById(accountId);
  if (!existing) return fail("계정을 찾을 수 없습니다.");

  const res = await runAction(async () => {
    const deleted = await deleteSnsAccount(accountId);
    if (!deleted) throw new Error("계정을 찾을 수 없습니다.");
    return true;
  });
  if (res.ok) revalidateAccount();
  return res;
}

export async function updateSnsIntakeTemplateAction(
  questions: PreSurveyQuestion[]
): Promise<ActionResult<{ questions: PreSurveyQuestion[] }>> {
  const res = await runAction(async () => {
    const t = await updateSnsIntakeTemplate(questions);
    return { questions: t.questions };
  });
  if (res.ok) revalidatePath("/settings/sns-intake");
  return res;
}

export async function createSnsContentAction(data: {
  accountId: string;
  title: string;
  scheduledOn: string | null;
  assignee: string | null;
  caption: string | null;
  hashtags: string | null;
  mediaNote: string | null;
}): Promise<ActionResult<SnsContent>> {
  const res = await runAction(() =>
    createSnsContent({
      account_id: data.accountId,
      title: data.title,
      scheduled_on: data.scheduledOn,
      assignee: data.assignee,
      caption: data.caption,
      hashtags: data.hashtags,
      media_note: data.mediaNote,
    })
  );
  if (res.ok) revalidateAccount(data.accountId);
  return res;
}

export async function updateSnsContentAction(
  contentId: string,
  accountId: string,
  patch: SnsContentPatch
): Promise<ActionResult<SnsContent>> {
  const res = await runAction(async () => {
    const content = await updateSnsContent(contentId, patch);
    if (!content) throw new Error("not found");
    if (content.account_id !== accountId) throw new Error("mismatch");
    return content;
  });
  if (res.ok) revalidateAccount(accountId);
  return res;
}

export async function deleteSnsContentAction(contentId: string, accountId: string): Promise<ActionResult<null>> {
  const res = await runAction(async () => {
    const deleted = await deleteSnsContent(contentId);
    if (!deleted) throw new Error("not found");
    return null;
  });
  if (res.ok) revalidateAccount(accountId);
  return res;
}

export async function uploadSnsMediaAction(formData: FormData): Promise<ActionResult<SnsMediaAttachment>> {
  const contentId = formData.get("contentId") as string;
  const accountId = formData.get("accountId") as string;
  const file = formData.get("file") as File | null;

  if (!contentId || !accountId) return fail("잘못된 요청입니다.");
  if (!file || !(file instanceof File) || file.size === 0) return fail("업로드할 파일을 선택해주세요.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const res = await runAction(() =>
    saveSnsMediaAttachment(contentId, {
      name: file.name,
      buffer,
      mime_type: file.type || "application/octet-stream",
      size: file.size,
    })
  );
  if (res.ok) revalidateAccount(accountId);
  return res;
}

export async function deleteSnsMediaAction(
  contentId: string,
  attachmentId: string,
  accountId: string
): Promise<ActionResult<boolean>> {
  if (!contentId || !attachmentId || !accountId) return fail("잘못된 요청입니다.");
  const res = await runAction(() => deleteSnsMediaAttachment(contentId, attachmentId));
  if (res.ok) revalidateAccount(accountId);
  return res;
}

export async function generateSnsAiCaptionAction(data: {
  accountId: string;
  title: string;
  scheduledOn?: string | null;
  mediaNote?: string | null;
}): Promise<ActionResult<{ caption: string; hashtags: string; fallback: boolean }>> {
  const account = await getSnsAccountById(data.accountId);
  if (!account) return fail("계정을 찾을 수 없습니다.");
  if (!data.title?.trim()) return fail("콘텐츠 제목/주제를 먼저 입력해주세요.");
  return runAction(() =>
    generateSnsCaptionDraft({
      brandName: account.company_name,
      platform: account.platform,
      handle: account.handle,
      title: data.title,
      scheduledOn: data.scheduledOn,
      mediaNote: data.mediaNote,
    })
  );
}

export async function saveSnsPlanAction(data: {
  accountId: string;
  templateId: string | null;
  fieldValues: Record<string, string>;
}): Promise<ActionResult<SnsPlan>> {
  const res = await runAction(() =>
    saveSnsPlan({
      account_id: data.accountId,
      template_id: data.templateId,
      field_values: data.fieldValues,
    })
  );
  if (res.ok) revalidateAccount(data.accountId);
  return res;
}

/**
 * 운영안 AI 초안. `placeholders`에 넘긴 항목만 생성한다(필드별 호출 시 다른 필드를 덮어쓰지 않음).
 * 사전설문 답변은 질문 id가 아니라 질문 문구를 키로 붙여 AI에 넘긴다.
 */
export async function generateSnsAiPlanAction(data: {
  accountId: string;
  templateId?: string | null;
  placeholders: string[];
  currentValues: Record<string, string>;
}): Promise<ActionResult<{ values: Record<string, string>; fallback: boolean }>> {
  const [account, intake, intakeTemplate, template] = await Promise.all([
    getSnsAccountById(data.accountId),
    getSnsIntakeResponse(data.accountId),
    getSnsIntakeTemplate(),
    data.templateId ? getPptTemplateById(data.templateId) : null,
  ]);
  if (!account) return fail("계정을 찾을 수 없습니다.");

  const allowed = template?.placeholders || BUILTIN_SNS_PLACEHOLDERS;
  const placeholders = data.placeholders.filter((p) => allowed.includes(p));
  if (placeholders.length === 0) return fail("생성할 항목이 없습니다.");

  return runAction(async () => {
    const values = await generateSnsPlanDraft({
      brandName: account.company_name,
      platform: account.platform,
      handle: account.handle,
      startsOn: account.starts_on,
      endsOn: account.ends_on,
      intakeAnswers: labelAnswers(intake?.answers, intakeTemplate.questions),
      placeholders,
      currentValues: data.currentValues,
    });
    const fallback = Object.values(values).every((v) => v.startsWith("AI 제안 실패"));
    return { values, fallback };
  });
}

export async function regenerateSnsTokenAction(
  accountId: string,
  tokenType: SnsTokenType
): Promise<ActionResult<SnsAccount>> {
  const account = await getSnsAccountById(accountId);
  if (!account) return fail("SNS 계정을 찾을 수 없습니다.");

  const res = await runAction(async () => {
    return await regenerateSnsToken(accountId, tokenType);
  });
  if (res.ok) {
    revalidateAccount(accountId);
    revalidatePath(`/sns-intake/${res.data.intake_token}`);
    revalidatePath(`/sns-approval/${res.data.approval_token}`);
  }
  return res;
}
