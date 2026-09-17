import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { Report } from "@/lib/db/types";
import { ValidationError } from "@/lib/db";

const PAGE_LEFT = 50;
const PAGE_WIDTH = 495; // A4 (595pt) - 좌우 여백 50

/**
 * PDF 가 그릴 수 없는 이모지.
 *
 * **왜 지우는가** — 이 PDF 는 저장소에 든 `IBMPlexSansKR` 하나만 등록한다. 한글·기호·전각문자는
 * 멀쩡한데 이모지에는 글리프가 없어 **빈칸(.notdef)** 으로 나간다. 크래시가 아니라서 아무도
 * 모르고, 광고주에게 가는 문서에 구멍이 뚫린 채로 나간다. 마케터는 총평에 이모지를 즐겨 쓰고
 * 이 앱의 AI 프롬프트 자체가 이모지를 권한다 — 드문 일이 아니다.
 *
 * **왜 이모지 폰트를 안 넣는가** — 컬러 이모지 폰트는 수~수십 MB 다. 배포 크기와 콜드 스타트를
 * 그만큼 내주고 얻는 것이 "총평의 🎉 한 글자" 라 수지가 안 맞는다.
 *
 * **무엇까지 지우는가** — 기본 표시가 이모지인 글자(`Emoji_Presentation`)와, 이모지로 그려
 * 달라고 명시한 조합(`그림문자 + U+FE0F`)만 지운다. `★ ▶ ■ ✓ ™ →` 같은 **글자 표시가 기본인
 * 기호는 건드리지 않는다** — 한국어 문서에서 글머리 기호로 흔히 쓰이고, 지우면 멀쩡하던 문장이
 * 오히려 망가진다. 이어 붙임(ZWJ)·피부색·국기·키캡 조각은 앞 글자가 사라지면 의미가 없으므로
 * 함께 지운다.
 */
const EMOJI_DROP_RE =
  /\p{Emoji_Presentation}|\p{Extended_Pictographic}️|[‍︎️⃣]|[\u{E0020}-\u{E007F}]/gu;

/** 사람 눈에 보이는 이모지만 센다(붙임 문자 제외). 화면 안내 문구의 "N자" 가 이 값이다. */
const EMOJI_COUNT_RE = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/gu;

/** PDF 로 그리기 직전에 이모지를 걸러낸다. 지운 자리에 생긴 겹공백만 정리하고 줄바꿈은 그대로 둔다. */
export function stripEmojiForPdf(text: string): string {
  if (!text) return text;
  const dropped = text.replace(EMOJI_DROP_RE, "");
  // 지운 것이 없으면 원문 그대로 돌려준다 — 사용자가 일부러 넣은 공백까지 건드릴 이유가 없다.
  if (dropped === text) return text;
  return dropped.replace(/[^\S\r\n]{2,}/g, " ").replace(/[^\S\r\n]+$/gm, "");
}

/**
 * 이 글에 PDF 가 못 그리는 이모지가 몇 자 있는가.
 *
 * **판정을 여기 한 곳에만 둔다.** 총평 저장 화면과 다운로드 버튼 옆 안내도 이 함수를 불러 쓴다
 * (`app/(dashboard)/campaigns/[id]/reports/`). 규칙을 화면에 따로 적어 두면 한쪽만 바뀌는
 * 날이 오고, 그러면 "괜찮다" 고 해 놓고 빈칸이 나가거나 그 반대가 된다.
 */
