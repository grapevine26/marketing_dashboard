"use server";

import { getCampaignByToken, getPreSurveyQuestionsForCampaign, upsertPreSurveyResponse } from "@/lib/db";
import { assistPreSurvey, PreSurveyAssistResponse } from "@/lib/ai/preSurveyAssist";
import { ActionResult, runAction, fail } from "@/lib/actions/result";
import { checkRateLimit, getClientIp, rollbackRateLimit } from "@/lib/security/rateLimit";
import { revalidatePath } from "next/cache";

export async function submitPublicPreSurveyAction(params: {
  token: string;
  answers: Record<string, string>;
  usedAiAssist: boolean;
  honeypot?: string;
}): Promise<ActionResult<{ submitted_at: string }>> {
  if (params.honeypot && params.honeypot.trim().length > 0) {
    return { ok: true, data: { submitted_at: new Date().toISOString() } };
  }

  const clientIp = await getClientIp();
  const rateLimit = checkRateLimit(`presurvey:${params.token}:${clientIp}`, 10, 10 * 60 * 1000);
  if (!rateLimit.allowed) {
    return fail("단시간에 너무 많은 요청이 발생했습니다. 10분 후 다시 시도해 주세요.");
  }

  const campaign = await getCampaignByToken("pre_survey", params.token);
  if (!campaign) return fail("유효하지 않은 사전조사 링크입니다.");

  const res = await runAction(async () => {
    const r = await upsertPreSurveyResponse({
      campaign_id: campaign.id,
      answers: params.answers,
      used_ai_assist: params.usedAiAssist,
    });
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
  const clientIp = await getClientIp();

  // 악용 방지 1: 전체 토큰 기준 과도한 요청 방어 (10분당 최대 20회)
  const totalLimit = checkRateLimit(`ai_assist_total:pre:${params.token}:${clientIp}`, 20, 10 * 60 * 1000);
  if (!totalLimit.allowed) {
    return fail("AI 추천 요청이 너무 빈번합니다. 잠시 후 다시 시도해 주세요.");
  }

  const campaign = await getCampaignByToken("pre_survey", params.token);
  if (!campaign) return fail("유효하지 않은 사전조사 링크입니다.");
  const questions = await getPreSurveyQuestionsForCampaign(campaign.id);
  const question = questions.find((q) => q.id === params.questionId);
  if (!question) return fail("질문을 찾을 수 없습니다.");

  // 악용 방지 2: 질문당 최대 3회 제한 (24시간)
  const rateLimitKey = `ai_assist:pre:${params.token}:${params.questionId}`;
  const questionLimit = checkRateLimit(rateLimitKey, 3, 24 * 60 * 60 * 1000);
  if (!questionLimit.allowed) {
    return fail("AI 추천은 질문당 최대 3회까지만 이용하실 수 있습니다.");
  }

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
