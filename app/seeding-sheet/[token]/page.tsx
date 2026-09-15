import { notFound } from "next/navigation";
import ClosedLinkNotice from "@/components/ClosedLinkNotice";
import { getCampaignByToken, getSeedingRecordsByCampaignId, getApplicantsByCampaignId, getFormConfig } from "@/lib/db";
import { toPublicCampaign, sanitizeApplicantForCompany, sanitizeSeedingForCompany } from "@/lib/db/types";
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
  // 캠페인이 끝나면 공유 링크도 닫는다. 끝난 뒤에도 옛 링크가 고객사 데이터를 계속 내보내면 안 된다.
  // 다시 열어야 하면 대시보드에서 상태를 되돌리면 된다.
  if (campaign.status === "completed") return <ClosedLinkNotice what="캠페인" />;

  const [records, applicants, formConfig] = await Promise.all([
    getSeedingRecordsByCampaignId(campaign.id),
    getApplicantsByCampaignId(campaign.id),
    getFormConfig(campaign.id),
  ]);
  // 조회 전용 공유 페이지: 연락처·주소·내부 비고는 클라이언트로 내려보내지 않는다.
  // 지원자와 시딩 기록 **양쪽** 을 씻는다. 배송지는 두 곳에 따로 들어 있다.
  //
  // 이 화면은 커스텀 답변을 아예 그리지 않지만, 그래도 현재 질문 목록을 넘긴다.
  // 안 그리는 값이라도 서버가 내려보내면 페이지 소스에 실리기 때문이다.
  const allowedQuestionIds = (formConfig?.custom_questions || []).map((q) => q.id);
  const rows = mergeSeedingRows(campaign.id, applicants, records).map((r) => ({
    ...r,
    applicant: sanitizeApplicantForCompany(r.applicant, allowedQuestionIds),
    seeding: sanitizeSeedingForCompany(r.seeding),
  }));

  return (
    <div className="min-h-screen bg-bg text-text p-4 sm:p-8 max-w-6xl mx-auto space-y-5 sm:space-y-6 font-sans">
      <div className="space-y-1">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
          <Building2 className="w-3.5 h-3.5" />
          <span>{campaign.company_name}</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-text tracking-tight mt-1">
          {campaign.name}
        </h1>
        <p className="text-sm font-semibold text-blue-400">실시간 시딩 진행 관리시트</p>
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
