import { notFound } from "next/navigation";
import { getCampaignByToken, getSeedingRecordsByCampaignId, getApplicantsByCampaignId } from "@/lib/db";
import { toPublicCampaign, sanitizeApplicantForCompany } from "@/lib/db/types";
import { mergeSeedingRows } from "@/lib/seeding/rows";
import { toKstDateString } from "@/lib/seeding/dday";
import SeedingSheetTable from "@/app/(dashboard)/campaigns/[id]/seeding-sheet/SeedingSheetTable";
import { Building2 } from "lucide-react";

export const revalidate = 0;

/** 광고주 관리시트 공유 페이지 — 조회 전용. 개인정보(연락처·주소)는 노출하지 않는다. */
export default async function PublicSeedingSheetSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const campaign = await getCampaignByToken("seeding_sheet_share", token);
  if (!campaign) notFound();

  const [records, applicants] = await Promise.all([
    getSeedingRecordsByCampaignId(campaign.id),
    getApplicantsByCampaignId(campaign.id),
  ]);
  // 조회 전용 공유 페이지: 연락처·주소는 클라이언트로 내려보내지 않는다
  const rows = mergeSeedingRows(campaign.id, applicants, records).map((r) => ({
    ...r,
    applicant: sanitizeApplicantForCompany(r.applicant),
  }));

  return (
    <div className="min-h-screen bg-bg text-text p-4 sm:p-8 max-w-6xl mx-auto space-y-5 sm:space-y-6 font-sans">
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
          <Building2 className="w-3.5 h-3.5" />
          <span>{campaign.company_name}</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-text mt-1">
          {campaign.name} - 실시간 시딩 관리시트
        </h1>
        <p className="text-xs text-text-sub">
          총 {rows.length}명 진행 중 · 배송/방문 단계, 업로드 D-day, 게시물 링크와 성과를 조회할 수 있습니다 (조회 전용).
        </p>
      </div>

      <SeedingSheetTable
        campaign={toPublicCampaign(campaign)}
        initialRecords={rows}
        todayKst={toKstDateString()}
        isReadOnly
        csvHref={`/api/seeding-sheet/export?token=${encodeURIComponent(token)}`}
      />
    </div>
  );
}
