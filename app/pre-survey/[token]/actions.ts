"use server";

import {
  getCampaignByToken,
  getPreSurveyQuestionsForCampaign,
  getPreSurveyResponse,
  insertAuditLog,
  upsertPreSurveyResponse,
} from "@/lib/db";
import type { PreSurveyResponse } from "@/lib/db/types";
import { assistPreSurvey, PreSurveyAssistResponse } from "@/lib/ai/preSurveyAssist";
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
import { revalidatePath } from "next/cache";

/** 저장 전후 답변을 비교해 실제로 내용이 달라진 문항 수를 센다. 답변 본문은 세는 데만 쓰고 밖으로 내보내지 않는다. */
function countChangedAnswers(
  before: Record<string, string>,
  after: Record<string, string>
): number {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  let changed = 0;
  for (const key of keys) {
    if ((before?.[key] ?? "") !== (after?.[key] ?? "")) changed += 1;
  }
  return changed;
}

/**
 * 사전조사 재제출(덮어쓰기) 흔적을 감사 로그에 남긴다.
 *
 * - 광고주·대행사가 "이 사람 답이 언제 바뀌었나"를 활동 기록에서 확인할 수 있어야 해서 남긴다.
 * - 답변 본문은 넣지 않는다. 이 프로젝트의 감사 로그는 개인정보를 담지 않는 것이 원칙이라
 *   사실관계(언제·몇 문항이 바뀌었나)와 식별자만 남긴다.
 * - 로그인이 없는 공개 제출이라 행위자 이름은 비운다(insertAuditLog 가 null 로 처리한다).
 *   공개 경로에서 로그를 남기는 다른 사례(지원 신청, 사전조사 제출)와 같은 방식이다.
 */
async function logPreSurveyOverwrite(
  campaignId: string,
  previous: PreSurveyResponse,
  saved: PreSurveyResponse
): Promise<void> {
  try {
    const changed = countChangedAnswers(previous.answers, saved.answers);
    await insertAuditLog({
      campaign_id: campaignId,
      entity_type: "campaign",
      entity_id: campaignId,
      action: "pre_survey.resubmitted",
      actor_type: "company",
      summary: `사전조사 응답이 다시 제출되어 이전 답변을 덮어썼습니다. (내용이 바뀐 문항 ${changed}개)`,
      details: {
        response_id: saved.id,
        changed_question_count: changed,
        previous_submitted_at: previous.submitted_at,
      },
    });
  } catch {
    // 로그 때문에 제출이 실패하면 안 된다. 기록은 부가 기능이라 삼키고 넘어간다.
  }
}

export async function submitPublicPreSurveyAction(params: {
  token: string;
  answers: Record<string, string>;
  usedAiAssist: boolean;
  honeypot?: string;
}): Promise<ActionResult<{ submitted_at: string }>> {
  if (params.honeypot && params.honeypot.trim().length > 0) {
    return { ok: true, data: { submitted_at: new Date().toISOString() } };
  }

  // **토큰을 먼저 확인한다.** 횟수 제한 키에 토큰이 들어가는데, 확인하지 않고 세면
  // 아무 문자열이나 보낼 때마다 auth_throttle 에 새 행이 하나씩 쌓인다. 키가 매번 달라
  // 어떤 제한에도 걸리지 않으므로, 그것만으로 DB 용량을 채워 로그인까지 멈출 수 있다.
  // 조회는 인덱스 한 번이라 제한 없이 맞아도 싸다.
  const campaign = await getCampaignByToken("pre_survey", params.token);
  if (!campaign) return fail("유효하지 않은 사전조사 링크입니다.");
  // 끝난 뒤에는 옛 링크로 고쳐 쓰지 못하게 막는다. 화면과 같은 기준이다.
  if (campaign.status === "completed") return fail("종료된 캠페인입니다. 담당자에게 문의해주세요.");

  // 제출 횟수 제한. DB 로 센다 — 인메모리는 서버리스에서 요청마다 비워져 아무것도 막지 못한다.
  const submitKey = publicSubmitKey("presurvey", params.token, await getClientIp());
  if (await isThrottled([submitKey])) {
    return fail("단시간에 너무 많은 요청이 발생했습니다. 10분 후 다시 시도해 주세요.");
  }
  await hitThrottle(submitKey, PUBLIC_SUBMIT);

  // 저장은 campaign_id 기준 upsert 라 재제출이면 이전 답변이 그대로 덮어써진다.
  // 덮어쓰기 자체는 정상 사용(오타 수정)이라 막지 않고, 비교용으로 저장 전 상태만 한 번 읽어둔다.
  const previous = await getPreSurveyResponse(campaign.id);

  const res = await runAction(async () => {
    const r = await upsertPreSurveyResponse({
      campaign_id: campaign.id,
      answers: params.answers,
      used_ai_assist: params.usedAiAssist,
    });
    // 첫 제출은 남기지 않는다. 첫 제출까지 남기면 로그가 제출 건수만큼 불어나 정작 중요한 "답이 바뀐 시점"이 묻힌다.
    if (previous) await logPreSurveyOverwrite(campaign.id, previous, r);
    return { submitted_at: r.submitted_at };
  });
  if (res.ok) {
    revalidatePath(`/campaigns/${campaign.id}`);
    revalidatePath(`/campaigns/${campaign.id}/pre-survey`);
  }
  return res;
}

