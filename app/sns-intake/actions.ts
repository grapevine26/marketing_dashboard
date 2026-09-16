"use server";

import { revalidatePath } from "next/cache";
import { saveSnsIntakeResponse, getSnsAccountByToken, getSnsIntakeQuestionsForAccount, isSnsAccountClosed } from "@/lib/db";
import { assistSnsIntake, SnsIntakeAssistResponse } from "@/lib/ai/snsIntakeAssist";
import { isRefundableFallback } from "@/lib/ai/config";
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

  // **토큰을 먼저 확인한다.** 횟수 제한 키에 토큰이 들어가므로, 확인 없이 세면 아무 문자열이나
  // 보낼 때마다 auth_throttle 에 새 행이 쌓이고 어떤 제한에도 걸리지 않는다.
  const account = await getSnsAccountByToken("intake", data.token);
  if (!account) return fail("유효하지 않은 설문 링크입니다.");
  // 끝난 뒤에는 옛 링크로 고쳐 쓰지 못하게 막는다. 화면과 같은 기준이다.
  if (isSnsAccountClosed(account)) return fail("종료된 계약입니다. 담당자에게 문의해주세요.");

  // 제출 횟수 제한. DB 로 센다 — 인메모리는 서버리스에서 요청마다 비워져 아무것도 막지 못한다.
  const submitKey = publicSubmitKey("snsintake", data.token, await getClientIp());
  if (await isThrottled([submitKey])) {
    return fail("단시간에 너무 많은 요청이 발생했습니다. 10분 후 다시 시도해 주세요.");
  }
  await hitThrottle(submitKey, PUBLIC_SUBMIT);

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
  // 토큰을 먼저 확인한다. 제한 키에 토큰이 들어가므로, 확인 없이 세면 아무 문자열이나
  // 보낼 때마다 새 행이 쌓여 제한 자체가 무의미해진다(위 제출 액션의 주석 참고).
  const account = await getSnsAccountByToken("intake", data.token);
  if (!account) return fail("유효하지 않은 설문 링크입니다.");
  // 끝난 뒤에는 옛 링크로 고쳐 쓰지 못하게 막는다. 화면과 같은 기준이다.
  if (isSnsAccountClosed(account)) return fail("종료된 계약입니다. 담당자에게 문의해주세요.");

  // AI 는 부를 때마다 돈이 나간다. 링크 전체 기준으로 먼저 막는다.
  const linkKey = aiLinkKey("sns", data.token);
  if (await isThrottled([linkKey])) {
    return fail("AI 추천 요청이 너무 빈번합니다. 잠시 후 다시 시도해 주세요.");
  }
  await hitThrottle(linkKey, AI_BY_LINK);
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

  // 모델을 **부르지도 못했을 때만** 횟수를 돌려준다.
  // 이미 불러 돈이 나간 뒤 응답이 쓸 만하지 않았던 경우까지 돌려주면, 파싱이 깨지도록
  // 유도하는 입력을 반복해 질문당 상한을 무한히 우회할 수 있다.
  if (!res.ok) {
    await refundThrottle(questionKey);
    return res;
  }
  if (res.data.fallback) {
    // 전에는 `fallback: true` 를 전부 "이미 불렀다" 로 봤다. 그런데 어시스트는 throw 하지
    // 않고 **키가 없을 때도** 같은 모양으로 돌아온다. 그래서 GEMINI_API_KEY 가 빠져 있으면
    // 광고주가 3번 누르는 순간 그 질문이 24시간 잠겼고, 키를 고쳐 넣어도 풀리지 않았다.
    // 이제 이유를 보고 "부르지 못한" 쪽(no-key·call-failed)만 돌려준다.
    if (isRefundableFallback(res.data.fallbackReason)) await refundThrottle(questionKey);
    // **폴백에도 남은 횟수를 실어 보낸다.** 환불되는 폴백이 생긴 뒤로는 "폴백이면 한 번 썼다"
    // 가 더 이상 참이 아니다. 세는 주체는 하나여야 한다(사전조사 액션과 같은 이유).
    return {
      ok: true,
      data: {
        ...res.data,
        remainingAttempts: Math.max(0, AI_BY_QUESTION.maxHits - (await getThrottleCount(questionKey))),
      },
    };
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
