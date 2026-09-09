"use server";

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
} from "@/lib/db";
import { PptTemplate } from "@/lib/db/types";
import { extractPlaceholders } from "@/lib/ppt/engine";
import { ActionResult, runAction, fail } from "@/lib/actions/result";

export async function uploadPptTemplateAction(
  formData: FormData
): Promise<ActionResult<{ template: PptTemplate; warning: string | null }>> {
  const file = formData.get("file");
  const name = formData.get("name");
  const kind = formData.get("kind");

  if (!(file instanceof File) || typeof name !== "string" || (kind !== "event" && kind !== "sns" && kind !== "report")) {
    return fail("필수 항목이 누락되었습니다.");
  }
  if (!file.name.toLowerCase().endsWith(".pptx")) {
    return fail(".pptx 파일만 업로드할 수 있습니다.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let placeholders: string[];
  try {
    placeholders = await extractPlaceholders(buffer);
  } catch {
    return fail("파일을 읽을 수 없습니다. 올바른 .pptx 파일인지 확인해주세요.");
  }

  const res = await runAction(async () => {
    const template = await savePptTemplate({ kind, name, file_buffer: buffer, placeholders });
    return {
      template: { ...template, file_data: undefined },
      warning: placeholders.length === 0 ? "치환 항목({{...}})이 하나도 감지되지 않았습니다. 슬라이드 텍스트에 {{브랜드명}} 같은 표시가 있는지 확인하세요." : null,
    };
  });
  if (res.ok) revalidatePath("/settings/ppt-templates");
  return res;
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
  if (!input.templateId || !input.name) return fail("필수 항목이 누락되었습니다.");
  if (input.kind !== "event" && input.kind !== "sns" && input.kind !== "report") {
    return fail("필수 항목이 누락되었습니다.");
  }

  const buffer = await readUploadedPptTemplateBuffer(input.templateId);
  if (!buffer) {
    return fail("업로드된 파일을 찾을 수 없습니다. 다시 시도해주세요.");
  }

  let placeholders: string[];
  try {
    placeholders = await extractPlaceholders(buffer);
  } catch {
    await discardUploadedPptTemplate(input.templateId);
    return fail("파일을 읽을 수 없습니다. 올바른 .pptx 파일인지 확인해주세요.");
  }

  const res = await runAction(async () => {
    const template = await recordUploadedPptTemplate({
      templateId: input.templateId,
      kind: input.kind,
      name: input.name,
      placeholders,
    });
    return {
      template,
      warning:
        placeholders.length === 0
          ? "치환 항목({{...}})이 하나도 감지되지 않았습니다. 슬라이드 텍스트에 {{브랜드명}} 같은 표시가 있는지 확인하세요."
          : null,
    };
  });
  if (res.ok) revalidatePath("/settings/ppt-templates");
  return res;
}

/** 이름과 종류만 바꾼다. 파일이 그대로라 이 템플릿을 쓰던 운영안이 끊기지 않는다. */
export async function updatePptTemplateMetaAction(input: {
  id: string;
  name: string;
  kind: PptTemplate["kind"];
}): Promise<ActionResult<PptTemplate>> {
  if (!input.id || !input.name.trim()) return fail("템플릿 이름을 입력해주세요.");
  const res = await runAction(async () => {
    const updated = await updatePptTemplateMeta(input.id, { name: input.name.trim(), kind: input.kind });
    if (!updated) throw new Error("템플릿을 찾을 수 없습니다.");
    return updated;
  });
  if (res.ok) revalidatePath("/settings/ppt-templates");
  return res;
}

/** 파일 교체를 시작할 자리를 잡아준다. 브라우저가 이 경로로 저장소에 바로 올린다. */
export async function preparePptTemplateReplaceAction(
  templateId: string
): Promise<ActionResult<{ fileKey: string; pathname: string }>> {
  if (!templateId) return fail("잘못된 요청입니다.");
  return runAction(() => preparePptTemplateReplace(templateId));
}

/**
 * 올라온 파일로 템플릿 내용을 갈아끼운다.
 * 치환 항목은 저장소에서 파일을 읽어 다시 뽑는다. 디자인이 바뀌면 항목도 바뀌기 때문이다.
 */
export async function confirmPptTemplateReplaceAction(input: {
  templateId: string;
  fileKey: string;
}): Promise<ActionResult<{ template: PptTemplate; warning: string | null }>> {
  if (!input.templateId || !input.fileKey) return fail("잘못된 요청입니다.");

  const bytes = await readPptTemplateFileByKey(input.fileKey);
  if (!bytes) return fail("업로드된 파일을 찾을 수 없습니다. 다시 시도해주세요.");

  let placeholders: string[];
  try {
    placeholders = await extractPlaceholders(bytes);
  } catch {
    return fail("파일을 읽을 수 없습니다. 올바른 .pptx 파일인지 확인해주세요.");
  }

  const res = await runAction(async () => {
    const template = await recordReplacedPptTemplate({
      templateId: input.templateId,
      fileKey: input.fileKey,
      placeholders,
    });
    return {
      template,
      warning:
        placeholders.length === 0
          ? "치환 항목({{...}})이 하나도 감지되지 않았습니다. 슬라이드 텍스트에 {{브랜드명}} 같은 표시가 있는지 확인하세요."
          : null,
    };
  });
  if (res.ok) revalidatePath("/settings/ppt-templates");
  return res;
}

/** 로컬 개발용. 배포에서는 브라우저가 저장소로 바로 올린다. */
export async function uploadPptTemplateReplacementAction(
  formData: FormData
): Promise<ActionResult<null>> {
  const file = formData.get("file");
  const fileKey = formData.get("fileKey");
  if (!(file instanceof File) || typeof fileKey !== "string") return fail("필수 항목이 누락되었습니다.");
  const buffer = Buffer.from(await file.arrayBuffer());
  return runAction(async () => {
    await putPptTemplateReplacement(fileKey, buffer);
    return null;
  });
}

/** 지웠던 기본 내장 템플릿을 되살린다. */
export async function restoreBuiltinPptTemplatesAction(): Promise<ActionResult<{ restored: number }>> {
  const res = await runAction(async () => ({ restored: await restoreBuiltinPptTemplates() }));
  if (res.ok) revalidatePath("/settings/ppt-templates");
  return res;
}

export async function deletePptTemplateAction(id: string): Promise<ActionResult<null>> {
  const res = await runAction(async () => {
    const deleted = await deletePptTemplate(id);
    if (!deleted) throw new Error("not found");
    return null;
  });
  if (res.ok) revalidatePath("/settings/ppt-templates");
  return res;
}
