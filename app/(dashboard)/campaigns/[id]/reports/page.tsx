import { getCampaignById, getReportsByCampaignId } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import CreateReportButton from "./CreateReportButton";
import { FileSpreadsheet, ChevronLeft, ArrowRight, Download, Calendar } from "lucide-react";

export const revalidate = 0;

export default async function ReportsListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaignById(id);
  if (!campaign) notFound();

  const reports = await getReportsByCampaignId(id);

  return (
    <div className="space-y-6 max-w-5xl mx-auto font-sans">
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
        <span className="text-text">캠페인 결과보고서 관리</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
          <h1 className="text-2xl font-bold text-text tracking-tight">캠페인 결과보고서 관리</h1>
          <p className="text-sm text-text-sub">
            실시간 시딩 성과를 스냅샷으로 저장하고, 커스텀 총평을 추가하여 한글 PDF 및 PPTX로 다운로드합니다.
          </p>
        </div>

        <CreateReportButton campaignId={campaign.id} />
      </div>

      {reports.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-border rounded-2xl bg-surface space-y-3">
          <p className="text-text-sub text-xs">생성된 결과보고서가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reports.map((rep) => (
            <div
              key={rep.id}
              className="p-6 rounded-3xl bg-surface border border-border space-y-4 shadow-xl flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-text-muted font-mono">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(rep.generated_at || rep.created_at).toLocaleString()}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-semibold text-[10px]">
                    스냅샷 보존
                  </span>
                </div>
                <h2 className="text-base font-bold text-text">{rep.title}</h2>
                <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-bg border border-border text-center text-xs">
                  <div>
                    <span className="text-[10px] text-text-muted block">최종선정</span>
                    <span className="font-bold text-text">{rep.snapshot_data?.metrics?.selectedCount || 0}명</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-text-muted block">업로드완료</span>
                    <span className="font-bold text-blue-400">{rep.snapshot_data?.metrics?.completedUploads || 0}건</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-text-muted block">총 조회수</span>
                    <span className="font-bold text-emerald-400">{(rep.snapshot_data?.metrics?.totalViews || 0).toLocaleString()}회</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-between gap-2">
                <Link
                  href={`/campaigns/${campaign.id}/reports/${rep.id}`}
                  className="text-xs text-blue-400 hover:underline font-semibold flex items-center gap-1"
                >
                  <span>총평 편집 & 열기</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                <div className="flex items-center gap-2">
                  <a
                    href={`/api/reports/${rep.id}/pdf`}
                    target="_blank"
                    className="px-3 py-1.5 rounded-lg bg-surface2 hover:bg-surface3 text-text text-xs font-semibold inline-flex items-center gap-1 transition"
                  >
                    <Download className="w-3 h-3 text-red-400" />
                    <span>PDF</span>
                  </a>
                  <a
                    href={`/api/reports/${rep.id}/pptx`}
                    target="_blank"
                    className="px-3 py-1.5 rounded-lg bg-surface2 hover:bg-surface3 text-text text-xs font-semibold inline-flex items-center gap-1 transition"
                  >
                    <Download className="w-3 h-3 text-orange-400" />
                    <span>PPTX</span>
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}