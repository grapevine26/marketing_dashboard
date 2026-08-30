import { NextRequest, NextResponse } from "next/server";
import { getReportById } from "@/lib/db";
import { generateReportPPTX } from "@/lib/reports/pptx";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params;
  const report = await getReportById(reportId);
  if (!report) {
    return new NextResponse("Report not found", { status: 404 });
  }

  try {
    const pptxBuffer = await generateReportPPTX(report);
    const filename = encodeURIComponent(`${report.title}.pptx`);

    return new NextResponse(new Uint8Array(pptxBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  } catch (error) {
    console.error("PPTX generation failed:", error);
    return new NextResponse("Failed to generate PPTX", { status: 500 });
  }
}