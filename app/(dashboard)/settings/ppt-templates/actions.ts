"use server";

import { revalidatePath } from "next/cache";
import { savePptTemplate, deletePptTemplate } from "@/lib/db";
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

export async function deletePptTemplateAction(id: string): Promise<ActionResult<null>> {
  const res = await runAction(async () => {
    const deleted = await deletePptTemplate(id);
    if (!deleted) throw new Error("not found");
    return null;
  });
  if (res.ok) revalidatePath("/settings/ppt-templates");
  return res;
}
