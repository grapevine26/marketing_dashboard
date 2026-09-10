"use server";

import { getCampaignByToken, getPreSurveyQuestionsForCampaign, upsertPreSurveyResponse } from "@/lib/db";
import { assistPreSurvey, PreSurveyAssistResponse } from "@/lib/ai/preSurveyAssist";
import { ActionResult, runAction, fail } from "@/lib/actions/result";
import { checkRateLimit, getClientIp } from "@/lib/security/rateLimit";
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
}): Promise<ActionResult<PreSurveyAssistResponse>> {
  const campaign = await getCampaignByToken("pre_survey", params.token);
  if (!campaign) return fail("유효하지 않은 사전조사 링크입니다.");
  const questions = await getPreSurveyQuestionsForCampaign(campaign.id);
  const question = questions.find((q) => q.id === params.questionId);
  if (!question) return fail("질문을 찾을 수 없습니다.");

  return runAction(() =>
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
}
