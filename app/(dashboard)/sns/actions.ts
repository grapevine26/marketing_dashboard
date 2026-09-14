"use server";

// 규칙: 액션 본문 첫 문장은 `return runAuthedAction(...)`. 존재 확인·DB 조회·파일 읽기를 그 앞에서 하면 인증 전에 실행된다.

import { revalidatePath } from "next/cache";
import { resolveMediaMime } from "@/lib/db/types";
import {
  createSnsAccount,
  updateSnsAccount,
  updateSnsIntakeTemplate,
  createSnsContent,
  updateSnsContent,
  deleteSnsContent,
  deleteSnsAccount,
  saveSnsMediaAttachment,
  recordUploadedSnsMedia,
  deleteSnsMediaAttachment,
  saveSnsPlan,
  getSnsAccountById,
  getSnsIntakeResponse,
  getSnsIntakeTemplate,
  getPptTemplateById,
  SnsContentPatch,
  regenerateSnsToken,
  updateSnsAccountIntakeQuestions,
  ValidationError,
} from "@/lib/db";
import { SnsAccount, SnsContent, SnsPlan, PreSurveyQuestion, SnsMediaAttachment, SnsTokenType } from "@/lib/db/types";
import { generateSnsCaptionDraft } from "@/lib/ai/snsCaptionAssist";
import { generateSnsPlanDraft } from "@/lib/ai/snsPlanAssist";
import { labelAnswers } from "@/lib/ai/config";
import { BUILTIN_SNS_PLACEHOLDERS } from "@/lib/db";
import { isManager } from "@/lib/auth/roles";
import { ActionResult, runAuthedAction } from "@/lib/actions/result";

const ACCOUNT_NOT_FOUND = "SNS 계정이 이미 삭제되었거나 찾을 수 없습니다. 화면을 새로고침해주세요.";
const CONTENT_NOT_FOUND = "콘텐츠가 이미 삭제되었거나 찾을 수 없습니다. 화면을 새로고침해주세요.";

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
  return runAuthedAction(async () => {
    const account = await createSnsAccount(data);
    revalidateAccount(account.id);
    return { id: account.id };
  });
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
  return runAuthedAction(async () => {
    const acc = await updateSnsAccount(accountId, patch);
    if (!acc) throw new ValidationError(ACCOUNT_NOT_FOUND);
    revalidateAccount(accountId);
    return acc;
  });
}

/**
 * 계정 삭제는 관리자 이상만. 직원이 부르면 리다이렉트 대신 이유를 돌려준다.
 * (runAdminAction 은 "/" 로 보내 버려서 화면에서 왜 안 되는지 알 수 없다.)
 */
export async function deleteSnsAccountAction(accountId: string): Promise<ActionResult<boolean>> {
  return runAuthedAction(async (user) => {
    if (!isManager(user.role)) throw new ValidationError("SNS 계정 삭제는 관리자만 할 수 있습니다.");
    const existing = await getSnsAccountById(accountId);
    if (!existing) throw new ValidationError(ACCOUNT_NOT_FOUND);

    const deleted = await deleteSnsAccount(accountId);
    if (!deleted) throw new ValidationError(ACCOUNT_NOT_FOUND);
    revalidateAccount();
    return true;
  });
}

export async function updateSnsIntakeTemplateAction(
  questions: PreSurveyQuestion[]
): Promise<ActionResult<{ questions: PreSurveyQuestion[] }>> {
  return runAuthedAction(async () => {
    const t = await updateSnsIntakeTemplate(questions);
    revalidatePath("/settings/templates");
    return { questions: t.questions };
  });
}

export async function saveSnsAccountIntakeQuestionsAction(data: {
  accountId: string;
  questions: PreSurveyQuestion[];
}): Promise<ActionResult<{ questions: PreSurveyQuestion[] }>> {
  return runAuthedAction(async () => {
    const updated = await updateSnsAccountIntakeQuestions(data.accountId, data.questions);
    revalidateAccount(data.accountId);
    return { questions: updated.intake_questions || [] };
  });
}

export async function resetSnsAccountIntakeQuestionsAction(
  accountId: string
): Promise<ActionResult<{ success: boolean }>> {
  return runAuthedAction(async () => {
    await updateSnsAccountIntakeQuestions(accountId, null);
    revalidateAccount(accountId);
    return { success: true };
  });
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
  return runAuthedAction(async () => {
    const content = await createSnsContent({
      account_id: data.accountId,
      title: data.title,
      scheduled_on: data.scheduledOn,
      assignee: data.assignee,
      caption: data.caption,
      hashtags: data.hashtags,
      media_note: data.mediaNote,
    });
    revalidateAccount(data.accountId);
    return content;
  });
}

export async function updateSnsContentAction(
  contentId: string,
  accountId: string,
  patch: SnsContentPatch
): Promise<ActionResult<SnsContent>> {
  return runAuthedAction(async () => {
    const content = await updateSnsContent(contentId, patch);
    if (!content) throw new ValidationError(CONTENT_NOT_FOUND);
    if (content.account_id !== accountId) throw new ValidationError("다른 계정의 콘텐츠입니다. 화면을 새로고침해주세요.");
    revalidateAccount(accountId);
    return content;
  });
}

export async function deleteSnsContentAction(contentId: string, accountId: string): Promise<ActionResult<null>> {
  return runAuthedAction(async () => {
    const deleted = await deleteSnsContent(contentId);
    if (!deleted) throw new ValidationError(CONTENT_NOT_FOUND);
    revalidateAccount(accountId);
    return null;
  });
}

