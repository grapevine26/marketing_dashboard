import { Report, ReportSnapshot, CAMPAIGN_STATUS_LABELS } from "@/lib/db/types";
import { ValidationError } from "@/lib/db";
import { fillTemplate, TableSpec, ChartSpec, TABLE_PREFIX, CHART_PREFIX } from "@/lib/ppt/engine";

/** 보고서 템플릿에서 쓸 수 있는 텍스트 치환 항목 */
export function buildReportValues(report: Report, snapshot: ReportSnapshot): Record<string, string> {
  const { campaign, metrics } = snapshot;
  const sections = (report.custom_sections || [])
    .map((s) => (s.title ? `■ ${s.title}\n${s.content || ""}` : s.content || ""))
    .filter(Boolean)
    .join("\n\n");
  return {
    보고서제목: report.title,
    캠페인명: campaign.name,
    브랜드명: campaign.company_name,
    캠페인유형: campaign.campaign_type === "shipping" ? "제품배송형" : "현장방문형",
    캠페인상태: CAMPAIGN_STATUS_LABELS[campaign.status] ?? campaign.status,
    생성일시: new Date(report.generated_at || report.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }),
    총지원자: String(metrics.totalApplicants),
    최종선정: String(metrics.selectedCount),
    예비선정: String(metrics.reservedCount),
    업로드완료: String(metrics.completedUploads),
    총조회수: metrics.totalViews.toLocaleString(),
    총인게이지먼트: metrics.totalEngagement.toLocaleString(),
    인게이지먼트율: String(metrics.avgEngagementRate),
    총평: sections || "-",
  };
}

/** `{{표:인플루언서}}` 에 들어갈 표 */
export function buildInfluencerTable(snapshot: ReportSnapshot): TableSpec {
  const selected = snapshot.applicants.filter((a) => a.status === "selected");
  return {
    headers: ["이름", "SNS 계정", "진행 단계", "업로드 링크", "조회수", "인게이지먼트"],
    colWeights: [1.6, 3.2, 1.6, 3.0, 1.2, 1.4],
    rows: selected.map((inf) => [
      inf.name,
      inf.sns_link,
      inf.seeding?.progress_stage || "선정완료",
      inf.seeding?.upload_link || "-",
      `${(inf.seeding?.views || 0).toLocaleString()}회`,
      (inf.seeding?.engagement || 0).toLocaleString(),
    ]),
    overflowLabel: (hidden) => `외 ${hidden}명 (전체 목록은 관리시트 CSV 참고)`,
  };
}

/** `{{차트:성과}}` 에 들어갈 막대 차트 — 조회수 상위 10명 */
export function buildPerformanceChart(snapshot: ReportSnapshot): ChartSpec {
  const selected = snapshot.applicants
    .filter((a) => a.status === "selected")
    .map((a) => ({ name: a.name, views: a.seeding?.views || 0, engagement: a.seeding?.engagement || 0 }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);
  return {
    type: "bar",
    categories: selected.map((s) => s.name),
    series: [
      { name: "조회수", values: selected.map((s) => s.views) },
      { name: "인게이지먼트", values: selected.map((s) => s.engagement) },
    ],
    colors: ["2563EB", "F59E0B"],
  };
}

/**
 * 결과보고서 PPTX. 템플릿(내장 또는 업로드)의 `{{...}}`를 채우고
 * `{{표:인플루언서}}` / `{{차트:성과}}` 자리에 표와 네이티브 차트를 넣는다.
 */
export async function generateReportPPTX(report: Report, templateBuffer: Buffer): Promise<Buffer> {
  const snapshot = report.snapshot_data;
  if (!snapshot) {
    throw new ValidationError("이 보고서에는 스냅샷 데이터가 없습니다. 새 보고서를 생성해주세요.");
  }
  return fillTemplate(templateBuffer, buildReportValues(report, snapshot), {
    tables: { [`${TABLE_PREFIX}인플루언서`]: buildInfluencerTable(snapshot) },
    charts: { [`${CHART_PREFIX}성과`]: buildPerformanceChart(snapshot) },
  });
}
