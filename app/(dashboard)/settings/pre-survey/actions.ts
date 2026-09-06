"use server";

import { updatePreSurveyTemplate } from "@/lib/db";
import { PreSurveyQuestion } from "@/lib/db/types";
import { revalidatePath } from "next/cache";
import { ActionResult, runAction } from "@/lib/actions/result";

export async function saveTemplateAction(
  questions: PreSurveyQuestion[]
): Promise<ActionResult<{ questions: PreSurveyQuestion[] }>> {
  const res = await runAction(async () => {
    const t = await updatePreSurveyTemplate(questions);
    return { questions: t.questions };
  });
  if (res.ok) revalidatePath("/settings/pre-survey");
  return res;
}
