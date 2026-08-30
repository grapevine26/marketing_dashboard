import { notFound } from "next/navigation";
import {
  getCampaignByToken,
  getApplicantsByCampaignId,
  getSeedingRecordsByCampaignId,
} from "@/lib/db";
import SeedingSheetTable from "@/app/(dashboard)/campaigns/[id]/seeding-sheet/SeedingSheetTable";
import { Building2, TableProperties } from "lucide-react";

export const revalidate = 0;

export default async function PublicSeedingSheetSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const campaign = await getCampaignByToken("seeding_sheet_share", token);
  if (!campaign) notFound();

  const [applicants, seedingRecords] = await Promise.all([
    getApplicantsByCampaignId(campaign.id),
    getSeedingRecordsByCampaignId(campaign.id),
  ]);

  const selectedApplicants = applicants.filter((a) => a.status === "selected");
  const mergedRecords = selectedApplicants.map((app) => {
    const seeding = seedingRecords.find((s) => s.applicant_id === app.id) || {
      id: `temp_${app.id}`,
      campaign_id: campaign.id,
      applicant_id: app.id,
      progress_stage: "선정완료" as const,
      upload_deadline: null,
      upload_link: null,
      views: 0,
      engagement: 0,
      notes: null,
      updated_at: new Date().toISOString(),
    };
    return { applicant: app, seeding };
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold">
            <Building2 className="w-3.5 h-3.5" />
            <span>{campaign.company_name} • 시딩 진행현황 관리시트 (조회 전용)</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white mt-2">
            {campaign.name} 시딩 관리 현황
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            실시간 진행 단계, 업로드 일정 및 성과 지표(조회수, 반응 수치)를 확인할 수 있습니다.
          </p>
        </div>

        <SeedingSheetTable
          campaign={campaign}
          initialRecords={mergedRecords}
          isReadOnly={true}
        />
      </div>
    </div>
  );
}