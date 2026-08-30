import { getCampaignById, getReportsByCampaignId } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import CreateReportButton from "./CreateReportButton";
import { FileSpreadsheet, ArrowLeft, ArrowRight, Download, Calendar } from "lucide-react";

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={`/campaigns/${campaign.id}`}
            className="text-xs text-zinc-400 hover:text-white inline-flex items-center gap-1 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>캠페인 허브로 돌아가기</span>
          </Link>
          <h1 className="text-xl font-bold text-zinc-100">5. 캠페인 결과보고서 관리</h1>
          <p className="text-xs text-zinc-400">
            실시간 시딩 성과를 스냅샷으로 저장하고, 커스텀 총평을 추가하여 한글 PDF 및 PPTX로 다운로드합니다.
          </p>
        </div>

        <CreateReportButton campaignId={campaign.id} />
      </div>

      {reports.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-[#22242A] rounded-2xl bg-[#131418] space-y-3">
          <p className="text-zinc-400 text-xs">생성된 결과보고서가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reports.map((rep) => (
            <div
              key={rep.id}
              className="p-6 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 shadow-xl flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-500 font-mono">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(rep.generated_at).toLocaleString()}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-semibold text-[10px]">
                    스냅샷 보존
                  </span>
                </div>
                <h2 className="text-base font-bold text-zinc-100">{rep.title}</h2>
                <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-[#090A0C] border border-[#22242A] text-center text-xs">
                  <div>
                    <span className="text-[10px] text-zinc-500 block">최종선정</span>
                    <span className="font-bold text-zinc-200">{rep.snapshot_data.metrics.selectedCount}명</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block">업로드완료</span>
                    <span className="font-bold text-blue-400">{rep.snapshot_data.metrics.completedUploads}건</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block">총 조회수</span>
                    <span className="font-bold text-emerald-400">{rep.snapshot_data.metrics.totalViews.toLocaleString()}회</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#22242A] flex items-center justify-between gap-2">
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
                    className="px-3 py-1.5 rounded-lg bg-[#181A20] hover:bg-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1 transition"
                  >
                    <Download className="w-3 h-3 text-red-400" />
                    <span>PDF</span>
                  </a>
                  <a
                    href={`/api/reports/${rep.id}/pptx`}
                    target="_blank"
                    className="px-3 py-1.5 rounded-lg bg-[#181A20] hover:bg-[#22242A] text-zinc-200 text-xs font-semibold inline-flex items-center gap-1 transition"
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