import { notFound } from "next/navigation";
import { getCampaignByToken, getApplicantsByCampaignId } from "@/lib/db";
import ApplicantTable from "@/app/(dashboard)/campaigns/[id]/applicants/ApplicantTable";
import { findDuplicates } from "@/lib/applicants/duplicates";
import { Building2, Users } from "lucide-react";

export const revalidate = 0;

export default async function PublicApplicantsSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const campaign = await getCampaignByToken("applicants_share", token);
  if (!campaign) notFound();

  const applicants = await getApplicantsByCampaignId(campaign.id);
  const duplicatesMap = findDuplicates(applicants);
  const duplicatesObj = Object.fromEntries(duplicatesMap);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              <Building2 className="w-3.5 h-3.5" />
              <span>{campaign.company_name} • 지원자 선정 공유</span>
            </div>
            <h1 className="text-2xl font-extrabold text-white mt-2">
              {campaign.name} 지원자 리스트
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              실시간 지원자 현황을 검토하고 [최종선정] 또는 [예비선정] 버튼을 클릭해 선정할 수 있습니다.
            </p>
          </div>
        </div>

        <ApplicantTable
          campaign={campaign}
          initialApplicants={applicants}
          duplicatesObj={duplicatesObj}
          isPublicShare={true}
        />
      </div>
    </div>
  );
}