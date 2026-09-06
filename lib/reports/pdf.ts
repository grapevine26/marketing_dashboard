import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { Report } from "@/lib/db/types";
import { ValidationError } from "@/lib/db";

export async function generateReportPDF(report: Report): Promise<Buffer> {
  const snapshot = report.snapshot_data;
  if (!snapshot) {
    throw new ValidationError("이 보고서에는 스냅샷 데이터가 없습니다. 새 보고서를 생성해주세요.");
  }
  const { campaign, applicants, metrics } = snapshot;

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

    // 한글 폰트 (PDF는 시스템 폰트 폴백이 없으므로 저장소에 포함된 폰트를 반드시 등록한다)
    const fontRegularPath = path.join(process.cwd(), "assets", "fonts", "IBMPlexSansKR-Regular.ttf");
    const fontBoldPath = path.join(process.cwd(), "assets", "fonts", "IBMPlexSansKR-SemiBold.ttf");

    if (fs.existsSync(fontRegularPath)) {
      doc.registerFont("Korean", fontRegularPath);
      doc.registerFont("KoreanBold", fs.existsSync(fontBoldPath) ? fontBoldPath : fontRegularPath);
      doc.font("Korean");
    } else {
      console.warn("Korean font not found; PDF Korean text will be broken:", fontRegularPath);
    }

    const generatedAt = new Date(report.generated_at || report.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    doc.fontSize(22).text(report.title, { align: "left" }).moveDown(0.3);
    doc
      .fontSize(10)
      .fillColor("#666666")
      .text(
        `캠페인: ${campaign.name} | 브랜드: ${campaign.company_name} | 유형: ${
          campaign.campaign_type === "shipping" ? "제품배송형" : "현장방문형"
        } | 생성일시: ${generatedAt}`
      )
      .moveDown(1.5);

    // Metrics Summary Box
    doc.rect(50, doc.y, 495, 65).fillAndStroke("#F3F4F6", "#E5E7EB");
    const boxY = doc.y + 12;
    doc.fillColor("#111827");
    const cells = [
      ["총 지원자", `${metrics.totalApplicants}명`, 70],
      ["최종 선정", `${metrics.selectedCount}명`, 170],
      ["업로드 완료", `${metrics.completedUploads}건`, 270],
      ["총 조회수", `${metrics.totalViews.toLocaleString()}회`, 370],
      ["인게이지먼트", metrics.totalEngagement.toLocaleString(), 460],
    ] as const;
    for (const [label, value, x] of cells) {
      doc.fontSize(10).text(label, x, boxY);
      doc.fontSize(16).text(value, x, boxY + 16);
    }
    doc.y = boxY + 65;
    doc.x = 50;
    doc.moveDown(1.5);

    // Custom Sections
    if (report.custom_sections && report.custom_sections.length > 0) {
      doc.fillColor("#111827").fontSize(14).text("■ 성과 분석 및 총평").moveDown(0.5);
      for (const section of report.custom_sections) {
        doc.fontSize(11).fillColor("#1F2937").text(section.title, { underline: true }).moveDown(0.3);
        doc.fontSize(10).fillColor("#374151").text(section.content || "-").moveDown(0.8);
      }
      doc.moveDown(1);
    }

    // Selected Influencer List
    doc.fillColor("#111827").fontSize(14).text("■ 참여 인플루언서 목록").moveDown(0.5);

    const selectedList = applicants.filter((a) => a.status === "selected");
    if (selectedList.length === 0) {
      doc.fontSize(10).fillColor("#6B7280").text("최종 선정된 인플루언서가 없습니다.");
    } else {
      selectedList.forEach((inf, idx) => {
        const stage = inf.seeding?.progress_stage || "선정완료";
        const link = inf.seeding?.upload_link || "미등록";
        const views = inf.seeding?.views || 0;
        doc
          .fontSize(10)
          .fillColor("#111827")
          .text(`${idx + 1}. ${inf.name} (${inf.sns_link}) - 상태: [${stage}] | 조회수: ${views.toLocaleString()}회 | 콘텐츠: ${link}`)
          .moveDown(0.4);
      });
    }

    doc.end();
  });
}