export function countEmojiForPdf(text: string | null | undefined): number {
  if (!text) return 0;
  return (text.match(EMOJI_COUNT_RE) || []).length;
}

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
    doc.font(bold).fontSize(22).fillColor("#111827").text(stripEmojiForPdf(report.title), PAGE_LEFT, 50, { width: PAGE_WIDTH });
    doc.moveDown(0.3);
    doc
      .font(regular)
      .fontSize(10)
      .fillColor("#666666")
      .text(
        `캠페인: ${stripEmojiForPdf(campaign.name)} | 브랜드: ${stripEmojiForPdf(campaign.company_name)} | 유형: ${
          campaign.campaign_type === "shipping" ? "제품배송형" : "현장방문형"
        } | 생성일시: ${generatedAt}`,
        { width: PAGE_WIDTH }
      );

    // ----- 지표 박스 -----
    // 지표가 **언제 기준인지** 박스에 붙여 둔다. 지표는 생성 시점에 고정되는데 바로 아래 총평은
    // 계속 고쳐지므로, 두 숫자가 다른 보고서가 그대로 광고주에게 나간 적이 있다
    // (지표 "업로드 0건" 아래 총평 "12건 업로드 완료"). 상세 화면의 인플루언서 표에는 이미
    // 같은 라벨이 있었는데 지표에만 없었다.
    doc.font(bold).fontSize(11).fillColor("#111827").text("■ 핵심 지표 (생성 시점 스냅샷)", PAGE_LEFT, doc.y + 14, { width: PAGE_WIDTH });
    const boxTop = doc.y + 4;
    const boxH = 62;
    doc.rect(PAGE_LEFT, boxTop, PAGE_WIDTH, boxH).fillAndStroke("#F3F4F6", "#E5E7EB");
    // 너비를 칸과 같은 자리에 적는다. 따로 둔 배열은 지표를 하나 더 넣는 순간
    // 조용히 어긋나서, 라벨은 3번 칸인데 너비는 4번 칸 것을 쓰게 된다.
    // 마지막 칸(인게이지먼트 + 비율)이 가장 길어서 너비를 더 준다.
    const cells: { label: string; value: string; width: number }[] = [
      { label: "총 지원자", value: `${metrics.totalApplicants}명`, width: 80 },
      { label: "최종 선정", value: `${metrics.selectedCount}명`, width: 80 },
      { label: "업로드 완료", value: `${metrics.completedUploads}건`, width: 85 },
      { label: "총 조회수", value: `${metrics.totalViews.toLocaleString()}회`, width: 110 },
      {
        label: "인게이지먼트",
        value: `${metrics.totalEngagement.toLocaleString()} (${metrics.avgEngagementRate}%)`,
        width: 140,
      },
    ];
    let cx = PAGE_LEFT;
    cells.forEach(({ label, value, width }) => {
      const x = cx + 10;
      doc.font(regular).fontSize(9).fillColor("#6B7280").text(label, x, boxTop + 12, { width: width - 12, lineBreak: false });
      doc.font(bold).fontSize(14).fillColor("#111827").text(value, x, boxTop + 29, { width: width - 12, lineBreak: false });
      cx += width;
    });
    doc
      .font(regular)
      .fontSize(8)
      .fillColor("#6B7280")
      .text(
        `지표 기준 시점: ${generatedAt} — 보고서를 만든 순간의 값이라, 그 뒤 캠페인이 진행돼도 이 숫자는 바뀌지 않습니다. 아래 총평은 최신 내용입니다.`,
        PAGE_LEFT,
        boxTop + boxH + 6,
        { width: PAGE_WIDTH }
      );
    let y = doc.y + 16;

    // ----- 총평 -----
    if (report.custom_sections && report.custom_sections.length > 0) {
      doc.font(bold).fontSize(14).fillColor("#111827").text("■ 성과 분석 및 총평 (마지막 저장 내용)", PAGE_LEFT, y, { width: PAGE_WIDTH });
      y = doc.y + 6;
      let 지운이모지 = 0;
      for (const section of report.custom_sections) {
        지운이모지 += countEmojiForPdf(section.title) + countEmojiForPdf(section.content);
        doc.font(bold).fontSize(11).fillColor("#1F2937").text(stripEmojiForPdf(section.title), PAGE_LEFT, y, { width: PAGE_WIDTH });
        y = doc.y + 3;
        doc.font(regular).fontSize(10).fillColor("#374151").text(stripEmojiForPdf(section.content) || "-", PAGE_LEFT, y, { width: PAGE_WIDTH });
        y = doc.y + 10;
      }
      // 받은 사람도 알아야 한다. 화면(저장 직후 토스트·다운로드 버튼 옆 안내)에서만 알리면
      // PDF 파일만 건네받은 사람은 왜 문장이 어색한지 알 방법이 없다.
      if (지운이모지 > 0) {
        doc
          .font(regular)
          .fontSize(8)
          .fillColor("#9CA3AF")
          .text(`* 이모지 ${지운이모지}자는 PDF 글꼴이 표시할 수 없어 제외했습니다. (PPTX 와 화면에는 그대로 나옵니다)`, PAGE_LEFT, y, { width: PAGE_WIDTH });
        y = doc.y + 6;
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
      doc.font(bold).fontSize(14).fillColor("#111827").text("■ 인플루언서별 성과 (조회수 / 인게이지먼트, 생성 시점 스냅샷)", PAGE_LEFT, y, { width: PAGE_WIDTH });
      y = doc.y + 8;
      const labelW = 110;
      const barX = PAGE_LEFT + labelW;
      const barMaxW = PAGE_WIDTH - labelW - 70;
      for (const r of chartRows) {
        doc.font(regular).fontSize(9).fillColor("#374151").text(stripEmojiForPdf(r.name), PAGE_LEFT, y + 4, { width: labelW - 8, lineBreak: false, ellipsis: true });
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
    doc.font(bold).fontSize(14).fillColor("#111827").text("■ 참여 인플루언서 목록 (생성 시점 스냅샷)", PAGE_LEFT, y, { width: PAGE_WIDTH });
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
          .text(
            stripEmojiForPdf(
              `${idx + 1}. ${inf.name} (${inf.sns_link}) - [${stage}] | 조회수 ${views.toLocaleString()}회 | 인게이지먼트 ${eng.toLocaleString()} | 콘텐츠: ${link}`
            ),
            PAGE_LEFT,
            y,
            { width: PAGE_WIDTH }
          );
        y = doc.y + 5;
      });
    }

    doc.end();
  });
}
