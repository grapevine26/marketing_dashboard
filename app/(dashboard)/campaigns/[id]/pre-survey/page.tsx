import { notFound } from "next/navigation";
import { getCampaignById, getPreSurveyTemplate, getPreSurveyResponse } from "@/lib/db";
import PreSurveyAgencyView from "./PreSurveyAgencyView";

export const revalidate = 0;

export default async function CampaignPreSurveyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaignById(id);
  if (!campaign) notFound();

  const [template, response] = await Promise.all([
    getPreSurveyTemplate(),
    getPreSurveyResponse(id),
  ]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">사전조사 관리 (에이전시 작성/조회)</h1>
        <p className="text-sm text-slate-400">
          광고주가 제출한 답변을 확인하거나, 에이전시 담당자가 직접 대신 입력할 수 있습니다.
        </p>
      </div>
      <PreSurveyAgencyView
        campaign={campaign}
        template={template}
        initialResponse={response}
      />
    </div>
  );
}