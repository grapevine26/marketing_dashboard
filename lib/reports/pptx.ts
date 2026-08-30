import pptxgen from "pptxgenjs";
import { Report } from "@/lib/db/types";

export async function generateReportPPTX(report: Report): Promise<Buffer> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";
  pptx.title = report.title;

  const { campaign, applicants, metrics } = report.snapshot_data;

  // Slide 1: Cover
  const slide1 = pptx.addSlide();
  slide1.background = { color: "1E293B" };
  slide1.addText(report.title, {
    x: 1.0,
    y: 2.2,
    w: 11.3,
    h: 1.5,
    fontSize: 32,
    bold: true,
    color: "FFFFFF",
    align: "left",
  });
  slide1.addText(
    `브랜드: ${campaign.company_name}  |  캠페인: ${campaign.name}  |  일시: ${new Date(
      report.generated_at
    ).toLocaleDateString("ko-KR")}`,
    {
      x: 1.0,
      y: 4.0,
      w: 11.3,
      h: 0.8,
      fontSize: 16,
      color: "94A3B8",
      align: "left",
    }
  );

  // Slide 2: Metrics Overview
  const slide2 = pptx.addSlide();
  slide2.addText("캠페인 핵심 성과 요약", {
    x: 0.8,
    y: 0.6,
    fontSize: 24,
    bold: true,
    color: "1E293B",
  });

  const kpis = [
    { label: "총 지원자 수", val: `${metrics.totalApplicants}명` },
    { label: "최종 선정 인원", val: `${metrics.selectedCount}명` },
    { label: "업로드 완료", val: `${metrics.completedUploads}건` },
    { label: "총 누적 조회수", val: `${metrics.totalViews.toLocaleString()}회` },
    { label: "총 인게이지먼트", val: `${metrics.totalEngagement.toLocaleString()}` },
  ];

  kpis.forEach((kpi, idx) => {
    const xPos = 0.8 + idx * 2.3;
    slide2.addShape(pptx.ShapeType.rect, {
      x: xPos,
      y: 1.6,
      w: 2.1,
      h: 1.8,
      fill: { color: "F8FAFC" },
      line: { color: "E2E8F0", width: 1 },
    });
    slide2.addText(kpi.label, {
      x: xPos,
      y: 1.8,
      w: 2.1,
      h: 0.4,
      fontSize: 13,
      color: "64748B",
      align: "center",
    });
    slide2.addText(kpi.val, {
      x: xPos,
      y: 2.3,
      w: 2.1,
      h: 0.6,
      fontSize: 20,
      bold: true,
      color: "0F172A",
      align: "center",
    });
  });

  // Custom sections on Slide 2
  if (report.custom_sections && report.custom_sections.length > 0) {
    let currentY = 3.8;
    report.custom_sections.forEach((sec) => {
      slide2.addText(`■ ${sec.title}`, {
        x: 0.8,
        y: currentY,
        fontSize: 16,
        bold: true,
        color: "334155",
      });
      slide2.addText(sec.content, {
        x: 0.8,
        y: currentY + 0.4,
        w: 11.5,
        h: 1.2,
        fontSize: 13,
        color: "475569",
      });
      currentY += 1.6;
    });
  }

  // Slide 3: Influencer Table
  const slide3 = pptx.addSlide();
  slide3.addText("참여 인플루언서 리스트", {
    x: 0.8,
    y: 0.6,
    fontSize: 24,
    bold: true,
    color: "1E293B",
  });

  const selectedList = applicants.filter((a) => a.status === "selected");
  const tableRows: any[][] = [
    [
      { text: "이름", options: { bold: true, fill: "E2E8F0" } },
      { text: "SNS 계정", options: { bold: true, fill: "E2E8F0" } },
      { text: "진행 단계", options: { bold: true, fill: "E2E8F0" } },
      { text: "업로드 링크", options: { bold: true, fill: "E2E8F0" } },
      { text: "조회수", options: { bold: true, fill: "E2E8F0" } },
      { text: "인게이지먼트", options: { bold: true, fill: "E2E8F0" } },
    ],
  ];

  selectedList.forEach((inf) => {
    tableRows.push([
      inf.name,
      inf.sns_link,
      inf.seeding?.progress_stage || "선정완료",
      inf.seeding?.upload_link || "-",
      `${(inf.seeding?.views || 0).toLocaleString()}회`,
      (inf.seeding?.engagement || 0).toLocaleString(),
    ]);
  });

  slide3.addTable(tableRows, {
    x: 0.8,
    y: 1.4,
    w: 11.5,
    colW: [1.8, 3.2, 1.8, 2.5, 1.1, 1.1],
    fontSize: 11,
    border: { pt: 1, color: "CBD5E1" },
  });

  const arrayBuffer = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
