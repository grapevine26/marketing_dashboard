"use server";

import { upsertPreSurveyResponse } from "@/lib/db";
import { assistPreSurvey } from "@/lib/ai/preSurveyAssist";
import { revalidatePath } from "next/cache";

export async function saveAgencyPreSurveyAction(params: {
  campaignId: string;
  answers: Record<string, string>;
  usedAiAssist: boolean;
}) {
  const res = await upsertPreSurveyResponse({
    campaign_id: params.campaignId,
    answers: params.answers,
    used_ai_assist: params.usedAiAssist,
  });
  revalidatePath(`/campaigns/${params.campaignId}`);
  revalidatePath(`/campaigns/${params.campaignId}/pre-survey`);
  return { success: true, response: res };
}

export async function getAiAssistAction(params: {
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