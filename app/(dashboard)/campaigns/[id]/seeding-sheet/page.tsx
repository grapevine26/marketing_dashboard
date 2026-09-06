import { notFound } from "next/navigation";
import { getCampaignById, getApplicantsByCampaignId, getSeedingRecordsByCampaignId } from "@/lib/db";
import { toPublicCampaign } from "@/lib/db/types";
import { mergeSeedingRows } from "@/lib/seeding/rows";
import { toKstDateString } from "@/lib/seeding/dday";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">시딩 관리시트</h1>
        <p className="text-sm text-slate-400">
          최종 선정된 인플루언서의 진행 단계 체크, D-day 추적, 업로드 링크 및 성과를 기록합니다.
        </p>
      </div>

      <SeedingSheetTable
        campaign={toPublicCampaign(campaign)}
        initialRecords={mergeSeedingRows(campaign.id, applicants, seedingRecords)}
        todayKst={toKstDateString()}
        isReadOnly={false}
        csvHref={`/api/seeding-sheet/export?campaignId=${campaign.id}`}
      />
    </div>
  );
}
