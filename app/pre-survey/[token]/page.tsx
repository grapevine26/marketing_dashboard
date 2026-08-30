import { notFound } from "next/navigation";
import { getCampaignByToken, getPreSurveyTemplate, getPreSurveyResponse } from "@/lib/db";
import PreSurveyPublicForm from "./PreSurveyPublicForm";
import { Building2, Sparkles } from "lucide-react";

export const revalidate = 0;

export default async function PublicPreSurveyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const campaign = await getCampaignByToken("pre_survey", token);
  if (!campaign) notFound();

  const [template, existingResponse] = await Promise.all([
    getPreSurveyTemplate(),
    getPreSurveyResponse(campaign.id),
  ]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
            <Building2 className="w-3.5 h-3.5" />
            <span>{campaign.company_name} • 사전 요구사항 조사</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            {campaign.name}
          </h1>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            성공적인 인플루언서 시딩 캠페인 진행을 위해 브랜드의 핵심 특장점 및 타겟 정보를 작성해주세요.
          </p>
        </div>

        <PreSurveyPublicForm
          campaign={campaign}
          template={template}
          initialResponse={existingResponse}
        />
      </div>
    </div>
  );
}