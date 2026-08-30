import { notFound } from "next/navigation";
import { getCampaignByToken, getPreSurveyTemplate, getPreSurveyResponse } from "@/lib/db";
import PreSurveyPublicForm from "./PreSurveyPublicForm";
import { FileQuestion, Building2 } from "lucide-react";

export const revalidate = 0;

export default async function PreSurveyPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const campaign = await getCampaignByToken("pre_survey", token);
  if (!campaign) notFound();

  const [template, response] = await Promise.all([
    getPreSurveyTemplate(),
    getPreSurveyResponse(campaign.id),
  ]);

  return (
    <div className="min-h-screen bg-[#090A0C] text-zinc-100 py-12 px-4 sm:px-6 flex flex-col items-center justify-center font-sans">
      <div className="max-w-2xl w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
            <Building2 className="w-3.5 h-3.5" />
            <span>{campaign.company_name}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-100">
            {campaign.name} - 사전조사서
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            성공적인 인플루언서 시딩 캠페인 기획을 위해 브랜드 정보를 입력해주세요.
          </p>
        </div>

        <PreSurveyPublicForm
          campaign={campaign}
          template={template}
          initialResponse={response}
        />
      </div>
    </div>
  );
}