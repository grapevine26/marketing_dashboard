import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
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
    <div className="space-y-6 font-sans">
      {/* 상단 브레드크럼 네비게이션 */}
      <div className="flex items-center gap-2 text-xs text-text-sub">
        <Link
          href={`/campaigns/${campaign.id}`}
          className="hover:text-accent-link flex items-center gap-1 transition"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>{campaign.name} 허브</span>
        </Link>
        <span>/</span>
        <span className="text-text">시딩 관리시트</span>
      </div>

      <div className="space-y-1">
        {/* 상단 소속 캠페인 안내 라벨 */}
        <div className="flex items-center gap-2 text-xs text-text-sub">
          <span className="px-2 py-0.5 rounded-md bg-surface2 border border-border font-medium text-text-2">
            {campaign.company_name}
          </span>
          <span className="font-semibold text-accent-link">
            {campaign.name}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-text tracking-tight">시딩 관리시트</h1>
        <p className="text-sm text-text-sub">
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
