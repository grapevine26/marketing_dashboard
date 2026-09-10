"use server";

import { revalidatePath } from "next/cache";
import { saveSnsIntakeResponse, getSnsAccountByToken, getSnsIntakeQuestionsForAccount } from "@/lib/db";
import { assistSnsIntake, SnsIntakeAssistResponse } from "@/lib/ai/snsIntakeAssist";
import { ActionResult, runAction, fail } from "@/lib/actions/result";
import { checkRateLimit, getClientIp, rollbackRateLimit } from "@/lib/security/rateLimit";

export async function submitSnsIntakeAction(data: {
  token: string;
  answers: Record<string, string>;
  honeypot?: string;
}): Promise<ActionResult<{ submitted_at: string }>> {
  if (data.honeypot && data.honeypot.trim().length > 0) {
    return { ok: true, data: { submitted_at: new Date().toISOString() } };
  }

  const clientIp = await getClientIp();
  const rateLimit = checkRateLimit(`snsintake:${data.token}:${clientIp}`, 10, 10 * 60 * 1000);
  if (!rateLimit.allowed) {
    return fail("단시간에 너무 많은 요청이 발생했습니다. 10분 후 다시 시도해 주세요.");
  }

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
  forceRefresh?: boolean;
  isRegeneration?: boolean;
  previousDraft?: string;
}): Promise<ActionResult<SnsIntakeAssistResponse & { remainingAttempts?: number }>> {
  const clientIp = await getClientIp();

  // 악용 방지 1: 전체 토큰 기준 과도한 요청 방어 (10분당 최대 20회)
  const totalLimit = checkRateLimit(`ai_assist_total:sns:${data.token}:${clientIp}`, 20, 10 * 60 * 1000);
  if (!totalLimit.allowed) {
    return fail("AI 추천 요청이 너무 빈번합니다. 잠시 후 다시 시도해 주세요.");
  }

  const account = await getSnsAccountByToken("intake", data.token);
  if (!account) return fail("유효하지 않은 설문 링크입니다.");
  const questions = await getSnsIntakeQuestionsForAccount(account.id);
  const question = questions.find((q) => q.id === data.questionId);
  if (!question) return fail("질문을 찾을 수 없습니다.");

  // 악용 방지 2: 질문당 최대 3회 제한 (24시간)
  const rateLimitKey = `ai_assist:sns:${data.token}:${data.questionId}`;
  const questionLimit = checkRateLimit(rateLimitKey, 3, 24 * 60 * 60 * 1000);
  if (!questionLimit.allowed) {
    return fail("AI 추천은 질문당 최대 3회까지만 이용하실 수 있습니다.");
  }

  const res = await runAction(() =>
    assistSnsIntake({
      question: question.question,
      userDraft: data.userDraft,
      forceRefresh: data.forceRefresh,
      isRegeneration: data.isRegeneration,
      previousDraft: data.previousDraft,
      context: {
        companyName: account.company_name,
        platform: account.platform,
        handle: account.handle,
      },
    })
  );

  if (!res.ok || res.data.fallback) {
    rollbackRateLimit(rateLimitKey);
    return res;
  }

  return {
    ok: true,
    data: {
      ...res.data,
      remainingAttempts: questionLimit.remaining,
    },
  };
}
