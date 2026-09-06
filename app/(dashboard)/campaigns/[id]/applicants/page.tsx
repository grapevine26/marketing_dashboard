import { notFound } from "next/navigation";
import { getCampaignById, getApplicantsByCampaignId, getFormConfig } from "@/lib/db";
import { toPublicCampaign } from "@/lib/db/types";
import ApplicantTable from "./ApplicantTable";
import { findDuplicates } from "@/lib/applicants/duplicates";

export const revalidate = 0;

export default async function CampaignApplicantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaignById(id);
  if (!campaign) notFound();

  const [applicants, formConfig] = await Promise.all([
    getApplicantsByCampaignId(id),
    getFormConfig(id),
  ]);
  const duplicates = Object.fromEntries(findDuplicates(applicants));

  return (
    <div className="space-y-6 font-sans">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">지원자 관리 & 선정</h1>
        <p className="text-sm text-zinc-400">
          실시간 접수된 인플루언서 지원자를 확인하고 최종선정, 예비선정, 미선정 처리를 할 수 있습니다.
        </p>
      </div>

      <ApplicantTable
        campaign={toPublicCampaign(campaign)}
        initialApplicants={applicants}
        duplicates={duplicates}
        customQuestions={formConfig?.custom_questions || []}
        mode="agency"
        csvHref={`/api/applicants/export?campaignId=${campaign.id}`}
      />
    </div>
  );
}
