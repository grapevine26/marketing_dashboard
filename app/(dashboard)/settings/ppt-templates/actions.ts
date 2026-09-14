"use server";

// 규칙: 액션 본문 첫 문장은 `return runAuthedAction(...)`. 파일 읽기·치환 항목 추출·DB 조회를 그 앞에서 하면 인증 전에 실행된다.

import { revalidatePath } from "next/cache";
import {
  savePptTemplate,
  deletePptTemplate,
  recordUploadedPptTemplate,
  readUploadedPptTemplateBuffer,
  readPptTemplateFileByKey,
  putPptTemplateReplacement,
  discardUploadedPptTemplate,
  updatePptTemplateMeta,
  preparePptTemplateReplace,
  recordReplacedPptTemplate,
  restoreBuiltinPptTemplates,
  ValidationError,
} from "@/lib/db";
import { PptTemplate } from "@/lib/db/types";
import { extractPlaceholders } from "@/lib/ppt/engine";
import { ActionResult, runAuthedAction } from "@/lib/actions/result";

const TEMPLATE_NOT_FOUND = "템플릿이 이미 삭제되었거나 찾을 수 없습니다. 화면을 새로고침해주세요.";
const NO_PLACEHOLDER_WARNING =
  "치환 항목({{...}})이 하나도 감지되지 않았습니다. 슬라이드 텍스트에 {{브랜드명}} 같은 표시가 있는지 확인하세요.";
const UNREADABLE_PPTX = "파일을 읽을 수 없습니다. 올바른 .pptx 파일인지 확인해주세요.";

function isTemplateKind(kind: unknown): kind is PptTemplate["kind"] {
  return kind === "event" || kind === "sns" || kind === "report";
}

/** pptx 를 열어 치환 항목을 뽑는다. 손상된 파일이면 사람이 읽을 오류로 바꾼다. */
async function extractPlaceholdersOrThrow(bytes: Buffer): Promise<string[]> {
  try {
    return await extractPlaceholders(bytes);
  } catch {
    throw new ValidationError(UNREADABLE_PPTX);
  }
}

