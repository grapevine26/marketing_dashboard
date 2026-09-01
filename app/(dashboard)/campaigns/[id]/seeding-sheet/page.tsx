import { notFound } from "next/navigation";
import {
  getCampaignById,
  getApplicantsByCampaignId,
  getSeedingRecordsByCampaignId,
} from "@/lib/db";
import SeedingSheetTable from "./SeedingSheetTable";

export const revalidate = 0;

export default async function CampaignSeedingSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaignById(id);
  if (!campaign) notFound();

  const [applicants, seedingRecords] = await Promise.all([
    getApplicantsByCampaignId(id),
    getSeedingRecordsByCampaignId(id),
  ]);

  const selectedApplicants = applicants.filter((a) => a.status === "selected");
  const mergedRecords = selectedApplicants.map((app) => {
    const seeding = seedingRecords.find((s) => s.applicant_id === app.id) || {
      id: `temp_${app.id}`,
      campaign_id: id,
      applicant_id: app.id,
      progress_stage: "선정완료" as const,
      upload_deadline: null,
      upload_link: null,
      views: 0,
      engagement: 0,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return { applicant: app, seeding };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">시딩 관리시트</h1>
        <p className="text-sm text-slate-400">
          최종 선정된 인플루언서의 진행 단계 체크, D-day 추적, 업로드 링크 및 성과를 기록합니다.
        </p>
      </div>

      <SeedingSheetTable
        campaign={campaign}
        initialRecords={mergedRecords}
        isReadOnly={false}
      />
    </div>
  );
}