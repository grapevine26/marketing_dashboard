"use server";

// 규칙: 액션 본문 첫 문장은 `return runAuthedAction(...)`. 존재 확인·DB 조회를 그 앞에서 하면 인증 전에 실행된다.

import {
  upsertPreSurveyResponse,
  getCampaignById,
  getPreSurveyQuestionsForCampaign,
  updateCampaignPreSurveyQuestions,
  ValidationError,
} from "@/lib/db";
import { PreSurveyQuestion } from "@/lib/db/types";
import { assistPreSurvey, PreSurveyAssistResponse } from "@/lib/ai/preSurveyAssist";
import { revalidatePath } from "next/cache";
import { ActionResult, runAuthedAction } from "@/lib/actions/result";

function revalidatePreSurvey(campaignId: string) {
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/pre-survey`);
}

export async function saveAgencyPreSurveyAction(params: {
  campaignId: string;
  answers: Record<string, string>;
  usedAiAssist: boolean;
}): Promise<ActionResult<{ submitted_at: string }>> {
  return runAuthedAction(async () => {
    const r = await upsertPreSurveyResponse({
      campaign_id: params.campaignId,
      answers: params.answers,
      used_ai_assist: params.usedAiAssist,
    });
    revalidatePreSurvey(params.campaignId);
    return { submitted_at: r.submitted_at };
  });
}

export async function saveCampaignPreSurveyQuestionsAction(params: {
  campaignId: string;
  questions: PreSurveyQuestion[];
}): Promise<ActionResult<{ questions: PreSurveyQuestion[] }>> {
  return runAuthedAction(async () => {
    const updated = await updateCampaignPreSurveyQuestions(params.campaignId, params.questions);
    revalidatePreSurvey(params.campaignId);
    return { questions: updated.pre_survey_questions || [] };
  });
}

export async function resetCampaignPreSurveyQuestionsAction(
  campaignId: string
): Promise<ActionResult<{ success: boolean }>> {
  return runAuthedAction(async () => {
    await updateCampaignPreSurveyQuestions(campaignId, null);
    revalidatePreSurvey(campaignId);
    return { success: true };
  });
}

export async function getAiAssistAction(params: {
  campaignId: string;
  questionId: string;
  userDraft?: string;
}): Promise<ActionResult<PreSurveyAssistResponse>> {
  return runAuthedAction(async () => {
    const campaign = await getCampaignById(params.campaignId);
    if (!campaign) throw new ValidationError("캠페인이 이미 삭제되었거나 찾을 수 없습니다. 화면을 새로고침해주세요.");
    const questions = await getPreSurveyQuestionsForCampaign(params.campaignId);
    const question = questions.find((q) => q.id === params.questionId);
    if (!question) throw new ValidationError("질문을 찾을 수 없습니다. 화면을 새로고침해주세요.");

    return assistPreSurvey({
      question: question.question,
      userDraft: params.userDraft,
      context: {
        campaignName: campaign.name,
        companyName: campaign.company_name,
        campaignType: campaign.campaign_type,
      },
    });
  });
}
