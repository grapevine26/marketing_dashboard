import { notFound } from "next/navigation";
import { getCampaignById, getPreSurveyTemplate, getPreSurveyResponse } from "@/lib/db";
import CampaignPreSurveyClient from "./CampaignPreSurveyClient";

export const revalidate = 0;

export default async function CampaignPreSurveyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaignById(id);
  if (!campaign) notFound();

  const [globalTemplate, response] = await Promise.all([
    getPreSurveyTemplate(),
    getPreSurveyResponse(id),
  ]);

  const isCustom = Boolean(campaign.pre_survey_questions && campaign.pre_survey_questions.length > 0);
  const resolvedQuestions = isCustom
    ? campaign.pre_survey_questions!
    : globalTemplate.questions;

  return (
    <CampaignPreSurveyClient
      campaign={campaign}
      resolvedQuestions={resolvedQuestions}
      isCustom={isCustom}
      defaultTemplateQuestions={globalTemplate.questions}
      initialResponse={response}
    />
  );
}