export async function uploadSnsMediaAction(formData: FormData): Promise<ActionResult<SnsMediaAttachment>> {
  return runAuthedAction(async () => {
    const contentId = formData.get("contentId") as string;
    const accountId = formData.get("accountId") as string;
    const file = formData.get("file") as File | null;

    if (!contentId || !accountId) throw new ValidationError("잘못된 요청입니다.");
    if (!file || !(file instanceof File) || file.size === 0) throw new ValidationError("업로드할 파일을 선택해주세요.");

    const buffer = Buffer.from(await file.arrayBuffer());
    const attachment = await saveSnsMediaAttachment(contentId, {
      name: file.name,
      buffer,
      // 브라우저가 형식을 안 알려주면 확장자로 되짚는다. 실제 내용은 서버가 다시 확인한다.
      mime_type: resolveMediaMime(file.name, file.type),
      size: file.size,
    });
    revalidateAccount(accountId);
    return attachment;
  });
}

/**
 * 브라우저가 Blob 에 직접 올린 파일을 DB 에 기록한다.
 *
 * 파일이 서버를 거치지 않았으므로, 여기서 실물이 올라왔는지와 내용이 형식과 맞는지 확인한다.
 * 어긋나면 올라온 파일을 지운다.
 */
export async function confirmSnsMediaUploadAction(input: {
  contentId: string;
  accountId: string;
  attachmentId: string;
  storedFilename: string;
  name: string;
  mimeType: string;
}): Promise<ActionResult<SnsMediaAttachment>> {
  return runAuthedAction(async () => {
    if (!input.contentId || !input.accountId || !input.attachmentId || !input.storedFilename) {
      throw new ValidationError("잘못된 요청입니다.");
    }
    const attachment = await recordUploadedSnsMedia(input.contentId, {
      attachmentId: input.attachmentId,
      storedFilename: input.storedFilename,
      name: input.name,
      mime_type: input.mimeType,
    });
    revalidateAccount(input.accountId);
    return attachment;
  });
}

export async function deleteSnsMediaAction(
  contentId: string,
  attachmentId: string,
  accountId: string
): Promise<ActionResult<boolean>> {
  return runAuthedAction(async () => {
    if (!contentId || !attachmentId || !accountId) throw new ValidationError("잘못된 요청입니다.");
    const deleted = await deleteSnsMediaAttachment(contentId, attachmentId);
    if (!deleted) throw new ValidationError("첨부 파일이 이미 삭제되었거나 찾을 수 없습니다. 화면을 새로고침해주세요.");
    revalidateAccount(accountId);
    return true;
  });
}

export async function generateSnsAiCaptionAction(data: {
  accountId: string;
  title: string;
  scheduledOn?: string | null;
  mediaNote?: string | null;
}): Promise<ActionResult<{ caption: string; hashtags: string; fallback: boolean }>> {
  return runAuthedAction(async () => {
    if (!data.title?.trim()) throw new ValidationError("콘텐츠 제목/주제를 먼저 입력해주세요.");
    const account = await getSnsAccountById(data.accountId);
    if (!account) throw new ValidationError(ACCOUNT_NOT_FOUND);
    return generateSnsCaptionDraft({
      brandName: account.company_name,
      platform: account.platform,
      handle: account.handle,
      title: data.title,
      scheduledOn: data.scheduledOn,
      mediaNote: data.mediaNote,
    });
  });
}

/**
 * 운영안 저장. `expectedUpdatedAt` 은 화면이 불러올 때 받은 plan.updated_at 이다.
 * 그 사이 다른 사람이 저장했으면 덮어쓰지 않고 오류를 돌려준다(낙관적 잠금).
 * 안 보내면(옛 화면) 잠금 없이 저장한다. 성공하면 새 updated_at 이 담긴 운영안을 돌려준다.
 */
export async function saveSnsPlanAction(data: {
  accountId: string;
  templateId: string | null;
  fieldValues: Record<string, string>;
  expectedUpdatedAt?: string | null;
}): Promise<ActionResult<SnsPlan>> {
  return runAuthedAction(async () => {
    const plan = await saveSnsPlan({
      account_id: data.accountId,
      template_id: data.templateId,
      field_values: data.fieldValues,
      expected_updated_at: data.expectedUpdatedAt,
    });
    revalidateAccount(data.accountId);
    return plan;
  });
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
  return runAuthedAction(async () => {
    const [account, intake, intakeTemplate, template] = await Promise.all([
      getSnsAccountById(data.accountId),
      getSnsIntakeResponse(data.accountId),
      getSnsIntakeTemplate(),
      data.templateId ? getPptTemplateById(data.templateId) : null,
    ]);
    if (!account) throw new ValidationError(ACCOUNT_NOT_FOUND);

    const allowed = template?.placeholders || BUILTIN_SNS_PLACEHOLDERS;
    const placeholders = data.placeholders.filter((p) => allowed.includes(p));
    if (placeholders.length === 0) throw new ValidationError("생성할 항목이 없습니다.");

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
  return runAuthedAction(async () => {
    // regenerateSnsToken 이 없는 계정이면 ValidationError 를 던진다.
    const updated = await regenerateSnsToken(accountId, tokenType);
    revalidateAccount(accountId);
    revalidatePath(`/sns-intake/${updated.intake_token}`);
    revalidatePath(`/sns-approval/${updated.approval_token}`);
    return updated;
  });
}
