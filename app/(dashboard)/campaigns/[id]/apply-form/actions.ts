"use server";

// 규칙: 액션 본문 첫 문장은 `return runAuthedAction(...)`. 존재 확인·DB 조회를 그 앞에서 하면 인증 전에 실행된다.

import {
  upsertCampaignFormConfig,
  getCampaignById,
  getPreSurveyResponse,
  getPreSurveyTemplate,
  ValidationError,
} from "@/lib/db";
import { CampaignFormConfig } from "@/lib/db/types";
import { generateFormIntro } from "@/lib/ai/formIntroAssist";
import { labelAnswers } from "@/lib/ai/config";
import { revalidatePath } from "next/cache";
import { ActionResult, runAuthedAction } from "@/lib/actions/result";

export async function saveFormConfigAction(params: {
  campaignId: string;
  introText: string;
  customQuestions: CampaignFormConfig["custom_questions"];
  isPublished: boolean;
}): Promise<ActionResult<CampaignFormConfig>> {
  return runAuthedAction(async () => {
    const saved = await upsertCampaignFormConfig({
      campaign_id: params.campaignId,
      intro_text: params.introText,
      custom_questions: params.customQuestions,
      is_published: params.isPublished,
    });
    revalidatePath(`/campaigns/${params.campaignId}`);
    revalidatePath(`/campaigns/${params.campaignId}/apply-form`);
    return saved;
  });
}

/** 캠페인 id만 받고, 사전조사 답변은 서버에서 질문 문구를 붙여 AI에 넘긴다. */
export async function generateAiIntroAction(
  campaignId: string
): Promise<ActionResult<{ text: string; fallback: boolean }>> {
  return runAuthedAction(async () => {
    const campaign = await getCampaignById(campaignId);
    if (!campaign) throw new ValidationError("캠페인이 이미 삭제되었거나 찾을 수 없습니다. 화면을 새로고침해주세요.");
    const [preSurvey, template] = await Promise.all([getPreSurveyResponse(campaignId), getPreSurveyTemplate()]);

    return generateFormIntro({
      campaignName: campaign.name,
      companyName: campaign.company_name,
      campaignType: campaign.campaign_type,
      preSurveyAnswers: labelAnswers(preSurvey?.answers, template.questions),
    });
  });
}
