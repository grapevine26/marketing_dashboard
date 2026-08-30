import { notFound } from "next/navigation";
import { getCampaignById, getCampaignFormConfig, getPreSurveyResponse } from "@/lib/db";
import ApplyFormEditor from "./ApplyFormEditor";

export const revalidate = 0;

export default async function ApplyFormSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaignById(id);
  if (!campaign) notFound();

  const [formConfig, preSurvey] = await Promise.all([
    getCampaignFormConfig(id),
    getPreSurveyResponse(id),
  ]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">신청폼 설정</h1>
        <p className="text-sm text-slate-400">
          인플루언서에게 노출될 모집 소개글(AI 초안 작성 지원)과 커스텀 질문을 구성하고 게시합니다.
        </p>
      </div>
      <ApplyFormEditor
        campaign={campaign}
        initialConfig={formConfig}
        preSurveyAnswers={preSurvey?.answers || {}}
      />
    </div>
  );
}