export async function uploadPptTemplateAction(
  formData: FormData
): Promise<ActionResult<{ template: PptTemplate; warning: string | null }>> {
  return runAuthedAction(async () => {
    const file = formData.get("file");
    const name = formData.get("name");
    const kind = formData.get("kind");

    if (!(file instanceof File) || typeof name !== "string" || !isTemplateKind(kind)) {
      throw new ValidationError("필수 항목이 누락되었습니다.");
    }
    if (!file.name.toLowerCase().endsWith(".pptx")) {
      throw new ValidationError(".pptx 파일만 업로드할 수 있습니다.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const placeholders = await extractPlaceholdersOrThrow(buffer);

    const template = await savePptTemplate({ kind, name, file_buffer: buffer, placeholders });
    revalidatePath("/settings/ppt-templates");
    return {
      template: { ...template, file_data: undefined },
      warning: placeholders.length === 0 ? NO_PLACEHOLDER_WARNING : null,
    };
  });
}

/**
 * 브라우저가 저장소에 직접 올린 pptx 를 템플릿으로 등록한다.
 *
 * 치환 항목은 여기서 뽑는다. 파일은 저장소에서 읽으므로 요청 본문 한도를 지나지 않는다.
 * 읽지 못하거나 pptx 가 아니면 올라온 파일을 지운다.
 */
export async function confirmPptTemplateUploadAction(input: {
  templateId: string;
  kind: PptTemplate["kind"];
  name: string;
}): Promise<ActionResult<{ template: PptTemplate; warning: string | null }>> {
  return runAuthedAction(async () => {
    if (!input.templateId || !input.name || !isTemplateKind(input.kind)) {
      throw new ValidationError("필수 항목이 누락되었습니다.");
    }

    const buffer = await readUploadedPptTemplateBuffer(input.templateId);
    if (!buffer) throw new ValidationError("업로드된 파일을 찾을 수 없습니다. 다시 시도해주세요.");

    let placeholders: string[];
    try {
      placeholders = await extractPlaceholders(buffer);
    } catch {
      await discardUploadedPptTemplate(input.templateId);
      throw new ValidationError(UNREADABLE_PPTX);
    }

    const template = await recordUploadedPptTemplate({
      templateId: input.templateId,
      kind: input.kind,
      name: input.name,
      placeholders,
    });
    revalidatePath("/settings/ppt-templates");
    return {
      template,
      warning: placeholders.length === 0 ? NO_PLACEHOLDER_WARNING : null,
    };
  });
}

/** 이름과 종류만 바꾼다. 파일이 그대로라 이 템플릿을 쓰던 운영안이 끊기지 않는다. */
export async function updatePptTemplateMetaAction(input: {
  id: string;
  name: string;
  kind: PptTemplate["kind"];
}): Promise<ActionResult<PptTemplate>> {
  return runAuthedAction(async () => {
    if (!input.id || !input.name.trim()) throw new ValidationError("템플릿 이름을 입력해주세요.");
    const updated = await updatePptTemplateMeta(input.id, { name: input.name.trim(), kind: input.kind });
    if (!updated) throw new ValidationError(TEMPLATE_NOT_FOUND);
    revalidatePath("/settings/ppt-templates");
    return updated;
  });
}

/** 파일 교체를 시작할 자리를 잡아준다. 브라우저가 이 경로로 저장소에 바로 올린다. */
export async function preparePptTemplateReplaceAction(
  templateId: string
): Promise<ActionResult<{ fileKey: string; pathname: string }>> {
  return runAuthedAction(async () => {
    if (!templateId) throw new ValidationError("잘못된 요청입니다.");
    return preparePptTemplateReplace(templateId);
  });
}

/**
 * 올라온 파일로 템플릿 내용을 갈아끼운다.
 * 치환 항목은 저장소에서 파일을 읽어 다시 뽑는다. 디자인이 바뀌면 항목도 바뀌기 때문이다.
 */
export async function confirmPptTemplateReplaceAction(input: {
  templateId: string;
  fileKey: string;
}): Promise<ActionResult<{ template: PptTemplate; warning: string | null }>> {
  return runAuthedAction(async () => {
    if (!input.templateId || !input.fileKey) throw new ValidationError("잘못된 요청입니다.");

    const bytes = await readPptTemplateFileByKey(input.fileKey);
    if (!bytes) throw new ValidationError("업로드된 파일을 찾을 수 없습니다. 다시 시도해주세요.");
    const placeholders = await extractPlaceholdersOrThrow(bytes);

    const template = await recordReplacedPptTemplate({
      templateId: input.templateId,
      fileKey: input.fileKey,
      placeholders,
    });
    revalidatePath("/settings/ppt-templates");
    return {
      template,
      warning: placeholders.length === 0 ? NO_PLACEHOLDER_WARNING : null,
    };
  });
}

/** 로컬 개발용. 배포에서는 브라우저가 저장소로 바로 올린다. */
export async function uploadPptTemplateReplacementAction(
  formData: FormData
): Promise<ActionResult<null>> {
  return runAuthedAction(async () => {
    const file = formData.get("file");
    const fileKey = formData.get("fileKey");
    if (!(file instanceof File) || typeof fileKey !== "string") throw new ValidationError("필수 항목이 누락되었습니다.");
    const buffer = Buffer.from(await file.arrayBuffer());
    await putPptTemplateReplacement(fileKey, buffer);
    return null;
  });
}

/** 지웠던 기본 내장 템플릿을 되살린다. */
export async function restoreBuiltinPptTemplatesAction(): Promise<ActionResult<{ restored: number }>> {
  return runAuthedAction(async () => {
    const restored = await restoreBuiltinPptTemplates();
    revalidatePath("/settings/ppt-templates");
    return { restored };
  });
}

export async function deletePptTemplateAction(id: string): Promise<ActionResult<null>> {
  return runAuthedAction(async () => {
    const deleted = await deletePptTemplate(id);
    if (!deleted) throw new ValidationError(TEMPLATE_NOT_FOUND);
    revalidatePath("/settings/ppt-templates");
    return null;
  });
}
