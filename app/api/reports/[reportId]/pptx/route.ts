import { NextRequest, NextResponse } from "next/server";
import { getReportById, ValidationError } from "@/lib/db";
import { generateReportPPTX } from "@/lib/reports/pptx";

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
    const pptxBuffer = await generateReportPPTX(report);
    const filename = encodeURIComponent(`${report.title}.pptx`);

    return new NextResponse(new Uint8Array(pptxBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return new NextResponse(error.message, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    console.error("PPTX generation failed:", error);
    return new NextResponse("PPTX 생성에 실패했습니다.", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
