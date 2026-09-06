import { notFound } from "next/navigation";
import Link from "next/link";
import { getReportById, getCampaignById, getPptTemplates, BUILTIN_REPORT_TEMPLATE_ID } from "@/lib/db";
import { ReportSnapshotMetrics } from "@/lib/db/types";
import CustomSectionEditor from "./CustomSectionEditor";
import ReportDownloads from "./ReportDownloads";
import { ArrowLeft, ExternalLink, AlertTriangle } from "lucide-react";

export const revalidate = 0;

const EMPTY_METRICS: ReportSnapshotMetrics = {
  totalApplicants: 0,
  selectedCount: 0,
  reservedCount: 0,
  completedUploads: 0,
  totalViews: 0,
  totalEngagement: 0,
  avgEngagementRate: 0,
};

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { id, reportId } = await params;
  const [report, campaign, reportTemplates] = await Promise.all([
    getReportById(reportId),
    getCampaignById(id),
    getPptTemplates("report"),
  ]);

  if (!report || !campaign || report.campaign_id !== campaign.id) notFound();
  const templateOptions = reportTemplates.map((t) => ({ id: t.id, name: t.name, builtin: Boolean(t.builtin), placeholders: t.placeholders }));

  const snapshot = report.snapshot_data;
  const metrics = snapshot?.metrics || EMPTY_METRICS;
  const selectedApplicants = (snapshot?.applicants || []).filter((a) => a.status === "selected");

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link href={`/campaigns/${campaign.id}/reports`} className="text-xs text-text-sub hover:text-text inline-flex items-center gap-1 mb-1 transition">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>보고서 목록으로 돌아가기</span>
          </Link>
          <h1 className="text-2xl font-bold text-text tracking-tight">{report.title}</h1>
          <p className="text-xs text-text-sub">
            생성일시: {new Date(report.generated_at || report.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
          </p>
        </div>

        {snapshot ? (
          <ReportDownloads reportId={report.id} templates={templateOptions} defaultTemplateId={BUILTIN_REPORT_TEMPLATE_ID} />
        ) : (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>구버전 보고서라 스냅샷 데이터가 없습니다. 새 보고서를 생성해주세요.</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "총 지원자", value: `${metrics.totalApplicants}명`, cls: "text-text" },
          { label: "최종선정 (예비)", value: `${metrics.selectedCount}명 (${metrics.reservedCount})`, cls: "text-emerald-400" },
          { label: "업로드 완료", value: `${metrics.completedUploads}건`, cls: "text-purple-400" },
          { label: "총 조회수", value: `${metrics.totalViews.toLocaleString()}회`, cls: "text-blue-400" },
          { label: "인게이지먼트 (비율)", value: `${metrics.totalEngagement.toLocaleString()} (${metrics.avgEngagementRate}%)`, cls: "text-amber-400" },
        ].map((m) => (
          <div key={m.label} className="p-4 rounded-2xl bg-surface border border-border">
            <div className="text-xs text-text-sub">{m.label}</div>
            <div className={`text-xl font-bold mt-1 font-mono tabular-nums ${m.cls}`}>{m.value}</div>
          </div>
        ))}
      </div>

      <CustomSectionEditor reportId={report.id} campaignId={campaign.id} initialSections={report.custom_sections || []} />

      <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
        <h2 className="text-base font-bold text-text">참여 인플루언서 성과 목록 (생성 시점 스냅샷)</h2>

        <div className="rounded-xl border border-border overflow-hidden overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-bg text-text-sub border-b border-border">
              <tr>
                <th className="p-3">인플루언서</th>
                <th className="p-3">SNS 채널</th>
                <th className="p-3">진행 단계</th>
                <th className="p-3">업로드 링크</th>
                <th className="p-3">조회수</th>
                <th className="p-3">인게이지먼트</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-text-2">
              {selectedApplicants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-text-muted">선정된 인플루언서가 없습니다.</td>
                </tr>
              ) : (
                selectedApplicants.map((app) => (
                  <tr key={app.id} className="hover:bg-surface2">
                    <td className="p-3 font-semibold text-text">{app.name}</td>
                    <td className="p-3">
                      <a href={app.sns_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-[140px]">
                        <span>{app.sns_link}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[11px] font-medium">{app.seeding?.progress_stage || "선정완료"}</span>
                    </td>
                    <td className="p-3">
                      {app.seeding?.upload_link ? (
                        <a href={app.seeding.upload_link} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline inline-flex items-center gap-1">
                          <span>콘텐츠 확인</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-text-faint">-</span>
                      )}
                    </td>
                    <td className="p-3 font-mono tabular-nums">{(app.seeding?.views || 0).toLocaleString()}회</td>
                    <td className="p-3 font-mono tabular-nums">{(app.seeding?.engagement || 0).toLocaleString()}</td>
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
