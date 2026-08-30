import { notFound } from "next/navigation";
import { getCampaignById, getApplicantsByCampaignId } from "@/lib/db";
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

  const applicants = await getApplicantsByCampaignId(id);
  const duplicatesMap = findDuplicates(applicants);
  const duplicatesObj = Object.fromEntries(duplicatesMap);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">지원자 관리 & 선정</h1>
        <p className="text-sm text-slate-400">
          실시간 접수된 인플루언서 지원자를 확인하고 최종선정 및 예비선정을 진행합니다.
        </p>
      </div>

      <ApplicantTable
        campaign={campaign}
        initialApplicants={applicants}
        duplicatesObj={duplicatesObj}
        isPublicShare={false}
      />
    </div>
  );
}