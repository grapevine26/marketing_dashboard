"use server";

import { upsertPreSurveyResponse, getCampaignById, getPreSurveyTemplate } from "@/lib/db";
import { assistPreSurvey, PreSurveyAssistResponse } from "@/lib/ai/preSurveyAssist";
import { revalidatePath } from "next/cache";
import { ActionResult, runAction, fail } from "@/lib/actions/result";

export async function saveAgencyPreSurveyAction(params: {
  campaignId: string;
  answers: Record<string, string>;
  usedAiAssist: boolean;
}): Promise<ActionResult<{ submitted_at: string }>> {
  const res = await runAction(async () => {
    const r = await upsertPreSurveyResponse({
      campaign_id: params.campaignId,
      answers: params.answers,
      used_ai_assist: params.usedAiAssist,
    });
    return { submitted_at: r.submitted_at };
  });
  if (res.ok) {
    revalidatePath(`/campaigns/${params.campaignId}`);
    revalidatePath(`/campaigns/${params.campaignId}/pre-survey`);
  }
  return res;
}

export async function getAiAssistAction(params: {
  campaignId: string;
  questionId: string;
  userDraft?: string;
}): Promise<ActionResult<PreSurveyAssistResponse>> {
  const campaign = await getCampaignById(params.campaignId);
  if (!campaign) return fail("캠페인을 찾을 수 없습니다.");
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
