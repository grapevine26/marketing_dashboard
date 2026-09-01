import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { Report } from "@/lib/db/types";

export async function generateReportPDF(report: Report): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: {
        Title: report.title,
        Author: "Marketing Seeding Platform",
      },
    });

    const buffers: Buffer[] = [];
    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    // Register Korean Font
    const fontRegularPath = path.join(
      process.cwd(),
      "assets",
      "fonts",
      "IBMPlexSansKR-Regular.ttf"
    );
    const fontBoldPath = path.join(
      process.cwd(),
      "assets",
      "fonts",
      "IBMPlexSansKR-SemiBold.ttf"
    );

    if (fs.existsSync(fontRegularPath)) {
      doc.registerFont("Korean", fontRegularPath);
      if (fs.existsSync(fontBoldPath)) {
        doc.registerFont("KoreanBold", fontBoldPath);
      } else {
        doc.registerFont("KoreanBold", fontRegularPath);
      }
      doc.font("Korean");
    }

    const { campaign, applicants, metrics } = report.snapshot_data;

    // Header
    doc
      .fontSize(22)
      .text(report.title, { align: "left" })
      .moveDown(0.3);

    doc
      .fontSize(10)
      .fillColor("#666666")
      .text(
        `캠페인: ${campaign.name} | 브랜드: ${campaign.company_name} | 유형: ${
          campaign.campaign_type === "shipping" ? "제품배송형" : "현장방문형"
        } | 생성일시: ${new Date(report.generated_at || report.created_at).toLocaleString("ko-KR")}`
      )
      .moveDown(1.5);

    // Metrics Summary Box
    doc.rect(50, doc.y, 495, 65).fillAndStroke("#F3F4F6", "#E5E7EB");
    const boxY = doc.y + 12;

    doc.fillColor("#111827");
    doc.fontSize(10).text("총 지원자", 70, boxY);
    doc.fontSize(16).text(`${metrics.totalApplicants}명`, 70, boxY + 16);

    doc.fontSize(10).text("최종 선정", 170, boxY);
    doc.fontSize(16).text(`${metrics.selectedCount}명`, 170, boxY + 16);

    doc.fontSize(10).text("업로드 완료", 270, boxY);
    doc.fontSize(16).text(`${metrics.completedUploads}건`, 270, boxY + 16);

    doc.fontSize(10).text("총 조회수", 370, boxY);
    doc.fontSize(16).text(`${metrics.totalViews.toLocaleString()}회`, 370, boxY + 16);

    doc.fontSize(10).text("인게이지먼트", 460, boxY);
    doc.fontSize(16).text(`${metrics.totalEngagement.toLocaleString()}`, 460, boxY + 16);

    doc.y = boxY + 65;
    doc.moveDown(1.5);

    // Custom Sections
    if (report.custom_sections && report.custom_sections.length > 0) {
      doc.fillColor("#111827").fontSize(14).text("■ 성과 분석 및 총평").moveDown(0.5);
      for (const section of report.custom_sections) {
        doc.fontSize(11).fillColor("#1F2937").text(section.title, { underline: true }).moveDown(0.3);
        doc.fontSize(10).fillColor("#374151").text(section.content).moveDown(0.8);
      }
      doc.moveDown(1);
    }

    // Selected Influencer Table Summary
    doc.fillColor("#111827").fontSize(14).text("■ 참여 인플루언서 목록").moveDown(0.5);

    const selectedList = applicants.filter((a: any) => a.status === "selected");
    if (selectedList.length === 0) {
      doc.fontSize(10).fillColor("#6B7280").text("최종 선정된 인플루언서가 없습니다.");
    } else {
      selectedList.forEach((inf: any, idx: number) => {
        const stage = inf.seeding?.progress_stage || "선정완료";
        const link = inf.seeding?.upload_link || "미등록";
        const views = inf.seeding?.views || 0;
        doc
          .fontSize(10)
          .fillColor("#111827")
          .text(
            `${idx + 1}. ${inf.name} (${inf.sns_link}) - 상태: [${stage}] | 조회수: ${views.toLocaleString()}회 | 콘텐츠: ${link}`
          )
          .moveDown(0.4);
      });
    }

    doc.end();
  });
}
