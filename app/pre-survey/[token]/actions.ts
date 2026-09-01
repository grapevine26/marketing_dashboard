"use server";

import { getCampaignByToken, upsertPreSurveyResponse } from "@/lib/db";
import { assistPreSurvey } from "@/lib/ai/preSurveyAssist";

export async function submitPublicPreSurveyAction(params: {
  token: string;
  answers: Record<string, string>;
  usedAiAssist: boolean;
}) {
  const campaign = await getCampaignByToken("pre_survey", params.token);
  if (!campaign) throw new Error("Invalid token");

  const res = await upsertPreSurveyResponse({
    campaign_id: campaign.id,
    answers: params.answers,
    used_ai_assist: params.usedAiAssist,
  });

  return { success: true, response: res };
}

export async function getPublicAiAssistAction(params: {
  question: string;
  userDraft?: string;
  campaignName: string;
  companyName: string;
  campaignType: string;
}) {
  return await assistPreSurvey({
    question: params.question,
    userDraft: params.userDraft,
    context: {
      campaignName: params.campaignName,
      companyName: params.companyName,
      campaignType: params.campaignType,
    },
  });
}