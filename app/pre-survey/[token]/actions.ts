"use server";

import { getCampaignByToken, getPreSurveyTemplate, upsertPreSurveyResponse } from "@/lib/db";
import { assistPreSurvey, PreSurveyAssistResponse } from "@/lib/ai/preSurveyAssist";
import { ActionResult, runAction, fail } from "@/lib/actions/result";
import { revalidatePath } from "next/cache";

export async function submitPublicPreSurveyAction(params: {
  token: string;
  answers: Record<string, string>;
  usedAiAssist: boolean;
}): Promise<ActionResult<{ submitted_at: string }>> {
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
}): Promise<ActionResult<PreSurveyAssistResponse>> {
  const campaign = await getCampaignByToken("pre_survey", params.token);
  if (!campaign) return fail("유효하지 않은 사전조사 링크입니다.");
  const template = await getPreSurveyTemplate();
  const question = template.questions.find((q) => q.id === params.questionId);
  if (!question) return fail("질문을 찾을 수 없습니다.");

  return runAction(() =>
    assistPreSurvey({
      question: question.question,
      userDraft: params.userDraft,
      context: {
        campaignName: campaign.name,
        companyName: campaign.company_name,
        campaignType: campaign.campaign_type,
      },
    })
  );
}
