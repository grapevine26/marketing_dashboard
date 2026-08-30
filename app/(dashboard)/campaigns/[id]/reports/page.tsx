import { notFound } from "next/navigation";
import Link from "next/link";
import { getCampaignById, getReportsByCampaignId } from "@/lib/db";
import { Plus, FileText, ArrowRight, Calendar, Download } from "lucide-react";
import CreateReportButton from "./CreateReportButton";

export const revalidate = 0;

export default async function CampaignReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaignById(id);
  if (!campaign) notFound();

  const reports = await getReportsByCampaignId(id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">결과보고서 관리</h1>
          <p className="text-sm text-slate-400">
            시딩 관리시트의 데이터를 스냅샷으로 캡처하여 PDF 및 파워포인트(PPTX) 보고서를 생성합니다.
          </p>
        </div>
        <CreateReportButton campaignId={campaign.id} />
      </div>

      {reports.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30 space-y-3">
          <p className="text-slate-400">생성된 결과보고서가 없습니다.</p>
          <p className="text-xs text-slate-500">
            [결과보고서 생성하기] 버튼을 누르면 현재 시딩 현황을 바탕으로 스냅샷 보고서가 즉시 생성됩니다.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reports.map((rep) => (
            <div
              key={rep.id}
              className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-purple-400 font-semibold px-2.5 py-0.5 rounded-full bg-purple-500/10">
                    스냅샷 보고서
                  </span>
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(rep.generated_at).toLocaleString("ko-KR")}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white">{rep.title}</h3>
                <div className="flex flex-wrap gap-3 text-xs text-slate-400 pt-1">
                  <span>선정: {rep.snapshot_data.metrics.selectedCount}명</span>
                  <span>업로드완료: {rep.snapshot_data.metrics.completedUploads}건</span>
                  <span>
                    총 조회수: {rep.snapshot_data.metrics.totalViews.toLocaleString()}회
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <a
                    href={`/api/reports/${rep.id}/pdf`}
                    download
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium inline-flex items-center gap-1 transition"
                  >
                    <Download className="w-3 h-3 text-red-400" />
                    <span>PDF</span>
                  </a>
                  <a
                    href={`/api/reports/${rep.id}/pptx`}
                    download
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium inline-flex items-center gap-1 transition"
                  >
                    <Download className="w-3 h-3 text-orange-400" />
                    <span>PPTX</span>
                  </a>
                </div>

                <Link
                  href={`/campaigns/${campaign.id}/reports/${rep.id}`}
                  className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1 font-semibold"
                >
                  <span>상세 보기 및 편집</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}