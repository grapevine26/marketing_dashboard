import { notFound } from "next/navigation";
import { getCampaignByToken, getCampaignFormConfig } from "@/lib/db";
import { toPublicCampaign } from "@/lib/db/types";
import ApplyPublicForm from "./ApplyPublicForm";
import { Building2 } from "lucide-react";

export const revalidate = 0;

export default async function PublicApplyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const campaign = await getCampaignByToken("apply_form", token);
  if (!campaign) notFound();

  const formConfig = await getCampaignFormConfig(campaign.id);

  if (formConfig && !formConfig.is_published) {
    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center p-4 font-sans">
        <div className="max-w-md p-8 rounded-3xl bg-surface border border-border text-center space-y-3 shadow-2xl">
          <h1 className="text-lg font-bold text-text">현재 모집이 마감되었습니다.</h1>
          <p className="text-xs text-text-sub">{campaign.name} 캠페인 지원 접수가 일시 마감되었습니다.</p>
        </div>
      </div>
    );
  }

  // 공개 페이지에는 토큰이 포함되지 않은 최소 정보만 내려보낸다.
  const publicCampaign = toPublicCampaign(campaign);

  return (
    <div className="min-h-screen bg-bg text-text py-12 px-4 sm:px-6 flex flex-col items-center justify-center font-sans">
      <div className="max-w-xl w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
            <Building2 className="w-3.5 h-3.5" />
            <span>{campaign.company_name}</span>
          </div>
          <h1 className="text-2xl font-extrabold text-text">{campaign.name} 인플루언서 지원폼</h1>
        </div>

        {formConfig?.intro_text && (
          <div className="p-6 rounded-3xl bg-surface border border-border text-xs text-text-2 whitespace-pre-wrap leading-relaxed shadow-xl">
            {formConfig.intro_text}
          </div>
        )}

        <ApplyPublicForm
          token={token}
          campaign={publicCampaign}
          customQuestions={formConfig?.custom_questions || []}
        />
      </div>
    </div>
  );
}
