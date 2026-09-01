"use server";

import { revalidatePath } from "next/cache";
import { savePptTemplate, deletePptTemplate } from "@/lib/db";
import { extractPlaceholders } from "@/lib/ppt/engine";

export async function uploadPptTemplateAction(formData: FormData) {
  const file = formData.get("file") as File | null;
  const name = formData.get("name") as string;
  const kind = formData.get("kind") as "event" | "sns";

  if (!file || !name || !kind) {
    throw new Error("필수 항목이 누락되었습니다.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const placeholders = await extractPlaceholders(buffer);

  const template = await savePptTemplate({
    kind,
    name,
    file_buffer: buffer,
    placeholders,
  });

  revalidatePath("/settings/ppt-templates");
  return { success: true, template };
}

export async function deletePptTemplateAction(id: string) {
  await deletePptTemplate(id);
  revalidatePath("/settings/ppt-templates");
  return { success: true };
}