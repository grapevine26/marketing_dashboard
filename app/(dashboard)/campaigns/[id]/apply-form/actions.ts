"use server";

import { upsertCampaignFormConfig, getCampaignById, getPreSurveyResponse, getPreSurveyTemplate } from "@/lib/db";
import { CampaignFormConfig } from "@/lib/db/types";
import { generateFormIntro } from "@/lib/ai/formIntroAssist";
import { labelAnswers } from "@/lib/ai/config";
import { revalidatePath } from "next/cache";
import { ActionResult, runAction, fail } from "@/lib/actions/result";

export async function saveFormConfigAction(params: {
  campaignId: string;
  introText: string;
  customQuestions: CampaignFormConfig["custom_questions"];
  isPublished: boolean;
}): Promise<ActionResult<CampaignFormConfig>> {
  const res = await runAction(() =>
    upsertCampaignFormConfig({
      campaign_id: params.campaignId,
      intro_text: params.introText,
      custom_questions: params.customQuestions,
      is_published: params.isPublished,
    })
  );
  if (!res.ok) return res;
  revalidatePath(`/campaigns/${params.campaignId}`);
  revalidatePath(`/campaigns/${params.campaignId}/apply-form`);
  return res;
}

/** 캠페인 id만 받고, 사전조사 답변은 서버에서 질문 문구를 붙여 AI에 넘긴다. */
export async function generateAiIntroAction(
  campaignId: string
): Promise<ActionResult<{ text: string; fallback: boolean }>> {
  const campaign = await getCampaignById(campaignId);
  if (!campaign) return fail("캠페인을 찾을 수 없습니다.");
  const [preSurvey, template] = await Promise.all([getPreSurveyResponse(campaignId), getPreSurveyTemplate()]);

  return runAction(() =>
    generateFormIntro({
      campaignName: campaign.name,
      companyName: campaign.company_name,
      campaignType: campaign.campaign_type,
      preSurveyAnswers: labelAnswers(preSurvey?.answers, template.questions),
    })
  );
}
