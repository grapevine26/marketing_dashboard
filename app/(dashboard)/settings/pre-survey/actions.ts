"use server";

import { updatePreSurveyTemplate } from "@/lib/db";
import { PreSurveyTemplate } from "@/lib/db/types";
import { revalidatePath } from "next/cache";

export async function saveTemplateAction(template: PreSurveyTemplate) {
  await updatePreSurveyTemplate(template);
  revalidatePath("/settings/pre-survey");
  return { success: true };
}