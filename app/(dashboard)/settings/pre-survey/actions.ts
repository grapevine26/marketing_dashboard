"use server";

import { updatePreSurveyTemplate } from "@/lib/db";
import { PreSurveyQuestion } from "@/lib/db/types";
import { revalidatePath } from "next/cache";
import { ActionResult, runAuthedAction } from "@/lib/actions/result";

/**
 * 공용 사전조사 문항 저장.
 * `expectedUpdatedAt` 은 화면이 불러올 때 받은 템플릿의 `updated_at` 이다. 그 사이 다른 사람이
 * 저장했으면 덮어쓰지 않고 오류를 돌려준다(낙관적 잠금).
 * 성공하면 화면이 다음 저장 때 쓸 새 `updated_at` 을 같이 돌려준다.
 */
export async function saveTemplateAction(
  questions: PreSurveyQuestion[],
  expectedUpdatedAt?: string | null
): Promise<ActionResult<{ questions: PreSurveyQuestion[]; updated_at: string }>> {
  const res = await runAuthedAction(async () => {
    const t = await updatePreSurveyTemplate(questions, expectedUpdatedAt);
    return { questions: t.questions, updated_at: t.updated_at };
  });
  if (res.ok) revalidatePath("/settings/templates");
  return res;
}
