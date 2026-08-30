import { notFound } from "next/navigation";
import { getCampaignByToken, getCampaignFormConfig } from "@/lib/db";
import ApplyPublicForm from "./ApplyPublicForm";
import { Sparkles, Building2, Truck, MapPin } from "lucide-react";

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
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-3">
          <h1 className="text-xl font-bold text-white">모집이 마감되었거나 준비 중입니다.</h1>
          <p className="text-sm text-slate-400">
            현재 해당 캠페인은 신청 접수를 받고 있지 않습니다. 에이전시에 문의해주세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
            <span>{campaign.company_name} • 인플루언서 모집</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            {campaign.name}
          </h1>
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
            {campaign.campaign_type === "shipping" ? (
              <span className="inline-flex items-center gap-1 text-amber-400">
                <Truck className="w-3.5 h-3.5" /> 제품배송형 체험단
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-purple-400">
                <MapPin className="w-3.5 h-3.5" /> 현장방문형 체험단
              </span>
            )}
          </div>
        </div>

        {formConfig?.intro_text && (
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
            {formConfig.intro_text}
          </div>
        )}

        <ApplyPublicForm
          campaign={campaign}
          customQuestions={formConfig?.custom_questions || []}
        />
      </div>
    </div>
  );
}