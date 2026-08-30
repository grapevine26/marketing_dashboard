"use server";

import { upsertCampaignFormConfig } from "@/lib/db";
import { CampaignFormConfig } from "@/lib/db/types";
import { generateFormIntro } from "@/lib/ai/formIntroAssist";
import { revalidatePath } from "next/cache";

export async function saveFormConfigAction(params: {
  campaignId: string;
  introText: string;
  customQuestions: CampaignFormConfig["custom_questions"];
  isPublished: boolean;
}) {
  const config = await upsertCampaignFormConfig({
    campaign_id: params.campaignId,
    intro_text: params.introText,
    custom_questions: params.customQuestions,
    is_published: params.isPublished,
  });

  revalidatePath(`/campaigns/${params.campaignId}`);
  revalidatePath(`/campaigns/${params.campaignId}/apply-form`);
  return { success: true, config };
}

export async function generateAiIntroAction(params: {
  campaignName: string;
  companyName: string;
  campaignType: string;
  preSurveyAnswers?: Record<string, string>;
}) {
  return await generateFormIntro({
    campaignName: params.campaignName,
    companyName: params.companyName,
    campaignType: params.campaignType,
    preSurveyAnswers: params.preSurveyAnswers,
  });
}