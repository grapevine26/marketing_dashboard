import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
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
        <span className="text-text">지원자 관리 & 선정</span>
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
        <h1 className="text-2xl font-bold text-text tracking-tight">지원자 관리 & 선정</h1>
        <p className="text-sm text-text-sub">
          실시간 접수된 인플루언서 지원자를 확인하고 최종선정, 예비선정, 미선정 처리를 할 수 있습니다.
        </p>
      </div>

      <ApplicantTable
        campaign={toPublicCampaign(campaign)}
        messageTemplates={campaign.message_templates}
        initialApplicants={applicants}
        duplicates={duplicates}
        customQuestions={formConfig?.custom_questions || []}
        mode="agency"
        csvHref={`/api/applicants/export?campaignId=${campaign.id}`}
      />
    </div>
  );
}
