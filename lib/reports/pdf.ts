import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { Report } from "@/lib/db/types";
import { ValidationError } from "@/lib/db";

const PAGE_LEFT = 50;
const PAGE_WIDTH = 495; // A4 (595pt) - 좌우 여백 50

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
      info: { Title: report.title, Author: "Marketing Seeding Platform" },
    });

    const buffers: Buffer[] = [];
    doc.on("data", (chunk) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    // 한글 폰트 (PDF는 시스템 폰트 폴백이 없으므로 저장소에 포함된 폰트를 반드시 등록한다)
    const fontRegularPath = path.join(process.cwd(), "assets", "fonts", "IBMPlexSansKR-Regular.ttf");
    const fontBoldPath = path.join(process.cwd(), "assets", "fonts", "IBMPlexSansKR-SemiBold.ttf");
    let regular = "Helvetica";
    let bold = "Helvetica-Bold";
    if (fs.existsSync(fontRegularPath)) {
      doc.registerFont("Korean", fontRegularPath);
      doc.registerFont("KoreanBold", fs.existsSync(fontBoldPath) ? fontBoldPath : fontRegularPath);
      regular = "Korean";
      bold = "KoreanBold";
    } else {
      console.warn("Korean font not found; PDF Korean text will be broken:", fontRegularPath);
    }
    doc.font(regular);

    const generatedAt = new Date(report.generated_at || report.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    // ----- 헤더 -----
    doc.font(bold).fontSize(22).fillColor("#111827").text(report.title, PAGE_LEFT, 50, { width: PAGE_WIDTH });
    doc.moveDown(0.3);
    doc
      .font(regular)
      .fontSize(10)
      .fillColor("#666666")
      .text(
        `캠페인: ${campaign.name} | 브랜드: ${campaign.company_name} | 유형: ${
          campaign.campaign_type === "shipping" ? "제품배송형" : "현장방문형"
        } | 생성일시: ${generatedAt}`,
        { width: PAGE_WIDTH }
      );

    // ----- 지표 박스 -----
    const boxTop = doc.y + 14;
    const boxH = 62;
    doc.rect(PAGE_LEFT, boxTop, PAGE_WIDTH, boxH).fillAndStroke("#F3F4F6", "#E5E7EB");
    const cells = [
      ["총 지원자", `${metrics.totalApplicants}명`],
      ["최종 선정", `${metrics.selectedCount}명`],
      ["업로드 완료", `${metrics.completedUploads}건`],
      ["총 조회수", `${metrics.totalViews.toLocaleString()}회`],
      ["인게이지먼트", `${metrics.totalEngagement.toLocaleString()} (${metrics.avgEngagementRate}%)`],
    ];
    // 마지막 칸(인게이지먼트 + 비율)이 가장 길어서 너비를 더 준다
    const cellWidths = [80, 80, 85, 110, 140];
    let cx = PAGE_LEFT;
    cells.forEach(([label, value], i) => {
      const x = cx + 10;
      doc.font(regular).fontSize(9).fillColor("#6B7280").text(label, x, boxTop + 12, { width: cellWidths[i] - 12, lineBreak: false });
      doc.font(bold).fontSize(14).fillColor("#111827").text(value, x, boxTop + 29, { width: cellWidths[i] - 12, lineBreak: false });
      cx += cellWidths[i];
    });
    let y = boxTop + boxH + 22;

    // ----- 총평 -----
    if (report.custom_sections && report.custom_sections.length > 0) {
      doc.font(bold).fontSize(14).fillColor("#111827").text("■ 성과 분석 및 총평", PAGE_LEFT, y, { width: PAGE_WIDTH });
      y = doc.y + 6;
      for (const section of report.custom_sections) {
        doc.font(bold).fontSize(11).fillColor("#1F2937").text(section.title, PAGE_LEFT, y, { width: PAGE_WIDTH });
        y = doc.y + 3;
        doc.font(regular).fontSize(10).fillColor("#374151").text(section.content || "-", PAGE_LEFT, y, { width: PAGE_WIDTH });
        y = doc.y + 10;
      }
      y += 6;
    }

    // ----- 인플루언서별 성과 차트 (조회수 상위 10명, 가로 막대) -----
    const selectedList = applicants.filter((a) => a.status === "selected");
    const chartRows = selectedList
      .map((a) => ({ name: a.name, views: a.seeding?.views || 0, engagement: a.seeding?.engagement || 0 }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);
    const maxVal = Math.max(1, ...chartRows.map((r) => Math.max(r.views, r.engagement)));

    if (chartRows.length > 0) {
      const rowH = 26;
      const chartH = 22 + chartRows.length * rowH + 18;
      if (y + chartH > doc.page.height - 60) {
        doc.addPage();
        y = 50;
      }
      doc.font(bold).fontSize(14).fillColor("#111827").text("■ 인플루언서별 성과 (조회수 / 인게이지먼트)", PAGE_LEFT, y, { width: PAGE_WIDTH });
      y = doc.y + 8;
      const labelW = 110;
      const barX = PAGE_LEFT + labelW;
      const barMaxW = PAGE_WIDTH - labelW - 70;
      for (const r of chartRows) {
        doc.font(regular).fontSize(9).fillColor("#374151").text(r.name, PAGE_LEFT, y + 4, { width: labelW - 8, lineBreak: false, ellipsis: true });
        const vw = Math.max(1, Math.round((r.views / maxVal) * barMaxW));
        const ew = Math.max(1, Math.round((r.engagement / maxVal) * barMaxW));
        doc.rect(barX, y, vw, 9).fill("#2563EB");
        doc.rect(barX, y + 11, ew, 9).fill("#F59E0B");
        doc.font(regular).fontSize(8).fillColor("#6B7280").text(r.views.toLocaleString(), barX + vw + 4, y, { lineBreak: false });
        doc.text(r.engagement.toLocaleString(), barX + ew + 4, y + 11, { lineBreak: false });
        y += rowH;
      }
      doc.rect(barX, y + 2, 9, 9).fill("#2563EB");
      doc.font(regular).fontSize(8).fillColor("#6B7280").text("조회수", barX + 13, y + 2, { lineBreak: false });
      doc.rect(barX + 60, y + 2, 9, 9).fill("#F59E0B");
      doc.text("인게이지먼트", barX + 73, y + 2, { lineBreak: false });
      y += 28;
    }

    // ----- 인플루언서 목록 -----
    if (y > doc.page.height - 120) {
      doc.addPage();
      y = 50;
    }
    doc.font(bold).fontSize(14).fillColor("#111827").text("■ 참여 인플루언서 목록", PAGE_LEFT, y, { width: PAGE_WIDTH });
    y = doc.y + 6;

    if (selectedList.length === 0) {
      doc.font(regular).fontSize(10).fillColor("#6B7280").text("최종 선정된 인플루언서가 없습니다.", PAGE_LEFT, y, { width: PAGE_WIDTH });
    } else {
      selectedList.forEach((inf, idx) => {
        if (doc.y > doc.page.height - 80) {
          doc.addPage();
          y = 50;
        }
        const stage = inf.seeding?.progress_stage || "선정완료";
        const link = inf.seeding?.upload_link || "미등록";
        const views = inf.seeding?.views || 0;
        const eng = inf.seeding?.engagement || 0;
        doc
          .font(regular)
          .fontSize(10)
          .fillColor("#111827")
          .text(`${idx + 1}. ${inf.name} (${inf.sns_link}) - [${stage}] | 조회수 ${views.toLocaleString()}회 | 인게이지먼트 ${eng.toLocaleString()} | 콘텐츠: ${link}`, PAGE_LEFT, y, { width: PAGE_WIDTH });
        y = doc.y + 5;
      });
    }

    doc.end();
  });
}
