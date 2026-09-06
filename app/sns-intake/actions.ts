"use server";

import { revalidatePath } from "next/cache";
import { saveSnsIntakeResponse, getSnsAccountByToken, getSnsIntakeTemplate } from "@/lib/db";
import { assistSnsIntake, SnsIntakeAssistResponse } from "@/lib/ai/snsIntakeAssist";
import { ActionResult, runAction, fail } from "@/lib/actions/result";

export async function submitSnsIntakeAction(data: {
  token: string;
  answers: Record<string, string>;
}): Promise<ActionResult<{ submitted_at: string }>> {
  const account = await getSnsAccountByToken("intake", data.token);
  if (!account) return fail("유효하지 않은 설문 링크입니다.");

  const res = await runAction(async () => {
    const r = await saveSnsIntakeResponse({ account_id: account.id, answers: data.answers });
    return { submitted_at: r.submitted_at };
  });
  if (res.ok) {
    revalidatePath(`/sns-intake/${data.token}`);
    revalidatePath(`/sns/${account.id}`);
  }
  return res;
}

export async function assistSnsIntakeAction(data: {
  token: string;
  questionId: string;
  userDraft?: string;
}): Promise<ActionResult<SnsIntakeAssistResponse>> {
  const account = await getSnsAccountByToken("intake", data.token);
  if (!account) return fail("유효하지 않은 설문 링크입니다.");
  const template = await getSnsIntakeTemplate();
  const question = template.questions.find((q) => q.id === data.questionId);
  if (!question) return fail("질문을 찾을 수 없습니다.");

  return runAction(() =>
    assistSnsIntake({
      question: question.question,
      userDraft: data.userDraft,
      context: {
        companyName: account.company_name,
        platform: account.platform,
        handle: account.handle,
      },
    })
  );
}
