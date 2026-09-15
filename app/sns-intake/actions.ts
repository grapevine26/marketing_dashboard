"use server";

import { revalidatePath } from "next/cache";
import { saveSnsIntakeResponse, getSnsAccountByToken, getSnsIntakeQuestionsForAccount } from "@/lib/db";
import { assistSnsIntake, SnsIntakeAssistResponse } from "@/lib/ai/snsIntakeAssist";
import { ActionResult, runAction, fail } from "@/lib/actions/result";
import {
  AI_BY_LINK,
  AI_BY_QUESTION,
  PUBLIC_SUBMIT,
  aiLinkKey,
  aiQuestionKey,
  getClientIp,
  hitThrottle,
  isThrottled,
  publicSubmitKey,
  getThrottleCount,
  refundThrottle,
} from "@/lib/security/throttle";

export async function submitSnsIntakeAction(data: {
  token: string;
  answers: Record<string, string>;
  honeypot?: string;
}): Promise<ActionResult<{ submitted_at: string }>> {
  if (data.honeypot && data.honeypot.trim().length > 0) {
    return { ok: true, data: { submitted_at: new Date().toISOString() } };
  }

  // 제출 횟수 제한. DB 로 센다 — 인메모리는 서버리스에서 요청마다 비워져 아무것도 막지 못한다.
  const submitKey = publicSubmitKey("snsintake", data.token, await getClientIp());
  if (await isThrottled([submitKey])) {
    return fail("단시간에 너무 많은 요청이 발생했습니다. 10분 후 다시 시도해 주세요.");
  }
  await hitThrottle(submitKey, PUBLIC_SUBMIT);

  const account = await getSnsAccountByToken("intake", data.token);
  if (!account) return fail("유효하지 않은 설문 링크입니다.");
  // 끝난 뒤에는 옛 링크로 고쳐 쓰지 못하게 막는다. 화면과 같은 기준이다.
  if (account.status === "ended") return fail("종료된 계약입니다. 담당자에게 문의해주세요.");

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
  // AI 는 부를 때마다 돈이 나간다. 링크 전체 기준으로 먼저 막는다.
  const linkKey = aiLinkKey("sns", data.token);
  if (await isThrottled([linkKey])) {
    return fail("AI 추천 요청이 너무 빈번합니다. 잠시 후 다시 시도해 주세요.");
  }
  await hitThrottle(linkKey, AI_BY_LINK);

  const account = await getSnsAccountByToken("intake", data.token);
  if (!account) return fail("유효하지 않은 설문 링크입니다.");
  // 끝난 뒤에는 옛 링크로 고쳐 쓰지 못하게 막는다. 화면과 같은 기준이다.
  if (account.status === "ended") return fail("종료된 계약입니다. 담당자에게 문의해주세요.");
  const questions = await getSnsIntakeQuestionsForAccount(account.id);
  const question = questions.find((q) => q.id === data.questionId);
  if (!question) return fail("질문을 찾을 수 없습니다.");

  // 질문당 제한. **부르기 전에** 센다. 동시에 여러 번 눌러도 상한을 넘지 않게 하려는 것이고,
  // 실패하면 아래에서 돌려준다.
  const questionKey = aiQuestionKey("sns", data.token, data.questionId);
  if (await isThrottled([questionKey])) {
    return fail("AI 추천은 질문당 최대 3회까지만 이용하실 수 있습니다.");
  }
  await hitThrottle(questionKey, AI_BY_QUESTION);

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
    await refundThrottle(questionKey);
    return res;
  }

  return {
    ok: true,
    data: {
      ...res.data,
      // 방금 한 번 썼으니 남은 횟수는 상한에서 사용 횟수를 뺀 값이다.
      remainingAttempts: Math.max(0, AI_BY_QUESTION.maxHits - (await getThrottleCount(questionKey))),
    },
  };
}
