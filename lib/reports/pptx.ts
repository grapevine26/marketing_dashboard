import pptxgen from "pptxgenjs";
import { Report } from "@/lib/db/types";
import { ValidationError } from "@/lib/db";

export async function generateReportPPTX(report: Report): Promise<Buffer> {
  const snapshot = report.snapshot_data;
  if (!snapshot) {
    throw new ValidationError("이 보고서에는 스냅샷 데이터가 없습니다. 새 보고서를 생성해주세요.");
  }
  const { campaign, applicants, metrics } = snapshot;

  const pptx = new pptxgen();
  // 좌표가 13.33 x 7.5 인치(와이드) 기준이므로 LAYOUT_WIDE. 16x9(10인치)로 두면 KPI 5번째 박스와 표가 잘린다.
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = report.title;

  const generatedAt = new Date(report.generated_at || report.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

  // Slide 1: Cover
  const slide1 = pptx.addSlide();
  slide1.background = { color: "1E293B" };
  slide1.addText(report.title, { x: 1.0, y: 2.2, w: 11.3, h: 1.5, fontSize: 32, bold: true, color: "FFFFFF", align: "left" });
  slide1.addText(`브랜드: ${campaign.company_name}  |  캠페인: ${campaign.name}  |  일시: ${generatedAt}`, {
    x: 1.0, y: 4.0, w: 11.3, h: 0.8, fontSize: 16, color: "94A3B8", align: "left",
  });

  // Slide 2: Metrics
  const slide2 = pptx.addSlide();
  slide2.addText("캠페인 핵심 성과 요약", { x: 0.8, y: 0.6, fontSize: 24, bold: true, color: "1E293B" });

  const kpis = [
    { label: "총 지원자 수", val: `${metrics.totalApplicants}명` },
    { label: "최종 선정 인원", val: `${metrics.selectedCount}명` },
    { label: "업로드 완료", val: `${metrics.completedUploads}건` },
    { label: "총 누적 조회수", val: `${metrics.totalViews.toLocaleString()}회` },
    { label: "총 인게이지먼트", val: metrics.totalEngagement.toLocaleString() },
  ];

  kpis.forEach((kpi, idx) => {
    const xPos = 0.8 + idx * 2.3;
    slide2.addShape(pptx.ShapeType.rect, { x: xPos, y: 1.6, w: 2.1, h: 1.8, fill: { color: "F8FAFC" }, line: { color: "E2E8F0", width: 1 } });
    slide2.addText(kpi.label, { x: xPos, y: 1.8, w: 2.1, h: 0.4, fontSize: 13, color: "64748B", align: "center" });
    slide2.addText(kpi.val, { x: xPos, y: 2.3, w: 2.1, h: 0.6, fontSize: 20, bold: true, color: "0F172A", align: "center" });
  });

  // Custom sections: 슬라이드당 2개씩, 넘치면 새 슬라이드
  const sections = report.custom_sections || [];
  let target = slide2;
  let currentY = 3.8;
  sections.forEach((sec, idx) => {
    if (idx > 0 && idx % 2 === 0) {
      target = pptx.addSlide();
      target.addText("성과 분석 및 총평 (계속)", { x: 0.8, y: 0.6, fontSize: 24, bold: true, color: "1E293B" });
      currentY = 1.4;
    }
    target.addText(`■ ${sec.title}`, { x: 0.8, y: currentY, w: 11.5, h: 0.4, fontSize: 16, bold: true, color: "334155" });
    target.addText(sec.content || "-", { x: 0.8, y: currentY + 0.45, w: 11.5, h: 1.2, fontSize: 13, color: "475569", valign: "top" });
    currentY += 1.75;
  });

  // Influencer table: 12행씩 페이지 나눔
  const selectedList = applicants.filter((a) => a.status === "selected");
  const headerRow = [
    { text: "이름", options: { bold: true, fill: { color: "E2E8F0" } } },
    { text: "SNS 계정", options: { bold: true, fill: { color: "E2E8F0" } } },
    { text: "진행 단계", options: { bold: true, fill: { color: "E2E8F0" } } },
    { text: "업로드 링크", options: { bold: true, fill: { color: "E2E8F0" } } },
    { text: "조회수", options: { bold: true, fill: { color: "E2E8F0" } } },
    { text: "인게이지먼트", options: { bold: true, fill: { color: "E2E8F0" } } },
  ];
  const PAGE = 12;
  const pages = Math.max(1, Math.ceil(selectedList.length / PAGE));
  for (let p = 0; p < pages; p++) {
    const slide = pptx.addSlide();
    slide.addText(pages > 1 ? `참여 인플루언서 리스트 (${p + 1}/${pages})` : "참여 인플루언서 리스트", { x: 0.8, y: 0.6, fontSize: 24, bold: true, color: "1E293B" });
    const rows = selectedList.slice(p * PAGE, (p + 1) * PAGE).map((inf) =>
      [
        inf.name,
        inf.sns_link,
        inf.seeding?.progress_stage || "선정완료",
        inf.seeding?.upload_link || "-",
        `${(inf.seeding?.views || 0).toLocaleString()}회`,
        (inf.seeding?.engagement || 0).toLocaleString(),
      ].map((text) => ({ text }))
    );
    slide.addTable([headerRow, ...rows], {
      x: 0.8, y: 1.4, w: 11.5,
      colW: [1.8, 3.2, 1.8, 2.5, 1.1, 1.1],
      fontSize: 11,
      border: { pt: 1, color: "CBD5E1" },
    });
  }

  const out = await pptx.write({ outputType: "nodebuffer" });
  return out as Buffer;
}
