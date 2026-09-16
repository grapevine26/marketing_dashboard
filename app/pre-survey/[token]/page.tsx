import { notFound } from "next/navigation";
import ClosedLinkNotice from "@/components/ClosedLinkNotice";
import { getCampaignByToken, getPreSurveyQuestionsForCampaign, getPreSurveyResponse } from "@/lib/db";
import { toPublicCampaign } from "@/lib/db/types";
import PreSurveyPublicForm from "./PreSurveyPublicForm";
import { Building2 } from "lucide-react";
import { aiQuestionKey, getThrottleCounts } from "@/lib/security/throttle";

export const revalidate = 0;

export default async function PreSurveyPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const campaign = await getCampaignByToken("pre_survey", token);
  if (!campaign) notFound();
  // 캠페인이 끝나면 공유 링크도 닫는다. 끝난 뒤에도 옛 링크가 고객사 데이터를 계속 내보내면 안 된다.
  // 다시 열어야 하면 대시보드에서 상태를 되돌리면 된다.
  if (campaign.status === "completed") return <ClosedLinkNotice what="캠페인" />;

  const [questions, response] = await Promise.all([
    getPreSurveyQuestionsForCampaign(campaign.id),
    getPreSurveyResponse(campaign.id),
  ]);

  const template = { id: 1, questions };

  // 질문마다 따로 묻던 자리다. 그 왕복이 **순차**라 질문이 8개면 8번을 줄줄이 기다렸고,
  // 로그인 없이 열리는 화면이라 그 시간이 그대로 첫 화면 지연이 됐다. 한 번에 묻는다.
  const usageCounts = await getThrottleCounts(questions.map((q) => aiQuestionKey("pre", token, q.id)));
  const initialAiUsage: Record<string, number> = {};
  for (const q of questions) {
    initialAiUsage[q.id] = usageCounts.get(aiQuestionKey("pre", token, q.id)) ?? 0;
  }

  return (
    <div className="min-h-screen bg-bg text-text py-6 sm:py-12 px-3 sm:px-6 flex flex-col items-center justify-center font-sans">
      <div className="max-w-2xl w-full space-y-5 sm:space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
            <Building2 className="w-3.5 h-3.5" />
            <span>{campaign.company_name}</span>
          </div>
          <h1 className="text-xl sm:text-3xl font-extrabold text-text tracking-tight">{campaign.name}</h1>
          <p className="text-xs sm:text-sm font-semibold text-blue-400">브랜드 캠페인 사전조사서</p>
          <p className="text-xs sm:text-sm text-text-sub max-w-md mx-auto">
            성공적인 인플루언서 시딩 캠페인 기획을 위해 브랜드 희망사항과 핵심 정보를 입력해주세요.
          </p>
        </div>

        <PreSurveyPublicForm
          token={token}
          campaign={toPublicCampaign(campaign)}
          template={template}
          initialAnswers={response?.answers || null}
          initialAiUsage={initialAiUsage}
        />
      </div>
    </div>
  );
}