/** 토큰으로 캠페인을 확인하고 질문 id로 질문 문구를 찾아 AI에 넘긴다. */
export async function getPublicAiAssistAction(params: {
  token: string;
  questionId: string;
  userDraft?: string;
  forceRefresh?: boolean;
  isRegeneration?: boolean;
  previousDraft?: string;
}): Promise<ActionResult<PreSurveyAssistResponse & { remainingAttempts?: number }>> {
  // 토큰을 먼저 확인한다. 제한 키에 토큰이 들어가므로, 확인 없이 세면 아무 문자열이나
  // 보낼 때마다 새 행이 쌓여 제한 자체가 무의미해진다(위 제출 액션의 주석 참고).
  const campaign = await getCampaignByToken("pre_survey", params.token);
  if (!campaign) return fail("유효하지 않은 사전조사 링크입니다.");
  // 끝난 뒤에는 옛 링크로 고쳐 쓰지 못하게 막는다. 화면과 같은 기준이다.
  if (campaign.status === "completed") return fail("종료된 캠페인입니다. 담당자에게 문의해주세요.");

  // AI 는 부를 때마다 돈이 나간다. 링크 전체 기준으로 먼저 막는다.
  const linkKey = aiLinkKey("pre", params.token);
  if (await isThrottled([linkKey])) {
    return fail("AI 추천 요청이 너무 빈번합니다. 잠시 후 다시 시도해 주세요.");
  }
  await hitThrottle(linkKey, AI_BY_LINK);
  const questions = await getPreSurveyQuestionsForCampaign(campaign.id);
  const question = questions.find((q) => q.id === params.questionId);
  if (!question) return fail("질문을 찾을 수 없습니다.");

  // 질문당 제한. **부르기 전에** 센다. 동시에 여러 번 눌러도 상한을 넘지 않게 하려는 것이고,
  // 실패하면 아래에서 돌려준다.
  const questionKey = aiQuestionKey("pre", params.token, params.questionId);
  if (await isThrottled([questionKey])) {
    return fail("AI 추천은 질문당 최대 3회까지만 이용하실 수 있습니다.");
  }
  await hitThrottle(questionKey, AI_BY_QUESTION);

  const res = await runAction(() =>
    assistPreSurvey({
      question: question.question,
      userDraft: params.userDraft,
      forceRefresh: params.forceRefresh,
      isRegeneration: params.isRegeneration,
      previousDraft: params.previousDraft,
      context: {
        campaignName: campaign.name,
        companyName: campaign.company_name,
        campaignType: campaign.campaign_type,
      },
    })
  );

  // 모델을 **부르지도 못했을 때만** 횟수를 돌려준다.
  // fallback 은 모델을 이미 불러 돈이 나간 뒤 응답이 쓸 만하지 않았다는 뜻이다. 그때도
  // 돌려주면, 파싱이 깨지도록 유도하는 입력을 반복해 질문당 상한을 무한히 우회할 수 있다.
  if (!res.ok) {
    await refundThrottle(questionKey);
    return res;
  }
  if (res.data.fallback) return res;

  return {
    ok: true,
    data: {
      ...res.data,
      // 방금 한 번 썼으니 남은 횟수는 상한에서 사용 횟수를 뺀 값이다.
      remainingAttempts: Math.max(0, AI_BY_QUESTION.maxHits - (await getThrottleCount(questionKey))),
    },
  };
}
