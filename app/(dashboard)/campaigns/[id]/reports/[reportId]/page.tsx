import { notFound } from "next/navigation";
import Link from "next/link";
import { getReportById, getCampaignById } from "@/lib/db";
import CustomSectionEditor from "./CustomSectionEditor";
import {
  Download,
  Calendar,
  Building2,
  Users,
  Eye,
  ThumbsUp,
  FileText,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";

export const revalidate = 0;

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { id, reportId } = await params;
  const [report, campaign] = await Promise.all([
    getReportById(reportId),
    getCampaignById(id),
  ]);

  if (!report || !campaign) notFound();

  const { snapshot_data } = report;
  const { metrics, applicants } = snapshot_data;
  const selectedApplicants = applicants.filter((a) => a.status === "selected");

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={`/campaigns/${campaign.id}/reports`}
            className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 mb-1 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>보고서 목록으로 돌아가기</span>
          </Link>
          <h1 className="text-2xl font-bold text-white tracking-tight">{report.title}</h1>
          <p className="text-xs text-slate-400">
            생성일시: {new Date(report.generated_at).toLocaleString("ko-KR")}
          </p>
        </div>

        {/* Download buttons */}
        <div className="flex items-center gap-2">
          <a
            href={`/api/reports/${report.id}/pdf`}
            download
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-md transition"
          >
            <Download className="w-4 h-4" />
            <span>PDF 보고서 다운로드</span>
          </a>
          <a
            href={`/api/reports/${report.id}/pptx`}
            download
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold shadow-md transition"
          >
            <Download className="w-4 h-4" />
            <span>PPTX 슬라이드 다운로드</span>
          </a>
        </div>
      </div>

      {/* Metrics Snapshot Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400">총 지원자</div>
          <div className="text-xl font-bold text-white mt-1">{metrics.totalApplicants}명</div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400">최종선정</div>
          <div className="text-xl font-bold text-emerald-400 mt-1">{metrics.selectedCount}명</div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400">업로드 완료</div>
          <div className="text-xl font-bold text-purple-400 mt-1">{metrics.completedUploads}건</div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400">총 조회수</div>
          <div className="text-xl font-bold text-blue-400 mt-1">
            {metrics.totalViews.toLocaleString()}회
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400">인게이지먼트</div>
          <div className="text-xl font-bold text-amber-400 mt-1">
            {metrics.totalEngagement.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Custom Sections Editor */}
      <CustomSectionEditor
        reportId={report.id}
        campaignId={campaign.id}
        initialSections={report.custom_sections || []}
      />

      {/* Influencer Snapshot Table */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <h2 className="text-base font-bold text-white">참여 인플루언서 성과 목록</h2>

        <div className="rounded-xl border border-slate-800 overflow-hidden overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-3">인플루언서</th>
                <th className="p-3">SNS 채널</th>
                <th className="p-3">진행 단계</th>
                <th className="p-3">업로드 링크</th>
                <th className="p-3">조회수</th>
                <th className="p-3">인게이지먼트</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {selectedApplicants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500">
                    선정된 인플루언서가 없습니다.
                  </td>
                </tr>
              ) : (
                selectedApplicants.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-800/30">
                    <td className="p-3 font-semibold text-white">{app.name}</td>
                    <td className="p-3">
                      <a
                        href={app.sns_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[140px]"
                      >
                        <span>{app.sns_link}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[11px] font-medium">
                        {app.seeding?.progress_stage || "선정완료"}
                      </span>
                    </td>
                    <td className="p-3">
                      {app.seeding?.upload_link ? (
                        <a
                          href={app.seeding.upload_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-400 hover:underline inline-flex items-center gap-1"
                        >
                          <span>콘텐츠 확인</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="p-3 font-mono">
                      {(app.seeding?.views || 0).toLocaleString()}회
                    </td>
                    <td className="p-3 font-mono">
                      {(app.seeding?.engagement || 0).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}