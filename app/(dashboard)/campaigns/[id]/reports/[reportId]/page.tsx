import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getReportById,
  getCampaignById,
  getPptTemplates,
  getApplicantsByCampaignId,
  getSeedingRecordsByCampaignId,
  buildReportSnapshot,
  BUILTIN_REPORT_TEMPLATE_ID,
} from "@/lib/db";
import { ReportSnapshotMetrics } from "@/lib/db/types";
import { countEmojiForPdf } from "@/lib/reports/pdf";
import CustomSectionEditor from "./CustomSectionEditor";
import ReportDownloads from "./ReportDownloads";
import ReportTitleEditor from "./ReportTitleEditor";
import { ReportLockProvider } from "./ReportLock";
import DeleteReportButton from "../DeleteReportButton";
import { ChevronLeft, ExternalLink, AlertTriangle, History } from "lucide-react";

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

/** 스냅샷과 지금 값을 견줄 지표. 라벨과 단위를 **한 자리**에 적는다(PDF 지표 박스와 같은 이유). */
const COMPARED_METRICS: { key: keyof ReportSnapshotMetrics; label: string; unit: string }[] = [
  { key: "totalApplicants", label: "총 지원자", unit: "명" },
  { key: "selectedCount", label: "최종선정", unit: "명" },
  { key: "reservedCount", label: "예비선정", unit: "명" },
  { key: "completedUploads", label: "업로드 완료", unit: "건" },
  { key: "totalViews", label: "총 조회수", unit: "회" },
  { key: "totalEngagement", label: "인게이지먼트", unit: "" },
];

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { id, reportId } = await params;
  // 지원자·시딩 기록은 "지금 값과 스냅샷이 다른가" 를 보려고 함께 읽는다. 서로 독립이라 같이 읽는다.
  const [report, campaign, reportTemplates, currentApplicants, currentSeeding] = await Promise.all([
    getReportById(reportId),
    getCampaignById(id),
    getPptTemplates("report"),
    getApplicantsByCampaignId(id),
    getSeedingRecordsByCampaignId(id),
  ]);

  if (!report || !campaign || report.campaign_id !== campaign.id) notFound();
  const templateOptions = reportTemplates.map((t) => ({ id: t.id, name: t.name, builtin: Boolean(t.builtin), placeholders: t.placeholders }));
  // 기본 내장 템플릿을 지웠을 수 있다. 그러면 남아 있는 첫 템플릿을 기본값으로 쓴다.
  const defaultTemplateId =
    templateOptions.find((t) => t.id === BUILTIN_REPORT_TEMPLATE_ID)?.id ?? templateOptions[0]?.id ?? "";

  const snapshot = report.snapshot_data;
  const metrics = snapshot?.metrics || EMPTY_METRICS;
  const selectedApplicants = (snapshot?.applicants || []).filter((a) => a.status === "selected");
  const generatedAtLabel = new Date(report.generated_at || report.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  /**
   * 지표는 **생성 시점에 고정**된다(의도된 설계다). 그런데 총평은 그 뒤로도 계속 고친다.
   * 그래서 "지표는 업로드 0건인데 총평은 12건 완료" 같은 보고서가 그대로 광고주에게 나갔다.
   * 막을 수는 없지만(스냅샷을 되살리면 보고서의 의미가 없어진다) **말해 줄 수는 있다.**
   * 지금 캠페인 값으로 같은 계산을 한 번 더 해서 달라진 항목만 알린다.
   */
  const currentMetrics = buildReportSnapshot(campaign, currentApplicants, currentSeeding).metrics;
  const drifted = snapshot
    ? COMPARED_METRICS.filter((m) => currentMetrics[m.key] !== metrics[m.key])
    : [];

  // PDF 글꼴에는 이모지 글리프가 없어 빈칸으로 나간다. 판정은 PDF 모듈 한 곳에만 둔다.
  const pdfEmojiCount =
    countEmojiForPdf(report.title) +
    (report.custom_sections || []).reduce((n, s) => n + countEmojiForPdf(s.title) + countEmojiForPdf(s.content), 0);
  const hasWrittenSections = (report.custom_sections || []).some((s) => (s.content || "").trim());

  return (
    <ReportLockProvider initialUpdatedAt={report.updated_at}>
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
          <Link
            href={`/campaigns/${campaign.id}/reports`}
            className="hover:text-accent-link transition"
          >
            <span>결과보고서 목록</span>
          </Link>
          <span>/</span>
          <span className="text-text truncate max-w-[200px]">{report.title}</span>
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
            <ReportTitleEditor reportId={report.id} campaignId={campaign.id} initialTitle={report.title} />
            <p className="text-xs text-text-sub">생성일시: {generatedAtLabel}</p>
          </div>

          <div className="flex flex-col items-end gap-2">
            {snapshot ? (
              <ReportDownloads
                reportId={report.id}
                templates={templateOptions}
                defaultTemplateId={defaultTemplateId}
                pdfEmojiCount={pdfEmojiCount}
              />
            ) : (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-warn-soft text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>구버전 보고서라 스냅샷 데이터가 없습니다. 새 보고서를 생성해주세요.</span>
              </div>
            )}
            <DeleteReportButton
              reportId={report.id}
              campaignId={campaign.id}
              title={report.title}
              hasSections={hasWrittenSections}
              redirectToList
              label="이 보고서 삭제"
            />
          </div>
        </div>

        <div className="space-y-2">
          {/* 지표 타일에도 "언제 기준인지" 를 붙인다. 아래 인플루언서 표에만 라벨이 있었다. */}
          <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <History className="w-3.5 h-3.5" />
            <span>아래 지표는 모두 <span className="font-semibold text-text-sub">{generatedAtLabel} 생성 시점 스냅샷</span>입니다. 이후 캠페인이 진행돼도 바뀌지 않습니다.</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "총 지원자", value: `${metrics.totalApplicants}명`, cls: "text-text" },
              { label: "최종선정 (예비)", value: `${metrics.selectedCount}명 (${metrics.reservedCount})`, cls: "text-text" },
              { label: "업로드 완료", value: `${metrics.completedUploads}건`, cls: "text-text" },
              { label: "총 조회수", value: `${metrics.totalViews.toLocaleString()}회`, cls: "text-text" },
              { label: "인게이지먼트 (비율)", value: `${metrics.totalEngagement.toLocaleString()} (${metrics.avgEngagementRate}%)`, cls: "text-text" },
            ].map((m) => (
              <div key={m.label} className="p-4 rounded-2xl bg-surface border border-border">
                <div className="text-xs text-text-sub">{m.label} <span className="text-text-muted">(생성 시점)</span></div>
                <div className={`text-xl font-bold mt-1 font-mono tabular-nums ${m.cls}`}>{m.value}</div>
              </div>
            ))}
          </div>

          {drifted.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-warn-soft text-xs space-y-2">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>지금 캠페인 데이터와 다릅니다.</span>
              </p>
              <ul className="space-y-0.5 font-mono tabular-nums text-[11px]">
                {drifted.map((m) => (
                  <li key={m.key}>
                    {m.label}: {metrics[m.key].toLocaleString()}{m.unit} (이 보고서) → {currentMetrics[m.key].toLocaleString()}{m.unit} (지금)
                  </li>
                ))}
              </ul>
              <p className="text-[11px] leading-relaxed">
                이 보고서의 지표는 생성 시점에 고정된 값이라 바뀌지 않습니다. 총평만 고치면 지표와 서로 다른 말을 하는
                보고서가 나갑니다. 지금 숫자로 내보내려면{" "}
                <Link href={`/campaigns/${campaign.id}/reports`} className="underline font-semibold hover:text-text">
                  새 결과보고서를 만드세요
                </Link>
                .
              </p>
            </div>
          )}
        </div>

        <CustomSectionEditor
          reportId={report.id}
          campaignId={campaign.id}
          initialSections={report.custom_sections || []}
        />

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
                          <span className="text-text-muted">-</span>
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
    </ReportLockProvider>
  );
}
