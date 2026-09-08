import { NextRequest, NextResponse } from "next/server";
import { getReportById, ValidationError } from "@/lib/db";
import { generateReportPDF } from "@/lib/reports/pdf";
import { fileDownloadResponse } from "@/lib/http/fileResponse";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params;
  const report = await getReportById(reportId);
  if (!report) {
    return new NextResponse("보고서를 찾을 수 없습니다.", { status: 404 });
  }

  try {
    const pdfBuffer = await generateReportPDF(report);
    const filename = encodeURIComponent(`${report.title}.pdf`);

    return fileDownloadResponse(pdfBuffer, "application/pdf", filename);
  } catch (error) {
    if (error instanceof ValidationError) {
      return new NextResponse(error.message, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    console.error("PDF generation failed:", error);
    return new NextResponse("PDF 생성에 실패했습니다.", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
