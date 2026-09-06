import { notFound } from "next/navigation";
import { getCampaignByToken, getApplicantsByCampaignId, getFormConfig } from "@/lib/db";
import { toPublicCampaign, sanitizeApplicantForCompany } from "@/lib/db/types";
import { findDuplicates } from "@/lib/applicants/duplicates";
import ApplicantTable from "@/app/(dashboard)/campaigns/[id]/applicants/ApplicantTable";
import { Building2 } from "lucide-react";

export const revalidate = 0;

/**
 * 광고주 지원자 공유 페이지. 로그인 없이 토큰으로 접근하며,
 * 스펙상 쓰기(최종선정/예비선정)를 허용하는 유일한 공개 라우트다.
 * 연락처·주소 같은 개인정보는 노출하지 않는다.
 */
export default async function PublicApplicantsSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const campaign = await getCampaignByToken("applicants_share", token);
  if (!campaign) notFound();

  const [allApplicants, formConfig] = await Promise.all([
    getApplicantsByCampaignId(campaign.id),
    getFormConfig(campaign.id),
  ]);
  const selectedCount = allApplicants.filter((a) => a.status === "selected").length;
  const reservedCount = allApplicants.filter((a) => a.status === "reserved").length;
  // 중복 감지는 원본으로 계산하고, 클라이언트로 내려보내는 객체에서는 개인정보 필드를 제거한다
  const duplicates = Object.fromEntries(findDuplicates(allApplicants));
  const applicants = allApplicants.map(sanitizeApplicantForCompany);

  return (
    <div className="min-h-screen bg-bg text-text p-4 sm:p-8 max-w-6xl mx-auto space-y-5 sm:space-y-6 font-sans">
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
          <Building2 className="w-3.5 h-3.5" />
          <span>{campaign.company_name}</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-text mt-1">
          {campaign.name} - 인플루언서 지원 현황 및 선정
        </h1>
        <p className="text-xs text-text-sub">
          총 {applicants.length}명 접수 / 최종선정 {selectedCount}명 / 예비 {reservedCount}명 · 최종선정/예비선정 버튼을 누르면 에이전시 화면에 즉시 반영됩니다.
        </p>
      </div>

      <ApplicantTable
        campaign={toPublicCampaign(campaign)}
        initialApplicants={applicants}
        duplicates={duplicates}
        customQuestions={formConfig?.custom_questions || []}
        mode="company"
        shareToken={token}
        csvHref={`/api/applicants/export?token=${encodeURIComponent(token)}`}
      />
    </div>
  );
}
